/**
 * Exact measurement of B-rep entities: the kernel side of the CAD "Measure" inspector (Fusion 360 Inspect > Measure class).
 *
 * An entity is a vertex, an edge, a face or the whole body of a `Brep`. `measureEntity` reports what one entity is (a point; an
 * edge's exact arc length, kind, radius / centre / sweep of a circle, direction of a line; a face's area, surface kind, normal
 * of a plane, radius / axis of a cylinder, sphere or cone, the torus radii; a body's volume, area, centroid and box).
 * `measureBetween` reports two entities against each other: the minimum distance with both closest points and the X / Y / Z
 * deltas, and, when both have a direction (a straight edge, a plane, the axis of a cylinder, cone or circle), the angle, whether
 * they are parallel and, for two parallel planes or lines, the perpendicular gap.
 *
 * Accuracy: closest points come from exact projections onto the curves and surfaces (a face's projection is checked against its
 * trimming loops, otherwise its boundary edges are projected), seeded from samples of both entities and refined by alternating
 * projection, the same scheme `minimumDistance` uses for whole solids. Edge lengths integrate |C'(t)| with Gauss-Legendre
 * quadrature on sub-intervals; face areas are the kernel's mass-property face areas (integrated over the parameter domain).
 * Nothing here moves or rebuilds geometry. The inputs are already placed: a caller that draws a body under a transform passes
 * the transformed body (`transformBrep`).
 */
import { add3, cross3, dist3, dot3, length3, normalize3, scale3, sub3, type Vec3 } from "./math.ts"
import { curveDerivs, curvePoint, curveProject, newtonSurface, surfacePoint, surfaceProject, type Curve3, type Surface } from "./geom.ts"
import { brepLocator, type BrepLocator } from "./classify.ts"
import { massProperties, type MassProperties } from "./mass.ts"
import { tessellateBrep, type BrepTessellation } from "./tessellate.ts"
import type { Brep } from "./topology.ts"

export type MeasureEntityKind = "vertex" | "edge" | "face" | "body"

/** One entity of a body: `index` is the vertex, edge or face index; a body ignores it. */
export interface MeasureRef {
  readonly kind: MeasureEntityKind
  readonly index: number
}

export interface MeasureBox { readonly min: Vec3; readonly max: Vec3 }

export type EntityMeasure =
  | { readonly kind: "vertex"; readonly index: number; readonly point: Vec3 }
  | {
    readonly kind: "edge"; readonly index: number; readonly curve: Curve3["kind"]; readonly length: number
    readonly start: Vec3; readonly end: Vec3; readonly closed: boolean
    /** A straight edge: unit direction from start to end. */
    readonly direction?: Vec3
    /** A circular edge: radius, centre, axis and the swept angle in degrees. */
    readonly radius?: number; readonly center?: Vec3; readonly axis?: Vec3; readonly sweepDeg?: number
  }
  | {
    readonly kind: "face"; readonly index: number; readonly surface: Surface["kind"]; readonly area: number
    readonly name?: string
    /** A planar face: outward unit normal and a point of the plane. */
    readonly normal?: Vec3; readonly origin?: Vec3
    /** Cylinder, cone, sphere, torus: the radius (cone: at the frame origin; torus: the minor radius) and the axis / centre. */
    readonly radius?: number; readonly majorRadius?: number; readonly center?: Vec3; readonly axis?: Vec3; readonly semiAngleDeg?: number
  }
  | { readonly kind: "body"; readonly volume: number; readonly area: number; readonly centroid: Vec3; readonly box: MeasureBox; readonly faces: number; readonly edges: number; readonly vertices: number }

export interface BetweenMeasure {
  /** Minimum distance between the two entities (0 when they touch or cross). */
  readonly distance: number
  /** The closest point on the first entity and on the second. */
  readonly pointA: Vec3
  readonly pointB: Vec3
  /** `pointB - pointA` per axis. */
  readonly delta: Vec3
  /** Angle between the two directions in degrees, when both have one (see `directionOf`). */
  readonly angleDeg?: number
  /** True when both have a direction and those are parallel (or anti-parallel) within 1e-9 rad. */
  readonly parallel?: boolean
  /** Two parallel planes or lines: their perpendicular gap (the distance between the infinite carriers). */
  readonly perpendicularGap?: number
}

/** What a direction is: a line (straight edge, an axis) or a plane normal. Angles between them follow the usual conventions. */
export interface EntityDirection { readonly kind: "line" | "normal"; readonly direction: Vec3; readonly point: Vec3 }

export class MeasureError extends Error {
  readonly _tag = "MeasureError"
}

// ---------------------------------------------------------------------------------------------------- caches

