/**
 * Surface patch x surface patch intersection (spec 42 R5): two parameter rectangles of two surfaces (NURBS, or analytic),
 * the curves in which they meet, each point on both surfaces to the Newton tolerance and each chord within the fit tolerance.
 *
 * The Boolean intersects faces through their tessellations (`meshIntersectionPolylines`); this is the same machinery without
 * a B-rep around it, so the intersection can be measured and gated on its own (`ssi.test.ts`):
 *
 *   1. seeds: the patches are sampled on parameter grids sized from their control nets (a NURBS patch needs a sample every
 *      fraction of a knot span to follow its curvature), the grids' triangles are intersected with a BVH and chained;
 *   2. every seed point is refined onto both exact surfaces by Newton and the polyline is resampled to the fit tolerance;
 *   3. a curve that is closed is reported closed, an open curve ends on the patch boundary (or at a tangency).
 */
import { add3, dist3, normalize3, scale3, sub3, type Vec2, type Vec3 } from "./math.ts"
import { surfaceDomain } from "./nurbs.ts"
import { surfacePeriods, surfacePoint, type Surface } from "./geom.ts"
import { meshIntersectionPolylines, refineSsiPolyline, refineSurfaceSurface, TriBvh, type SsiPoint, type TriSet } from "./intersect.ts"

/** A rectangle of a surface's parameter plane. */
export interface ParamRange { readonly u0: number; readonly u1: number; readonly v0: number; readonly v1: number }

export interface PatchSsiOptions {
  /** Newton tolerance, mm: how close the two surface points of one curve point are. Default 1e-9. */
  readonly tol?: number
  /** Chord sag of the resampled curve, mm. Default 5e-7 (half the 1e-6 the gate asks of the fitted curve). */
  readonly fitTol?: number
  /** Extra grid refinement: the seed grids are this many times finer. Default 1. */
  readonly density?: number
}

export interface PatchCurve {
  readonly points: ReadonlyArray<SsiPoint>
  readonly closed: boolean
}

/** The natural parameter rectangle of a NURBS patch. */
export const nurbsRange = (s: Surface): ParamRange => {
  if (s.kind !== "nurbs") throw new RangeError("nurbsRange needs a NURBS surface")
  const [u0, u1, v0, v1] = surfaceDomain(s.data)
  return { u0, u1, v0, v1 }
}

/** Grid size of a surface's seed mesh in each parameter direction: a few samples per knot span, more where the surface bends. */
const gridSize = (s: Surface, r: ParamRange, density: number): readonly [number, number] => {
  let nu = 8, nv = 8
  if (s.kind === "nurbs") {
    const d = s.data
    // Distinct knot spans times a sample count that follows the degree: a cubic span can fold once.
    nu = Math.max(1, d.points.length - d.degreeU) * 3 * d.degreeU
    nv = Math.max(1, d.points[0]!.length - d.degreeV) * 3 * d.degreeV
  } else if (s.kind === "sphere" || s.kind === "torus") { nu = 96; nv = 48 }
  else if (s.kind === "cylinder" || s.kind === "cone") { nu = 96; nv = 16 }
  void r
  return [Math.ceil(nu * density), Math.ceil(nv * density)]
}

const gridMesh = (s: Surface, r: ParamRange, nu: number, nv: number): TriSet => {
  const pos: Vec3[] = [], uvs: Vec2[] = []
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const u = r.u0 + ((r.u1 - r.u0) * i) / nu, v = r.v0 + ((r.v1 - r.v0) * j) / nv
    pos.push(surfacePoint(s, u, v))
    uvs.push({ x: u, y: v })
  }
  const tris: Array<readonly [number, number, number]> = []
  const id = (i: number, j: number) => i * (nv + 1) + j
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    // Alternate the diagonal so a ridge along one diagonal direction is seen from both sides.
    if ((i + j) % 2 === 0) { tris.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)], [id(i, j), id(i + 1, j + 1), id(i, j + 1)]) }
    else { tris.push([id(i, j), id(i + 1, j), id(i, j + 1)], [id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)]) }
  }
  return { pos: (i) => pos[i]!, uv: (i) => uvs[i]!, gid: (i) => i, tris }
}

