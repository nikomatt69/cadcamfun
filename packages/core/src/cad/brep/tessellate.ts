/**
 * Watertight tessellation of a B-rep (SMLib's SmApiTessellate): chord-height, angular and edge-length tolerances as in
 * `SmTessellationParams`.
 *
 * 1. Every edge is sampled once (adaptive on its exact curve); faces that share the edge share those samples, so the
 *    welded mesh has no cracks.
 * 2. Each face's loops are mapped into its (u, v) domain by projection (or the edge-use p-curve). Periodic parameters
 *    are unwrapped along the loop; seams are placed on the side the material lies on; a loop through a pole closes
 *    along the degenerate parameter line; loops that wrap a period (a band between two circles, a hemisphere bounded
 *    by its equator) are cut open with an internal seam.
 * 3. The domain is triangulated by a constrained Delaunay triangulation in metric-scaled (u, v) and refined by
 *    inserting points until every triangle is within the chord height of the exact surface, its normals turn by less
 *    than the angular tolerance and its edges are shorter than the maximum length.
 */
import { cross3, dist3, dot3, length3, normalize3, sub3, unwrapNear, type Vec3 } from "./math.ts"
import { curveDerivs, curvePoint, curve2Point, surfaceDerivs, surfaceNormal, surfacePeriods, surfacePoint, surfaceProject, type Surface, type SurfaceParam } from "./geom.ts"
import { Cdt } from "./cdt.ts"
import { checkBudget } from "./budget.ts"
import type { Brep, Coedge, Edge, Face } from "./topology.ts"

export interface TessellateOptions {
  /** Max distance between the mesh and the exact surface/curve, mm. Default: 1/2000 of the model diagonal, in [0.001, 0.05]. */
  readonly chordTol?: number
  /** Max turn of the tangent/normal across one segment or triangle, degrees (default 15). 0 disables. */
  readonly angleTolDeg?: number
  /** Edge-length target, mm (0 = none). */
  readonly maxEdge?: number
  /** Safety cap on points per face (default 200 000). */
  readonly maxPointsPerFace?: number
  /**
   * Integration mode: refine curved faces only until no triangle spans more than this many radians along a periodic
   * parameter (or 1/8 of a NURBS knot range), instead of by chord and angle. The quadrature then integrates the exact
   * surface on the triangles; used by the mass properties.
   */
  readonly paramStep?: number
  /** Tessellate only these faces (the Boolean meshes only the faces near the other operand); default every face. */
  readonly faces?: ReadonlySet<number>
  /** Reuse the mesh of a face met before with the same surface, side, boundary and options (the Boolean's sequences). */
  readonly reuse?: boolean
}

export interface FaceMesh {
  readonly face: number
  /** Local vertex positions (xyz), exact surface normals (outward) and (u, v) parameters. */
  readonly positions: Float64Array
  readonly normals: Float32Array
  readonly uvs: Float64Array
  /** Local triangles, counter-clockwise seen from outside. */
  readonly indices: Uint32Array
  /**
   * Every triangle of the (u, v) domain, counter-clockwise in (u, v), including those that collapse to a line in 3D at a
   * pole (dropped from `indices`); integrals over the face use these.
   */
  readonly domain: Uint32Array
  /** Global (welded) index of each local vertex. */
  readonly global: Uint32Array
}

export interface EdgePolyline {
  readonly edge: number
  /** Global indices of the samples, from v0 to v1. */
  readonly points: ReadonlyArray<number>
  readonly params: ReadonlyArray<number>
}

export interface BrepTessellation {
  /** Welded positions shared by all faces. */
  readonly positions: Float64Array
  /** Welded triangles of all faces. */
  readonly indices: Uint32Array
  /** Face index of each welded triangle. */
  readonly triangleFace: Uint32Array
  readonly faces: ReadonlyArray<FaceMesh>
  readonly edges: ReadonlyArray<EdgePolyline>
  readonly warnings: ReadonlyArray<string>
  readonly chordTol: number
}

// ================================================================ helpers

const bboxDiagonal = (b: Brep): number => {
  let lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
  const grow = (p: Vec3) => {
    lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y), z: Math.min(lo.z, p.z) }
    hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y), z: Math.max(hi.z, p.z) }
  }
  for (const v of b.vertices) grow(v.point)
  for (const e of b.edges) for (let i = 0; i <= 8; i++) grow(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * i) / 8))
  const d = Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
  return Number.isFinite(d) && d > 0 ? d : 1
}

class Points {
  readonly xyz: number[] = []
  add(p: Vec3): number {
    this.xyz.push(p.x, p.y, p.z)
    return this.xyz.length / 3 - 1
  }
  get(i: number): Vec3 {
    return { x: this.xyz[i * 3]!, y: this.xyz[i * 3 + 1]!, z: this.xyz[i * 3 + 2]! }
  }
}

// ================================================================ edges

const sampleEdge = (e: Edge, chord: number, angle: number, maxEdge: number): number[] => {
  if (e.curve.kind === "line") {
    const len = e.t1 - e.t0
    const n = maxEdge > 0 ? Math.max(1, Math.ceil(len / maxEdge)) : 1
    return Array.from({ length: n + 1 }, (_, i) => e.t0 + (len * i) / n)
  }
  // Initial uniform split, then recursive refinement on chord, angle and length.
  let init = 4
  if (e.curve.kind === "circle" || e.curve.kind === "ellipse") {
    const r = e.curve.kind === "circle" ? e.curve.radius : Math.max(e.curve.a, e.curve.b)
    const sweep = e.t1 - e.t0
    const byChord = chord < r ? 2 * Math.acos(1 - chord / r) : Math.PI
    const step = Math.min(byChord, angle > 0 ? angle : Math.PI / 2, Math.PI / 2)
    init = Math.max(2, Math.ceil(sweep / step))
  } else if (e.curve.kind === "nurbs") {
    init = Math.max(4, (e.curve.data.points.length - 1) * 2)
  }
  const out: number[] = []
  const rec = (a: number, b: number, pa: Vec3, pb: Vec3, ta: Vec3, tb: Vec3, depth: number): void => {
    const m = (a + b) / 2
    const [pm, tm] = curveDerivs(e.curve, m)
    const chordMid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, z: (pa.z + pb.z) / 2 }
    const sag = dist3(pm, chordMid)
    const turn = angle > 0 ? Math.acos(Math.max(-1, Math.min(1, dot3(normalize3(ta), normalize3(tb))))) : 0
    const long = maxEdge > 0 && dist3(pa, pb) > maxEdge
    if (depth < 24 && (sag > chord || turn > angle || long)) {
      rec(a, m, pa, pm, ta, tm, depth + 1)
      rec(m, b, pm, pb, tm, tb, depth + 1)
      return
    }
    out.push(b)
  }
  out.push(e.t0)
  for (let i = 0; i < init; i++) {
    const a = e.t0 + ((e.t1 - e.t0) * i) / init
    const b = e.t0 + ((e.t1 - e.t0) * (i + 1)) / init
    const [pa, ta] = curveDerivs(e.curve, a)
    const [pb, tb] = curveDerivs(e.curve, b)
    rec(a, b, pa, pb, ta, tb, 0)
  }
  return out
}

