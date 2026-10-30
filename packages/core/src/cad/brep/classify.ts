/**
 * Point location against a B-rep (SMLib's SmBrep::PointClassify): closest point on the exact boundary and in/out/on
 * classification by the sign of (P − Q)·N, with N the outward normal of the face at Q, or the pseudo-normal of the
 * faces around Q when Q is on an edge or a vertex (Bærentzen & Aanæs). Unlike ray casting on a mesh, this stays
 * exact for points micrometres from the surface.
 */
import { add3, dist3, dot3, length3, normalize3, scale3, sub3, type Vec3 } from "./math.ts"
import { curvePoint, curveProject, surfaceNormal, surfacePeriods, surfacePoint, surfaceProject } from "./geom.ts"
import { edgeUses, type Brep } from "./topology.ts"
import { faceBoundaries, type FaceBoundaries, type UvSample } from "./tessellate.ts"
import { orient2d } from "./predicates.ts"

export type PointClass = "in" | "out" | "on"

export interface ClosestPoint {
  readonly point: Vec3
  readonly distance: number
  /** Outward normal (face) or pseudo-normal (edge, vertex) at the closest point. */
  readonly normal: Vec3
  readonly face?: number
  readonly edge?: number
  readonly vertex?: number
}

export interface BrepLocator {
  readonly brep: Brep
  readonly boundaries: FaceBoundaries
  /** True when (u, v) lies inside face `fi` (boundary included within `eps` in parameter units). */
  insideFace(fi: number, u: number, v: number): boolean
  closest(p: Vec3): ClosestPoint
  classify(p: Vec3, tol: number): PointClass
}

interface Box { lo: Vec3; hi: Vec3 }

const boxDistance = (b: Box, p: Vec3): number => {
  const dx = Math.max(b.lo.x - p.x, 0, p.x - b.hi.x)
  const dy = Math.max(b.lo.y - p.y, 0, p.y - b.hi.y)
  const dz = Math.max(b.lo.z - p.z, 0, p.z - b.hi.z)
  return Math.hypot(dx, dy, dz)
}

/** Winding number of (u, v) with respect to closed rings. */
const winding = (rings: ReadonlyArray<ReadonlyArray<UvSample>>, u: number, v: number): number => {
  let w = 0
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i]!, b = r[(i + 1) % r.length]!
      // Which side of the edge the point is on is a sign question: exact orientation, so a point on a boundary vertex or on a
      // collinear run of ring samples is never counted in or out by rounding.
      if (a.v <= v) {
        if (b.v > v && orient2d(a.u, a.v, b.u, b.v, u, v) > 0) w++
      } else if (b.v <= v && orient2d(a.u, a.v, b.u, b.v, u, v) < 0) w--
    }
  }
  return w
}

/** Distance in (u, v) from a point to the rings' polylines. */
const ringDistance = (rings: ReadonlyArray<ReadonlyArray<UvSample>>, u: number, v: number): number => {
  let best = Infinity
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i]!, b = r[(i + 1) % r.length]!
      const dx = b.u - a.u, dy = b.v - a.v
      const l2 = dx * dx + dy * dy
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((u - a.u) * dx + (v - a.v) * dy) / l2))
      best = Math.min(best, Math.hypot(a.u + dx * t - u, a.v + dy * t - v))
    }
  }
  return best
}

