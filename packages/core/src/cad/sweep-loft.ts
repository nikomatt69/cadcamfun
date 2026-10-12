/**
 * Swept and lofted solids for the feature history, with real caps (ear-clipped, so concave profiles work) and the frames a CAD
 * kernel uses:
 *
 *   sweep   a closed profile carried along a 3D path with rotation-minimising (parallel transport) frames, so the profile does not
 *           twist on a bending path; at every corner of the path the profile is cut in the mitre plane and stretched by 1 / cos(half
 *           the bend angle), so the wall keeps its thickness through the bend. A closed path makes a ring (a torus, a frame, a gasket).
 *   loft    two or more closed sections joined into one solid. The sections are resampled to the same number of points by arc
 *           length, wound the same way round the loft direction and rotated to the closest start point so the surface does not
 *           twist; `smooth` passes a Catmull-Rom curve through the sections instead of straight (ruled) spans.
 *
 * Meshes are outward facing: the signed volume is checked and the winding flipped when the construction came out inside out.
 * Everything here is in world coordinates; the history places the sketch profiles into the world before calling.
 */
import type { Mesh } from "./solid.ts"
import { meshVolume } from "./solid.ts"
import { triangulateRing } from "./triangulate.ts"
import type { Vec2 } from "./vec.ts"

export interface P3 { readonly x: number; readonly y: number; readonly z: number }

const sub = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a: P3, b: P3): P3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const mul = (a: P3, s: number): P3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const dot = (a: P3, b: P3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: P3, b: P3): P3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const length = (a: P3): number => Math.hypot(a.x, a.y, a.z)
const unit = (a: P3): P3 => {
  const l = length(a)
  if (l < 1e-12) throw new RangeError("Zero-length direction (two path points coincide)")
  return mul(a, 1 / l)
}

/** The vector turned about the unit `axis` by `angle` (Rodrigues). */
const rotate = (v: P3, axis: P3, angle: number): P3 => {
  const c = Math.cos(angle), s = Math.sin(angle)
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)))
}

/** The smallest rotation taking the unit vector `a` to `b`, as a function on vectors. */
const alignment = (a: P3, b: P3): ((v: P3) => P3) => {
  const d = Math.max(-1, Math.min(1, dot(a, b)))
  if (d > 1 - 1e-12) return (v) => v
  let axis = cross(a, b)
  if (length(axis) < 1e-9) {
    // Opposite directions: turn half a revolution about any axis perpendicular to `a`.
    axis = Math.abs(a.x) < 0.9 ? cross(a, { x: 1, y: 0, z: 0 }) : cross(a, { x: 0, y: 1, z: 0 })
  }
  const k = unit(axis)
  const angle = Math.acos(d)
  return (v) => rotate(v, k, angle)
}

/** Flips the winding when the signed volume is negative. */
const outward = (positions: number[], indices: number[]): Mesh => {
  const mesh: Mesh = { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
  if (meshVolume(mesh) >= 0) return mesh
  for (let i = 0; i + 2 < mesh.indices.length; i += 3) { const b = mesh.indices[i + 1]!; mesh.indices[i + 1] = mesh.indices[i + 2]!; mesh.indices[i + 2] = b }
  return mesh
}

/** Side strips between consecutive rings, plus caps from a triangulation of the first and last ring. */
const closeRings = (rings: ReadonlyArray<ReadonlyArray<P3>>, capStart: ReadonlyArray<readonly [number, number, number]> | undefined, capEnd: ReadonlyArray<readonly [number, number, number]> | undefined, wrap: boolean): Mesh => {
  const n = rings[0]!.length
  const positions: number[] = []
  const indices: number[] = []
  for (const ring of rings) for (const p of ring) positions.push(p.x, p.y, p.z)
  const spans = wrap ? rings.length : rings.length - 1
  for (let k = 0; k < spans; k++) {
    const lo = k * n, up = ((k + 1) % rings.length) * n
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      indices.push(lo + i, lo + j, up + j, lo + i, up + j, up + i)
    }
  }
  if (capStart !== undefined) for (const [a, b, c] of capStart) indices.push(a, c, b)
  if (capEnd !== undefined) { const base = (rings.length - 1) * n; for (const [a, b, c] of capEnd) indices.push(base + a, base + b, base + c) }
  return outward(positions, indices)
}