// ================================================================ faces: parameter-space boundary

interface UvPoint {
  u: number
  v: number
  /** Global point index. */
  readonly g: number
  /** u (resp. v) is undetermined here (pole). */
  readonly su: boolean
  readonly sv: boolean
  /**
   * Boundary samples: the edge left from here and its parameter (`edge`, `t`), and the edge that led here (`inEdge`,
   * `inT`). They differ at the vertices between coedges; both are absent along pole lines and synthetic cuts.
   */
  edge?: number
  t?: number
  inEdge?: number
  inT?: number
}

const TAU = Math.PI * 2

const isSingular = (s: Surface, uv: SurfaceParam): { readonly su: boolean; readonly sv: boolean } => {
  const d = surfaceDerivs(s, uv.u, uv.v)
  const lu = length3(d.su), lv = length3(d.sv)
  const ref = Math.max(lu, lv, 1e-300)
  return { su: lu < 1e-9 * ref || lu < 1e-12, sv: lv < 1e-9 * ref || lv < 1e-12 }
}

interface FaceCtx {
  readonly face: Face
  readonly s: Surface
  readonly pu: number | undefined
  readonly pv: number | undefined
}

/** (u, v) of one coedge's samples in traversal order, unwrapped continuously within the coedge. */
const coedgeUv = (ctx: FaceCtx, b: Brep, c: Coedge, edgeSamples: ReadonlyArray<EdgePolyline>, pts: Points): UvPoint[] => {
  const poly = edgeSamples[c.edge]!
  const order = c.reversed ? [...poly.points.keys()].reverse() : [...poly.points.keys()]
  const out: UvPoint[] = []
  let hint: SurfaceParam | undefined
  for (const k of order) {
    const g = poly.points[k]!
    let uv: SurfaceParam
    if (c.pcurve !== undefined) {
      const q = curve2Point(c.pcurve, poly.params[k]!)
      uv = { u: q.x, v: q.y }
    } else {
      uv = surfaceProject(ctx.s, pts.get(g), hint)
    }
    const sing = isSingular(ctx.s, uv)
    hint = uv
    const first = out.length === 0
    out.push({ u: uv.u, v: uv.v, g, su: sing.su, sv: sing.sv, edge: c.edge, t: poly.params[k]!, ...(first ? {} : { inEdge: c.edge, inT: poly.params[k]! }) })
  }
  // Unwrap periodic directions within the coedge (skipping undetermined values).
  let refU: number | undefined, refV: number | undefined
  for (const p of out) {
    if (ctx.pu !== undefined && !p.su) {
      if (refU !== undefined) p.u = unwrapNear(p.u, refU, ctx.pu)
      refU = p.u
    }
    if (ctx.pv !== undefined && !p.sv) {
      if (refV !== undefined) p.v = unwrapNear(p.v, refV, ctx.pv)
      refV = p.v
    }
  }
  // Undetermined parameters take their neighbour's value (the limit along the edge).
  const fill = (key: "u" | "v", flag: "su" | "sv") => {
    for (let i = 0; i < out.length; i++) {
      if (!out[i]![flag]) continue
      let j = i - 1
      while (j >= 0 && out[j]![flag]) j--
      let k = i + 1
      while (k < out.length && out[k]![flag]) k++
      const src = j >= 0 && (i === out.length - 1 || k >= out.length) ? out[j] : k < out.length ? out[k] : j >= 0 ? out[j] : undefined
      if (src !== undefined) out[i]![key] = src[key]
    }
  }
  fill("u", "su")
  fill("v", "sv")
  void b
  return out
}