export const brepLocator = (b: Brep, boundaries?: FaceBoundaries): BrepLocator => {
  const fb = boundaries ?? faceBoundaries(b)
  const uses = edgeUses(b)
  // Face boxes from boundary samples, padded for bulging curved faces.
  const faceBox: Box[] = b.faces.map((f, fi) => {
    let lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
    const grow = (p: Vec3) => {
      lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y), z: Math.min(lo.z, p.z) }
      hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y), z: Math.max(hi.z, p.z) }
    }
    const rings = fb.rings[fi] ?? []
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const r of rings) for (const s of r) { grow(fb.point(s.g)); u0 = Math.min(u0, s.u); u1 = Math.max(u1, s.u); v0 = Math.min(v0, s.v); v1 = Math.max(v1, s.v) }
    if (f.surface.kind !== "plane" && Number.isFinite(u0)) {
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) grow(surfacePoint(f.surface, u0 + ((u1 - u0) * i) / 8, v0 + ((v1 - v0) * j) / 8))
      const pad = 0.05 * Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
      lo = { x: lo.x - pad, y: lo.y - pad, z: lo.z - pad }
      hi = { x: hi.x + pad, y: hi.y + pad, z: hi.z + pad }
    }
    return { lo, hi }
  })
  const periods = b.faces.map((f) => surfacePeriods(f.surface))
  // Edge boxes from curve samples, padded for the bulge between them: an edge farther than the best distance so far cannot
  // hold the closest point, and the exact projection (the expensive part of a query) is skipped for it.
  const edgeBox: Box[] = b.edges.map((e) => {
    let lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
    for (let k = 0; k <= 24; k++) {
      const q = curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 24)
      lo = { x: Math.min(lo.x, q.x), y: Math.min(lo.y, q.y), z: Math.min(lo.z, q.z) }
      hi = { x: Math.max(hi.x, q.x), y: Math.max(hi.y, q.y), z: Math.max(hi.z, q.z) }
    }
    const pad = e.curve.kind === "line" ? 1e-9 : 0.05 * Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) + 1e-9
    return { lo: { x: lo.x - pad, y: lo.y - pad, z: lo.z - pad }, hi: { x: hi.x + pad, y: hi.y + pad, z: hi.z + pad } }
  })

  const insideFace = (fi: number, u: number, v: number): boolean => {
    const rings = fb.rings[fi]
    if (rings === undefined || rings.length === 0) return false
    const per = periods[fi]!
    const us = per.u !== undefined ? [u, u - per.u, u + per.u, u - 2 * per.u, u + 2 * per.u] : [u]
    const vs = per.v !== undefined ? [v, v - per.v, v + per.v] : [v]
    for (const uu of us) for (const vv of vs) {
      if (winding(rings, uu, vv) !== 0) return true
      if (ringDistance(rings, uu, vv) < 1e-9 * (1 + Math.abs(uu) + Math.abs(vv))) return true
    }
    return false
  }

  const outwardNormal = (fi: number, p: Vec3): Vec3 => {
    const f = b.faces[fi]!
    const q = surfaceProject(f.surface, p)
    const n = surfaceNormal(f.surface, q.u, q.v)
    return f.reversed ? scale3(n, -1) : n
  }

  const closest = (p: Vec3): ClosestPoint => {
    let best: ClosestPoint | undefined
    const order = b.faces.map((_, fi) => fi).sort((x, y) => boxDistance(faceBox[x]!, p) - boxDistance(faceBox[y]!, p))
    for (const fi of order) {
      if (best !== undefined && boxDistance(faceBox[fi]!, p) > best.distance) break
      const f = b.faces[fi]!
      const q = surfaceProject(f.surface, p)
      if (!insideFace(fi, q.u, q.v)) continue
      const sp = surfacePoint(f.surface, q.u, q.v)
      const d = dist3(sp, p)
      if (best === undefined || d < best.distance) {
        const n = surfaceNormal(f.surface, q.u, q.v)
        best = { point: sp, distance: d, normal: f.reversed ? scale3(n, -1) : n, face: fi }
      }
    }
    // Edges (the closest point of a face may be on its boundary).
    b.edges.forEach((e, ei) => {
      if (best !== undefined && boxDistance(edgeBox[ei]!, p) > best.distance) return
      const t = curveProject(e.curve, p, e.t0, e.t1)
      const q = curvePoint(e.curve, t)
      const d = dist3(q, p)
      if (best !== undefined && d >= best.distance - 1e-15) return
      const atStart = Math.abs(t - e.t0) < 1e-12 * (1 + Math.abs(t))
      const atEnd = Math.abs(t - e.t1) < 1e-12 * (1 + Math.abs(t))
      if (atStart || atEnd) {
        const vi = atStart ? e.v0 : e.v1
        best = { point: q, distance: d, normal: vertexNormal(vi), vertex: vi }
        return
      }
      let n = { x: 0, y: 0, z: 0 }
      for (const u of uses[ei]!) n = add3(n, outwardNormal(u.face, q))
      best = { point: q, distance: d, normal: normalize3(n), edge: ei }
    })
    if (best === undefined) throw new Error("brepLocator: empty B-rep")
    return best
  }

  // Angle-weighted pseudo-normal at a vertex: incident faces weighted by the angle of their edges at the vertex.
  const vertexNormalCache = new Map<number, Vec3>()
  const vertexNormal = (vi: number): Vec3 => {
    const cached = vertexNormalCache.get(vi)
    if (cached !== undefined) return cached
    const P = b.vertices[vi]!.point
    let n = { x: 0, y: 0, z: 0 }
    b.faces.forEach((f, fi) => {
      for (const l of f.loops) {
        const k = l.coedges.length
        for (let i = 0; i < k; i++) {
          const c = l.coedges[i]!, nx = l.coedges[(i + 1) % k]!
          const ec = b.edges[c.edge]!, en = b.edges[nx.edge]!
          const end = c.reversed ? ec.v0 : ec.v1
          if (end !== vi) continue
          // Directions away from the vertex along the incoming (reversed) and outgoing edges.
          const away = (e: typeof ec, fromEnd: boolean): Vec3 => {
            const span = e.t1 - e.t0
            const t = fromEnd ? e.t1 - span * 1e-4 : e.t0 + span * 1e-4
            return normalize3(sub3(curvePoint(e.curve, t), P))
          }
          const d1 = away(ec, !c.reversed)
          const d2 = away(en, nx.reversed)
          const ang = Math.acos(Math.max(-1, Math.min(1, dot3(d1, d2))))
          n = add3(n, scale3(outwardNormal(fi, P), ang > 1e-9 ? ang : 1e-9))
        }
      }
    })
    const out = length3(n) > 0 ? normalize3(n) : { x: 0, y: 0, z: 1 }
    vertexNormalCache.set(vi, out)
    return out
  }

  const classify = (p: Vec3, tol: number): PointClass => {
    const c = closest(p)
    if (c.distance <= tol) return "on"
    return dot3(sub3(p, c.point), c.normal) < 0 ? "in" : "out"
  }

  return { brep: b, boundaries: fb, insideFace, closest, classify }
}
