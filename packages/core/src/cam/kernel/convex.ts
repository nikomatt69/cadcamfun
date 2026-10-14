/**
 * Exact distance between two convex solids given by their vertices (spec 29 §12, the rotating part body against the tool). The
 * solids are the convex hulls of the points; GJK (Gilbert, Johnson, Keerthi) walks the Minkowski difference A − B towards the
 * origin, and the closest point of each simplex is found over all of its subsets, so no tolerance-dependent face logic is used.
 *
 *   distance  |closest point of A − B to the origin|, mm, when the hulls do not overlap
 *   overlap   the origin lies inside A − B: the hulls share a point
 *
 * A cylinder is represented by a prism of `sides` facets whose vertices lie on the circumscribed circle, so its distance is never
 * under-estimated (a circumscribed polygon contains the cylinder's cross-section). Its flat ends are exact, which a capsule is not.
 */
import { length3, type Vec3 } from "../../cad/vec.ts"

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const EPS = 1e-12

/** The vertices of a prism circumscribing a cylinder of `radius` about the axis through `base` along `axis` (unit), from `z0` to `z1`. */
export const cylinderPrism = (base: Vec3, axis: Vec3, z0: number, z1: number, radius: number, sides = 32): Vec3[] => {
  // Build two unit vectors orthogonal to the axis.
  const helper = Math.abs(axis.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  const u0 = { x: helper.y * axis.z - helper.z * axis.y, y: helper.z * axis.x - helper.x * axis.z, z: helper.x * axis.y - helper.y * axis.x }
  const ul = length3(u0)
  const u = { x: u0.x / ul, y: u0.y / ul, z: u0.z / ul }
  const v = { x: axis.y * u.z - axis.z * u.y, y: axis.z * u.x - axis.x * u.z, z: axis.x * u.y - axis.y * u.x }
  const rc = radius / Math.cos(Math.PI / sides)
  const out: Vec3[] = []
  for (const z of [z0, z1]) {
    const c = { x: base.x + axis.x * z, y: base.y + axis.y * z, z: base.z + axis.z * z }
    for (let k = 0; k < sides; k++) {
      const t = (2 * Math.PI * k) / sides
      const cs = Math.cos(t) * rc, sn = Math.sin(t) * rc
      out.push({ x: c.x + u.x * cs + v.x * sn, y: c.y + u.y * cs + v.y * sn, z: c.z + u.z * cs + v.z * sn })
    }
  }
  return out
}

/** The eight corners of a box (centre, half extents in its own frame) mapped by `toMachine`. */
export const boxVertices = (centre: Vec3, half: Vec3, toMachine: (p: Vec3) => Vec3 = (p) => p): Vec3[] => {
  const out: Vec3[] = []
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    out.push(toMachine({ x: centre.x + sx * half.x, y: centre.y + sy * half.y, z: centre.z + sz * half.z }))
  return out
}

const support = (pts: ReadonlyArray<Vec3>, d: Vec3): Vec3 => {
  let best = pts[0]!, bestDot = dot(best, d)
  for (let i = 1; i < pts.length; i++) {
    const v = dot(pts[i]!, d)
    if (v > bestDot) { bestDot = v; best = pts[i]! }
  }
  return best
}

/**
 * The point of conv(S) closest to the origin, with the subset of S it lies in. Every subset T is tried: the closest point of its affine
 * hull, with the weights λ of the points summing to one, is a candidate when every weight is non-negative; the smallest candidate
 * is the closest point of conv(S).
 */
const closestOnHull = (S: ReadonlyArray<Vec3>): { point: Vec3; subset: Vec3[] } => {
  let best: { point: Vec3; subset: Vec3[] } | undefined
  const n = S.length
  for (let mask = 1; mask < 1 << n; mask++) {
    const T = S.filter((_, i) => (mask & (1 << i)) !== 0)
    const lam = affineMinimiser(T)
    if (lam === undefined || lam.some((x) => x < -1e-12)) continue
    const p = T.reduce((acc, t, i) => ({ x: acc.x + lam[i]! * t.x, y: acc.y + lam[i]! * t.y, z: acc.z + lam[i]! * t.z }), { x: 0, y: 0, z: 0 })
    if (best === undefined || length3(p) < length3(best.point)) best = { point: p, subset: T }
  }
  return best ?? { point: S[0]!, subset: [S[0]!] }
}

/**
 * Weights λ with Σλ = 1 that minimise |Σ λ_i t_i|²: the KKT system [G 1; 1ᵀ 0][λ; μ] = [0; 1] with the Gram matrix G. `undefined`
 * when the points are dependent (their subset is then covered by a smaller one).
 */
const affineMinimiser = (T: ReadonlyArray<Vec3>): number[] | undefined => {
  const k = T.length, m = k + 1
  const A: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0))
  const b = new Array<number>(m).fill(0)
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) A[i]![j] = dot(T[i]!, T[j]!)
    A[i]![k] = 1
    A[k]![i] = 1
  }
  b[k] = 1
  for (let col = 0; col < m; col++) {
    let piv = col
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r]![col]!) > Math.abs(A[piv]![col]!)) piv = r
    if (Math.abs(A[piv]![col]!) < 1e-12) return undefined
    ;[A[col], A[piv]] = [A[piv]!, A[col]!]
    ;[b[col], b[piv]] = [b[piv]!, b[col]!]
    for (let r = 0; r < m; r++) {
      if (r === col) continue
      const f = A[r]![col]! / A[col]![col]!
      for (let c = col; c < m; c++) A[r]![c]! -= f * A[col]![c]!
      b[r]! -= f * b[col]!
    }
  }
  return Array.from({ length: k }, (_, i) => b[i]! / A[i]![i]!)
}

export interface HullDistance {
  /** Distance between the hulls, mm (0 when they overlap). */
  readonly distance: number
  readonly overlap: boolean
  /** Iterations used. */
  readonly iterations: number
}

/** Distance between conv(A) and conv(B), exact up to the GJK tolerance (1e-9 mm). */
export const hullDistance = (A: ReadonlyArray<Vec3>, B: ReadonlyArray<Vec3>): HullDistance => {
  const minkowski = (d: Vec3): Vec3 => sub(support(A, d), support(B, { x: -d.x, y: -d.y, z: -d.z }))
  let S: Vec3[] = [minkowski({ x: 1, y: 0, z: 0 })]
  let v = S[0]!
  for (let it = 1; it <= 200; it++) {
    const c = closestOnHull(S)
    v = c.point
    const vn = length3(v)
    if (vn <= 1e-9) return { distance: 0, overlap: true, iterations: it }
    S = c.subset
    const w = minkowski({ x: -v.x, y: -v.y, z: -v.z })
    // The support in direction -v bounds the distance from below by w·v / |v|: no progress means v is the closest point.
    if (vn * vn - dot(v, w) <= 1e-10 * vn) return { distance: vn, overlap: false, iterations: it }
    if (S.some((p) => length3(sub(p, w)) < 1e-12)) return { distance: vn, overlap: false, iterations: it }
    S = [...S, w]
  }
  return { distance: length3(v), overlap: false, iterations: 200 }
}