/** Builds the closed parameter-space rings of a face (natural orientation: material on the left). */
const faceRings = (
  ctx: FaceCtx,
  b: Brep,
  edgeSamples: ReadonlyArray<EdgePolyline>,
  pts: Points,
  chord: number,
  angle: number,
  warnings: string[]
): UvPoint[][] => {
  const f = ctx.face
  const useCount = new Map<number, number>()
  for (const l of f.loops) for (const c of l.coedges) useCount.set(c.edge, (useCount.get(c.edge) ?? 0) + 1)
  const rings: UvPoint[][] = []
  const wrapping: Array<{ readonly pts: UvPoint[]; readonly axis: "u" | "v"; readonly sign: number }> = []
  const seamPlaced = new Map<number, { readonly u: number; readonly v: number; readonly axis: "u" | "v" }>()
  for (const loop of f.loops) {
    // Natural orientation: a reversed face has its loops traversed backwards in (u, v).
    const coedges = f.reversed ? [...loop.coedges].reverse().map((c) => ({ ...c, reversed: !c.reversed })) : loop.coedges
    const ring: UvPoint[] = []
    for (const c of coedges) {
      const seg = coedgeUv(ctx, b, c, edgeSamples, pts)
      if (seg.length === 0) continue
      const isSeam = (useCount.get(c.edge) ?? 0) >= 2
      const first = seg[0]!, lastS = seg[seg.length - 1]!
      let du = 0, dv = 0
      const prev = ring[ring.length - 1]
      // Continuity with the previous coedge where the junction is a regular point.
      if (prev !== undefined) {
        if (ctx.pu !== undefined) {
          const ref = !first.su ? first.u : seg.find((p) => !p.su)?.u
          const target = !prev.su ? prev.u : [...ring].reverse().find((p) => !p.su)?.u
          if (ref !== undefined && target !== undefined) du = Math.round((target - ref) / ctx.pu) * ctx.pu
        }
        if (ctx.pv !== undefined) {
          const ref = !first.sv ? first.v : seg.find((p) => !p.sv)?.v
          const target = !prev.sv ? prev.v : [...ring].reverse().find((p) => !p.sv)?.v
          if (ref !== undefined && target !== undefined) dv = Math.round((target - ref) / ctx.pv) * ctx.pv
        }
      }
      // Seams after a pole (or loops of seams only): place by the side the material lies on.
      const junctionSingular = prev === undefined || prev.su || prev.sv || first.su || first.sv
      if (isSeam && junctionSingular) {
        const isoU = Math.abs(lastS.u - first.u) < Math.abs(lastS.v - first.v)
        const axis: "u" | "v" = isoU ? "u" : "v"
        const other = seamPlaced.get(c.edge)
        if (axis === "u" && ctx.pu !== undefined) {
          const goingUp = lastS.v > first.v
          const base = other !== undefined ? other.u + (goingUp ? ctx.pu : -ctx.pu) : prev !== undefined ? unwrapNear(first.u, [...ring].reverse().find((p) => !p.su)?.u ?? first.u, ctx.pu) : first.u
          du = base - first.u
        } else if (axis === "v" && ctx.pv !== undefined) {
          const goingRight = lastS.u > first.u
          const base = other !== undefined ? other.v + (goingRight ? -ctx.pv : ctx.pv) : first.v
          dv = base - first.v
        }
      }
      for (const p of seg) { p.u += du; p.v += dv }
      if (isSeam && !seamPlaced.has(c.edge)) {
        const isoU = Math.abs(lastS.u - first.u) < Math.abs(lastS.v - first.v)
        seamPlaced.set(c.edge, { u: first.u, v: first.v, axis: isoU ? "u" : "v" })
      }
      // Junction: same point; a gap in (u, v) is a pole line.
      if (prev !== undefined) {
        if (prev.g === first.g) {
          const gap = Math.hypot(prev.u - first.u, prev.v - first.v)
          if (gap > 1e-9 * (1 + Math.abs(prev.u) + Math.abs(prev.v))) {
            // Leaves along the pole line, then arrives at the next coedge's start.
            prev.edge = undefined
            prev.t = undefined
            ring.push(...poleLine(prev, first, angle), first)
          } else {
            prev.edge = first.edge
            prev.t = first.t
          }
          ring.push(...seg.slice(1))
        } else {
          warnings.push(`face loop not connected at point ${prev.g} → ${first.g}`)
          ring.push(...seg)
        }
      } else ring.push(...seg)
    }
    if (ring.length < 2) continue
    const a = ring[0]!, z = ring[ring.length - 1]!
    if (a.g === z.g) {
      const gapU = z.u - a.u, gapV = z.v - a.v
      const regular = !a.su && !a.sv && !z.su && !z.sv
      const wrapU = regular && ctx.pu !== undefined && Math.abs(Math.abs(gapU) - ctx.pu) < 1e-6 && Math.abs(gapV) < 1e-6
      const wrapV = regular && ctx.pv !== undefined && Math.abs(Math.abs(gapV) - ctx.pv) < 1e-6 && Math.abs(gapU) < 1e-6
      if (wrapU || wrapV) {
        ring.pop()
        a.inEdge = z.inEdge
        a.inT = z.inT
        wrapping.push({ pts: ring, axis: wrapU ? "u" : "v", sign: Math.sign(wrapU ? gapU : gapV) })
        continue
      }
      // Same point: either closed in (u, v) or closing along a pole line (z kept, the line leads back to a).
      if (Math.hypot(gapU, gapV) > 1e-9 * (1 + Math.abs(a.u) + Math.abs(a.v))) {
        z.edge = undefined
        z.t = undefined
        ring.push(...poleLine(z, a, angle))
      } else {
        ring.pop()
        a.inEdge = z.inEdge
        a.inT = z.inT
      }
    } else warnings.push(`face loop does not close`)
    rings.push(ring)
  }
  // Loops wrapping a period: join two into a band, or close one through the pole on the material side.
  if (wrapping.length > 0) {
    const used = new Set<number>()
    for (let i = 0; i < wrapping.length; i++) {
      if (used.has(i)) continue
      const w = wrapping[i]!
      const partner = wrapping.findIndex((o, j) => j !== i && !used.has(j) && o.axis === w.axis && o.sign === -w.sign)
      used.add(i)
      if (partner >= 0) {
        used.add(partner)
        rings.push(joinBand(ctx, w.pts, wrapping[partner]!.pts, w.axis, pts, chord, angle))
      } else {
        const r = closeThroughPole(ctx, w.pts, w.axis, w.sign, pts, chord, angle)
        if (r === undefined) warnings.push("face loop wraps a period but the face has no pole or second boundary")
        else rings.push(r)
      }
    }
  }
  // Shift holes into the outer ring's period window.
  if (rings.length > 1 && (ctx.pu !== undefined || ctx.pv !== undefined)) {
    const areaOf = (r: UvPoint[]) => {
      let A = 0
      for (let i = 0; i < r.length; i++) { const p = r[i]!, q = r[(i + 1) % r.length]!; A += p.u * q.v - q.u * p.v }
      return A / 2
    }
    let outer = 0
    for (let i = 1; i < rings.length; i++) if (Math.abs(areaOf(rings[i]!)) > Math.abs(areaOf(rings[outer]!))) outer = i
    const box = (r: UvPoint[]) => {
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
      for (const p of r) { u0 = Math.min(u0, p.u); u1 = Math.max(u1, p.u); v0 = Math.min(v0, p.v); v1 = Math.max(v1, p.v) }
      return { u0, u1, v0, v1 }
    }
    const ob = box(rings[outer]!)
    rings.forEach((r, i) => {
      if (i === outer) return
      const rb = box(r)
      let du = 0, dv = 0
      if (ctx.pu !== undefined) { const cu = (rb.u0 + rb.u1) / 2; du = Math.round(((ob.u0 + ob.u1) / 2 - cu) / ctx.pu) * ctx.pu; if (cu + du < ob.u0) du += ctx.pu; if (cu + du > ob.u1) du -= ctx.pu }
      if (ctx.pv !== undefined) { const cv = (rb.v0 + rb.v1) / 2; dv = Math.round(((ob.v0 + ob.v1) / 2 - cv) / ctx.pv) * ctx.pv; if (cv + dv < ob.v0) dv += ctx.pv; if (cv + dv > ob.v1) dv -= ctx.pv }
      if (du !== 0 || dv !== 0) for (const p of r) { p.u += du; p.v += dv }
    })
  }
  return rings
}