/** Intersection curves of patch `ra` of `sa` with patch `rb` of `sb`. */
export const intersectPatches = (sa: Surface, ra: ParamRange, sb: Surface, rb: ParamRange, options: PatchSsiOptions = {}): PatchCurve[] => {
  const tol = options.tol ?? 1e-9
  const fitTol = options.fitTol ?? 5e-7
  const density = options.density ?? 1
  const [au, av] = gridSize(sa, ra, density), [bu, bv] = gridSize(sb, rb, density)
  const A = gridMesh(sa, ra, au, av), B = gridMesh(sb, rb, bu, bv)
  const bvh = new TriBvh(B, 0)
  const out: PatchCurve[] = []
  for (const pl of meshIntersectionPolylines(A, B, bvh, sa, sb)) {
    const refined = refineSsiPolyline(sa, sb, pl.pts, pl.closed, tol, fitTol)
    if (refined === undefined) continue
    out.push(...trimToRanges({ points: refined, closed: pl.closed }, sa, ra, sb, rb, tol))
  }
  return out
}

/**
 * Newton does not know the patch ends: a refined point near the boundary can come out a hair outside the parameter rectangle,
 * where a NURBS surface is only extrapolated and the "curve" is off the patch by up to 1e-2 mm. The points outside either
 * rectangle are cut away and each cut end is moved back to the boundary by bisection along the curve.
 */
const trimToRanges = (c: PatchCurve, sa: Surface, ra: ParamRange, sb: Surface, rb: ParamRange, tol: number): PatchCurve[] => {
  const pa = surfacePeriods(sa), pb = surfacePeriods(sb)
  const within = (q: SsiPoint): boolean => {
    const okU = (u: number, r: ParamRange, period: number | undefined) => (period !== undefined && r.u1 - r.u0 >= period - 1e-9) || (u >= r.u0 && u <= r.u1)
    const okV = (v: number, r: ParamRange, period: number | undefined) => (period !== undefined && r.v1 - r.v0 >= period - 1e-9) || (v >= r.v0 && v <= r.v1)
    return okU(q.ua, ra, pa.u) && okV(q.va, ra, pa.v) && okU(q.ub, rb, pb.u) && okV(q.vb, rb, pb.v)
  }
  const flags = c.points.map(within)
  if (flags.every(Boolean)) return [c]
  const cut = (inside: SsiPoint, outside: SsiPoint): SsiPoint => {
    let lo = inside, hi = outside
    for (let k = 0; k < 40; k++) {
      const mid = { p: { x: (lo.p.x + hi.p.x) / 2, y: (lo.p.y + hi.p.y) / 2, z: (lo.p.z + hi.p.z) / 2 }, ua: (lo.ua + hi.ua) / 2, va: (lo.va + hi.va) / 2, ub: (lo.ub + hi.ub) / 2, vb: (lo.vb + hi.vb) / 2 }
      const q = refineSurfaceSurface(sa, sb, mid.p, { u: mid.ua, v: mid.va }, { u: mid.ub, v: mid.vb }, normalize3(sub3(hi.p, lo.p)), tol)
      if (q === undefined) break
      if (within(q)) lo = q; else hi = q
      if (dist3(lo.p, hi.p) < 1e-12) break
    }
    return lo
  }
  const n = c.points.length
  // Rotate a closed curve to start at a point inside, then treat it as open; all runs of inside points become curves.
  const start = c.closed ? flags.findIndex((f) => !f) : 0
  const order = c.closed ? Array.from({ length: n + 1 }, (_, i) => (start + i) % n) : Array.from({ length: n }, (_, i) => i)
  const runs: SsiPoint[][] = []
  let run: SsiPoint[] = []
  for (let k = 0; k < order.length; k++) {
    const i = order[k]!
    if (flags[i]) {
      if (run.length === 0 && k > 0) run.push(cut(c.points[i]!, c.points[order[k - 1]!]!))
      run.push(c.points[i]!)
    } else if (run.length > 0) {
      run.push(cut(c.points[order[k - 1]!]!, c.points[i]!))
      runs.push(run)
      run = []
    }
  }
  if (run.length > 0) runs.push(run)
  return runs.filter((r) => r.length >= 2).map((points) => ({ points, closed: false }))
}

/** Points along a curve's polyline at most `step` apart (for measuring distances to it). */
export const densify = (c: PatchCurve, step: number): Vec3[] => {
  const out: Vec3[] = []
  const n = c.points.length
  const m = c.closed ? n : n - 1
  for (let i = 0; i < m; i++) {
    const a = c.points[i]!.p, b = c.points[(i + 1) % n]!.p
    const k = Math.max(1, Math.ceil(dist3(a, b) / step))
    for (let j = 0; j < k; j++) out.push(add3(a, scale3(sub3(b, a), j / k)))
  }
  if (!c.closed) out.push(c.points[n - 1]!.p)
  return out
}
