/**
 * Exact intersections for the Boolean (SMLib's SmTopologyIntersector / SmSurfaceIntersector / SmSurfaceTracer):
 *
 * - curve × surface: seeds from the edge polyline against the face triangles, refined by Newton on C(t) = S(u, v);
 * - curve on surface: an edge lying in another face's surface (coplanar and coincident faces);
 * - curve × curve: for edges sharing a surface, refined by Gauss–Newton on |C1(t) − C2(s)|;
 * - surface × surface: seeds from triangle–triangle intersections of the two face meshes, chained topologically
 *   (by mesh edge and triangle, not by coordinates), each point refined onto both exact surfaces by Newton's method
 *   on (u_a, v_a, u_b, v_b) with a plane constraint across the curve, then resampled until the chords are within the
 *   fit tolerance.
 */
import { cross3, dist3, dot3, length3, normalize3, solve2, solveDense, sub3, unwrapNear as unwrapNearCheck, type Vec2, type Vec3 } from "./math.ts"
import { curveDerivs, curvePoint, curveProject, surfaceDerivs, surfaceNormal, surfacePeriods, surfacePoint, surfaceProject, type Curve3, type Surface, type SurfaceParam } from "./geom.ts"
import type { Edge } from "./topology.ts"
import type { FaceMesh } from "./tessellate.ts"
import { checkBudget } from "./budget.ts"

// ================================================================ triangle BVH

export interface TriSet {
  readonly pos: (i: number) => Vec3
  readonly uv: (i: number) => Vec2
  /** Global (welded) point id of local vertex i. */
  readonly gid: (i: number) => number
  readonly tris: ReadonlyArray<readonly [number, number, number]>
}

export const triSetOfFace = (fm: FaceMesh): TriSet => {
  const tris: Array<readonly [number, number, number]> = []
  for (let i = 0; i < fm.indices.length; i += 3) tris.push([fm.indices[i]!, fm.indices[i + 1]!, fm.indices[i + 2]!])
  return {
    pos: (i) => ({ x: fm.positions[i * 3]!, y: fm.positions[i * 3 + 1]!, z: fm.positions[i * 3 + 2]! }),
    uv: (i) => ({ x: fm.uvs[i * 2]!, y: fm.uvs[i * 2 + 1]! }),
    gid: (i) => fm.global[i]!,
    tris
  }
}

interface Node {
  lo: Vec3
  hi: Vec3
  left?: Node
  right?: Node
  items?: number[]
}

export class TriBvh {
  readonly root: Node | undefined
  constructor(readonly set: TriSet, pad = 0) {
    const ids = set.tris.map((_, i) => i)
    const boxes = set.tris.map((t) => {
      const a = set.pos(t[0]), b = set.pos(t[1]), c = set.pos(t[2])
      return {
        lo: { x: Math.min(a.x, b.x, c.x) - pad, y: Math.min(a.y, b.y, c.y) - pad, z: Math.min(a.z, b.z, c.z) - pad },
        hi: { x: Math.max(a.x, b.x, c.x) + pad, y: Math.max(a.y, b.y, c.y) + pad, z: Math.max(a.z, b.z, c.z) + pad }
      }
    })
    this.boxes = boxes
    this.root = ids.length === 0 ? undefined : this.build(ids)
  }
  private readonly boxes: ReadonlyArray<{ lo: Vec3; hi: Vec3 }>
  private build(ids: number[]): Node {
    let lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
    for (const i of ids) {
      const b = this.boxes[i]!
      lo = { x: Math.min(lo.x, b.lo.x), y: Math.min(lo.y, b.lo.y), z: Math.min(lo.z, b.lo.z) }
      hi = { x: Math.max(hi.x, b.hi.x), y: Math.max(hi.y, b.hi.y), z: Math.max(hi.z, b.hi.z) }
    }
    if (ids.length <= 6) return { lo, hi, items: ids }
    const ext = { x: hi.x - lo.x, y: hi.y - lo.y, z: hi.z - lo.z }
    const axis: "x" | "y" | "z" = ext.x >= ext.y && ext.x >= ext.z ? "x" : ext.y >= ext.z ? "y" : "z"
    const c = (i: number) => (this.boxes[i]!.lo[axis] + this.boxes[i]!.hi[axis]) / 2
    ids.sort((a, b) => c(a) - c(b))
    const mid = ids.length >> 1
    return { lo, hi, left: this.build(ids.slice(0, mid)), right: this.build(ids.slice(mid)) }
  }
  /** Triangles whose (padded) box overlaps [lo, hi]. */
  query(lo: Vec3, hi: Vec3, out: number[] = []): number[] {
    const stack: Node[] = this.root === undefined ? [] : [this.root]
    while (stack.length > 0) {
      const n = stack.pop()!
      if (n.hi.x < lo.x || n.lo.x > hi.x || n.hi.y < lo.y || n.lo.y > hi.y || n.hi.z < lo.z || n.lo.z > hi.z) continue
      if (n.items !== undefined) {
        for (const i of n.items) {
          const b = this.boxes[i]!
          if (b.hi.x < lo.x || b.lo.x > hi.x || b.hi.y < lo.y || b.lo.y > hi.y || b.hi.z < lo.z || b.lo.z > hi.z) continue
          out.push(i)
        }
      } else {
        stack.push(n.left!, n.right!)
      }
    }
    return out
  }
}