/** Points strictly between `a` and `b` along a degenerate (pole) line; they all map to the same 3D point. */
const poleLine = (a: UvPoint, b: UvPoint, angle: number): UvPoint[] => {
  const span = Math.max(Math.abs(b.u - a.u), Math.abs(b.v - a.v))
  const n = Math.max(1, Math.ceil(span / Math.max(angle, Math.PI / 32)))
  const out: UvPoint[] = []
  const alongU = Math.abs(b.u - a.u) >= Math.abs(b.v - a.v)
  for (let i = 1; i < n; i++) out.push({ u: a.u + ((b.u - a.u) * i) / n, v: a.v + ((b.v - a.v) * i) / n, g: a.g, su: alongU, sv: !alongU })
  return out
}

/** Adaptive samples of the straight (u, v) segment from `a` to `b` (exclusive), as new interior points. */
const sampleUvLine = (ctx: FaceCtx, a: SurfaceParam, b: SurfaceParam, pts: Points, chord: number, angle: number): UvPoint[] => {
  const params: number[] = []
  const P = (t: number) => surfacePoint(ctx.s, a.u + (b.u - a.u) * t, a.v + (b.v - a.v) * t)
  const N = (t: number) => surfaceNormal(ctx.s, a.u + (b.u - a.u) * t, a.v + (b.v - a.v) * t)
  const rec = (t0: number, t1: number, depth: number) => {
    const m = (t0 + t1) / 2
    const p0 = P(t0), p1 = P(t1), pm = P(m)
    const sag = dist3(pm, { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2, z: (p0.z + p1.z) / 2 })
    const turn = angle > 0 ? Math.acos(Math.max(-1, Math.min(1, dot3(N(t0), N(t1))))) : 0
    if (depth < 16 && (sag > chord || turn > angle || depth < 2)) {
      rec(t0, m, depth + 1)
      params.push(m)
      rec(m, t1, depth + 1)
    }
  }
  rec(0, 1, 0)
  params.sort((x, y) => x - y)
  return params.map((t) => {
    const u = a.u + (b.u - a.u) * t, v = a.v + (b.v - a.v) * t
    return { u, v, g: pts.add(surfacePoint(ctx.s, u, v)), su: false, sv: false }
  })
}

/** Two loops wrapping the same period in opposite directions bound a band; cut it open along a shared seam. */
const joinBand = (ctx: FaceCtx, A: UvPoint[], B: UvPoint[], axis: "u" | "v", pts: Points, chord: number, angle: number): UvPoint[] => {
  const period = (axis === "u" ? ctx.pu : ctx.pv)!
  const a0 = A[0]!
  // Rotate B to start at its point closest (in the wrapping parameter) to A's start.
  let bestK = 0, bestD = Infinity
  B.forEach((p, k) => {
    const d = Math.abs(unwrapNear(p[axis], a0[axis], period) - a0[axis])
    if (d < bestD) { bestD = d; bestK = k }
  })
  const Bstart = B[bestK]!
  const shiftB = unwrapNear(Bstart[axis], a0[axis] + period * Math.sign(A[A.length - 1]![axis] - a0[axis] || 1), period) - Bstart[axis]
  // Unwrap B from its new start continuously.
  const Br: UvPoint[] = []
  let ref = Bstart[axis] + shiftB
  for (let i = 0; i < B.length; i++) {
    const p = B[(bestK + i) % B.length]!
    const val = unwrapNear(p[axis], ref, period)
    ref = val
    Br.push(axis === "u" ? { ...p, u: val } : { ...p, v: val })
  }
  const aEnd = { u: axis === "u" ? a0.u + (A[A.length - 1]!.u > a0.u ? period : -period) : a0.u, v: axis === "v" ? a0.v + (A[A.length - 1]!.v > a0.v ? period : -period) : a0.v }
  const b0 = Br[0]!
  const cut = sampleUvLine(ctx, aEnd, b0, pts, chord, angle)
  const shift = { u: axis === "u" ? a0.u - aEnd.u : 0, v: axis === "v" ? a0.v - aEnd.v : 0 }
  const bEnd = { u: b0.u + shift.u, v: b0.v + shift.v }
  const ring: UvPoint[] = [...A, { ...a0, u: aEnd.u, v: aEnd.v }, ...cut, ...Br, { ...b0, u: bEnd.u, v: bEnd.v }]
  // The cut back down: the same samples shifted by one period, reversed.
  for (const p of [...cut].reverse()) ring.push({ ...p, u: p.u + shift.u, v: p.v + shift.v })
  return ring
}

/** One loop wrapping a period around a pole (hemisphere, cone cap): close it along the degenerate parameter line. */
const closeThroughPole = (ctx: FaceCtx, A: UvPoint[], axis: "u" | "v", sign: number, pts: Points, chord: number, angle: number): UvPoint[] | undefined => {
  if (axis !== "u") return undefined
  const s = ctx.s
  // Material is on the left: travelling +u it is towards +v.
  const towardsHigh = sign > 0
  let poleV: number | undefined
  if (s.kind === "sphere") poleV = towardsHigh ? Math.PI / 2 : -Math.PI / 2
  else if (s.kind === "cone") {
    const t = Math.tan(s.semiAngle)
    if (t !== 0) {
      const apex = -s.radius / t
      const vRef = A[0]!.v
      if ((apex > vRef) === towardsHigh) poleV = apex
    }
  } else {
    // Generic: search the singular parameter line on the material side.
    const vRef = A[0]!.v
    for (let k = 1; k <= 64 && poleV === undefined; k++) {
      const v = vRef + (towardsHigh ? 1 : -1) * k * 0.05 * (1 + Math.abs(vRef))
      if (isSingular(s, { u: A[0]!.u, v }).su) poleV = v
    }
  }
  if (poleV === undefined) return undefined
  const a0 = A[0]!
  const uEnd = a0.u + (sign > 0 ? ctx.pu! : -ctx.pu!)
  const pole = pts.add(surfacePoint(s, a0.u, poleV))
  const up = sampleUvLine(ctx, { u: uEnd, v: a0.v }, { u: uEnd, v: poleV }, pts, chord, angle)
  const P1: UvPoint = { u: uEnd, v: poleV, g: pole, su: true, sv: false }
  const P2: UvPoint = { u: a0.u, v: poleV, g: pole, su: true, sv: false }
  const ring: UvPoint[] = [...A, { ...a0, u: uEnd }, ...up, P1, ...poleLine(P1, P2, angle), P2]
  for (const p of [...up].reverse()) ring.push({ ...p, u: p.u - (uEnd - a0.u) })
  return ring
}

