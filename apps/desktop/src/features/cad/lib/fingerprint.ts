/**
 * A cheap fingerprint of the *shape* of an element: everything that changes what it is made of, and
 * nothing that only moves it.
 *
 * The canvas keeps one Three object per element and rebuilds its geometry only when this value
 * changes, so moving a part of a large assembly costs one matrix update instead of a full scene
 * rebuild. `JSON.stringify` is not an option: an element can carry thousands of points (a spline, a
 * profile, a mesh), and materialising that as a string on every hover would cost more than the
 * rebuild it is meant to avoid.
 *
 * The hash is 32-bit on purpose. It is only ever compared between two versions of the *same* element
 * (is the geometry still the one I built?), never across elements, so a collision between two
 * different parts of the drawing cannot make the canvas keep the wrong geometry.
 */

/** Fields that place an element without changing what it is made of. */
export const PLACEMENT_KEYS: ReadonlySet<string> = new Set([
  // The factory bakes x / y / z into `object.position`; `applyElementTransform` moves it by the delta.
  "x", "y", "z",
  // The gizmo transform, applied as a matrix around the pivot.
  "rotation", "scale", "translateX", "translateY", "translateZ",
  // Bookkeeping the canvas handles without touching the geometry.
  "id", "layerId", "visible", "locked", "name", "description",
  // A back-reference kept for saving; the builder never reads it.
  "originalData",
])

/** How deep to walk before giving up: a nested group inside a component inside a group is already deep. */
const MAX_DEPTH = 12

/**
 * IEEE-754 bits of a number, exactly. Coordinates move by fractions of a millimetre, so rounding to
 * an integer (or truncating to 32 bits) would call a moved control point "unchanged".
 */
const numberBits = new Float64Array(1)
const numberWords = new Uint32Array(numberBits.buffer)

const mix = (hash: number, value: number): number => {
  let next = (hash ^ (value | 0)) >>> 0
  next = Math.imul(next, 16777619) >>> 0
  return next
}

const mixNumber = (hash: number, value: number): number => {
  numberBits[0] = value
  return mix(mix(hash, numberWords[0]!), numberWords[1]!)
}

const hash = (value: unknown, seen: WeakSet<object>, depth: number): number => {
  if (value === null) return mix(0, 1)
  switch (typeof value) {
    case "number": return mixNumber(0, value)
    case "boolean": return mix(0, value ? 2 : 3)
    case "string": {
      let next = mix(0, 4 + value.length)
      for (let index = 0; index < value.length; index++) next = mix(next, value.charCodeAt(index))
      return next
    }
    case "undefined": return mix(0, 5)
    case "bigint": return mixNumber(0, Number(value))
    case "function": case "symbol": return mix(0, 6)
  }
  const object = value as object
  // A cycle or a runaway nesting contributes nothing but must not be followed.
  if (depth >= MAX_DEPTH || seen.has(object)) return mix(0, 7)
  seen.add(object)
  try {
    // A typed array is hashed in place: no intermediate string, no intermediate array.
    if (ArrayBuffer.isView(object)) {
      const view = object as unknown as ArrayLike<number>
      let next = mix(0, 8 + view.length)
      for (let index = 0; index < view.length; index++) next = mixNumber(next, view[index]!)
      return next
    }
    if (Array.isArray(object)) {
      let next = mix(0, 9 + object.length)
      for (const item of object as readonly unknown[]) next = mix(next, hash(item, seen, depth + 1))
      return next
    }
    if (object instanceof Set || object instanceof Map) {
      // Key order is not part of the value here, so fold it in sorted.
      const entries = object instanceof Set ? [...object] : [...object.entries()]
      const sorted = entries
        .map((entry) => hash(entry, seen, depth + 1))
        .sort((a, b) => a - b)
      let next = mix(0, 10 + sorted.length)
      for (const entry of sorted) next = mix(next, entry)
      return next
    }
    const record = object as Record<string, unknown>
    // Sorted, so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` are the same shape.
    const keys = Object.keys(record).filter((key) => !PLACEMENT_KEYS.has(key)).sort()
    let next = mix(0, 11 + keys.length)
    for (const key of keys) {
      next = mix(next, hash(key, seen, depth + 1))
      next = mix(next, hash(record[key], seen, depth + 1))
    }
    return next
  } finally {
    seen.delete(object)
  }
}

/** The shape fingerprint of an element: same number = same geometry, move it as much as you like. */
export const shapeFingerprint = (element: unknown): number => hash(element, new WeakSet<object>(), 0)