// ================================================================ segment × triangle

/** Intersection of segment p→q with triangle (a, b, c): segment parameter and barycentrics, or undefined. */
const segTri = (p: Vec3, q: Vec3, a: Vec3, b: Vec3, c: Vec3): { readonly s: number; readonly l1: number; readonly l2: number } | undefined => {
  const e1 = sub3(b, a), e2 = sub3(c, a)
  const d = sub3(q, p)
  const h = cross3(d, e2)
  const det = dot3(e1, h)
  const scale = length3(e1) * length3(e2) * length3(d)
  if (Math.abs(det) <= 1e-14 * scale) return undefined
  const f = 1 / det
  const sv = sub3(p, a)
  const l1 = f * dot3(sv, h)
  if (l1 < 0 || l1 > 1) return undefined
  const qv = cross3(sv, e1)
  const l2 = f * dot3(d, qv)
  if (l2 < 0 || l1 + l2 > 1) return undefined
  const s = f * dot3(e2, qv)
  if (s < 0 || s > 1) return undefined
  return { s, l1, l2 }
}

// ================================================================ curve × surface

export interface CurveSurfaceHit {
  readonly t: number
  readonly u: number
  readonly v: number
  readonly point: Vec3
}

/** Newton on C(t) − S(u, v) = 0. */
export const refineCurveSurface = (c: Curve3, s: Surface, t0: number, uv0: SurfaceParam, tol: number): CurveSurfaceHit | undefined => {
  let t = t0, u = uv0.u, v = uv0.v
  for (let it = 0; it < 30; it++) {
    const [C, D] = curveDerivs(c, t)
    const S = surfaceDerivs(s, u, v)
    const F = sub3(C, S.p)
    if (length3(F) < tol * 1e-3) break
    let step: number[][]
    try {
      step = solveDense(
        [
          [D.x, -S.su.x, -S.sv.x],
          [D.y, -S.su.y, -S.sv.y],
          [D.z, -S.su.z, -S.sv.z]
        ],
        [[-F.x], [-F.y], [-F.z]]
      )
    } catch {
      return undefined
    }
    t += step[0]![0]!
    u += step[1]![0]!
    v += step[2]![0]!
    if (!Number.isFinite(t + u + v)) return undefined
  }
  const P = curvePoint(c, t)
  if (dist3(P, surfacePoint(s, u, v)) > tol) return undefined
  return { t, u, v, point: P }
}

/**
 * Transversal hits of edge `e` (sampled at `params`, 3D `points`) with the triangulated face `mesh` of `s`.
 * Parameters within [t0, t1] (ends included); hits closer than `tol` are merged.
 */