// ================================================================ faces: triangulation and refinement

/** Test hook: receives each face's parameter-space rings. */
let debugRings: ((face: number, rings: ReadonlyArray<ReadonlyArray<{ readonly u: number; readonly v: number; readonly g: number }>>) => void) | undefined
export const setTessellationDebug = (hook: typeof debugRings): void => { debugRings = hook }

const tessellateFace = (
  fi: number,
  b: Brep,
  edgeSamples: ReadonlyArray<EdgePolyline>,
  pts: Points,
  chord: number,
  angle: number,
  maxEdge: number,
  maxPoints: number,
  paramStep: number | undefined,
  warnings: string[]
): FaceMesh | undefined => {
  const face = b.faces[fi]!
  const s = face.surface
  const per = surfacePeriods(s)
  const ctx: FaceCtx = { face, s, pu: per.u, pv: per.v }
  const rings = faceRings(ctx, b, edgeSamples, pts, chord, angle, warnings)
  if (debugRings !== undefined) debugRings(fi, rings.map((r) => r.map((p) => ({ u: p.u, v: p.v, g: p.g }))))
  if (rings.length === 0) {
    warnings.push(`face ${fi}: no boundary`)
    return undefined
  }
  // Metric scale of the parameters (mm per unit u and v), so the Delaunay criterion sees near-isotropic triangles.
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (const r of rings) for (const p of r) { u0 = Math.min(u0, p.u); u1 = Math.max(u1, p.u); v0 = Math.min(v0, p.v); v1 = Math.max(v1, p.v) }
  let su = 0, sv = 0, n = 0
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
    const d = surfaceDerivs(s, u0 + ((u1 - u0) * i) / 4, v0 + ((v1 - v0) * j) / 4)
    su += length3(d.su)
    sv += length3(d.sv)
    n++
  }
  su = su / n || 1
  sv = sv / n || 1
  // Cylinders and cones are straight along v: any triangle may be long in v, and a Delaunay criterion
  // that sees v compressed joins boundary points at matching u across the face (strips) instead of diagonals across the
  // curvature, which the refinement then broke up into thousands of small triangles. The chord test still decides.
  // A long thin cylinder (a 1 mm bore through a 100 mm plate) needs the compression to follow its length: with the fixed
  // factor the strip stays dozens of times longer than it is wide and the refinement breaks it into 150 000 slivers.
  if (s.kind === "cylinder" || s.kind === "cone") sv *= Math.min(0.02, (4 * (u1 - u0) * su) / Math.max(1e-300, (v1 - v0) * sv))
  const cdt = new Cdt({ minX: u0 * su, minY: v0 * sv, maxX: u1 * su, maxY: v1 * sv })
  // Local vertex table.
  const localG: number[] = []
  const localU: number[] = []
  const localV: number[] = []
  // Pole flags: the parameter is undetermined at this vertex (any value maps to the same 3D point).
  const localSu: boolean[] = []
  const localSv: boolean[] = []
  const indexOf = new Map<number, number>()
  const add = (u: number, v: number, g: number, pu: boolean, pv: boolean): number => {
    const id = cdt.addPoint(u * su, v * sv)
    if (!indexOf.has(id)) {
      indexOf.set(id, localG.length)
      localG.push(g)
      localU.push(u)
      localV.push(v)
      localSu.push(pu)
      localSv.push(pv)
    }
    return id
  }
  try {
    const ringIds = rings.map((r) => r.map((p) => add(p.u, p.v, p.g, p.su, p.sv)))
    for (const ids of ringIds) for (let i = 0; i < ids.length; i++) cdt.addConstraint(ids[i]!, ids[(i + 1) % ids.length]!)
  } catch (err) {
    warnings.push(`face ${fi}: ${(err as Error).message}`)
    return undefined
  }
  cdt.markRegions()
  // Refinement.
  const posOf = (id: number): Vec3 => pts.get(localG[indexOf.get(id)!]!)
  const uvOf = (id: number): readonly [number, number] => { const k = indexOf.get(id)!; return [localU[k]!, localV[k]!] }
  const cosTol = angle > 0 ? Math.cos(angle) : -2
  const normalCache = new Map<number, Vec3>()
  const nrm = (id: number): Vec3 => {
    let v = normalCache.get(id)
    if (v === undefined) { const [u, w] = uvOf(id); v = surfaceNormal(s, u, w); normalCache.set(id, v) }
    return v
  }
  const flat = s.kind === "plane"
  // Integration mode: parameter-span limits per direction.
  const stepU = paramStep === undefined ? undefined : per.u !== undefined ? paramStep : (u1 - u0) / 24
  const stepV = paramStep === undefined ? undefined : per.v !== undefined || s.kind === "sphere" ? paramStep : s.kind === "cylinder" || s.kind === "cone" ? undefined : (v1 - v0) / 24
  // A triangle that passed its tests keeps passing while it exists (the tests read only its corners, and constrained edges
  // never change), so a later pass skips it: without this every pass re-tested the whole face, and a sphere took seconds.
  const passed = new Set<string>()
  const triangleKey = (a: number, b: number, c: number): string => {
    const m = Math.min(a, b, c)
    return m === a ? `${a},${b},${c}` : m === b ? `${b},${c},${a}` : `${c},${a},${b}`
  }
  for (let pass = 0; pass < 40; pass++) {
    const tris = cdt.result().triangles
    if (cdt.pointCount > maxPoints) {
      warnings.push(`face ${fi}: point budget reached`)
      break
    }
    const inserts: Array<readonly [number, number]> = []
    for (const [a, b2, c] of tris) {
      const key = triangleKey(a, b2, c)
      if (passed.has(key)) continue
      // Effective parameters: a pole corner takes the undetermined parameter from the other corners, which is where
      // the triangle's 3D edges actually leave the pole (a cone generator, a sphere meridian).
      const ka = indexOf.get(a)!, kb = indexOf.get(b2)!, kc = indexOf.get(c)!
      const effU = (k: number, o1: number, o2: number): number => {
        if (!localSu[k]) return localU[k]!
        const others = [o1, o2].filter((o) => !localSu[o])
        return others.length === 0 ? localU[k]! : others.reduce((s, o) => s + localU[o]!, 0) / others.length
      }
      const effV = (k: number, o1: number, o2: number): number => {
        if (!localSv[k]) return localV[k]!
        const others = [o1, o2].filter((o) => !localSv[o])
        return others.length === 0 ? localV[k]! : others.reduce((s, o) => s + localV[o]!, 0) / others.length
      }
      const ua = effU(ka, kb, kc), va = effV(ka, kb, kc)
      const ub = effU(kb, kc, ka), vb = effV(kb, kc, ka)
      const uc = effU(kc, ka, kb), vc = effV(kc, ka, kb)
      const pa = posOf(a), pb = posOf(b2), pc = posOf(c)
      // A triangle with two corners on a pole is a line in 3D: it is not in the mesh, so it needs no refinement
      // (refining it would only push points towards the pole forever). Integration mode still bounds its span.
      const ga = localG[indexOf.get(a)!], gb = localG[indexOf.get(b2)!], gc = localG[indexOf.get(c)!]
      const degenerate = ga === gb || gb === gc || gc === ga
      if (degenerate && paramStep === undefined) continue
      let bad = false
      if (maxEdge > 0 && Math.max(dist3(pa, pb), dist3(pb, pc), dist3(pc, pa)) > maxEdge) bad = true
      if (paramStep !== undefined) {
        if (!flat) {
          // Raw parameters: the quadrature runs on the (u, v) triangle itself.
          const ru = [localU[ka]!, localU[kb]!, localU[kc]!], rv = [localV[ka]!, localV[kb]!, localV[kc]!]
          const spanU = Math.max(...ru) - Math.min(...ru), spanV = Math.max(...rv) - Math.min(...rv)
          if ((stepU !== undefined && spanU > stepU) || (stepV !== undefined && spanV > stepV)) bad = true
        }
      } else if (!bad && !flat) {
        // Chord height = distance from the flat triangle to the surface along the surface normal (a tangential slip
        // of the parameterisation is not an error of the mesh).
        const sag = (mu: number, mv: number, lin: Vec3): number => {
          const d = surfaceDerivs(s, mu, mv)
          const n = cross3(d.su, d.sv)
          const ln = length3(n)
          return ln > 1e-300 ? Math.abs(dot3(sub3(d.p, lin), n)) / ln : dist3(d.p, lin)
        }
        const uc0 = (ua + ub + uc) / 3, vc0 = (va + vb + vc) / 3
        const lin = { x: (pa.x + pb.x + pc.x) / 3, y: (pa.y + pb.y + pc.y) / 3, z: (pa.z + pb.z + pc.z) / 3 }
        if (sag(uc0, vc0, lin) > chord) bad = true
        else {
          // Edge midpoints of the triangle (catches long thin triangles across curvature).
          // Boundary segments are fixed (shared with the neighbour face) and are skipped.
          // Per edge, a pole end takes the parameter of the edge's other end.
          const end = (k: number, o: number): readonly [number, number] => [localSu[k] && !localSu[o] ? localU[o]! : localU[k]!, localSv[k] && !localSv[o] ? localV[o]! : localV[k]!]
          const mid = (k: number, o: number): readonly [number, number] => { const p = end(k, o), q = end(o, k); return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }
          const [mab, mbc, mca] = [mid(ka, kb), mid(kb, kc), mid(kc, ka)]
          const mids: Array<readonly [number, number, Vec3, Vec3, number, number]> = [
            [mab[0], mab[1], pa, pb, a, b2],
            [mbc[0], mbc[1], pb, pc, b2, c],
            [mca[0], mca[1], pc, pa, c, a]
          ]
          for (const [mu, mv, p, q, ia, ib] of mids) {
            if (sag(mu, mv, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 }) > chord && !cdt.isConstrained(ia, ib)) { bad = true; break }
          }
        }
        if (!bad && angle > 0) {
          // At a pole corner: the limit normal from inside this triangle.
          const cu = (ua + ub + uc) / 3, cv = (va + vb + vc) / 3
          const nAt = (id: number, k: number, u: number, v: number): Vec3 =>
            localSu[k] || localSv[k] ? surfaceNormal(s, u + (cu - u) * 1e-4, v + (cv - v) * 1e-4) : nrm(id)
          const na = nAt(a, ka, ua, va), nb = nAt(b2, kb, ub, vb), nc = nAt(c, kc, uc, vc)
          if (dot3(na, nb) < cosTol || dot3(nb, nc) < cosTol || dot3(nc, na) < cosTol) bad = true
        }
      }
      if (!bad) passed.add(key)
      if (bad) {
        // Effective centroid first (where the 3D triangle is); the raw (u, v) centroid, always strictly inside, if not.
        inserts.push([(ua + ub + uc) / 3, (va + vb + vc) / 3])
        if (localSu[ka] || localSu[kb] || localSu[kc] || localSv[ka] || localSv[kb] || localSv[kc])
          inserts.push([(localU[ka]! + localU[kb]! + localU[kc]!) / 3, (localV[ka]! + localV[kb]! + localV[kc]!) / 3])
      }
    }
    if (inserts.length === 0) break
    let added = 0
    for (const [u, v] of inserts) {
      const id = cdt.addInteriorPoint(u * su, v * sv)
      if (id !== undefined && !indexOf.has(id)) {
        indexOf.set(id, localG.length)
        localG.push(pts.add(surfacePoint(s, u, v)))
        localU.push(u)
        localV.push(v)
        localSu.push(false)
        localSv.push(false)
        added++
      }
    }
    if (added === 0) break
  }
  // Output: local arrays in CDT index order.
  const res = cdt.result()
  const triangles: number[] = []
  const domain: number[] = []
  for (const [a, b2, c] of res.triangles) {
    domain.push(indexOf.get(a)!, indexOf.get(b2)!, indexOf.get(c)!)
    const ga = localG[indexOf.get(a)!]!, gb = localG[indexOf.get(b2)!]!, gc = localG[indexOf.get(c)!]!
    if (ga === gb || gb === gc || gc === ga) continue
    const pa = pts.get(ga), pb = pts.get(gb), pc = pts.get(gc)
    if (length3(cross3(sub3(pb, pa), sub3(pc, pa))) <= 1e-18) continue
    if (face.reversed) triangles.push(indexOf.get(a)!, indexOf.get(c)!, indexOf.get(b2)!)
    else triangles.push(indexOf.get(a)!, indexOf.get(b2)!, indexOf.get(c)!)
  }
  const count = localG.length
  const positions = new Float64Array(count * 3)
  const normals = new Float32Array(count * 3)
  const uvs = new Float64Array(count * 2)
  // At a pole the normal is a limit taken from inside the face: towards the centroid of a domain triangle using it.
  const insideOf = new Map<number, readonly [number, number]>()
  for (let i = 0; i < domain.length; i += 3) for (let q = 0; q < 3; q++) {
    const k = domain[i + q]!
    if ((localSu[k] || localSv[k]) && !insideOf.has(k)) {
      const t = [domain[i]!, domain[i + 1]!, domain[i + 2]!]
      insideOf.set(k, [t.reduce((sum, j) => sum + localU[j]!, 0) / 3, t.reduce((sum, j) => sum + localV[j]!, 0) / 3])
    }
  }
  for (let k = 0; k < count; k++) {
    const p = pts.get(localG[k]!)
    positions[k * 3] = p.x; positions[k * 3 + 1] = p.y; positions[k * 3 + 2] = p.z
    const towards = insideOf.get(k)
    let nn = towards === undefined
      ? surfaceNormal(s, localU[k]!, localV[k]!)
      : surfaceNormal(s, localU[k]! + (towards[0] - localU[k]!) * 1e-4, localV[k]! + (towards[1] - localV[k]!) * 1e-4)
    if (face.reversed) nn = { x: -nn.x, y: -nn.y, z: -nn.z }
    normals[k * 3] = nn.x; normals[k * 3 + 1] = nn.y; normals[k * 3 + 2] = nn.z
    uvs[k * 2] = localU[k]!; uvs[k * 2 + 1] = localV[k]!
  }
  return { face: fi, positions, normals, uvs, indices: Uint32Array.from(triangles), domain: Uint32Array.from(domain), global: Uint32Array.from(localG) }
}