const massCache = new WeakMap<Brep, MassProperties>()
const massOf = (b: Brep): MassProperties => {
  let hit = massCache.get(b)
  if (hit === undefined) { hit = massProperties(b); massCache.set(b, hit) }
  return hit
}
const locatorCache = new WeakMap<Brep, BrepLocator>()
const locatorOf = (b: Brep): BrepLocator => {
  let hit = locatorCache.get(b)
  if (hit === undefined) { hit = brepLocator(b); locatorCache.set(b, hit) }
  return hit
}
const meshCache = new WeakMap<Brep, BrepTessellation>()
const meshOf = (b: Brep): BrepTessellation => {
  let hit = meshCache.get(b)
  if (hit === undefined) { hit = tessellateBrep(b, { angleTolDeg: 15 }); meshCache.set(b, hit) }
  return hit
}

const check = (b: Brep, ref: MeasureRef): void => {
  const count = ref.kind === "vertex" ? b.vertices.length : ref.kind === "edge" ? b.edges.length : ref.kind === "face" ? b.faces.length : 1
  if (ref.kind !== "body" && (!Number.isInteger(ref.index) || ref.index < 0 || ref.index >= count)) {
    throw new MeasureError(`${ref.kind} ${ref.index} does not exist (the body has ${count})`)
  }
}

// ---------------------------------------------------------------------------------------------------- single entities

/** Gauss-Legendre nodes and weights on [-1, 1], 8 points. */
const GL_X = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363]
const GL_W = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620, 0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763]

/** Arc length of `c` over [t0, t1]: closed form for lines and circles, composite Gauss-Legendre otherwise. */
export const curveLength = (c: Curve3, t0: number, t1: number): number => {
  if (c.kind === "line") return Math.abs(t1 - t0)
  if (c.kind === "circle") return Math.abs(t1 - t0) * c.radius
  const pieces = c.kind === "nurbs" ? Math.max(16, c.data.points.length * 4) : 32
  let sum = 0
  const h = (t1 - t0) / pieces
  for (let k = 0; k < pieces; k++) {
    const a = t0 + k * h, mid = a + h / 2
    for (let i = 0; i < GL_X.length; i++) sum += GL_W[i]! * length3(curveDerivs(c, mid + (h / 2) * GL_X[i]!)[1]) * (h / 2)
  }
  return Math.abs(sum)
}

const boxOf = (b: Brep): MeasureBox => {
  const t = meshOf(b)
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity }
  const grow = (x: number, y: number, z: number) => {
    min.x = Math.min(min.x, x); min.y = Math.min(min.y, y); min.z = Math.min(min.z, z)
    max.x = Math.max(max.x, x); max.y = Math.max(max.y, y); max.z = Math.max(max.z, z)
  }
  for (let i = 0; i < t.positions.length; i += 3) grow(t.positions[i]!, t.positions[i + 1]!, t.positions[i + 2]!)
  for (const v of b.vertices) grow(v.point.x, v.point.y, v.point.z)
  return { min, max }
}

/** What one entity is, measured exactly (see the module comment). */
export const measureEntity = (b: Brep, ref: MeasureRef): EntityMeasure => {
  check(b, ref)
  switch (ref.kind) {
    case "vertex": return { kind: "vertex", index: ref.index, point: b.vertices[ref.index]!.point }
    case "edge": {
      const e = b.edges[ref.index]!
      const start = curvePoint(e.curve, e.t0), end = curvePoint(e.curve, e.t1)
      const base = { kind: "edge" as const, index: ref.index, curve: e.curve.kind, length: curveLength(e.curve, e.t0, e.t1), start, end, closed: e.v0 === e.v1 }
      if (e.curve.kind === "line") return { ...base, direction: normalize3(sub3(end, start)) }
      if (e.curve.kind === "circle") {
        return { ...base, radius: e.curve.radius, center: e.curve.frame.origin, axis: e.curve.frame.z, sweepDeg: (Math.abs(e.t1 - e.t0) * 180) / Math.PI }
      }
      return base
    }
    case "face": {
      const f = b.faces[ref.index]!
      const s = f.surface
      const base = { kind: "face" as const, index: ref.index, surface: s.kind, area: massOf(b).faceAreas[ref.index] ?? 0, ...(f.name !== undefined ? { name: f.name } : {}) }
      switch (s.kind) {
        case "plane": return { ...base, normal: f.reversed ? scale3(s.frame.z, -1) : s.frame.z, origin: s.frame.origin }
        case "cylinder": return { ...base, radius: s.radius, center: s.frame.origin, axis: s.frame.z }
        case "cone": return { ...base, radius: s.radius, center: s.frame.origin, axis: s.frame.z, semiAngleDeg: (s.semiAngle * 180) / Math.PI }
        case "sphere": return { ...base, radius: s.radius, center: s.frame.origin }
        case "torus": return { ...base, radius: s.minor, majorRadius: s.major, center: s.frame.origin, axis: s.frame.z }
        default: return base
      }
    }
    case "body": {
      const m = massOf(b)
      return { kind: "body", volume: m.volume, area: m.area, centroid: m.centroid, box: boxOf(b), faces: b.faces.length, edges: b.edges.length, vertices: b.vertices.length }
    }
  }
}