export interface SweepInput {
  /** The profile ring in world coordinates (a simple polygon, planar). */
  readonly ring: ReadonlyArray<P3>
  /** The same ring in the plane's own 2D coordinates (for the caps' triangulation). */
  readonly ring2d: ReadonlyArray<Vec2>
  /** The unit normal of the profile's plane and a point on it (the centre the path starts from). */
  readonly normal: P3
  readonly centre: P3
  /** The path as a polyline (world), and whether it closes on itself (the last point is not repeated). */
  readonly path: ReadonlyArray<P3>
  readonly closed: boolean
  /** Carry the path a millimetre past each end (for a tool that is subtracted, so its caps do not touch the faces it cuts). */
  readonly extend?: boolean
}

/** Sweeps a profile along a path. Throws a `RangeError` for a degenerate path or profile. */
export const sweepSolid = (input: SweepInput): Mesh => {
  let path = input.path.filter((p, i, all) => i === 0 || length(sub(p, all[i - 1]!)) > 1e-9)
  if (input.closed && path.length > 2 && length(sub(path[0]!, path[path.length - 1]!)) < 1e-9) path = path.slice(0, -1)
  if (path.length < (input.closed ? 3 : 2)) throw new RangeError("The sweep path needs at least two distinct points")
  if (input.ring.length < 3) throw new RangeError("The sweep profile needs at least three points")
  const closed = input.closed
  const n = path.length
  if (!closed && input.extend === true) {
    const t0 = unit(sub(path[1]!, path[0]!)), t1 = unit(sub(path[n - 1]!, path[n - 2]!))
    path = [sub(path[0]!, t0), ...path, add(path[n - 1]!, t1)]
  }
  const m = path.length
  const segment = (i: number): P3 => unit(sub(path[(i + 1) % m]!, path[i]!))
  const tangent = (k: number): P3 => {
    if (!closed && k === 0) return segment(0)
    if (!closed && k === m - 1) return segment(m - 2)
    const both = add(segment((k + m - 1) % m), segment(k % m))
    if (length(both) < 1e-6) throw new RangeError("The sweep path doubles back on itself")
    return unit(both)
  }
  const tangents = Array.from({ length: m }, (_, k) => tangent(k))
  const offsets = input.ring.map((q) => sub(q, input.centre))
  const rings: P3[][] = []
  let frame = alignment(unit(input.normal), tangents[0]!)
  for (let k = 0; k < m; k++) {
    if (k > 0) {
      const previous = frame
      const step = alignment(tangents[k - 1]!, tangents[k]!)
      frame = (v) => step(previous(v))
    }
    // The profile stretches along the bend direction so its wall keeps its thickness across the mitre.
    let bend: P3 | undefined
    let stretch = 1
    if (closed || (k > 0 && k < m - 1)) {
      const a = segment((k + m - 1) % m), b = segment(k % m)
      const half = length(add(a, b)) / 2
      if (half < 1e-6) throw new RangeError("The sweep path doubles back on itself")
      const d = sub(b, a)
      if (length(d) > 1e-9) { bend = unit(d); stretch = 1 / half }
    }
    rings.push(offsets.map((w) => {
      let v = frame(w)
      if (bend !== undefined) v = add(v, mul(bend, dot(v, bend) * (stretch - 1)))
      return add(path[k]!, v)
    }))
  }
  // The triangulation is of the 2D ring, which may be the mirror image of the 3D ring; orient every triangle to the ring's own 3D
  // normal so the caps agree with the side strips (closeRings turns them to face outward, and `outward` flips the whole mesh if the
  // ring ran clockwise about the path).
  const ringNormal = newell(input.ring)
  const tris = closed ? undefined : triangulateRing(input.ring2d).map(([a, b, c]) => {
    const A = input.ring[a]!, B = input.ring[b]!, C = input.ring[c]!
    return (dot(cross(sub(B, A), sub(C, A)), ringNormal) >= 0 ? [a, b, c] : [a, c, b]) as readonly [number, number, number]
  })
  return closeRings(rings, tris, tris, closed)
}