// ================================================================ entry point

/** Display tolerance used when none is given: 1/2000 of the model diagonal, clamped to [0.001, 0.05] mm. */
export const defaultChordTol = (b: Brep): number => Math.min(0.05, Math.max(0.001, bboxDiagonal(b) / 2000))

// ---------------------------------------------------------------- face reuse
// A blend or any sequence of Booleans meshes the same faces of the growing body again and again (a fillet tool touches a few
// faces; the rest come out of each Boolean with the same surface object and the same boundary). A face's mesh depends only on
// its surface, its side, its boundary curves and ranges, and the options, so it is kept per surface object and reused.

const objectIds = new WeakMap<object, number>()
let nextObjectId = 1
const idOf = (o: object): number => {
  let id = objectIds.get(o)
  if (id === undefined) { id = nextObjectId++; objectIds.set(o, id) }
  return id
}
const faceMeshes = new WeakMap<object, Map<string, FaceMesh>>()
const FACE_MESHES_PER_SURFACE = 32
/** Reuse counters (diagnostics: how many face meshes the Booleans took from the cache). */
export const faceMeshReuse = { hits: 0, misses: 0 }

const faceKey = (b: Brep, face: Face, settings: string): string =>
  `${settings}|${face.reversed ? 1 : 0}|${face.loops.map((l) => l.coedges.map((c) => { const e = b.edges[c.edge]!; return `${idOf(e.curve)}:${e.t0}:${e.t1}:${c.reversed ? 1 : 0}` }).join(",")).join(";")}`