export const edgeSurfaceHits = (
  e: Edge,
  params: ReadonlyArray<number>,
  points: ReadonlyArray<Vec3>,
  s: Surface,
  mesh: TriSet,
  bvh: TriBvh,
  tol: number
): CurveSurfaceHit[] => {
  const hits: CurveSurfaceHit[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const p = points[i]!, q = points[i + 1]!
    const lo = { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), z: Math.min(p.z, q.z) }
    const hi = { x: Math.max(p.x, q.x), y: Math.max(p.y, q.y), z: Math.max(p.z, q.z) }
    for (const ti of bvh.query(lo, hi)) {
      const [ia, ib, ic] = mesh.tris[ti]!
      const r = segTri(p, q, mesh.pos(ia), mesh.pos(ib), mesh.pos(ic))
      if (r === undefined) continue
      const t = params[i]! + (params[i + 1]! - params[i]!) * r.s
      const ua = mesh.uv(ia), ub = mesh.uv(ib), uc = mesh.uv(ic)
      const l0 = 1 - r.l1 - r.l2
      const uv = { u: l0 * ua.x + r.l1 * ub.x + r.l2 * uc.x, v: l0 * ua.y + r.l1 * ub.y + r.l2 * uc.y }
      const h = refineCurveSurface(e.curve, s, t, uv, tol)
      if (h === undefined) continue
      const span = e.t1 - e.t0
      if (h.t < e.t0 - 1e-9 * span || h.t > e.t1 + 1e-9 * span) continue
      const tt = Math.min(e.t1, Math.max(e.t0, h.t))
      if (hits.some((x) => dist3(x.point, h.point) < tol)) continue
      hits.push({ ...h, t: tt, point: curvePoint(e.curve, tt) })
    }
  }
  return hits.sort((a, b) => a.t - b.t)
}

/** True when the edge lies on the surface (every sample within `tol`). */
export const edgeOnSurface = (e: Edge, s: Surface, tol: number): boolean => {
  for (let k = 0; k <= 12; k++) {
    const p = curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 12)
    const q = surfaceProject(s, p)
    if (dist3(surfacePoint(s, q.u, q.v), p) > tol) return false
  }
  return true
}

// ================================================================ curve × curve

export interface CurveCurveHit {
  readonly t: number
  readonly s: number
  readonly point: Vec3
}

/** Gauss–Newton on |C1(t) − C2(s)|²; returns the hit when the curves meet within `tol`. */
export const refineCurveCurve = (c1: Curve3, c2: Curve3, t0: number, s0: number, tol: number): CurveCurveHit | undefined => {
  let t = t0, s = s0
  for (let it = 0; it < 40; it++) {
    const [P, dP] = curveDerivs(c1, t)
    const [Q, dQ] = curveDerivs(c2, s)
    const F = sub3(P, Q)
    // J = [dP, −dQ]; normal equations.
    const a = dot3(dP, dP), b = -dot3(dP, dQ), d = dot3(dQ, dQ)
    const g1 = dot3(dP, F), g2 = -dot3(dQ, F)
    const st = solve2(a, b, b, d, -g1, -g2)
    if (st === undefined) break
    t += st[0]
    s += st[1]
    if (Math.abs(st[0]) + Math.abs(st[1]) < 1e-15 * (1 + Math.abs(t) + Math.abs(s))) break
  }
  const P = curvePoint(c1, t)
  if (dist3(P, curvePoint(c2, s)) > tol) return undefined
  return { t, s, point: P }
}