export interface LoftSectionInput {
  /** The section ring in world coordinates. */
  readonly ring: ReadonlyArray<P3>
}

const ringLength = (ring: ReadonlyArray<P3>): number => ring.reduce((sum, p, i) => sum + length(sub(ring[(i + 1) % ring.length]!, p)), 0)

/** `count` points evenly spaced by arc length round a closed ring, starting at its first point. */
export const resampleRing = (ring: ReadonlyArray<P3>, count: number): P3[] => {
  const total = ringLength(ring)
  if (!(total > 1e-9)) throw new RangeError("A loft section has no length")
  const out: P3[] = []
  let edge = 0, travelled = 0
  for (let k = 0; k < count; k++) {
    const target = (total * k) / count
    for (;;) {
      const a = ring[edge]!, b = ring[(edge + 1) % ring.length]!
      const l = length(sub(b, a))
      if (travelled + l >= target - 1e-12 || edge === ring.length - 1) {
        out.push(add(a, mul(sub(b, a), l < 1e-12 ? 0 : Math.min(1, Math.max(0, (target - travelled) / l)))))
        break
      }
      travelled += l
      edge++
    }
  }
  return out
}

/** Normal of a planar ring by Newell's method (not unit length: its length is twice the area). */
const newell = (ring: ReadonlyArray<P3>): P3 => {
  let x = 0, y = 0, z = 0
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!, q = ring[(i + 1) % ring.length]!
    x += (p.y - q.y) * (p.z + q.z); y += (p.z - q.z) * (p.x + q.x); z += (p.x - q.x) * (p.y + q.y)
  }
  return { x, y, z }
}

const centroid = (ring: ReadonlyArray<P3>): P3 => mul(ring.reduce(add, { x: 0, y: 0, z: 0 }), 1 / ring.length)

/** The ring flattened into its own plane: 2D coordinates for the cap triangulation (counter-clockwise about the normal). */
const flatten = (ring: ReadonlyArray<P3>, normal: P3): Vec2[] => {
  const n = unit(normal)
  const helper = Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
  const u = unit(cross(helper, n)), v = cross(n, u)
  const c = centroid(ring)
  return ring.map((p) => ({ x: dot(sub(p, c), u), y: dot(sub(p, c), v) }))
}

/** Catmull-Rom (uniform) between `p1` and `p2` for the neighbours `p0` and `p3`. */
const spline = (p0: P3, p1: P3, p2: P3, p3: P3, t: number): P3 => {
  const t2 = t * t, t3 = t2 * t
  const f = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), z: f(p0.z, p1.z, p2.z, p3.z) }
}

export interface LoftOptions {
  /** Points per section after resampling (default 96). */
  readonly samples?: number
  /** A Catmull-Rom curve through the sections instead of straight spans. */
  readonly smooth?: boolean
}