/**
 * A cached face mesh carried into this tessellation: each global id it used maps to one id here. Boundary points are the
 * samples of this tessellation's own edges (the same positions, bit for bit, since sampling is deterministic), so the face
 * still shares them with its neighbours; interior points are added.
 */
const adoptFaceMesh = (cached: FaceMesh, fi: number, b: Brep, edges: ReadonlyArray<EdgePolyline>, pts: Points): FaceMesh => {
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`
  const boundary = new Map<string, number>()
  for (const l of b.faces[fi]!.loops) for (const c of l.coedges) for (const g of edges[c.edge]!.points) { const p = pts.get(g); boundary.set(key(p.x, p.y, p.z), g) }
  const remap = new Map<number, number>()
  const n = cached.global.length
  const global = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    const old = cached.global[i]!
    let id = remap.get(old)
    if (id === undefined) {
      const x = cached.positions[i * 3]!, y = cached.positions[i * 3 + 1]!, z = cached.positions[i * 3 + 2]!
      id = boundary.get(key(x, y, z)) ?? pts.add({ x, y, z })
      remap.set(old, id)
    }
    global[i] = id
  }
  return { ...cached, face: fi, global }
}

/** Tessellates every face of the B-rep; the welded mesh is watertight for a valid closed shell. */
export const tessellateBrep = (b: Brep, options: TessellateOptions = {}): BrepTessellation => {

  const chord = options.chordTol ?? defaultChordTol(b)
  const angle = ((options.angleTolDeg ?? 15) * Math.PI) / 180
  const maxEdge = options.maxEdge ?? 0
  const maxPoints = options.maxPointsPerFace ?? 200_000
  const warnings: string[] = []
  const pts = new Points()
  const vg = b.vertices.map((v) => pts.add(v.point))
  const edges: EdgePolyline[] = b.edges.map((e, ei) => {
    const params = sampleEdge(e, chord, angle, maxEdge)
    const points = params.map((t, i) => (i === 0 ? vg[e.v0]! : i === params.length - 1 ? vg[e.v1]! : pts.add(curvePoint(e.curve, t))))
    void ei
    return { edge: ei, points, params }
  })
  const faces: FaceMesh[] = []
  const welded: number[] = []
  const triFace: number[] = []
  const settings = `${chord}|${angle}|${maxEdge}|${maxPoints}|${options.paramStep ?? ""}`
  b.faces.forEach((face, fi) => {
    if (options.faces !== undefined && !options.faces.has(fi)) return
    checkBudget()
    let fm: FaceMesh | undefined
    if (options.reuse === true) {
      const key = faceKey(b, face, settings)
      let bySurface = faceMeshes.get(face.surface)
      const cached = bySurface?.get(key)
      if (cached !== undefined) { faceMeshReuse.hits++; fm = adoptFaceMesh(cached, fi, b, edges, pts) }
      else {
        faceMeshReuse.misses++
        // Warnings of a fresh mesh are this tessellation's; a mesh with warnings is not kept.
        const before = warnings.length
        fm = tessellateFace(fi, b, edges, pts, chord, angle, maxEdge, maxPoints, options.paramStep, warnings)
        if (fm !== undefined && warnings.length === before) {
          if (bySurface === undefined) { bySurface = new Map(); faceMeshes.set(face.surface, bySurface) }
          if (bySurface.size >= FACE_MESHES_PER_SURFACE) bySurface.delete(bySurface.keys().next().value!)
          bySurface.set(key, fm)
        }
      }
    } else fm = tessellateFace(fi, b, edges, pts, chord, angle, maxEdge, maxPoints, options.paramStep, warnings)
    if (fm === undefined) return
    faces.push(fm)
    for (let i = 0; i < fm.indices.length; i += 3) {
      welded.push(fm.global[fm.indices[i]!]!, fm.global[fm.indices[i + 1]!]!, fm.global[fm.indices[i + 2]!]!)
      triFace.push(fi)
    }
  })
  return {
    positions: Float64Array.from(pts.xyz),
    indices: Uint32Array.from(welded),
    triangleFace: Uint32Array.from(triFace),
    faces,
    edges,
    warnings,
    chordTol: chord
  }
}

export interface UvSample {
  readonly u: number
  readonly v: number
  /** Global point index; indices below the B-rep's vertex count are its vertices. */
  readonly g: number
  /** Edge left from this sample and its parameter there. */
  readonly edge?: number
  readonly t?: number
  /** Edge that led to this sample and its parameter there. */
  readonly inEdge?: number
  readonly inT?: number
  /** On a pole line (u or v undetermined). */
  readonly pole: boolean
}

export interface FaceBoundaries {
  /** Per face: its closed parameter-space rings (natural orientation, material on the left). */
  readonly rings: ReadonlyArray<ReadonlyArray<ReadonlyArray<UvSample>>>
  /** True when a face needed a synthetic cut (a loop wrapping a period without a seam edge). */
  readonly synthetic: ReadonlyArray<boolean>
  readonly point: (g: number) => Vec3
  readonly edges: ReadonlyArray<EdgePolyline>
  readonly warnings: ReadonlyArray<string>
}

/**
 * The parameter-space boundary rings of every face, built exactly as the tessellator builds them (seams placed,
 * poles closed, holes shifted into the outer window). Used by the Boolean imprint to arrange cut curves in (u, v).
 */
export const faceBoundaries = (b: Brep, options: TessellateOptions = {}): FaceBoundaries => {
  const chord = options.chordTol ?? defaultChordTol(b)
  const angle = ((options.angleTolDeg ?? 15) * Math.PI) / 180
  const maxEdge = options.maxEdge ?? 0
  const warnings: string[] = []
  const pts = new Points()
  const vg = b.vertices.map((v) => pts.add(v.point))
  const edges: EdgePolyline[] = b.edges.map((e, ei) => {
    const params = sampleEdge(e, chord, angle, maxEdge)
    const points = params.map((t, i) => (i === 0 ? vg[e.v0]! : i === params.length - 1 ? vg[e.v1]! : pts.add(curvePoint(e.curve, t))))
    return { edge: ei, points, params }
  })
  const synthetic: boolean[] = []
  const rings = b.faces.map((face, fi) => {
    const per = surfacePeriods(face.surface)
    const ctx: FaceCtx = { face, s: face.surface, pu: per.u, pv: per.v }
    const before = pts.xyz.length
    const rs = faceRings(ctx, b, edges, pts, chord, angle, warnings)
    // Synthetic cut points are new interior points added while building the rings.
    synthetic[fi] = rs.some((r) => r.some((p) => p.edge === undefined && !p.su && !p.sv && p.g * 3 >= before))
    return rs.map((r) =>
      r.map((p): UvSample => ({
        u: p.u,
        v: p.v,
        g: p.g,
        pole: p.su || p.sv,
        ...(p.edge === undefined ? {} : { edge: p.edge, t: p.t! }),
        ...(p.inEdge === undefined ? {} : { inEdge: p.inEdge, inT: p.inT! })
      }))
    )
  })
  return { rings, synthetic, point: (g) => pts.get(g), edges, warnings }
}

/** The welded mesh in the core's `Mesh` shape (Float32 positions), for the viewport, CSG and the CAM. */
export const brepToMesh = (b: Brep, options: TessellateOptions = {}): { readonly positions: Float32Array; readonly indices: Uint32Array } => {
  const t = tessellateBrep(b, options)
  return { positions: Float32Array.from(t.positions), indices: t.indices }
}

/** Boundary edges (used once) and non-manifold edges (used 3+ times) of the welded mesh; both 0 for a watertight one. */
export const meshEdgeDefects = (indices: Uint32Array): { readonly open: number; readonly nonManifold: number; readonly misoriented: number } => {
  const count = new Map<string, number>()
  const directed = new Map<string, number>()
  for (let i = 0; i < indices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[i + k]!, c = indices[i + ((k + 1) % 3)]!
      const key = a < c ? `${a}_${c}` : `${c}_${a}`
      count.set(key, (count.get(key) ?? 0) + 1)
      directed.set(`${a}>${c}`, (directed.get(`${a}>${c}`) ?? 0) + 1)
    }
  }
  let open = 0, nonManifold = 0, misoriented = 0
  for (const v of count.values()) { if (v === 1) open++; else if (v > 2) nonManifold++ }
  for (const v of directed.values()) if (v > 1) misoriented++
  return { open, nonManifold, misoriented }
}

void normalize3