/** Crossings (and touchings) of two edges, from their polylines; includes end points lying on the other edge. */
export const edgeEdgeHits = (
  e1: Edge,
  p1: ReadonlyArray<number>,
  x1: ReadonlyArray<Vec3>,
  e2: Edge,
  p2: ReadonlyArray<number>,
  x2: ReadonlyArray<Vec3>,
  seedDist: number,
  tol: number
): CurveCurveHit[] => {
  const hits: CurveCurveHit[] = []
  // Where the curves touch (tangent at the hit, e.g. a fillet's tangent line meeting the arc that ends it) Newton converges
  // slowly and stops short; when such a hit is near an end point of either edge that lies exactly on the other curve, that
  // end point is the intersection.
  const ends: Array<{ readonly p: Vec3; readonly onFirst: boolean; readonly param: number }> = [
    { p: curvePoint(e1.curve, e1.t0), onFirst: true, param: e1.t0 }, { p: curvePoint(e1.curve, e1.t1), onFirst: true, param: e1.t1 },
    { p: curvePoint(e2.curve, e2.t0), onFirst: false, param: e2.t0 }, { p: curvePoint(e2.curve, e2.t1), onFirst: false, param: e2.t1 }
  ]
  const snap = Math.max(seedDist * 0.25, tol * 100)
  const snapped = (h: CurveCurveHit): CurveCurveHit => {
    for (const end of ends) {
      if (dist3(end.p, h.point) > snap) continue
      const other = end.onFirst ? e2 : e1
      const q = curveProject(other.curve, end.p, other.t0, other.t1)
      if (dist3(curvePoint(other.curve, q), end.p) > tol) continue
      return end.onFirst ? { t: end.param, s: q, point: end.p } : { t: q, s: end.param, point: end.p }
    }
    return h
  }
  const add = (raw: CurveCurveHit | undefined) => {
    if (raw === undefined) return
    const h = snapped(raw)
    const s1 = e1.t1 - e1.t0, s2 = e2.t1 - e2.t0
    if (h.t < e1.t0 - 1e-9 * s1 || h.t > e1.t1 + 1e-9 * s1 || h.s < e2.t0 - 1e-9 * s2 || h.s > e2.t1 + 1e-9 * s2) return
    const t = Math.min(e1.t1, Math.max(e1.t0, h.t)), s = Math.min(e2.t1, Math.max(e2.t0, h.s))
    if (hits.some((x) => dist3(x.point, h.point) < tol)) return
    hits.push({ t, s, point: curvePoint(e1.curve, t) })
  }
  // Edges on one curve (a stretch both solids use, e.g. two blends meeting on their mitre ellipse): every sample would
  // "cross"; only the ends of the overlap are vertices, i.e. each edge's end points that lie on the other edge.
  const paramOn = (p: Vec3, e: Edge): number | undefined => {
    const t = curveProject(e.curve, p, e.t0, e.t1)
    return dist3(curvePoint(e.curve, t), p) <= tol ? t : undefined
  }
  let run = 0
  for (let i = 0; i < x1.length && run < 3; i++) run = paramOn(x1[i]!, e2) === undefined ? 0 : run + 1
  if (run >= 3) {
    for (const t of [e1.t0, e1.t1]) { const s = paramOn(curvePoint(e1.curve, t), e2); if (s !== undefined) add({ t, s, point: curvePoint(e1.curve, t) }) }
    for (const s of [e2.t0, e2.t1]) { const t = paramOn(curvePoint(e2.curve, s), e1); if (t !== undefined) add({ t, s, point: curvePoint(e2.curve, s) }) }
    return hits.sort((a, b) => a.t - b.t)
  }
  for (let i = 0; i + 1 < x1.length; i++) {
    for (let j = 0; j + 1 < x2.length; j++) {
      const r = segSegClosest(x1[i]!, x1[i + 1]!, x2[j]!, x2[j + 1]!)
      if (r.d > seedDist) continue
      const t = p1[i]! + (p1[i + 1]! - p1[i]!) * r.a
      const s = p2[j]! + (p2[j + 1]! - p2[j]!) * r.b
      add(refineCurveCurve(e1.curve, e2.curve, t, s, tol))
    }
  }
  return hits.sort((a, b) => a.t - b.t)
}

const segSegClosest = (p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): { readonly a: number; readonly b: number; readonly d: number } => {
  const d1 = sub3(q1, p1), d2 = sub3(q2, p2), r = sub3(p1, p2)
  const a = dot3(d1, d1), e = dot3(d2, d2), f = dot3(d2, r)
  let s = 0, t = 0
  if (a <= 1e-300 && e <= 1e-300) return { a: 0, b: 0, d: length3(r) }
  if (a <= 1e-300) { t = Math.max(0, Math.min(1, f / e)) }
  else {
    const c = dot3(d1, r)
    if (e <= 1e-300) { s = Math.max(0, Math.min(1, -c / a)) }
    else {
      const b = dot3(d1, d2)
      const den = a * e - b * b
      s = den > 1e-300 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)) }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)) }
    }
  }
  const c1 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s }
  const c2 = { x: p2.x + d2.x * t, y: p2.y + d2.y * t, z: p2.z + d2.z * t }
  return { a: s, b: t, d: dist3(c1, c2) }
}

// ================================================================ surface × surface

export interface SsiPoint {
  readonly p: Vec3
  readonly ua: number
  readonly va: number
  readonly ub: number
  readonly vb: number
}

/**
 * Newton for a point on both surfaces near `seed`, constrained to the plane through `seed` normal to `dir`
 * (the curve direction), so successive points do not slide along the curve.
 */