/** Lofts closed sections (two or more) into one solid. Throws a `RangeError` when a section is degenerate. */
export const loftSolid = (sections: ReadonlyArray<LoftSectionInput>, options: LoftOptions = {}): Mesh => {
  if (sections.length < 2) throw new RangeError("A loft needs at least two sections")
  const count = Math.max(8, Math.min(512, options.samples ?? 96))
  const centres = sections.map((s) => centroid(s.ring))
  let direction = sub(centres[centres.length - 1]!, centres[0]!)
  if (length(direction) < 1e-9) direction = newell(sections[0]!.ring)
  direction = unit(direction)
  const rings = sections.map((s) => {
    let r = resampleRing(s.ring, count)
    // Every section runs counter-clockwise about the loft direction.
    if (dot(newell(r), direction) < 0) r = [r[0]!, ...r.slice(1).reverse()]
    return r
  })
  // Rotate each ring to the start that matches the one before it most closely.
  for (let k = 1; k < rings.length; k++) {
    const previous = rings[k - 1]!, ring = rings[k]!
    let best = 0, bestCost = Infinity
    for (let shift = 0; shift < count; shift++) {
      let cost = 0
      for (let i = 0; i < count; i++) { const d = sub(ring[(i + shift) % count]!, previous[i]!); cost += dot(d, d) }
      if (cost < bestCost) { bestCost = cost; best = shift }
    }
    rings[k] = ring.map((_, i) => ring[(i + best) % count]!)
  }
  let stacked: P3[][] = rings
  if (options.smooth === true && rings.length > 2) {
    stacked = []
    for (let k = 0; k < rings.length - 1; k++) {
      const a = rings[Math.max(0, k - 1)]!, b = rings[k]!, c = rings[k + 1]!, d = rings[Math.min(rings.length - 1, k + 2)]!
      for (let step = 0; step < 4; step++) stacked.push(b.map((_, i) => spline(a[i]!, b[i]!, c[i]!, d[i]!, step / 4)))
    }
    stacked.push(rings[rings.length - 1]!)
  }
  const first = stacked[0]!, last = stacked[stacked.length - 1]!
  const startCap = triangulateRing(flatten(first, newell(first)))
  const endCap = triangulateRing(flatten(last, newell(last)))
  return closeRings(stacked, startCap, endCap, false)
}

/**
 * A path with the corners of its polyline replaced by circular bends of `radius` (the centre line of a pipe bend): each corner that
 * turns more than 5 degrees gets a tangent arc, drawn within the 0.01 mm chord tolerance. Throws a `RangeError` when two bends need
 * more of a straight run than it has, naming the run.
 */
export const roundPath = (path: ReadonlyArray<P3>, radius: number): P3[] => {
  if (!(radius > 0)) throw new RangeError(`A bend radius must be positive (it is ${radius})`)
  const n = path.length
  if (n < 3) return [...path]
  interface Corner { readonly at: number; readonly setback: number; readonly u1: P3; readonly u2: P3; readonly phi: number }
  const corners = new Map<number, Corner>()
  for (let i = 1; i < n - 1; i++) {
    const b = path[i]!
    const u1 = unit(sub(path[i - 1]!, b)), u2 = unit(sub(path[i + 1]!, b))
    const phi = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))))
    if (Math.PI - phi < (5 * Math.PI) / 180) continue
    if (phi < 1e-3) throw new RangeError("The path doubles back on itself")
    corners.set(i, { at: i, setback: radius / Math.tan(phi / 2), u1, u2, phi })
  }
  for (let i = 0; i < n - 1; i++) {
    const need = (corners.get(i)?.setback ?? 0) + (corners.get(i + 1)?.setback ?? 0)
    const run = length(sub(path[i + 1]!, path[i]!))
    if (need > run + 1e-9) throw new RangeError(`A bend radius of ${radius} mm needs ${need.toFixed(2)} mm of the ${run.toFixed(2)} mm straight run ${i + 1}`)
  }
  const out: P3[] = []
  for (let i = 0; i < n; i++) {
    const c = corners.get(i)
    if (c === undefined) { out.push(path[i]!); continue }
    const b = path[i]!
    const t1 = add(b, mul(c.u1, c.setback)), t2 = add(b, mul(c.u2, c.setback))
    const centre = add(b, mul(unit(add(c.u1, c.u2)), radius / Math.sin(c.phi / 2)))
    const d1 = unit(sub(t1, centre)), d2 = unit(sub(t2, centre))
    const sweep = Math.PI - c.phi
    const step = 2 * Math.acos(Math.max(0, 1 - 0.01 / radius))
    const steps = Math.min(96, Math.max(4, Math.ceil(sweep / Math.max(step, 1e-3))))
    out.push(t1)
    const sinS = Math.sin(sweep)
    for (let k = 1; k < steps; k++) {
      const u = k / steps
      out.push(add(centre, mul(add(mul(d1, Math.sin((1 - u) * sweep) / sinS), mul(d2, Math.sin(u * sweep) / sinS)), radius)))
    }
    out.push(t2)
  }
  return out
}
