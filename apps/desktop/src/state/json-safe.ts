/**
 * Makes any value safe to send as a JSON request body.
 *
 * Elements in the editor can hold things JSON cannot: `undefined` (in arrays too), NaN and Infinity, typed arrays, Maps, Dates,
 * functions, class instances (three.js objects) and cycles. The typed client refuses such a body with "Expected JSON value at ...",
 * which used to stop the toolpath generator for a drawing that looked perfectly normal. This returns the plain-JSON version:
 * what has no JSON form is dropped (object keys) or removed (array items), non-finite numbers become 0 in arrays and are dropped as
 * keys, and anything cyclic or deeper than `MAX_DEPTH` is cut.
 */
const MAX_DEPTH = 32

export const toJsonSafe = (value: unknown): unknown => walk(value, new WeakSet<object>(), 0)

const SKIP = Symbol("skip")

const walk = (value: unknown, seen: WeakSet<object>, depth: number): unknown => {
  switch (typeof value) {
    case "string": case "boolean": return value
    case "number": return Number.isFinite(value) ? value : SKIP
    case "bigint": return Number(value)
    case "undefined": case "function": case "symbol": return SKIP
  }
  if (value === null) return null
  const object = value as object
  if (depth >= MAX_DEPTH || seen.has(object)) return SKIP
  if (object instanceof Date) return Number.isNaN(object.getTime()) ? SKIP : object.toISOString()
  seen.add(object)
  try {
    if (ArrayBuffer.isView(object)) return Array.from(object as unknown as ArrayLike<number>, (n) => (Number.isFinite(n) ? n : 0))
    if (Array.isArray(object) || object instanceof Set) {
      const items: unknown[] = []
      for (const item of object as Iterable<unknown>) {
        const next = walk(item, seen, depth + 1)
        if (next !== SKIP) items.push(next)
        else if (typeof item === "number") items.push(0)
      }
      return items
    }
    if (object instanceof Map) return walk(Object.fromEntries(object), seen, depth)
    const withJson = object as { toJSON?: () => unknown }
    if (typeof withJson.toJSON === "function") {
      const produced = withJson.toJSON()
      return produced === object ? SKIP : walk(produced, seen, depth + 1)
    }
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(object)) {
      const next = walk((object as Record<string, unknown>)[key], seen, depth + 1)
      if (next !== SKIP) out[key] = next
    }
    return out
  } finally {
    seen.delete(object)
  }
}

/** `toJsonSafe` for an object: always an object (an empty one when there is nothing to keep). */
export const toJsonSafeRecord = <T extends object>(value: T): T => {
  const safe = toJsonSafe(value)
  return (safe === SKIP || typeof safe !== "object" || safe === null ? {} : safe) as T
}