export const refineSurfaceSurface = (sa: Surface, sb: Surface, seed: Vec3, a0: SurfaceParam, b0: SurfaceParam, dir: Vec3 | undefined, tol: number): SsiPoint | undefined => {
  let ua = a0.u, va = a0.v, ub = b0.u, vb = b0.v
  let T = dir
  for (let it = 0; it < 40; it++) {
    const A = surfaceDerivs(sa, ua, va)
    const B = surfaceDerivs(sb, ub, vb)
    if (T === undefined || length3(T) < 1e-12) {
      const n = cross3(cross3(A.su, A.sv), cross3(B.su, B.sv))
      T = length3(n) > 1e-300 ? normalize3(n) : { x: 1, y: 0, z: 0 }
    }
    const F = sub3(A.p, B.p)
    const g = dot3(sub3(A.p, seed), T)
    if (length3(F) < tol * 1e-4 && Math.abs(g) < tol * 1e-2) break
    let step: number[][]
    try {
      step = solveDense(
        [
          [A.su.x, A.sv.x, -B.su.x, -B.sv.x],
          [A.su.y, A.sv.y, -B.su.y, -B.sv.y],
          [A.su.z, A.sv.z, -B.su.z, -B.sv.z],
          [dot3(A.su, T), dot3(A.sv, T), 0, 0]
        ],
        [[-F.x], [-F.y], [-F.z], [-g]]
      )
    } catch {
      return undefined
    }
    // Damped step: never move more than a fraction of the surfaces' size in one go.
    ua += step[0]![0]!
    va += step[1]![0]!
    ub += step[2]![0]!
    vb += step[3]![0]!
    if (!Number.isFinite(ua + va + ub + vb)) return undefined
  }
  const pa = surfacePoint(sa, ua, va)
  if (dist3(pa, surfacePoint(sb, ub, vb)) > tol) return undefined
  return { p: pa, ua, va, ub, vb }
}

/** Tangent of the intersection curve at a point (normals' cross product). */
export const ssiTangent = (sa: Surface, sb: Surface, q: SsiPoint): Vec3 => {
  const na = surfaceNormal(sa, q.ua, q.va), nb = surfaceNormal(sb, q.ub, q.vb)
  return normalize3(cross3(na, nb))
}

export interface SsiPolyline {
  readonly points: SsiPoint[]
  readonly closed: boolean
}

/**
 * Intersection polylines of two triangulated faces (approximate, from the meshes); coplanar triangle pairs are
 * skipped. Endpoints are chained by mesh topology: a point is identified by the mesh edge it lies on and the
 * triangle of the other mesh it crosses.
 */