/** The direction an entity carries, if any: a straight edge or a cylinder / cone / torus / circle axis is a line, a plane a normal. */
export const directionOf = (b: Brep, ref: MeasureRef): EntityDirection | undefined => {
  check(b, ref)
  if (ref.kind === "edge") {
    const e = b.edges[ref.index]!
    if (e.curve.kind === "line") return { kind: "line", direction: e.curve.dir, point: e.curve.origin }
    if (e.curve.kind === "circle" || e.curve.kind === "ellipse") return { kind: "line", direction: e.curve.frame.z, point: e.curve.frame.origin }
    return undefined
  }
  if (ref.kind === "face") {
    const f = b.faces[ref.index]!
    const s = f.surface
    if (s.kind === "plane") return { kind: "normal", direction: f.reversed ? scale3(s.frame.z, -1) : s.frame.z, point: s.frame.origin }
    if (s.kind === "cylinder" || s.kind === "cone" || s.kind === "torus") return { kind: "line", direction: s.frame.z, point: s.frame.origin }
  }
  return undefined
}

// ---------------------------------------------------------------------------------------------------- closest points

/** Closest point of an entity to `p` (exact projection; a face is clipped by its trimming loops). */
const closestOn = (b: Brep, ref: MeasureRef, p: Vec3): Vec3 => {
  switch (ref.kind) {
    case "vertex": return b.vertices[ref.index]!.point
    case "edge": {
      const e = b.edges[ref.index]!
      return curvePoint(e.curve, curveProject(e.curve, p, Math.min(e.t0, e.t1), Math.max(e.t0, e.t1)))
    }
    case "face": return closestOnFace(b, ref.index, p)
    case "body": return locatorOf(b).closest(p).point
  }
}

const closestOnFace = (b: Brep, fi: number, p: Vec3): Vec3 => {
  const f = b.faces[fi]!
  const locator = locatorOf(b)
  let best: Vec3 | undefined
  let bestD = Infinity
  const take = (q: Vec3) => { const d = dist3(p, q); if (d < bestD) { bestD = d; best = q } }
  const uv = surfaceProject(f.surface, p)
  if (locator.insideFace(fi, uv.u, uv.v)) take(surfacePoint(f.surface, uv.u, uv.v))
  // A trimmed face can hold its minimum inside away from the untrimmed projection (a torus, a NURBS patch): seed Newton from
  // the nearest vertex of the face's own mesh too.
  const mesh = meshOf(b).faces.find((m) => m.face === fi)
  if (mesh !== undefined) {
    let k = -1, kd = Infinity
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const d = Math.hypot(mesh.positions[i]! - p.x, mesh.positions[i + 1]! - p.y, mesh.positions[i + 2]! - p.z)
      if (d < kd) { kd = d; k = i / 3 }
    }
    if (k >= 0) {
      const seed = { u: mesh.uvs[k * 2]!, v: mesh.uvs[k * 2 + 1]! }
      const q = newtonSurface(f.surface, p, seed)
      if (locator.insideFace(fi, q.u, q.v)) take(surfacePoint(f.surface, q.u, q.v))
      else take({ x: mesh.positions[k * 3]!, y: mesh.positions[k * 3 + 1]!, z: mesh.positions[k * 3 + 2]! })
    }
  }
  for (const loop of f.loops) for (const c of loop.coedges) take(closestOn(b, { kind: "edge", index: c.edge }, p))
  return best ?? surfacePoint(f.surface, uv.u, uv.v)
}