export const meshIntersectionPolylines = (A: TriSet, B: TriSet, bvhB: TriBvh, sa: Surface, sb: Surface): Array<{ readonly pts: Array<{ readonly p: Vec3; readonly uva: Vec2; readonly uvb: Vec2 }>; readonly closed: boolean }> => {
  interface End { readonly key: string; readonly p: Vec3; readonly uva: Vec2; readonly uvb: Vec2 }
  const segs: Array<readonly [End, End]> = []
  const edgeKey = (g1: number, g2: number) => (g1 < g2 ? `${g1}_${g2}` : `${g2}_${g1}`)
  const lerp2 = (a: Vec2, b: Vec2, s: number): Vec2 => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s })
  const bary = (S: TriSet, t: readonly [number, number, number], l1: number, l2: number): Vec2 => {
    const a = S.uv(t[0]), b = S.uv(t[1]), c = S.uv(t[2])
    const l0 = 1 - l1 - l2
    return { x: l0 * a.x + l1 * b.x + l2 * c.x, y: l0 * a.y + l1 * b.y + l2 * c.y }
  }
  // Canonical segment of mesh edge (i, j) of set S: from the lower global id to the higher.
  const edgeHits = (S: TriSet, ta: readonly [number, number, number], T: TriSet, tb: readonly [number, number, number], tbId: number, sIsA: boolean, out: End[]) => {
    for (let k = 0; k < 3; k++) {
      let i = ta[k]!, j = ta[(k + 1) % 3]!
      if (S.gid(i) > S.gid(j)) [i, j] = [j, i]
      const r = segTri(S.pos(i), S.pos(j), T.pos(tb[0]), T.pos(tb[1]), T.pos(tb[2]))
      if (r === undefined) continue
      const p = { x: S.pos(i).x + (S.pos(j).x - S.pos(i).x) * r.s, y: S.pos(i).y + (S.pos(j).y - S.pos(i).y) * r.s, z: S.pos(i).z + (S.pos(j).z - S.pos(i).z) * r.s }
      const uvS = lerp2(S.uv(i), S.uv(j), r.s)
      const uvT = bary(T, tb, r.l1, r.l2)
      const key = `${sIsA ? "A" : "B"}${edgeKey(S.gid(i), S.gid(j))}|${tbId}`
      out.push(sIsA ? { key, p, uva: uvS, uvb: uvT } : { key, p, uva: uvT, uvb: uvS })
    }
  }
  A.tris.forEach((ta, ia) => {
    if ((ia & 255) === 0) checkBudget()
    const a = A.pos(ta[0]), b = A.pos(ta[1]), c = A.pos(ta[2])
    const na = cross3(sub3(b, a), sub3(c, a))
    const lo = { x: Math.min(a.x, b.x, c.x), y: Math.min(a.y, b.y, c.y), z: Math.min(a.z, b.z, c.z) }
    const hi = { x: Math.max(a.x, b.x, c.x), y: Math.max(a.y, b.y, c.y), z: Math.max(a.z, b.z, c.z) }
    for (const ib of bvhB.query(lo, hi)) {
      const tb = B.tris[ib]!
      const pa = B.pos(tb[0]), pb = B.pos(tb[1]), pc = B.pos(tb[2])
      const nb = cross3(sub3(pb, pa), sub3(pc, pa))
      // Coplanar (or nearly) triangles: no transversal curve here.
      if (length3(cross3(normalize3(na), normalize3(nb))) < 1e-9) {
        if (Math.abs(dot3(sub3(a, pa), normalize3(nb))) < 1e-9 * (1 + length3(a))) continue
      }
      const ends: End[] = []
      edgeHits(A, ta, B, tb, ib, true, ends)
      edgeHits(B, tb, A, ta, ia, false, ends)
      // Distinct points (a crossing through a vertex shows up on two edges).
      const uniq: End[] = []
      for (const e of ends) if (!uniq.some((u) => dist3(u.p, e.p) < 1e-12 * (1 + length3(e.p)))) uniq.push(e)
      if (uniq.length === 2) segs.push([uniq[0]!, uniq[1]!])
      else if (uniq.length > 2) {
        // Take the two farthest apart.
        let bi = 0, bj = 1, bd = -1
        for (let i = 0; i < uniq.length; i++) for (let j = i + 1; j < uniq.length; j++) { const d = dist3(uniq[i]!.p, uniq[j]!.p); if (d > bd) { bd = d; bi = i; bj = j } }
        segs.push([uniq[bi]!, uniq[bj]!])
      }
    }
  })
  void sa
  void sb
  // Chain segments: by key, then by coordinates for ends that crossed a mesh vertex.
  const byKey = new Map<string, number[]>()
  segs.forEach(([a, b], si) => {
    for (const e of [a, b]) {
      const l = byKey.get(e.key) ?? []
      l.push(si)
      byKey.set(e.key, l)
    }
  })
  const used = new Array<boolean>(segs.length).fill(false)
  const scale = segs.reduce((m, [a]) => Math.max(m, Math.abs(a.p.x), Math.abs(a.p.y), Math.abs(a.p.z)), 1)
  const findNext = (end: End, exclude: number): number => {
    for (const si of byKey.get(end.key) ?? []) if (!used[si] && si !== exclude) return si
    for (let si = 0; si < segs.length; si++) {
      if (used[si] || si === exclude) continue
      const [a, b] = segs[si]!
      if (dist3(a.p, end.p) < 1e-10 * scale || dist3(b.p, end.p) < 1e-10 * scale) return si
    }
    return -1
  }
  const out: Array<{ pts: Array<{ p: Vec3; uva: Vec2; uvb: Vec2 }>; closed: boolean }> = []
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue
    used[s0] = true
    const chain: End[] = [segs[s0]![0], segs[s0]![1]]
    // Grow forward from the last end, then backward from the first.
    for (const forward of [true, false]) {
      for (;;) {
        const end = forward ? chain[chain.length - 1]! : chain[0]!
        const si = findNext(end, -1)
        if (si < 0) break
        used[si] = true
        const [a, b] = segs[si]!
        const other = a.key === end.key || dist3(a.p, end.p) < 1e-10 * scale ? b : a
        if (forward) chain.push(other)
        else chain.unshift(other)
      }
    }
    const closed = chain.length > 3 && (chain[0]!.key === chain[chain.length - 1]!.key || dist3(chain[0]!.p, chain[chain.length - 1]!.p) < 1e-10 * scale)
    if (closed) chain.pop()
    // Drop consecutive duplicates.
    const pts = chain.filter((e, i) => i === 0 || dist3(e.p, chain[i - 1]!.p) > 1e-12 * scale).map((e) => ({ p: e.p, uva: e.uva, uvb: e.uvb }))
    if (pts.length >= 2) out.push({ pts, closed })
  }
  return bridgeGaps(out)
}

/**
 * Joins the pieces of one intersection curve that the triangle tests left apart. A crossing that falls on the edge shared
 * by two triangles of the other mesh can be missed by both (each rounds it outside), which drops a segment and breaks a
 * closed curve into open pieces whose ends do not meet any vertex; the arrangement then loses them. Open pieces whose ends
 * are within three polyline steps and continue each other's direction are joined, and a piece whose two ends meet that way
 * is closed. The refinement that follows puts every point back on the exact curve.
 */
const bridgeGaps = <P extends { readonly p: Vec3 }>(chains: Array<{ pts: P[]; closed: boolean }>): Array<{ pts: P[]; closed: boolean }> => {
  const open = chains.filter((c) => !c.closed && c.pts.length >= 2)
  if (open.length === 0) return chains
  let step = 0
  for (const c of chains) for (let i = 1; i < c.pts.length; i++) step = Math.max(step, dist3(c.pts[i]!.p, c.pts[i - 1]!.p))
  const gapTol = 3 * step
  const dirOf = (a: Vec3, b: Vec3) => normalize3(sub3(b, a))
  const tailDir = (c: { pts: P[] }) => dirOf(c.pts[c.pts.length - 2]!.p, c.pts[c.pts.length - 1]!.p)
  const headDir = (c: { pts: P[] }) => dirOf(c.pts[0]!.p, c.pts[1]!.p)
  // Can the end of `a` continue into the start of `b`?
  const continues = (a: { pts: P[] }, b: { pts: P[] }): boolean => {
    const e = a.pts[a.pts.length - 1]!.p, s = b.pts[0]!.p
    const d = dist3(e, s)
    if (d > gapTol) return false
    if (d < 1e-12) return true
    const g = dirOf(e, s)
    return dot3(tailDir(a), g) > 0.7 && dot3(g, headDir(b)) > 0.7
  }
  const reverse = (c: { pts: P[]; closed: boolean }) => ({ pts: [...c.pts].reverse(), closed: c.closed })
  let pieces = open.map((c) => ({ pts: [...c.pts], closed: false }))
  for (let merged = true; merged;) {
    merged = false
    search: for (let i = 0; i < pieces.length; i++) {
      for (let j = 0; j < pieces.length; j++) {
        if (i === j) continue
        for (const b of [pieces[j]!, reverse(pieces[j]!)]) {
          if (!continues(pieces[i]!, b)) continue
          pieces[i] = { pts: [...pieces[i]!.pts, ...b.pts], closed: false }
          pieces = pieces.filter((_, k) => k !== j)
          merged = true
          break search
        }
      }
    }
  }
  for (const c of pieces) if (c.pts.length > 3 && continues(c, c)) c.closed = true
  return [...chains.filter((c) => c.closed || c.pts.length < 2), ...pieces]
}

/**
 * Refines a mesh polyline onto the exact intersection curve and resamples it so that every chord is within
 * `fitTol` of the curve and turns by less than `maxTurn` radians.
 */