/** Points spread over an entity, the seeds of the alternating projection. */
const samplesOf = (b: Brep, ref: MeasureRef): Vec3[] => {
  switch (ref.kind) {
    case "vertex": return [b.vertices[ref.index]!.point]
    case "edge": {
      const e = b.edges[ref.index]!
      const n = e.curve.kind === "line" ? 8 : 48
      return Array.from({ length: n + 1 }, (_, k) => curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / n))
    }
    case "face": {
      const mesh = meshOf(b).faces.find((m) => m.face === ref.index)
      const out: Vec3[] = []
      if (mesh !== undefined) {
        const count = mesh.positions.length / 3
        const stride = Math.max(1, Math.floor(count / 400))
        for (let k = 0; k < count; k += stride) out.push({ x: mesh.positions[k * 3]!, y: mesh.positions[k * 3 + 1]!, z: mesh.positions[k * 3 + 2]! })
      }
      for (const loop of b.faces[ref.index]!.loops) for (const c of loop.coedges) out.push(...samplesOf(b, { kind: "edge", index: c.edge }).filter((_, k) => k % 4 === 0))
      return out
    }
    case "body": {
      const t = meshOf(b)
      const out: Vec3[] = []
      const count = t.positions.length / 3
      const stride = Math.max(1, Math.floor(count / 800))
      for (let k = 0; k < count; k += stride) out.push({ x: t.positions[k * 3]!, y: t.positions[k * 3 + 1]!, z: t.positions[k * 3 + 2]! })
      return out
    }
  }
}

const angleBetween = (a: Vec3, b: Vec3): number => {
  // atan2 of |a x b| and a . b: accurate near 0 and 180 degrees, where acos loses digits.
  return Math.atan2(length3(cross3(a, b)), dot3(a, b))
}

const PARALLEL_TOL = 1e-9

/**
 * Two entities against each other: minimum distance and closest points (alternating exact projection from the best seeds of
 * both sides), and the angle / parallel gap when both carry a direction. `a` and `b` may be the same body.
 */
export const measureBetween = (bodyA: Brep, refA: MeasureRef, bodyB: Brep, refB: MeasureRef, options: { readonly candidates?: number; readonly iterations?: number } = {}): BetweenMeasure => {
  check(bodyA, refA); check(bodyB, refB)
  const k = Math.max(1, options.candidates ?? 6)
  const iterations = Math.max(1, options.iterations ?? 40)
  let best = { d: Infinity, a: { x: 0, y: 0, z: 0 } as Vec3, b: { x: 0, y: 0, z: 0 } as Vec3 }
  const refine = (pa: Vec3, pb: Vec3) => {
    let a = pa, b = pb, d = dist3(a, b)
    for (let it = 0; it < iterations; it++) {
      const a2 = closestOn(bodyA, refA, b)
      const b2 = closestOn(bodyB, refB, a2)
      const d2 = dist3(a2, b2)
      if (d2 > d - 1e-13) { if (d2 <= d) { a = a2; b = b2; d = d2 } break }
      a = a2; b = b2; d = d2
    }
    if (d < best.d) best = { d, a, b }
  }
  const seeds = (fromBody: Brep, from: MeasureRef, toBody: Brep, to: MeasureRef, swap: boolean) => {
    const near = samplesOf(fromBody, from).map((p) => { const q = closestOn(toBody, to, p); return { p, q, d: dist3(p, q) } }).sort((x, y) => x.d - y.d)
    const picked: typeof near = []
    const gap = near.length === 0 ? 0 : near[0]!.d * 0.25 + 1e-9
    for (const n of near) {
      if (picked.length >= k) break
      if (picked.every((m) => dist3(m.p, n.p) > gap)) picked.push(n)
    }
    for (const n of picked) swap ? refine(n.q, n.p) : refine(n.p, n.q)
  }
  seeds(bodyA, refA, bodyB, refB, false)
  seeds(bodyB, refB, bodyA, refA, true)
  const distance = best.d < 1e-12 ? 0 : best.d
  const result: BetweenMeasure = { distance, pointA: best.a, pointB: best.b, delta: sub3(best.b, best.a) }
  const da = directionOf(bodyA, refA), db = directionOf(bodyB, refB)
  if (da === undefined || db === undefined) return result
  const raw = angleBetween(da.direction, db.direction)
  const acute = Math.min(raw, Math.PI - raw)
  let angle: number
  if (da.kind === db.kind) angle = da.kind === "normal" ? raw : acute
  else angle = Math.PI / 2 - acute // a line against a plane: the angle with the plane, not with its normal
  const parallel = da.kind === db.kind ? acute <= PARALLEL_TOL : Math.abs(Math.PI / 2 - acute) <= PARALLEL_TOL
  const out = { ...result, angleDeg: (angle * 180) / Math.PI, parallel }
  if (!parallel || da.kind !== db.kind) return out
  // Parallel carriers: the gap between the infinite plane / line through each.
  const offset = sub3(db.point, da.point)
  const gap = da.kind === "normal"
    ? Math.abs(dot3(offset, normalize3(da.direction)))
    : length3(sub3(offset, scale3(normalize3(da.direction), dot3(offset, normalize3(da.direction)))))
  return { ...out, perpendicularGap: gap }
}

/** The middle of the two closest points (where a dimension label goes). */
export const measureMidpoint = (m: BetweenMeasure): Vec3 => scale3(add3(m.pointA, m.pointB), 0.5)