export const refineSsiPolyline = (
  sa: Surface,
  sb: Surface,
  pts: ReadonlyArray<{ readonly p: Vec3; readonly uva: Vec2; readonly uvb: Vec2 }>,
  closed: boolean,
  tol: number,
  fitTol: number,
  maxTurn = 0.15
): SsiPoint[] | undefined => {
  const refined: SsiPoint[] = []
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const prevP = closed ? pts[(i - 1 + n) % n]!.p : pts[Math.max(0, i - 1)]!.p, nextP = closed ? pts[(i + 1) % n]!.p : pts[Math.min(n - 1, i + 1)]!.p
    let dir = normalize3(sub3(nextP, prevP))
    // The seeds come from triangle-triangle crossings and may zigzag: when the surfaces cross transversally, their exact
    // tangent fixes the constraint plane. A plane almost containing the curve lets Newton slide along it without bound (a
    // straight line where two parallel cylinders meet ran off to z = 2e8).
    const ua = { u: pts[i]!.uva.x, v: pts[i]!.uva.y }, ub = { u: pts[i]!.uvb.x, v: pts[i]!.uvb.y }
    const exact = cross3(surfaceNormal(sa, ua.u, ua.v), surfaceNormal(sb, ub.u, ub.v))
    if (length3(exact) > 0.05 && (length3(dir) === 0 || Math.abs(dot3(dir, normalize3(exact))) < 0.7)) dir = normalize3(exact)
    const q = refineSurfaceSurface(sa, sb, pts[i]!.p, ua, ub, length3(dir) > 0 ? dir : undefined, tol)
    // A point far from its seed (more than the seeds' own spacing) slid along the curve or jumped branches: dropped.
    const reach = Math.max(dist3(prevP, pts[i]!.p), dist3(nextP, pts[i]!.p), tol) * 2
    if (q === undefined || dist3(q.p, pts[i]!.p) > reach) continue
    if (refined.length === 0 || dist3(q.p, refined[refined.length - 1]!.p) > tol) refined.push(q)
  }
  if (refined.length < 2) return undefined
  // Adaptive subdivision between consecutive points.
  const out: SsiPoint[] = []
  const pa = surfacePeriods(sa), pb = surfacePeriods(sb)
  // Mean of two parameters across a period seam: unwrap the second next to the first.
  const avg = (x: number, y: number, period: number | undefined): number => (period === undefined ? (x + y) / 2 : (x + unwrapNearCheck(y, x, period)) / 2)
  const rec = (a: SsiPoint, b: SsiPoint, depth: number): void => {
    const mid = { x: (a.p.x + b.p.x) / 2, y: (a.p.y + b.p.y) / 2, z: (a.p.z + b.p.z) / 2 }
    const dir = normalize3(sub3(b.p, a.p))
    const chord = dist3(a.p, b.p)
    const m = refineSurfaceSurface(sa, sb, mid, { u: avg(a.ua, b.ua, pa.u), v: avg(a.va, b.va, pa.v) }, { u: avg(a.ub, b.ub, pb.u), v: avg(a.vb, b.vb, pb.v) }, dir, tol)
    // A solution far from the chord is another branch of the curve (or the far side of a closed one).
    if (m === undefined || depth > 14 || dist3(m.p, mid) > chord) { out.push(b); return }
    const sag = dist3(m.p, mid)
    const ta = ssiTangent(sa, sb, a), tb = ssiTangent(sa, sb, b)
    const turn = Math.acos(Math.min(1, Math.abs(dot3(ta, tb))))
    if (sag > fitTol || turn > maxTurn) {
      rec(a, m, depth + 1)
      rec(m, b, depth + 1)
    } else out.push(b)
  }
  out.push(refined[0]!)
  for (let i = 0; i + 1 < refined.length; i++) rec(refined[i]!, refined[i + 1]!, 0)
  if (closed) rec(refined[refined.length - 1]!, refined[0]!, 0)
  if (closed) out.pop()
  return out
}

/** Unwraps periodic parameters of SSI points continuously along the curve, per surface. */
export const unwrapSsi = (sa: Surface, sb: Surface, pts: SsiPoint[]): SsiPoint[] => {
  const pa = surfacePeriods(sa), pb = surfacePeriods(sb)
  const out: SsiPoint[] = []
  for (const q of pts) {
    const prev = out[out.length - 1]
    if (prev === undefined) { out.push(q); continue }
    out.push({
      p: q.p,
      ua: pa.u === undefined ? q.ua : unwrapNearCheck(q.ua, prev.ua, pa.u),
      va: pa.v === undefined ? q.va : unwrapNearCheck(q.va, prev.va, pa.v),
      ub: pb.u === undefined ? q.ub : unwrapNearCheck(q.ub, prev.ub, pb.u),
      vb: pb.v === undefined ? q.vb : unwrapNearCheck(q.vb, prev.vb, pb.v)
    })
  }
  return out
}
