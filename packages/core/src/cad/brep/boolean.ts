/**
 * Exact B-rep Booleans (SMLib's SmApiBoolean pipeline): intersect → imprint → classify → sew.
 *
 * 1. Intersect. Edges of each solid against the faces of the other (exact points by Newton), edges lying on the
 *    other solid's surfaces (coplanar/coincident faces) and their crossings with that face's boundary, and the
 *    intersection curves of every pair of non-coincident faces (refined onto both surfaces, recognised as lines and
 *    circles, otherwise fitted as cubic B-splines within the fit tolerance).
 * 2. Imprint. Every intersection point becomes a vertex (one registry for both solids, so touching corners merge);
 *    edges are split at those vertices; each face is cut by the curves lying on it through a planar arrangement in
 *    its (u, v) domain, giving face fragments bounded by edge pieces.
 * 3. Classify. A point inside each fragment is located against the other solid (exact closest point and
 *    pseudo-normal): in, out, or on with the same or the opposite orientation.
 * 4. Sew. Fragments are kept by the operation's rules, the second solid's are flipped for a difference, pieces that
 *    coincide are one edge, coplanar neighbours are merged and the result is validated.
 *
 * A result that does not validate as a closed manifold solid is an error (`BooleanError`), never returned.
 */
import { add3, cross3, dist3, dot3, length3, normalize3, scale3, sub3, translation, unwrapNear, type Frame, type Vec2, type Vec3 } from "./math.ts"
import { curvePoint, curveProject, surfaceDerivs, surfaceNormal, surfacePeriods, surfacePoint, surfaceProject, type Curve3, type Surface } from "./geom.ts"
import { interpolateCurve, nurbsCurvePoint, type NurbsCurveData } from "./nurbs.ts"
import { compactBrepMapped, edgeUses, EMPTY_BREP, transformBrep, type Brep, type Coedge, type Edge, type Face, type Loop } from "./topology.ts"
import { faceBoundaries, tessellateBrep, type FaceBoundaries, type UvSample } from "./tessellate.ts"
import { brepLocator, type BrepLocator } from "./classify.ts"
import { massProperties } from "./mass.ts"
import { Cdt } from "./cdt.ts"
import { checkBudget } from "./budget.ts"
import {
  edgeEdgeHits,
  edgeOnSurface,
  edgeSurfaceHits,
  meshIntersectionPolylines,
  refineSsiPolyline,
  refineSurfaceSurface,
  TriBvh,
  triSetOfFace,
  type SsiPoint,
  type TriSet
} from "./intersect.ts"
import { validateBrep, type BrepIssue } from "./validate.ts"
import { recordDerivation, type FaceOrigin } from "./lineage-record.ts"
import { separateContacts, separateTouchingVertices } from "./contact.ts"
import { orient2d } from "./predicates.ts"
import { makeSphere, makeTorus } from "./primitives.ts"

export type BooleanOp = "union" | "subtract" | "intersect"

/** Where in the pipeline a Boolean gave up. */
export type BooleanStage = "prepare" | "arrange" | "validate"

/** Machine-readable account of a failed Boolean: what stage, which operand and face, what to try. */
export interface BooleanDiagnostic {
  readonly stage: BooleanStage
  readonly operand?: "A" | "B"
  readonly face?: number
  /** Suggested remedy for the person or the assistant. */
  readonly hint: string
  /** Displacements already tried by the recovery (mm), empty when the plain pipeline failed and no recovery ran. */
  readonly attempts: ReadonlyArray<number>
}

export class BooleanError extends Error {
  constructor(message: string, readonly issues: ReadonlyArray<BrepIssue> = [], readonly diagnostic?: BooleanDiagnostic) {
    super(message)
  }
}

const DEGENERATE_HINT = "the operands meet in a degenerate way (tangent, coincident or exactly aligned); move one by a small amount, change a radius slightly, or model the contact as an overlap"

/**
 * What the Booleans of this process did (spec 42 R0): how often the plain pipeline sufficed, how often an operand had to be
 * displaced to break a degenerate contact (the result is then approximate and carries a warning), how often the plain
 * pipeline failed, how often every recovery failed too, and how often the answer was empty. Read with `booleanCounters`,
 * cleared with `resetBooleanCounters`; the seeded report (`kernel-fuzz-report.ts`) and the assistant's `cad.kernel` report print it.
 */
export interface BooleanCounters {
  readonly calls: number
  /** Solved by the plain pipeline (no displacement). */
  readonly exact: number
  /** The plain pipeline failed and a displaced operand gave the answer (a warning says so). */
  readonly recoveredByDisplacement: number
  /** The plain pipeline refused (counted before the recovery tries): `booleanStrict` failures. */
  readonly strictFailure: number
  /** The plain pipeline and every recovery refused: a `BooleanError` reached the caller. */
  readonly failed: number
  /** The result has no faces (disjoint intersection, a subtraction that removes everything). */
  readonly emptyResult: number
  /** A pole or apex on the other solid sent the call straight to the recovery. */
  readonly poleContact: number
  /** Solved by the plain pipeline with a tangent, edge or point contact kept in place (a warning says so; no operand moved). */
  readonly inPlaceContact: number
  /** Solved exactly after a bare sphere or torus operand was given another parametrisation frame (poles and seams moved off the contact; no geometry changed). */
  readonly reframed: number
  /** Failures by the stage that gave up. */
  readonly byStage: Readonly<Record<BooleanStage, number>>
}

const COUNTERS = { calls: 0, exact: 0, recoveredByDisplacement: 0, strictFailure: 0, failed: 0, emptyResult: 0, poleContact: 0, inPlaceContact: 0, reframed: 0, byStage: { prepare: 0, arrange: 0, validate: 0 } as Record<BooleanStage, number> }

export const booleanCounters = (): BooleanCounters => ({ ...COUNTERS, byStage: { ...COUNTERS.byStage } })
export const resetBooleanCounters = (): void => {
  COUNTERS.calls = 0; COUNTERS.exact = 0; COUNTERS.recoveredByDisplacement = 0; COUNTERS.strictFailure = 0; COUNTERS.failed = 0; COUNTERS.emptyResult = 0; COUNTERS.poleContact = 0; COUNTERS.inPlaceContact = 0; COUNTERS.reframed = 0
  COUNTERS.byStage = { prepare: 0, arrange: 0, validate: 0 }
}

export interface BooleanOptions {
  /** Coincidence tolerance, mm (default 1e-8 × model size, at least 1e-7). */
  readonly tol?: number
  /** Max deviation of fitted intersection curves, mm (default 1e-6 × model size, at least 1e-6). */
  readonly fitTol?: number
  /** Diagnostics hook: receives each stage's data (intersections, arrangements, classification). */
  readonly debug?: (stage: string, data: unknown) => void
  /**
   * Turn of the normal across one triangle of the seed meshes, degrees (default 10). The seeds only find where the surfaces
   * meet (the curves are then refined on the exact surfaces); a small, simple operand such as a rolling-ball corner can use a
   * coarser seed.
   */
  readonly seedAngleDeg?: number
}

export interface BooleanStats {
  readonly intersectionCurves: number
  readonly splitPoints: number
  readonly fragments: number
  readonly keptFaces: number
}

export interface BooleanResult {
  readonly brep: Brep
  readonly warnings: ReadonlyArray<string>
  readonly stats: BooleanStats
}

const TAU = Math.PI * 2

/**
 * Signed turn between two consecutive samples of a circle, in (−π, π]. Consecutive samples are closer than half a turn, so
 * the sum telescopes to the exact angle of the last point; a sample slightly out of order (two marks within the tolerance of
 * one vertex) is a small negative step, not a whole extra turn.
 */
const stepAngle = (delta: number): number => {
  let d = delta % TAU
  if (d > Math.PI) d -= TAU
  else if (d <= -Math.PI) d += TAU
  return d
}

/** Cumulative angles, kept non-decreasing for use as curve parameters (the true total is `total`). */
const runningAngles = (angles: ReadonlyArray<number>): { readonly params: number[]; readonly total: number } => {
  const params: number[] = [0]
  let acc = 0
  for (let i = 1; i < angles.length; i++) {
    acc += stepAngle(angles[i]! - angles[i - 1]!)
    params.push(Math.max(acc, params[i - 1]!))
  }
  return { params, total: acc }
}

// ================================================================ registries

class VertexRegistry {
  readonly pts: Vec3[] = []
  constructor(readonly tol: number) {}
  add(p: Vec3): number {
    for (let i = 0; i < this.pts.length; i++) if (dist3(this.pts[i]!, p) <= this.tol) return i
    this.pts.push(p)
    return this.pts.length - 1
  }
}

class UnionFind {
  private readonly p = new Map<string, string>()
  find(x: string): string {
    let r = x
    while (this.p.has(r) && this.p.get(r) !== r) r = this.p.get(r)!
    // Path compression.
    let y = x
    while (this.p.has(y) && this.p.get(y) !== r) { const n = this.p.get(y)!; this.p.set(y, r); y = n }
    return r
  }
  union(a: string, b: string): void {
    const ra = this.find(a), rb = this.find(b)
    if (ra !== rb) this.p.set(rb, ra)
  }
}

/** A piece of curve between two registry vertices: the unit of edge identity in the result. */
interface Piece {
  readonly key: string
  readonly curve: Curve3
  /** Parameter range, t0 < t1; v0 at t0. */
  readonly t0: number
  readonly t1: number
  readonly v0: number
  readonly v1: number
}

interface SolidData {
  readonly brep: Brep
  readonly fb: FaceBoundaries
  readonly loc: BrepLocator
  readonly tri: ReadonlyArray<TriSet | undefined>
  readonly bvh: ReadonlyArray<TriBvh | undefined>
  /** Registry id of each vertex. */
  readonly vid: number[]
  /** Split points per edge. */
  readonly splits: Array<Array<{ readonly t: number; readonly vid: number }>>
  /** Faces of the other solid on whose surface each edge lies. */
  readonly onFaces: Array<number[]>
  readonly faceBox: ReadonlyArray<{ readonly lo: Vec3; readonly hi: Vec3 }>
  readonly edgeBox: ReadonlyArray<{ readonly lo: Vec3; readonly hi: Vec3 }>
}

const boxOverlap = (a: { lo: Vec3; hi: Vec3 }, b: { lo: Vec3; hi: Vec3 }, pad: number): boolean =>
  a.lo.x - pad <= b.hi.x && b.lo.x - pad <= a.hi.x && a.lo.y - pad <= b.hi.y && b.lo.y - pad <= a.hi.y && a.lo.z - pad <= b.hi.z && b.lo.z - pad <= a.hi.z

const boxOf = (pts: Iterable<Vec3>): { lo: Vec3; hi: Vec3 } => {
  let lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const p of pts) {
    lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y), z: Math.min(lo.z, p.z) }
    hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y), z: Math.max(hi.z, p.z) }
  }
  return { lo, hi }
}

// ================================================================ curve fitting

interface FittedCurve {
  readonly curve: Curve3
  readonly t0: number
  readonly t1: number
  /** Curve parameter of each input point. */
  readonly params: ReadonlyArray<number>
}

/**
 * The exact conic two surfaces meet in, when there is one the line and circle tests do not cover: a plane cutting a
 * cylinder obliquely meets it in an ellipse centred where the axis crosses the plane, of minor radius R across the axis and
 * major radius R / |cos θ| along the axis's projection (θ between the axis and the plane's normal).
 */
const conicOf = (sa: Surface, sb: Surface): { readonly frame: Frame; readonly a: number; readonly b: number } | undefined => {
  const plane = sa.kind === "plane" ? sa : sb.kind === "plane" ? sb : undefined
  const cyl = sa.kind === "cylinder" ? sa : sb.kind === "cylinder" ? sb : undefined
  if (plane === undefined || cyl === undefined || plane.kind !== "plane" || cyl.kind !== "cylinder") return undefined
  const n = plane.frame.z, ax = cyl.frame.z
  const c = dot3(n, ax)
  if (Math.abs(c) < 1e-9 || Math.abs(Math.abs(c) - 1) < 1e-12) return undefined
  const centre = add3(cyl.frame.origin, scale3(ax, dot3(sub3(plane.frame.origin, cyl.frame.origin), n) / c))
  const major = normalize3(sub3(ax, scale3(n, c)))
  return { frame: { origin: centre, x: major, y: cross3(n, major), z: n }, a: cyl.radius / Math.abs(c), b: cyl.radius }
}

/** Line, circle, the surfaces' exact conic, or an interpolating cubic B-spline through exact points of a curve. */
const fitCurve = (pts: ReadonlyArray<Vec3>, closed: boolean, tol: number, conic?: { readonly frame: Frame; readonly a: number; readonly b: number }): FittedCurve => {
  const n = pts.length
  const P0 = pts[0]!, Pn = closed ? pts[0]! : pts[n - 1]!
  // Line.
  if (!closed) {
    const d = sub3(Pn, P0)
    const L = length3(d)
    if (L > tol) {
      const u = scale3(d, 1 / L)
      let ok = true
      for (const p of pts) { const r = sub3(p, P0); if (length3(sub3(r, scale3(u, dot3(r, u)))) > tol) { ok = false; break } }
      if (ok) return { curve: { kind: "line", origin: P0, dir: u }, t0: 0, t1: L, params: pts.map((p) => dot3(sub3(p, P0), u)) }
    }
  }
  // Circle through three well-spread points.
  if (n >= 3) {
    const a = pts[0]!, b = pts[Math.floor(n / 3)]!, c = pts[Math.floor((2 * n) / 3)]!
    const ab = sub3(b, a), ac = sub3(c, a)
    const nrm = cross3(ab, ac)
    const nn = dot3(nrm, nrm)
    if (nn > 1e-24) {
      const center = add3(a, scale3(add3(scale3(cross3(nrm, ab), dot3(ac, ac)), scale3(cross3(ac, nrm), dot3(ab, ab))), 1 / (2 * nn)))
      const R = dist3(center, a)
      const z = normalize3(nrm)
      let ok = R > tol
      for (const p of pts) if (Math.abs(dist3(p, center) - R) > tol || Math.abs(dot3(sub3(p, center), z)) > tol) { ok = false; break }
      if (ok) {
        // Orient the frame so the points run counter-clockwise.
        const x = normalize3(sub3(P0, center))
        let fr: Frame = { origin: center, x, y: cross3(z, x), z }
        const ang = (p: Vec3) => Math.atan2(dot3(sub3(p, center), fr.y), dot3(sub3(p, center), fr.x))
        if (ang(pts[1]!) < 0) { const z2 = scale3(z, -1); fr = { origin: center, x, y: cross3(z2, x), z: z2 } }
        const { params, total } = runningAngles(pts.map(ang))
        const t1 = closed ? TAU : total
        return { curve: { kind: "circle", frame: fr, radius: R }, t0: 0, t1, params }
      }
    }
  }
  // The exact ellipse of the two surfaces, when every point lies on it.
  if (conic !== undefined && n >= 2) {
    const { a, b } = conic
    const local = (p: Vec3) => { const d = sub3(p, conic.frame.origin); return { x: dot3(d, conic.frame.x), y: dot3(d, conic.frame.y), z: dot3(d, conic.frame.z) } }
    let ok = true
    for (const p of pts) {
      const q = local(p)
      if (Math.abs(q.z) > tol || Math.abs(Math.hypot(q.x / a, q.y / b) - 1) * Math.min(a, b) > tol) { ok = false; break }
    }
    if (ok) {
      // Orient the frame so the points run with increasing parameter.
      const ang = (f: Frame, p: Vec3) => { const d = sub3(p, f.origin); return Math.atan2(dot3(d, f.y) / b, dot3(d, f.x) / a) }
      let d0 = ang(conic.frame, pts[1] ?? Pn) - ang(conic.frame, P0)
      while (d0 > Math.PI) d0 -= TAU
      while (d0 < -Math.PI) d0 += TAU
      const fr: Frame = d0 < 0 ? { origin: conic.frame.origin, x: conic.frame.x, y: scale3(conic.frame.y, -1), z: scale3(conic.frame.z, -1) } : conic.frame
      const t0 = ang(fr, P0)
      const { params: rel, total } = runningAngles(pts.map((p) => ang(fr, p)))
      return { curve: { kind: "ellipse", frame: fr, a, b }, t0, t1: closed ? t0 + TAU : t0 + total, params: rel.map((t) => t0 + t) }
    }
  }
  // Cubic B-spline interpolation (closed curves repeat the first point).
  const data = closed ? [...pts, pts[0]!] : pts
  const rows = data.map((p) => [p.x, p.y, p.z])
  let { curve, params } = interpolateCurve(rows, 3)
  // At a tight turn (two nearly tangent surfaces) the points are far apart compared with the radius, and a cubic through them
  // hooks out past the data and back. Between two data points the curve must stay near their chord; where it does not, the
  // curve through the same points is made of straight spans (degree 1), which cannot overshoot.
  if (hooks(curve, params, data)) ({ curve, params } = interpolateCurve(rows, 1))
  return { curve: { kind: "nurbs", data: curve }, t0: 0, t1: 1, params: closed ? params.slice(0, n) : params }
}

/** Whether a fitted curve strays from the chord of some span of its data by more than a quarter of the span. */
const hooks = (curve: NurbsCurveData, params: ReadonlyArray<number>, data: ReadonlyArray<Vec3>): boolean => {
  for (let i = 0; i + 1 < data.length; i++) {
    const a = data[i]!, b = data[i + 1]!
    const d = sub3(b, a), len2 = dot3(d, d)
    if (len2 < 1e-24) continue
    const limit = 0.25 * Math.sqrt(len2)
    for (const f of [0.25, 0.5, 0.75]) {
      const q = nurbsCurvePoint(curve, params[i]! + (params[i + 1]! - params[i]!) * f)
      const p = { x: q[0]!, y: q[1]!, z: q[2]! }
      const t = Math.max(0, Math.min(1, dot3(sub3(p, a), d) / len2))
      if (dist3(p, add3(a, scale3(d, t))) > limit) return true
    }
  }
  return false
}

// ================================================================ the Boolean

export const booleanStrict = (A: Brep, B: Brep, op: BooleanOp, options: BooleanOptions = {}): BooleanResult => {
  const warnings: string[] = []
  const allBox = boxOf([...A.vertices.map((v) => v.point), ...B.vertices.map((v) => v.point), ...[A, B].flatMap((b) => b.edges.map((e) => curvePoint(e.curve, (e.t0 + e.t1) / 2)))])
  const size = Math.max(1e-3, dist3(allBox.lo, allBox.hi))
  const tol = options.tol ?? Math.max(1e-7, size * 1e-8)
  const fitTol = options.fitTol ?? Math.max(1e-6, size * 1e-6)
  // Rounded down to a power of two: never coarser than size / 600, and the same for the Booleans of one sequence (a blend's
  // tools change the size a little each time), so a face met again reuses its mesh (`tessellateBrep` `reuse`).
  const seedChord = 2 ** Math.floor(Math.log2(size / 600))
  const reg = new VertexRegistry(Math.max(tol * 10, 1e-7))

  // ------------------------------------------------ preparation
  // Face boxes come from the boundary samples (and, for a curved face, its surface sampled over its parameter range), so
  // only the faces near the other operand are meshed: a fillet tool touches a few faces of a large body, and meshing the
  // whole body for every Boolean of a blend sequence was most of its cost. A face away from the other operand has no
  // intersection; it stays one fragment, classified as a whole.
  const opts = { chordTol: seedChord, angleTolDeg: options.seedAngleDeg ?? 10 }
  const pad = seedChord * 2
  const faceBoxesOf = (b: Brep, fb: FaceBoundaries): Array<{ lo: Vec3; hi: Vec3 }> =>
    b.faces.map((f, fi) => {
      const ps: Vec3[] = []
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
      for (const r of fb.rings[fi] ?? []) for (const s of r) { ps.push(fb.point(s.g)); u0 = Math.min(u0, s.u); u1 = Math.max(u1, s.u); v0 = Math.min(v0, s.v); v1 = Math.max(v1, s.v) }
      if (f.surface.kind !== "plane" && Number.isFinite(u0)) for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) ps.push(surfacePoint(f.surface, u0 + ((u1 - u0) * i) / 8, v0 + ((v1 - v0) * j) / 8))
      if (ps.length === 0) return { lo: allBox.lo, hi: allBox.hi }
      const bx = boxOf(ps)
      // A curved face can bulge between the samples.
      const bulge = f.surface.kind === "plane" ? 0 : 0.05 * dist3(bx.lo, bx.hi)
      const p = pad + bulge
      return { lo: { x: bx.lo.x - p, y: bx.lo.y - p, z: bx.lo.z - p }, hi: { x: bx.hi.x + p, y: bx.hi.y + p, z: bx.hi.z + p } }
    })
  const fbs = [faceBoundaries(A, opts), faceBoundaries(B, opts)] as const
  const boxes = [faceBoxesOf(A, fbs[0]), faceBoxesOf(B, fbs[1])] as const
  const solidBox = (bs: ReadonlyArray<{ lo: Vec3; hi: Vec3 }>) => boxOf(bs.flatMap((x) => [x.lo, x.hi]))
  const near = [solidBox(boxes[1]), solidBox(boxes[0])] as const
  const prepare = (b: Brep, s: 0 | 1): SolidData => {
    const fb = fbs[s]
    const faceBox = boxes[s]
    const active = new Set(b.faces.map((_, fi) => fi).filter((fi) => boxOverlap(faceBox[fi]!, near[s], 0)))
    const tess = tessellateBrep(b, { ...opts, faces: active, reuse: true })
    const tri: Array<TriSet | undefined> = b.faces.map(() => undefined)
    const bvh: Array<TriBvh | undefined> = b.faces.map(() => undefined)
    for (const fm of tess.faces) { tri[fm.face] = triSetOfFace(fm); bvh[fm.face] = new TriBvh(tri[fm.face]!, tol) }
    const edgeBox = b.edges.map((e, ei) => {
      const bx = boxOf(fb.edges[ei]!.points.map((g) => fb.point(g)))
      void e
      return { lo: { x: bx.lo.x - pad, y: bx.lo.y - pad, z: bx.lo.z - pad }, hi: { x: bx.hi.x + pad, y: bx.hi.y + pad, z: bx.hi.z + pad } }
    })
    return {
      brep: b,
      fb,
      loc: brepLocator(b, fb),
      tri,
      bvh,
      vid: b.vertices.map((v) => reg.add(v.point)),
      splits: b.edges.map(() => []),
      onFaces: b.edges.map(() => []),
      faceBox,
      edgeBox
    }
  }
  const S = [prepare(A, 0), prepare(B, 1)] as const

  const coincidentSurfaces = (sa: Surface, sb: Surface, sdB: SolidData, fbi: number): boolean => {
    // Every sampled point of face fb lies on surface sa.
    const t = sdB.tri[fbi]
    if (t === undefined) return false
    const step = Math.max(1, Math.floor(t.tris.length / 12))
    for (let i = 0; i < t.tris.length; i += step) {
      const tr = t.tris[i]!
      const c = scale3(add3(add3(t.pos(tr[0]), t.pos(tr[1])), t.pos(tr[2])), 1 / 3)
      const q = surfaceProject(sb, c)
      const p = surfacePoint(sb, q.u, q.v)
      const qa = surfaceProject(sa, p)
      if (dist3(surfacePoint(sa, qa.u, qa.v), p) > tol * 10) return false
    }
    return true
  }

  // ------------------------------------------------ 1a. edges × faces of the other solid
  const edgePoints = (sd: SolidData, ei: number): Vec3[] => sd.fb.edges[ei]!.points.map((g) => sd.fb.point(g))
  for (const s of [0, 1] as const) {
    const me = S[s], other = S[1 - s]!
    me.brep.edges.forEach((e, ei) => {
      other.brep.faces.forEach((f, fi) => {
        if (!boxOverlap(me.edgeBox[ei]!, other.faceBox[fi]!, 0)) return
        if (edgeOnSurface(e, f.surface, tol * 10)) {
          me.onFaces[ei]!.push(fi)
          return
        }
        const t = other.tri[fi], bv = other.bvh[fi]
        if (t === undefined || bv === undefined) return
        for (const h of edgeSurfaceHits(e, me.fb.edges[ei]!.params, edgePoints(me, ei), f.surface, t, bv, tol * 10)) {
          if (!other.loc.insideFace(fi, h.u, h.v)) continue
          const v = reg.add(h.point)
          me.splits[ei]!.push({ t: h.t, vid: v })
          // A hit on the face's boundary also splits that boundary edge.
          for (const l of f.loops) for (const c of l.coedges) {
            const e2 = other.brep.edges[c.edge]!
            const t2 = curveProject(e2.curve, h.point, e2.t0, e2.t1)
            if (dist3(curvePoint(e2.curve, t2), h.point) <= tol * 10) other.splits[c.edge]!.push({ t: t2, vid: v })
          }
        }
      })
    })
  }
  // ------------------------------------------------ 1b. edges lying on the other solid's faces: crossings with its boundary
  for (const s of [0, 1] as const) {
    const me = S[s], other = S[1 - s]!
    me.brep.edges.forEach((e, ei) => {
      for (const fi of me.onFaces[ei]!) {
        for (const l of other.brep.faces[fi]!.loops) for (const c of l.coedges) {
          const e2 = other.brep.edges[c.edge]!
          if (!boxOverlap(me.edgeBox[ei]!, other.edgeBox[c.edge]!, 0)) continue
          const hits = edgeEdgeHits(e, me.fb.edges[ei]!.params, edgePoints(me, ei), e2, other.fb.edges[c.edge]!.params, edgePoints(other, c.edge), seedChord * 4, tol * 10)
          for (const h of hits) {
            const v = reg.add(h.point)
            me.splits[ei]!.push({ t: h.t, vid: v })
            other.splits[c.edge]!.push({ t: h.s, vid: v })
          }
        }
      }
    })
  }

  // ------------------------------------------------ 1c. face × face intersection curves
  interface Ssi {
    readonly fa: number
    readonly fb: number
    pts: SsiPoint[]
    readonly closed: boolean
  }
  const ssis: Ssi[] = []
  const onEdgeOf = (sd: SolidData, fi: number, pts: ReadonlyArray<SsiPoint>): boolean => {
    for (const l of sd.brep.faces[fi]!.loops) for (const c of l.coedges) {
      const e = sd.brep.edges[c.edge]!
      if (pts.every((q) => dist3(curvePoint(e.curve, curveProject(e.curve, q.p, e.t0, e.t1)), q.p) <= tol * 100)) return true
    }
    return false
  }
  A.faces.forEach((fa, ia) => {
    B.faces.forEach((fbF, ib) => {
      if (!boxOverlap(S[0].faceBox[ia]!, S[1].faceBox[ib]!, 0)) return
      checkBudget()
      if (coincidentSurfaces(fa.surface, fbF.surface, S[1], ib)) return
      const ta = S[0].tri[ia], tb = S[1].tri[ib], bvb = S[1].bvh[ib]
      if (ta === undefined || tb === undefined || bvb === undefined) return
      for (const pl of meshIntersectionPolylines(ta, tb, bvb, fa.surface, fbF.surface)) {
        const refined = refineSsiPolyline(fa.surface, fbF.surface, pl.pts, pl.closed, tol, fitTol)
        if (refined === undefined) { warnings.push(`face ${ia}×${ib}: intersection curve could not be refined`); continue }
        if (onEdgeOf(S[0], ia, refined) || onEdgeOf(S[1], ib, refined)) continue
        ssis.push({ fa: ia, fb: ib, pts: refined, closed: pl.closed })
      }
    })
  })

  // Snap open SSI ends to registry vertices; split SSI curves at vertices they pass through.
  interface SsiPiece extends Piece { readonly ssi: number; readonly uvA: Vec2[]; readonly uvB: Vec2[]; readonly params: number[] }
  const ssiPieces: SsiPiece[] = []
  const snapR = seedChord * 6
  const projectToSsi = (q: SsiPoint, p: Vec3, sa: Surface, sb: Surface): SsiPoint => {
    const a = surfaceProject(sa, p, { u: q.ua, v: q.va })
    const b = surfaceProject(sb, p, { u: q.ub, v: q.vb })
    return { p, ua: a.u, va: a.v, ub: b.u, vb: b.v }
  }
  ssis.forEach((c, ci) => {
    const sa = A.faces[c.fa]!.surface, sb = B.faces[c.fb]!.surface
    let pts = c.pts
    // Vertices on this curve: registry points that lie on both surfaces and near the polyline.
    const onCurve: Array<{ readonly vid: number; readonly seg: number; readonly f: number }> = []
    reg.pts.forEach((P, vid) => {
      let best = -1, bestD = Infinity, bestF = 0
      const nseg = c.closed ? pts.length : pts.length - 1
      for (let i = 0; i < nseg; i++) {
        const a = pts[i]!.p, b = pts[(i + 1) % pts.length]!.p
        const d = sub3(b, a)
        const l2 = dot3(d, d)
        const f = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot3(sub3(P, a), d) / l2))
        const dd = dist3(add3(a, scale3(d, f)), P)
        if (dd < bestD) { bestD = dd; best = i; bestF = f }
      }
      if (best < 0 || bestD > snapR) return
      const qa = surfaceProject(sa, P), qb = surfaceProject(sb, P)
      if (dist3(surfacePoint(sa, qa.u, qa.v), P) > tol * 10 || dist3(surfacePoint(sb, qb.u, qb.v), P) > tol * 10) return
      onCurve.push({ vid, seg: best, f: bestF })
    })
    if (!c.closed) {
      // Ends must be vertices.
      const endVid = (end: SsiPoint): number | undefined => {
        let best: number | undefined, bd = Infinity
        for (const o of onCurve) { const d = dist3(reg.pts[o.vid]!, end.p); if (d < bd) { bd = d; best = o.vid } }
        return bd <= snapR ? best : undefined
      }
      const v0 = endVid(pts[0]!), v1 = endVid(pts[pts.length - 1]!)
      if (v0 === undefined || v1 === undefined) {
        warnings.push(`intersection curve of faces ${c.fa}×${c.fb} ends away from any boundary point`)
        return
      }
      pts = [projectToSsi(pts[0]!, reg.pts[v0]!, sa, sb), ...pts.slice(1, -1), projectToSsi(pts[pts.length - 1]!, reg.pts[v1]!, sa, sb)]
    }
    // Ordered vertices along the curve (by segment, then position).
    const along = onCurve
      .map((o) => ({ ...o, pos: o.seg + o.f }))
      .sort((x, y) => x.pos - y.pos)
      .filter((o, i, arr) => i === 0 || o.vid !== arr[i - 1]!.vid)
    // Insert interior vertices as exact points.
    type Mark = { readonly q: SsiPoint; readonly vid?: number }
    const marks: Mark[] = pts.map((q) => ({ q }))
    const firstVid = c.closed ? undefined : along.find((o) => dist3(reg.pts[o.vid]!, pts[0]!.p) <= tol * 100)?.vid
    const lastVid = c.closed ? undefined : along.find((o) => dist3(reg.pts[o.vid]!, pts[pts.length - 1]!.p) <= tol * 100)?.vid
    if (!c.closed) {
      marks[0] = { q: marks[0]!.q, vid: firstVid! }
      marks[marks.length - 1] = { q: marks[marks.length - 1]!.q, vid: lastVid! }
    }
    const inserts = along.filter((o) => o.vid !== firstVid && o.vid !== lastVid)
    // Insert from the back so segment indices stay valid.
    for (const o of [...inserts].reverse()) {
      const q0 = marks[o.seg]!.q
      const at: Mark = { q: projectToSsi(q0, reg.pts[o.vid]!, sa, sb), vid: o.vid }
      if (dist3(q0.p, at.q.p) <= tol * 10) marks[o.seg] = { q: at.q, vid: o.vid }
      else if (o.seg + 1 < marks.length && dist3(marks[o.seg + 1]!.q.p, at.q.p) <= tol * 10) marks[o.seg + 1] = { q: at.q, vid: o.vid }
      else marks.splice(o.seg + 1, 0, at)
    }
    // A closed curve with no vertex gets one.
    let ring = marks
    if (c.closed) {
      const k = ring.findIndex((m) => m.vid !== undefined)
      if (k < 0) {
        const vid = reg.add(ring[0]!.q.p)
        ring = [{ q: ring[0]!.q, vid }, ...ring.slice(1)]
      } else ring = [...ring.slice(k), ...ring.slice(0, k)]
      ring = [...ring, ring[0]!]
    }
    // Pieces between consecutive vertices.
    let start = 0
    for (let i = 1; i < ring.length; i++) {
      if (ring[i]!.vid === undefined) continue
      const raw = ring.slice(start, i + 1)
      // Samples crowded next to a neighbour (a refined point beside an inserted vertex) make an interpolating spline hook
      // back on itself; keep the ends and the samples at least a twentieth of a seed chord apart.
      const minGap = seedChord * 0.05
      const seg: Mark[] = [raw[0]!]
      for (let k = 1; k < raw.length - 1; k++) {
        const m = raw[k]!
        if (m.vid === undefined && (dist3(m.q.p, seg[seg.length - 1]!.q.p) < minGap || dist3(m.q.p, raw[raw.length - 1]!.q.p) < minGap)) continue
        seg.push(m)
      }
      if (raw.length > 1) seg.push(raw[raw.length - 1]!)
      // A refined sample that sits off the curve and makes it turn back on itself is dropped (a spur of the mesh seed); the
      // spline would otherwise loop there.
      // A spur of several samples (out along the curve and back) loses its tip point by point until nothing turns back.
      for (let pass = 0, changed = true; changed && pass < 200; pass++) {
        changed = false
        for (let k = seg.length - 2; k >= 1; k--) {
          if (seg[k]!.vid !== undefined) continue
          if (dot3(sub3(seg[k]!.q.p, seg[k - 1]!.q.p), sub3(seg[k + 1]!.q.p, seg[k]!.q.p)) < 0) { seg.splice(k, 1); changed = true }
        }
      }
      const v0 = seg[0]!.vid!, v1 = seg[seg.length - 1]!.vid!
      const pieceClosed = v0 === v1
      const ptsP = seg.map((m) => m.q)
      if (ptsP.length >= 2 && !(ptsP.length === 2 && v0 === v1)) {
        const fit = fitCurve(pieceClosed ? ptsP.slice(0, -1).map((q) => q.p) : ptsP.map((q) => q.p), pieceClosed, Math.max(tol * 10, fitTol / 10), conicOf(sa, sb))
        const params = pieceClosed ? [...fit.params, fit.t1] : [...fit.params]
        ssiPieces.push({
          key: `C${ci}.${ssiPieces.length}`,
          ssi: ci,
          curve: fit.curve,
          t0: fit.t0,
          t1: fit.t1,
          v0,
          v1,
          uvA: ptsP.map((q) => ({ x: q.ua, y: q.va })),
          uvB: ptsP.map((q) => ({ x: q.ub, y: q.vb })),
          params
        })
      }
      start = i
    }
  })

  options.debug?.("intersections", {
    ssis: ssis.map((c) => ({ fa: c.fa, fb: c.fb, closed: c.closed, n: c.pts.length, first: c.pts[0]?.p, last: c.pts[c.pts.length - 1]?.p })),
    ssiPieces: ssiPieces.map((p) => ({ key: p.key, v0: p.v0, v1: p.v1, kind: p.curve.kind })),
    vertices: reg.pts,
    splits: S.map((sd) => sd.splits.map((l) => l.map((x) => x.vid + "@" + x.t))),
    onFaces: S.map((sd) => sd.onFaces)
  })
  // ------------------------------------------------ 2a. split edges into pieces
  const edgePieces: Array<Array<Piece[]>> = [[], []]
  for (const s of [0, 1] as const) {
    const sd = S[s]
    sd.brep.edges.forEach((e, ei) => {
      const ends = [{ t: e.t0, vid: sd.vid[e.v0]! }, { t: e.t1, vid: sd.vid[e.v1]! }]
      const span = e.t1 - e.t0
      const inner = sd.splits[ei]!
        .filter((x) => x.t > e.t0 + 1e-9 * span && x.t < e.t1 - 1e-9 * span && x.vid !== ends[0]!.vid && x.vid !== ends[1]!.vid)
        .sort((a, b) => a.t - b.t)
        .filter((x, i, arr) => i === 0 || (x.vid !== arr[i - 1]!.vid && x.t - arr[i - 1]!.t > 1e-9 * span))
      // A closed edge split by vertices keeps its seam vertex as an end.
      const marks = [ends[0]!, ...inner, ends[1]!]
      const pieces: Piece[] = []
      for (let k = 0; k + 1 < marks.length; k++) {
        pieces.push({ key: `E${s}.${ei}.${k}`, curve: e.curve, t0: marks[k]!.t, t1: marks[k + 1]!.t, v0: marks[k]!.vid, v1: marks[k + 1]!.vid })
      }
      edgePieces[s]![ei] = pieces
    })
  }

  // ------------------------------------------------ 2b. identity of coincident pieces
  const uf = new UnionFind()
  const pieceByKey = new Map<string, Piece>()
  const allPieces: Piece[] = [...edgePieces[0]!.flat(), ...edgePieces[1]!.flat(), ...ssiPieces]
  for (const p of allPieces) pieceByKey.set(p.key, p)
  const midOf = (p: Piece): Vec3 => curvePoint(p.curve, (p.t0 + p.t1) / 2)
  const byEnds = new Map<string, Piece[]>()
  for (const p of allPieces) {
    const k = p.v0 < p.v1 ? `${p.v0}_${p.v1}` : `${p.v1}_${p.v0}`
    const l = byEnds.get(k) ?? []
    l.push(p)
    byEnds.set(k, l)
  }
  for (const group of byEnds.values()) {
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i]!, b = group[j]!
      if (dist3(midOf(a), midOf(b)) > tol * 100) continue
      // Closed pieces must also agree at a second point.
      if (a.v0 === a.v1 && dist3(curvePoint(a.curve, a.t0 + (a.t1 - a.t0) * 0.25), curvePoint(b.curve, b.t0 + (b.t1 - b.t0) * 0.25)) > tol * 100 && dist3(curvePoint(a.curve, a.t0 + (a.t1 - a.t0) * 0.25), curvePoint(b.curve, b.t0 + (b.t1 - b.t0) * 0.75)) > tol * 100) continue
      // Prefer original edges as representatives.
      if (a.key.startsWith("C") && !b.key.startsWith("C")) uf.union(b.key, a.key)
      else uf.union(a.key, b.key)
    }
  }
  /** +1 when piece p runs the same way as its representative. */
  const senseToRep = (p: Piece): number => {
    const r = pieceByKey.get(uf.find(p.key))!
    if (r === p) return 1
    if (r.v0 !== r.v1) return r.v0 === p.v0 ? 1 : -1
    const tp = curveTangentAt(p.curve, (p.t0 + p.t1) / 2)
    const m = midOf(p)
    const tr = curveTangentAt(r.curve, curveProject(r.curve, m, r.t0, r.t1))
    return dot3(tp, tr) >= 0 ? 1 : -1
  }

  // ------------------------------------------------ 3. arrangements and fragments
  interface HalfEdge {
    readonly from: number // node
    readonly to: number
    readonly uv: Vec2[] // scaled-free raw (u, v)
    readonly piece: string | undefined // undefined: pole line
    /** +1 when travelling along the piece's parameter direction. */
    readonly dir: number
    twin: number
  }
  interface Fragment {
    readonly solid: 0 | 1
    readonly face: number
    readonly loops: Array<Array<{ readonly piece: string; readonly dir: number }>>
    readonly sample: Vec3
    readonly normal: Vec3
  }
  const fragments: Fragment[] = []

  for (const s of [0, 1] as const) {
    const sd = S[s], other = S[1 - s]!
    sd.brep.faces.forEach((face, fi) => {
      checkBudget()
      if (sd.fb.synthetic[fi]) throw new BooleanError(`face ${fi} of operand ${s === 0 ? "A" : "B"} has a loop wrapping a period without a seam edge (not supported)`, [], { stage: "prepare", operand: s === 0 ? "A" : "B", face: fi, hint: "split the face with a seam edge (re-create the body from its feature history) before the Boolean", attempts: [] })
      const surf = face.surface
      const per = surfacePeriods(surf)
      const rings = sd.fb.rings[fi] ?? []
      // Metric scale for angles.
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
      for (const r of rings) for (const p of r) { u0 = Math.min(u0, p.u); u1 = Math.max(u1, p.u); v0 = Math.min(v0, p.v); v1 = Math.max(v1, p.v) }
      const dc = surfaceDerivs(surf, (u0 + u1) / 2, (v0 + v1) / 2)
      const su = Math.max(length3(dc.su), 1e-9), sv = Math.max(length3(dc.sv), 1e-9)
      const eps = 1e-7 * Math.max(1, (u1 - u0) * su, (v1 - v0) * sv)
      // Nodes: (registry vertex, uv position).
      const nodes: Array<{ readonly vid: number; readonly u: number; readonly v: number }> = []
      const node = (vid: number, u: number, v: number): number => {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]!
          if (n.vid === vid && Math.hypot((n.u - u) * su, (n.v - v) * sv) <= Math.max(eps, 1e-6 * Math.max(su, sv))) return i
        }
        nodes.push({ vid, u, v })
        return nodes.length - 1
      }
      const hes: HalfEdge[] = []
      const addHe = (from: number, to: number, uv: Vec2[], piece: string | undefined, dir: number): number => {
        hes.push({ from, to, uv, piece, dir, twin: -1 })
        return hes.length - 1
      }
      // --- boundary: rings with split vertices inserted, cut into pieces at vertices.
      for (const ring of rings) {
        // Expand: each step i → i+1 runs along `out` of sample i (undefined: a pole line). Split vertices of that edge
        // are inserted between the two samples.
        type RS = { u: number; v: number; vid?: number; out?: number; tOut?: number; tIn?: number; inserted?: true }
        const ex: RS[] = []
        const n = ring.length
        for (let i = 0; i < n; i++) {
          const a = ring[i]!, b = ring[(i + 1) % n]!
          const isVertex = a.g < sd.brep.vertices.length && (a.edge !== undefined || a.inEdge !== undefined)
          // A split vertex that falls exactly on a boundary sample (an equator crossing a sphere's seam at a sampled latitude)
          // is that sample; the strict "between two samples" test below would never see it.
          const sampleEdge = a.edge ?? a.inEdge
          const sampleT = a.edge !== undefined ? a.t : a.inT
          let sampleVid: number | undefined
          if (!isVertex && sampleEdge !== undefined && sampleT !== undefined) {
            const span = sd.brep.edges[sampleEdge]!.t1 - sd.brep.edges[sampleEdge]!.t0
            sampleVid = edgePieces[s]![sampleEdge]!.slice(0, -1).find((p) => Math.abs(p.t1 - sampleT) <= 1e-9 * span)?.v1
          }
          ex.push({ u: a.u, v: a.v, vid: isVertex ? sd.vid[a.g]! : sampleVid, out: a.edge, tOut: a.t, tIn: a.inT })
          if (a.edge !== undefined && b.inEdge === a.edge && a.t !== undefined && b.inT !== undefined) {
            const ta = a.t, tb = b.inT
            const lo = Math.min(ta, tb), hi = Math.max(ta, tb)
            // The split vertices are the inner ends of the edge's pieces (deduplicated there).
            const inner = edgePieces[s]![a.edge]!
              .slice(0, -1)
              .map((p) => ({ t: p.t1, vid: p.v1 }))
              .filter((x) => x.t > lo && x.t < hi)
              .sort((x, y) => (tb > ta ? x.t - y.t : y.t - x.t))
            for (const x of inner) {
              const P = reg.pts[x.vid]!
              const q = surfaceProject(surf, P, { u: a.u, v: a.v })
              const uu = per.u !== undefined ? unwrapNear(q.u, a.u, per.u) : q.u
              const vv = per.v !== undefined ? unwrapNear(q.v, a.v, per.v) : q.v
              ex.push({ u: uu, v: vv, vid: x.vid, out: a.edge, tOut: x.t, tIn: x.t, inserted: true })
            }
          }
        }
        // A contact point on a boundary sample (a tangent sphere touching a seam at the equator) is found twice: as the sample and as
        // the inserted split vertex a few ulps from it. One node, or the ring gets a zero-length piece that no cycle closes.
        for (let i = 0; i < ex.length && ex.length > 2; i++) {
          const a = ex[i]!, j = (i + 1) % ex.length, b = ex[j]!
          if (a.vid === undefined || a.vid !== b.vid || Math.hypot((a.u - b.u) * su, (a.v - b.v) * sv) > 1e-6) continue
          ex.splice(a.inserted === true || b.inserted !== true ? i : j, 1)
          i--
        }
        const cutIdx = ex.map((p, i) => (p.vid !== undefined ? i : -1)).filter((i) => i >= 0)
        if (cutIdx.length === 0) throw new BooleanError(`face ${fi}: boundary ring without vertices`, [], { stage: "arrange", operand: s === 0 ? "A" : "B", face: fi, hint: DEGENERATE_HINT, attempts: [] })
        for (let k = 0; k < cutIdx.length; k++) {
          const i0 = cutIdx[k]!, i1 = cutIdx[(k + 1) % cutIdx.length]!
          const seg: RS[] = []
          for (let i = i0; ; i = (i + 1) % ex.length) { seg.push(ex[i]!); if (i === i1 && seg.length > 1) break }
          const a = seg[0]!, b = seg[seg.length - 1]!
          const from = node(a.vid!, a.u, a.v), to = node(b.vid!, b.u, b.v)
          const uv = seg.map((p) => ({ x: p.u, y: p.v }))
          // Between two vertices every step runs along one edge, or all along a pole line.
          const ed = a.out
          if (ed === undefined || seg.slice(0, -1).some((p) => p.out !== ed)) {
            if (seg.slice(0, -1).some((p) => p.out !== undefined)) throw new BooleanError(`face ${fi}: boundary piece mixes edges`, [], { stage: "arrange", operand: s === 0 ? "A" : "B", face: fi, hint: DEGENERATE_HINT, attempts: [] })
            addHe(from, to, uv, undefined, 1)
            continue
          }
          const tA = a.tOut!, tB = b.tIn!
          const mid = (tA + tB) / 2
          const pc = edgePieces[s]![ed]!.find((p) => p.t0 <= mid && mid <= p.t1)
          if (pc === undefined) throw new BooleanError(`face ${fi}: no piece of edge ${ed} at t=${mid}`, [], { stage: "arrange", operand: s === 0 ? "A" : "B", face: fi, hint: DEGENERATE_HINT, attempts: [] })
          addHe(from, to, uv, pc.key, tB > tA ? 1 : -1)
        }
      }
      // --- cut curves: SSI pieces on this face, and the other solid's edge pieces lying on it.
      const cutsUv: Array<{ readonly uv: Vec2[]; readonly piece: Piece; readonly v0: number; readonly v1: number }> = []
      // A cut that is the same edge as a piece of this face's boundary adds nothing.
      const ownReps = new Set(hes.filter((h) => h.piece !== undefined).map((h) => uf.find(h.piece!)))
      for (const p of ssiPieces) {
        const c = ssis[p.ssi]!
        if ((s === 0 && c.fa !== fi) || (s === 1 && c.fb !== fi)) continue
        if (ownReps.has(uf.find(p.key))) continue
        cutsUv.push({ uv: s === 0 ? p.uvA : p.uvB, piece: p, v0: p.v0, v1: p.v1 })
      }
      other.brep.edges.forEach((e2, ei2) => {
        if (!other.onFaces[ei2]!.includes(fi)) return
        for (const p of edgePieces[1 - s]![ei2]!) {
          if (ownReps.has(uf.find(p.key))) continue
          const K = 16
          const uv: Vec2[] = []
          let hint: { u: number; v: number } | undefined
          for (let k = 0; k <= K; k++) {
            const P = k === 0 ? reg.pts[p.v0]! : k === K ? reg.pts[p.v1]! : curvePoint(e2.curve, p.t0 + ((p.t1 - p.t0) * k) / K)
            const q = surfaceProject(surf, P, hint)
            hint = q
            uv.push({ x: q.u, y: q.v })
          }
          cutsUv.push({ uv, piece: p, v0: p.v0, v1: p.v1 })
        }
      })
      for (const c of cutsUv) {
        // Unwrap continuously, then shift by whole periods so the middle lies inside the face.
        const uv = c.uv.map((q) => ({ ...q }))
        for (let i = 1; i < uv.length; i++) {
          if (per.u !== undefined) uv[i]!.x = unwrapNear(uv[i]!.x, uv[i - 1]!.x, per.u)
          if (per.v !== undefined) uv[i]!.y = unwrapNear(uv[i]!.y, uv[i - 1]!.y, per.v)
        }
        // Middle of the central segment (never an end point, which lies on the boundary).
        const km = Math.max(1, Math.floor(uv.length / 2))
        const m = { x: (uv[km - 1]!.x + uv[km]!.x) / 2, y: (uv[km - 1]!.y + uv[km]!.y) / 2 }
        const shifts: Array<readonly [number, number]> = []
        for (const ku of per.u !== undefined ? [0, -1, 1, -2, 2] : [0]) for (const kv of per.v !== undefined ? [0, -1, 1] : [0]) shifts.push([ku * (per.u ?? 0), kv * (per.v ?? 0)])
        const inside = shifts.find(([du, dv]) => windingUv(rings, m.x + du, m.y + dv) !== 0)
        if (inside === undefined) continue
        for (const q of uv) { q.x += inside[0]; q.y += inside[1] }
        const a = uv[0]!, b = uv[uv.length - 1]!
        const from = node(c.v0, a.x, a.y), to = node(c.v1, b.x, b.y)
        const h1 = addHe(from, to, uv, c.piece.key, 1)
        const h2 = addHe(to, from, [...uv].reverse(), c.piece.key, -1)
        hes[h1]!.twin = h2
        hes[h2]!.twin = h1
      }
      options.debug?.("arrangement", { solid: s, face: fi, nodes, hes: hes.map((h) => ({ from: h.from, to: h.to, piece: h.piece, dir: h.dir, n: h.uv.length, a: h.uv[0], b: h.uv[h.uv.length - 1], uv: h.uv })) })
      // --- traverse: left faces.
      const out = new Map<number, number[]>()
      hes.forEach((h, i) => { const l = out.get(h.from) ?? []; l.push(i); out.set(h.from, l) })
      // Direction a half-edge leaves its node: towards the first sample a real distance away. Samples within a few ulps of the
      // node (a snapped end next to its neighbour) have a direction that is rounding noise.
      const dirAngle = (pts: ReadonlyArray<Vec2>): number => {
        const a = pts[0]!
        let far = 0
        for (let k = 1; k < pts.length; k++) far = Math.max(far, Math.hypot((pts[k]!.x - a.x) * su, (pts[k]!.y - a.y) * sv))
        const min = Math.max(1e-12 * Math.max(1, Math.abs(a.x * su), Math.abs(a.y * sv)), far * 1e-3)
        for (let k = 1; k < pts.length; k++) {
          const b = pts[k]!
          const dx = (b.x - a.x) * su, dy = (b.y - a.y) * sv
          if (Math.hypot(dx, dy) > min) return Math.atan2(dy, dx)
        }
        return 0
      }
      const outAngle = hes.map((h) => dirAngle(h.uv))
      const inAngle = hes.map((h) => dirAngle([...h.uv].reverse()))
      const next = (hi: number): number => {
        const h = hes[hi]!
        const cands = out.get(h.to) ?? []
        let best = -1, bestD = Infinity
        for (const c of cands) {
          let d = inAngle[hi]! - outAngle[c]!
          while (d <= 1e-12) d += TAU
          while (d > TAU + 1e-12) d -= TAU
          if (c === h.twin) d = TAU + 1 // dead end only
          if (d < bestD) { bestD = d; best = c }
        }
        return best
      }
      const used = new Array<boolean>(hes.length).fill(false)
      const cycles: Array<{ readonly hes: number[]; readonly area: number }> = []
      for (let i = 0; i < hes.length; i++) {
        if (used[i]) continue
        const cyc: number[] = []
        let h = i
        let guard = 0
        while (h >= 0 && !used[h] && guard++ < 100000) {
          used[h] = true
          cyc.push(h)
          h = next(h)
        }
        if (h !== i) { warnings.push(`face ${fi}: open cycle in the arrangement`); continue }
        let area = 0
        for (const k of cyc) {
          const pts = hes[k]!.uv
          for (let j = 0; j + 1 < pts.length; j++) area += (pts[j]!.x * su) * (pts[j + 1]!.y * sv) - (pts[j + 1]!.x * su) * (pts[j]!.y * sv)
        }
        cycles.push({ hes: cyc, area: area / 2 })
      }
      const polyOf = (c: { hes: number[] }): Vec2[] => c.hes.flatMap((k) => hes[k]!.uv.slice(0, -1))
      const outers = cycles.filter((c) => c.area > eps * eps)
      const holes = cycles.filter((c) => c.area < -eps * eps)
      const groups = outers.map((o) => ({ outer: o, holes: [] as typeof holes }))
      for (const h of holes) {
        // Test point just to the left of the hole's boundary (the material side), never on another cycle's boundary.
        const hp = polyOf(h)
        let k0 = 0, bestLen = -1
        for (let k = 0; k < hp.length; k++) {
          const a = hp[k]!, b = hp[(k + 1) % hp.length]!
          const len = Math.hypot((b.x - a.x) * su, (b.y - a.y) * sv)
          if (len > bestLen) { bestLen = len; k0 = k }
        }
        const a0 = hp[k0]!, b0 = hp[(k0 + 1) % hp.length]!
        const off = Math.min(bestLen * 1e-3, eps * 100)
        const tx = ((b0.x - a0.x) * su) / bestLen, ty = ((b0.y - a0.y) * sv) / bestLen
        const p = { x: (a0.x + b0.x) / 2 + (-ty * off) / su, y: (a0.y + b0.y) / 2 + (tx * off) / sv }
        let best: (typeof groups)[number] | undefined
        for (const g of groups) if (windingPoly(polyOf(g.outer), p.x, p.y) !== 0 && (best === undefined || g.outer.area < best.outer.area)) best = g
        if (best === undefined) { warnings.push(`face ${fi}: hole cycle outside every outer cycle`); continue }
        best.holes.push(h)
      }
      options.debug?.("cycles", { solid: s, face: fi, cycles: cycles.map((c) => ({ area: c.area, hes: c.hes })) })
      for (const g of groups) {
        // Interior sample: the centroid of the largest triangle of the fragment's triangulation.
        const polys = [polyOf(g.outer), ...g.holes.map(polyOf)]
        const sample = interiorSample(polys, su, sv)
        const P = surfacePoint(surf, sample.x, sample.y)
        const n0 = surfaceNormal(surf, sample.x, sample.y)
        const toLoop = (c: { hes: number[] }) =>
          c.hes.filter((k) => hes[k]!.piece !== undefined).map((k) => ({ piece: hes[k]!.piece!, dir: hes[k]!.dir }))
        fragments.push({
          solid: s,
          face: fi,
          loops: [toLoop(g.outer), ...g.holes.map(toLoop)].filter((l) => l.length > 0),
          sample: P,
          normal: face.reversed ? scale3(n0, -1) : n0
        })
      }
    })
  }

  // ------------------------------------------------ 4. classify and select
  type Cls = "in" | "out" | "onSame" | "onOpposite"
  const keep = (s: 0 | 1, c: Cls): { readonly keep: boolean; readonly flip: boolean } => {
    if (op === "union") return { keep: s === 0 ? c === "out" || c === "onSame" : c === "out", flip: false }
    if (op === "intersect") return { keep: s === 0 ? c === "in" || c === "onSame" : c === "in", flip: false }
    return s === 0 ? { keep: c === "out" || c === "onOpposite", flip: false } : { keep: c === "in", flip: true }
  }
  const kept: Array<{ readonly fr: Fragment; readonly flip: boolean }> = []
  for (const fr of fragments) {
    const other = S[1 - fr.solid]!
    const cp = other.loc.closest(fr.sample)
    let cls: Cls
    if (cp.distance <= Math.max(tol * 100, fitTol)) cls = dot3(cp.normal, fr.normal) > 0 ? "onSame" : "onOpposite"
    else cls = dot3(sub3(fr.sample, cp.point), cp.normal) < 0 ? "in" : "out"
    const k = keep(fr.solid, cls)
    options.debug?.("classify", { solid: fr.solid, face: fr.face, cls, keep: k.keep, sample: fr.sample, loops: fr.loops })
    if (k.keep) kept.push({ fr, flip: k.flip })
  }

  // ------------------------------------------------ 5. sew
  const edgeIndex = new Map<string, number>()
  const vertices: Array<{ point: Vec3; tol: number }> = reg.pts.map((p) => ({ point: p, tol: reg.tol }))
  const edges: Edge[] = []
  const edgeOfPiece = (key: string): { readonly edge: number; readonly sense: number } => {
    const rep = uf.find(key)
    let ei = edgeIndex.get(rep)
    if (ei === undefined) {
      const p = pieceByKey.get(rep)!
      edges.push({ curve: p.curve, t0: p.t0, t1: p.t1, v0: p.v0, v1: p.v1, tol: Math.max(reg.tol, fitTol) })
      ei = edges.length - 1
      edgeIndex.set(rep, ei)
    }
    return { edge: ei, sense: senseToRep(pieceByKey.get(key)!) }
  }
  const faces: Face[] = kept.map(({ fr, flip }) => {
    const orig = S[fr.solid].brep.faces[fr.face]!
    let loops: Loop[] = fr.loops.map((l) => ({
      coedges: l.map((h): Coedge => {
        const { edge, sense } = edgeOfPiece(h.piece)
        return { edge, reversed: h.dir * sense < 0 }
      })
    }))
    const reversed = flip ? !orig.reversed : orig.reversed
    // Arrangements use the surface's natural orientation, including for reversed input faces. Restore the
    // outward loop orientation when sewing; a subtraction's flip is already included in `reversed`.
    if (reversed) loops = loops.map((l) => ({ coedges: [...l.coedges].reverse().map((c) => ({ edge: c.edge, reversed: !c.reversed })) }))
    return orig.name === undefined ? { surface: orig.surface, reversed, loops } : { surface: orig.surface, reversed, loops, name: orig.name }
  })
  const stats = { intersectionCurves: ssis.length, splitPoints: reg.pts.length, fragments: fragments.length, keptFaces: faces.length }
  // Nothing kept: the intersection of solids that are apart or only touch, or a subtraction that removes everything.
  if (faces.length === 0) return { brep: EMPTY_BREP, warnings, stats }
  // A designed contact along a curve (a tangent cylinder, boxes sharing an edge) leaves an edge four fragments meet at: it is
  // kept in place as two coincident edges, one per wedge of material (contact.ts), and the answer is checked against the operands.
  let sewnFaces: Face[] = faces
  let contactNote: string | undefined
  const contact = separateContacts(vertices, edges, faces)
  if (contact !== undefined) {
    vertices.splice(0, vertices.length, ...contact.vertices)
    edges.splice(0, edges.length, ...contact.edges)
    sewnFaces = contact.faces
    contactNote = `tangent or edge contact kept in place: ${contact.separatedEdges} coincident edge(s) separate the wedges of material`
  }
  let result: Brep = shellsByConnectivity({ vertices, edges, faces: sewnFaces, shells: [] })
  // Provenance (spec 41 N1): each kept fragment is a piece of one operand face. `split` and `merged` are decided when the table is read (`provenanceOf`).
  const wholeFace = (fr: Fragment): boolean => {
    if (fr.loops.length !== S[fr.solid].brep.faces[fr.face]!.loops.length) return false
    const original = S[fr.solid].brep.faces[fr.face]!.loops.reduce((n, l) => n + l.coedges.length, 0)
    if (fr.loops.reduce((n, l) => n + l.length, 0) !== original) return false
    return fr.loops.every((l) => l.every((h) => {
      const m = /^E(\d+)\.(\d+)\.\d+$/.exec(h.piece)
      return m !== null && Number(m[1]) === fr.solid && edgePieces[fr.solid]![Number(m[2])]?.length === 1
    }))
  }
  // The lineage is advisory: a defect in it must never turn a valid Boolean into a failure (provenance.test.ts guards the table).
  const origins: FaceOrigin[][] = kept.map(({ fr, flip }) => [{
    operand: fr.solid,
    face: fr.face,
    relation: wholeFace(fr) ? "same" : "trimmed",
    ...(flip ? { flipped: true as const } : {})
  }])
  const merged = mergeCoplanarFaces(result)
  result = merged.brep
  const compacted = compactBrepMapped(result)
  result = compacted.brep
  try { recordDerivation(result, `boolean ${op}`, [A, B], compacted.order.map((m) => merged.from[m]!.flatMap((k) => origins[k]!))) } catch { /* advisory */ }
  options.debug?.("result", result)
  let report = validateBrep(result, { coarseVolume: true })
  // A lens thinner than the coarse chord (seed 114: a 0.07 mm torus/sphere overlap) tessellates with the wrong sign, so a
  // coarse non-positive volume alone is not proof the faces point inwards: the exact volume decides. Only that one issue is
  // rechecked exactly; a face that gave no triangle or a broken topology stays a failure on the coarse evidence.
  if (!report.valid && report.issues.length > 0 && report.issues.every((i) => i.kind === "orientation")) {
    const exact = validateBrep(result)
    if (exact.valid) report = exact
  }
  // Shells that meet in a point (a cavity tangent to the outer wall, spheres tangent outside) share one vertex, which Euler-Poincare
  // cannot count: one vertex per shell makes the topology honest, and the point contact stays where it is.
  if (!report.valid && report.issues.length > 0 && report.issues.every((i) => i.kind === "euler")) {
    const touching = separateTouchingVertices(result.vertices, result.edges, result.faces)
    if (touching !== undefined) {
      const split = shellsByConnectivity({ vertices: touching.vertices, edges: touching.edges, faces: touching.faces, shells: [] })
      const again = validateBrep(split, { coarseVolume: true })
      if (again.valid) { result = split; report = again; contactNote = `point contact kept in place: ${touching.splitVertices} vertex(es) split between shells` }
    }
  }
  if (!report.valid) throw new BooleanError(`Boolean ${op} produced an invalid solid: ${report.issues.slice(0, 3).map((i) => i.message).join("; ")}`, report.issues, { stage: "validate", hint: DEGENERATE_HINT, attempts: [] })
  if (contactNote !== undefined) {
    // The separated contact must still be the operands' answer: a sampled volume check against exact point location.
    if (!agreesWithOperands(A, B, op, result)) throw new BooleanError(`Boolean ${op}: the separated contact disagrees with the operands`, [], { stage: "validate", hint: DEGENERATE_HINT, attempts: [] })
    warnings.push(contactNote)
  }
  return {
    brep: result,
    warnings,
    stats
  }
}

// ================================================================ helpers

const curveTangentAt = (c: Curve3, t: number): Vec3 => {
  const h = 1e-6
  return normalize3(sub3(curvePoint(c, t + h), curvePoint(c, t - h)))
}

/** Parameter of an edge end matching a registry vertex (for pieces whose end sample carries a different edge). */
const edgeEndParam = (e: Edge, vid: ReadonlyArray<number>, a: number, b: number, first: boolean): number => {
  const target = first ? a : b
  if (vid[e.v0] === target && vid[e.v1] !== target) return e.t0
  if (vid[e.v1] === target && vid[e.v0] !== target) return e.t1
  return first ? e.t0 : e.t1
}

const windingPoly = (poly: ReadonlyArray<Vec2>, u: number, v: number): number => {
  let w = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!
    if (a.y <= v) {
      if (b.y > v && orient2d(a.x, a.y, b.x, b.y, u, v) > 0) w++
    } else if (b.y <= v && orient2d(a.x, a.y, b.x, b.y, u, v) < 0) w--
  }
  return w
}

const windingUv = (rings: ReadonlyArray<ReadonlyArray<UvSample>>, u: number, v: number): number => {
  let w = 0
  for (const r of rings) w += windingPoly(r.map((p) => ({ x: p.u, y: p.v })), u, v)
  return w
}

/** A point well inside a polygon with holes: the centroid of the largest triangle of its constrained triangulation. */
const interiorSample = (polys: ReadonlyArray<ReadonlyArray<Vec2>>, su: number, sv: number): Vec2 => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of polys) for (const q of p) { minX = Math.min(minX, q.x * su); minY = Math.min(minY, q.y * sv); maxX = Math.max(maxX, q.x * su); maxY = Math.max(maxY, q.y * sv) }
  const cdt = new Cdt({ minX, minY, maxX, maxY })
  try {
    for (const p of polys) {
      const ids = p.map((q) => cdt.addPoint(q.x * su, q.y * sv))
      for (let i = 0; i < ids.length; i++) cdt.addConstraint(ids[i]!, ids[(i + 1) % ids.length]!)
    }
    cdt.markRegions()
    const r = cdt.result()
    let best: Vec2 | undefined, bestA = -1
    for (const [a, b, c] of r.triangles) {
      const A = Math.abs((r.xs[b]! - r.xs[a]!) * (r.ys[c]! - r.ys[a]!) - (r.ys[b]! - r.ys[a]!) * (r.xs[c]! - r.xs[a]!))
      if (A > bestA) { bestA = A; best = { x: (r.xs[a]! + r.xs[b]! + r.xs[c]!) / 3 / su, y: (r.ys[a]! + r.ys[b]! + r.ys[c]!) / 3 / sv } }
    }
    if (best !== undefined && insidePolys(polys, best.x, best.y)) return best
  } catch {
    // Degenerate fragment (duplicate or touching points): the scanline below always finds an inside point.
  }
  return scanlineSample(polys, su, sv)
}

/** Even-odd inside test of a point against a polygon with holes. */
const insidePolys = (polys: ReadonlyArray<ReadonlyArray<Vec2>>, x: number, y: number): boolean => {
  let crossings = 0
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!
    if ((a.y > y) !== (b.y > y)) {
      // The point is left of an upward edge (right of a downward one) exactly when the crossing is east of it.
      const o = orient2d(a.x, a.y, b.x, b.y, x, y)
      if (b.y > a.y ? o > 0 : o < 0) crossings++
    }
  }
  return crossings % 2 === 1
}

/**
 * A point inside a polygon with holes, by scanlines: on lines across its height (between vertex heights), the middle of the
 * widest inside run (even-odd). Unlike a vertex average it cannot fall outside a fragment bounded by a densely sampled arc.
 */
const scanlineSample = (polys: ReadonlyArray<ReadonlyArray<Vec2>>, su: number, sv: number): Vec2 => {
  let minY = Infinity, maxY = -Infinity
  for (const p of polys) for (const q of p) { minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y) }
  let best: Vec2 | undefined, bestW = -1
  const lines = 37
  for (let k = 1; k < lines; k++) {
    // Off the regular grid so a line does not run through vertices on round coordinates.
    const y = minY + ((maxY - minY) * (k + 0.123456)) / (lines + 0.25)
    const xs: number[] = []
    for (const p of polys) for (let i = 0; i < p.length; i++) {
      const a = p[i]!, b = p[(i + 1) % p.length]!
      if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y))
    }
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = (xs[i + 1]! - xs[i]!) * su
      if (w > bestW) { bestW = w; best = { x: (xs[i]! + xs[i + 1]!) / 2, y } }
    }
  }
  if (best !== undefined) return best
  const all = polys[0]!
  void sv
  return { x: all.reduce((s, q) => s + q.x, 0) / all.length, y: all.reduce((s, q) => s + q.y, 0) / all.length }
}

/** Shells = connected components of faces through shared edges; all closed. */
const shellsByConnectivity = (b: Brep): Brep => {
  const uses = edgeUses({ ...b, shells: [{ faces: b.faces.map((_, i) => i), closed: true }] })
  const comp = new Array<number>(b.faces.length).fill(-1)
  let nc = 0
  for (let f0 = 0; f0 < b.faces.length; f0++) {
    if (comp[f0]! >= 0) continue
    const stack = [f0]
    comp[f0] = nc
    while (stack.length > 0) {
      const f = stack.pop()!
      for (const l of b.faces[f]!.loops) for (const c of l.coedges) for (const u of uses[c.edge]!) if (comp[u.face]! < 0) { comp[u.face] = nc; stack.push(u.face) }
    }
    nc++
  }
  const shells = Array.from({ length: nc }, (_, k) => ({ faces: b.faces.map((_, i) => i).filter((i) => comp[i] === k), closed: true }))
  return { ...b, shells }
}

const samePlane = (a: Face, b: Face): boolean => {
  if (a.surface.kind !== "plane" || b.surface.kind !== "plane") return false
  const na = cross3(a.surface.frame.x, a.surface.frame.y), nb = cross3(b.surface.frame.x, b.surface.frame.y)
  const sa = a.reversed ? -1 : 1, sb = b.reversed ? -1 : 1
  if (dot3(na, nb) * sa * sb < 1 - 1e-12) return false
  return Math.abs(dot3(sub3(b.surface.frame.origin, a.surface.frame.origin), na)) < 1e-9 * (1 + length3(a.surface.frame.origin))
}

/**
 * Whether two faces lie on the same cylinder or cone with the same parametrisation (same axis direction and reference
 * direction, same radius, same apex) and the same orientation: fragments of one analytic surface that the intersection split
 * (a stack of coaxial cylinders of one radius) are one face again. A different reference direction would put the seam
 * elsewhere, so such a pair is left alone.
 */
const sameCurvedDomain = (a: Face, b: Face): boolean => {
  if (a.reversed !== b.reversed) return false
  const sa = a.surface, sb = b.surface
  if (sa.kind === "cylinder" && sb.kind === "cylinder") {
    const t = 1e-9 * (1 + sa.radius)
    return Math.abs(sa.radius - sb.radius) <= t && dot3(sa.frame.z, sb.frame.z) > 1 - 1e-12 && dot3(sa.frame.x, sb.frame.x) > 1 - 1e-12 && length3(cross3(sub3(sb.frame.origin, sa.frame.origin), sa.frame.z)) <= t
  }
  if (sa.kind === "cone" && sb.kind === "cone") {
    const tan = Math.tan(sa.semiAngle)
    if (Math.abs(tan) < 1e-12) return false
    const apex = (s: typeof sa) => sub3(s.frame.origin, scale3(s.frame.z, s.radius / tan))
    const t = 1e-9 * (1 + sa.radius)
    return Math.abs(sa.semiAngle - sb.semiAngle) <= 1e-12 && dot3(sa.frame.z, sb.frame.z) > 1 - 1e-12 && dot3(sa.frame.x, sb.frame.x) > 1 - 1e-12 && dist3(apex(sa), apex(sb)) <= t
  }
  return false
}

/** A closed circle: the ring where stacked fragments of one cylinder or cone meet. Merging across any other edge (a helical groove) is not attempted. */
const isRing = (e: Edge): boolean => e.curve.kind === "circle" && e.v0 === e.v1

/**
 * Merges faces on the same plane, cylinder or cone (same orientation) that share edges: the shared edges disappear and the
 * remaining coedges are re-chained into loops (spec 42 R3, same-domain merge).
 */
const mergeCoplanarFaces = (b: Brep): { readonly brep: Brep; readonly from: ReadonlyArray<ReadonlyArray<number>> } => {
  const uses = edgeUses({ ...b, shells: [{ faces: b.faces.map((_, i) => i), closed: true }] })
  const parent = b.faces.map((_, i) => i)
  const find = (x: number): number => { while (parent[x] !== x) x = parent[x] = parent[parent[x]!]!; return x }
  b.edges.forEach((_, ei) => {
    const u = uses[ei]!
    if (u.length !== 2 || u[0]!.face === u[1]!.face) return
    const fa = b.faces[u[0]!.face]!, fb = b.faces[u[1]!.face]!
    if (samePlane(fa, fb) || (isRing(b.edges[ei]!) && sameCurvedDomain(fa, fb))) parent[find(u[1]!.face)] = find(u[0]!.face)
  })
  const groups = new Map<number, number[]>()
  b.faces.forEach((_, i) => { const r = find(i); const l = groups.get(r) ?? []; l.push(i); groups.set(r, l) })
  if ([...groups.values()].every((g) => g.length === 1)) return { brep: b, from: b.faces.map((_, i) => [i]) }
  const faces: Face[] = []
  const faceMap = new Map<number, number>()
  const from: number[][] = []
  for (const [root, g] of groups) {
    from.push(g)
    if (g.length === 1) { faceMap.set(root, faces.length); faces.push(b.faces[root]!); continue }
    const inGroup = new Set(g)
    const all: Coedge[] = g.flatMap((fi) => b.faces[fi]!.loops.flatMap((l) => l.coedges))
    // Internal edges: used by two faces of the group.
    const internal = new Set<number>()
    // A seam (an edge both uses of which belong to one face) stays: it is the boundary of the merged face's parametrisation.
    for (const c of all) { const u = uses[c.edge]!; if (u.length === 2 && u[0]!.face !== u[1]!.face && inGroup.has(u[0]!.face) && inGroup.has(u[1]!.face)) internal.add(c.edge) }
    const rest = all.filter((c) => !internal.has(c.edge))
    const startOf = (c: Coedge) => (c.reversed ? b.edges[c.edge]!.v1 : b.edges[c.edge]!.v0)
    const endOf = (c: Coedge) => (c.reversed ? b.edges[c.edge]!.v0 : b.edges[c.edge]!.v1)
    const usedC = new Array<boolean>(rest.length).fill(false)
    const loops: Loop[] = []
    for (let i = 0; i < rest.length; i++) {
      if (usedC[i]) continue
      const loop: Coedge[] = []
      let k = i
      while (k >= 0 && !usedC[k]) {
        usedC[k] = true
        loop.push(rest[k]!)
        const e = endOf(rest[k]!), here = rest[k]!.edge
        // At a vertex where a seam is split, the way back along the edge just used is not the way on: take another edge first.
        k = rest.findIndex((c, j) => !usedC[j] && startOf(c) === e && c.edge !== here)
        if (k < 0) k = rest.findIndex((c, j) => !usedC[j] && startOf(c) === e)
      }
      loops.push({ coedges: loop })
    }
    // Outer loop first: the one of largest extent.
    const ext = (l: Loop) => {
      let lo = Infinity, hi = -Infinity
      for (const c of l.coedges) { const p = b.vertices[startOf(c)]!.point; lo = Math.min(lo, p.x + p.y + p.z); hi = Math.max(hi, p.x + p.y + p.z) }
      return hi - lo
    }
    loops.sort((x, y) => ext(y) - ext(x))
    const base = b.faces[root]!
    for (const fi of g) faceMap.set(fi, faces.length)
    faces.push({ ...base, loops })
  }
  const shells = b.shells.map((s) => ({ closed: s.closed, faces: [...new Set(s.faces.map((f) => faceMap.get(f)!))] }))
  return { brep: { ...b, faces, shells }, from }
}

void refineSurfaceSurface

// ================================================================ degenerate alignments

/**
 * Boolean for aligned, tangent and coincident operands. Designed contacts are solved in place by the plain pipeline: coincident
 * faces, tangent or edge contacts kept as coincident edges (contact.ts), poles on planes and on equal spheres. Only if the plain
 * pipeline does not give a valid solid that agrees with the operands (or a pole sits on a curved face it cannot yet handle
 * exactly), the second operand is nudged by a few parts per million of the model size, which breaks the contact; that last
 * resort is reported in `warnings` and counted in `recoveredByDisplacement`.
 */
export const booleanBrep = (A: Brep, B: Brep, op: BooleanOp, options: BooleanOptions = {}): BooleanResult => {
  // A pole of a sphere or the apex of a cone on a curved surface of the other solid is a degenerate contact the pipeline can get
  // wrong without noticing (a sphere's south pole on a torus left the union 0.1 % too big and still valid): go straight to the
  // recovery. On a plane or on a coincident sphere the contact is designed and the plain pipeline is exact; its answer is still
  // checked against the operands by a sampled volume.
  const kindAB = poleContactKind(A, B), kindBA = poleContactKind(B, A)
  const poleKind = kindAB === "hard" || kindBA === "hard" ? "hard" : kindAB === "designed" || kindBA === "designed" ? "designed" : "none"
  const poleContact = poleKind === "hard"
  COUNTERS.calls++
  try {
    if (poleContact) { COUNTERS.poleContact++; throw new BooleanError("a pole or apex of one operand lies on the surface of the other", [], { stage: "prepare", hint: DEGENERATE_HINT, attempts: [] }) }
    const done = booleanStrict(A, B, op, options)
    if (poleKind === "designed" && done.brep.faces.length > 0 && !agreesWithOperands(A, B, op, done.brep)) {
      throw new BooleanError("the exact result of a pole contact disagrees with the operands", [], { stage: "validate", hint: DEGENERATE_HINT, attempts: [] })
    }
    COUNTERS.exact++
    if (done.warnings.some((w) => w.includes("kept in place"))) COUNTERS.inPlaceContact++
    if (done.brep.faces.length === 0) COUNTERS.emptyResult++
    return done
  } catch (e) {
    if (!(e instanceof BooleanError)) throw e
    const first: BooleanError = e
    if (!poleContact) COUNTERS.strictFailure++
    // An exact way out before any displacement: a bare sphere or torus operand is re-parametrised (its poles and seams move; the
    // solid does not), which removes a pole or seam lying on the other operand's surface or on an intersection curve. The pair is
    // checked like a displaced one, against the volume identities, but to a much tighter bound because nothing moved.
    for (const cand of reframedPairs(A, B)) {
      try {
        const set = pairSet(A, B, cand.key, () => cand, options, 1e-7)
        const r = set.get(op)
        if (!agreesWithOperands(set.A, set.B, op, r)) continue
        if (!set.identitiesHold()) continue
        COUNTERS.reframed++
        if (r.faces.length === 0) COUNTERS.emptyResult++
        return { brep: r, warnings: [], stats: set.stats(op) }
      } catch (e2) {
        if (!(e2 instanceof BooleanError)) throw e2
      }
    }
    const box = boxOf([...A.vertices, ...B.vertices].map((v) => v.point))
    const extent = dist3(box.lo, box.hi)
    const dirs: Vec3[] = [{ x: 0.53, y: 0.31, z: 0.79 }, { x: -0.61, y: 0.43, z: -0.66 }]
    // Growing displacements: an exact tangency needs a few ppm, a near-tangency (two curves 1e-4 apart) needs more.
    for (const scale of [3e-6, 3e-5, 3e-4, 3e-3]) {
      const eps = Math.max(1e-6, extent * scale)
      for (const [di, d] of dirs.entries()) {
        try {
          const set = pairSet(A, B, `${scale}:${di}`, () => ({ A, B: transformBrep(B, translation(scale3(normalize3(d), eps))) }), options)
          const r = set.get(op)
          // A displaced operand can make the pipeline return a valid solid that is not the answer. Two checks: a sample of the
          // operands' box against the result's volume, and the identities that union, intersection and difference of the same
          // pair must satisfy (V(A u B) + V(A n B) = V(A) + V(B) and V(A - B) + V(A n B) = V(A)), which catch a small error the
          // sample cannot.
          if (!agreesWithOperands(A, set.B, op, r)) continue
          if (!set.identitiesHold()) continue
          COUNTERS.recoveredByDisplacement++
          if (r.faces.length === 0) COUNTERS.emptyResult++
          return { brep: r, warnings: [`degenerate alignment (${degenerateCase(A, B, first, poleContact)}): the second operand was displaced by ${eps.toExponential(1)} mm to break an exact tangency or coincidence; the result is exact only to that distance`], stats: set.stats(op) }
        } catch (e3) {
          if (!(e3 instanceof BooleanError)) throw e3
        }
      }
    }
    const tried = [3e-6, 3e-5, 3e-4, 3e-3].map((k) => Math.max(1e-6, extent * k))
    COUNTERS.failed++
    COUNTERS.byStage[first.diagnostic?.stage ?? "validate"]++
    throw new BooleanError(`${first.message} (also failed with the second operand displaced by up to ${tried[3]!.toExponential(1)} mm)`, first.issues, { ...(first.diagnostic ?? { stage: "validate" as const, hint: DEGENERATE_HINT }), attempts: tried })
  }
}

/**
 * Names the case a displacement was needed for: the curved surfaces of both operands and why the plain pipeline did not hold, so
 * a warning says "torus x cylinder: ..." instead of "something degenerate". Descriptive only; it decides nothing.
 */
const degenerateCase = (A: Brep, B: Brep, failure: BooleanError, poleContact: boolean): string => {
  const kinds = (b: Brep) => [...new Set(b.faces.map((f) => f.surface.kind).filter((k) => k !== "plane"))].sort().join("/") || "planar"
  const pair = `${kinds(A)} x ${kinds(B)}`
  if (poleContact) return `${pair}: a pole or apex lies on a curved face of the other solid and the operand cannot be re-parametrised`
  const reason = failure.message.replace(/^Boolean \w+ produced an invalid solid: /, "invalid result: ").slice(0, 100)
  return `${pair}: singular surface intersection the plain pipeline cannot arrange (${reason})`
}

/**
 * A solid that is one whole sphere or torus face (what `makeSphere` / `makeTorus` build), or undefined. Only these can be
 * re-parametrised safely: the seam edge belongs to the face, so rebuilding the primitive with another frame gives the same solid.
 */
const bareRound = (b: Brep): Face | undefined => {
  if (b.faces.length !== 1 || b.shells.length !== 1 || b.edges.length > 3) return undefined
  const f = b.faces[0]!
  if (f.reversed || (f.surface.kind !== "sphere" && f.surface.kind !== "torus")) return undefined
  const fr = f.surface.frame
  if (dot3(cross3(fr.x, fr.y), fr.z) <= 0) return undefined
  return f
}

const rotateAbout = (v: Vec3, k: Vec3, a: number): Vec3 =>
  add3(add3(scale3(v, Math.cos(a)), scale3(cross3(k, v), Math.sin(a))), scale3(k, dot3(k, v) * (1 - Math.cos(a))))

/** The same bare sphere or torus with another frame: a sphere's axis is turned (poles and seam move), a torus is turned about its axis (the seam moves). */
const reframeRound = (b: Brep, variant: number): Brep | undefined => {
  const face = bareRound(b)
  if (face === undefined) return undefined
  const s = face.surface
  if (s.kind !== "sphere" && s.kind !== "torus") return undefined
  // Irrational-looking angles: a designed (grid-aligned) model has no reason to put a pole or a seam on them.
  const tilts = [0.9273, 2.2143, 1.4427], turns = [0.6174, 1.8851, 2.9702]
  const f = s.frame
  let fr: Frame
  if (s.kind === "sphere") {
    const z = normalize3(rotateAbout(rotateAbout(f.z, f.x, tilts[variant]!), f.z, turns[variant]!))
    const x0 = rotateAbout(f.x, f.z, turns[variant]! * 1.7)
    const x = normalize3(sub3(x0, scale3(z, dot3(x0, z))))
    fr = { origin: f.origin, x, y: cross3(z, x), z }
  } else {
    const x = rotateAbout(f.x, f.z, turns[variant]!)
    fr = { origin: f.origin, x, y: cross3(f.z, x), z: f.z }
  }
  const out = s.kind === "sphere" ? makeSphere(s.radius, fr) : makeTorus(s.major, s.minor, fr)
  return face.name === undefined ? out : { ...out, faces: out.faces.map((x) => ({ ...x, name: face.name! })) }
}

/** Candidate pairs for the exact recovery: B re-parametrised, then A, three frames each (only bare spheres and tori qualify). */
function* reframedPairs(A: Brep, B: Brep): Generator<{ readonly key: string; readonly A: Brep; readonly B: Brep }> {
  for (let variant = 0; variant < 3; variant++) {
    const B2 = reframeRound(B, variant)
    if (B2 !== undefined && poleContactKind(A, B2) !== "hard" && poleContactKind(B2, A) !== "hard") yield { key: `reframeB:${variant}`, A, B: B2 }
  }
  for (let variant = 0; variant < 3; variant++) {
    const A2 = reframeRound(A, variant)
    if (A2 !== undefined && poleContactKind(A2, B) !== "hard" && poleContactKind(B, A2) !== "hard") yield { key: `reframeA:${variant}`, A: A2, B }
  }
}

/** Poles of spheres and apexes of cones of `a` (the points where a surface's parametrisation degenerates), with their surface. */
const poles = (a: Brep): Array<{ readonly p: Vec3; readonly surface: Surface }> => {
  const out: Array<{ readonly p: Vec3; readonly surface: Surface }> = []
  const seen = new Set<string>()
  for (const f of a.faces) {
    const sf = f.surface
    const add = (p: Vec3) => { const k = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`; if (!seen.has(k)) { seen.add(k); out.push({ p, surface: sf }) } }
    if (sf.kind === "sphere") { add(add3(sf.frame.origin, scale3(sf.frame.z, sf.radius))); add(add3(sf.frame.origin, scale3(sf.frame.z, -sf.radius))) }
    else if (sf.kind === "cone" && Math.abs(Math.tan(sf.semiAngle)) > 1e-12) {
      // The apex is a degenerate point of the body only when the cone reaches it: a truncated cone ends before it, and its apex is not on the solid.
      const apex = add3(sf.frame.origin, scale3(sf.frame.z, -sf.radius / Math.tan(sf.semiAngle)))
      if (a.vertices.some((v) => dist3(v.point, apex) <= 1e-7 * (1 + sf.radius))) add(apex)
    }
  }
  return out
}

/** Whether two analytic surfaces are the same surface (spheres of one centre and radius, cones of one axis, apex and angle). */
const sameAnalytic = (a: Surface, b: Surface): boolean => {
  if (a.kind === "sphere" && b.kind === "sphere") {
    const t = 1e-9 * (1 + a.radius)
    return Math.abs(a.radius - b.radius) <= t && dist3(a.frame.origin, b.frame.origin) <= t
  }
  if (a.kind === "cone" && b.kind === "cone") {
    const t = 1e-9 * (1 + a.radius)
    return Math.abs(a.semiAngle - b.semiAngle) <= 1e-12 && Math.abs(a.radius - b.radius) <= t && Math.abs(Math.abs(dot3(a.frame.z, b.frame.z)) - 1) <= 1e-12 && length3(cross3(sub3(b.frame.origin, a.frame.origin), a.frame.z)) <= t
  }
  return false
}

/**
 * How the poles of `a` meet the boundary of `b`: "hard" when one lies on (or within a margin of) a curved face of `b` that is
 * not the pole's own surface (the intersection curve passes through the pole's neighbourhood: strict results were seen 0.8 % off
 * for a pole 1e-5 mm from the surface of a 17 mm model, and sound from 1e-4 mm; the margin is 2e-4 of the model's size),
 * "designed" when every contact is with a plane or with the same sphere or cone, "none" when no pole is near.
 */
const poleContactKind = (a: Brep, b: Brep): "none" | "designed" | "hard" => {
  const ps = poles(a)
  if (ps.length === 0) return "none"
  const loc = brepLocator(b)
  const box = boxOf(ps.map((x) => x.p).concat(b.vertices.map((v) => v.point)))
  const near = 2e-4 * Math.max(1, dist3(box.lo, box.hi))
  let kind: "none" | "designed" | "hard" = "none"
  for (const { p, surface } of ps) {
    const c = loc.closest(p)
    if (c.distance >= near) continue
    // Faces of b at the closest point: the face itself, or those around an edge or vertex.
    const faces: number[] = []
    if (c.face !== undefined) faces.push(c.face)
    else b.faces.forEach((f, fi) => { if (f.loops.some((l) => l.coedges.some((ce) => (c.edge !== undefined ? ce.edge === c.edge : b.edges[ce.edge]!.v0 === c.vertex || b.edges[ce.edge]!.v1 === c.vertex)))) faces.push(fi) })
    const designed = faces.length > 0 && faces.every((fi) => b.faces[fi]!.surface.kind === "plane" || sameAnalytic(surface, b.faces[fi]!.surface))
    if (!designed) return "hard"
    kind = "designed"
  }
  return kind
}

/**
 * Whether a Boolean result has the volume the operands say: the fraction of a low-discrepancy sample of the operands' box that
 * lies in the result by the operation's rule (exact point location in each operand), against the result's exact volume. Used on
 * the recovery path only, where a valid-looking wrong solid has been seen.
 */
const agreesWithOperands = (A: Brep, B: Brep, op: BooleanOp, result: Brep): boolean => {
  const la = brepLocator(A), lb = brepLocator(B)
  const pts: Vec3[] = []
  for (const b of [A, B]) {
    const t = tessellateBrep(b, { angleTolDeg: 20 })
    for (let i = 0; i < t.positions.length; i += 3) pts.push({ x: t.positions[i]!, y: t.positions[i + 1]!, z: t.positions[i + 2]! })
  }
  const tight = boxOf(pts)
  const pad = 0.01 * dist3(tight.lo, tight.hi)
  const box = { lo: { x: tight.lo.x - pad, y: tight.lo.y - pad, z: tight.lo.z - pad }, hi: { x: tight.hi.x + pad, y: tight.hi.y + pad, z: tight.hi.z + pad } }
  const size = { x: box.hi.x - box.lo.x, y: box.hi.y - box.lo.y, z: box.hi.z - box.lo.z }
  const boxVolume = size.x * size.y * size.z
  const tol = Math.max(1e-7, Math.max(size.x, size.y, size.z) * 1e-8)
  const N = 3000
  const halton = (i: number, base: number): number => { let f = 1, r = 0; for (let k = i; k > 0; k = Math.floor(k / base)) { f /= base; r += f * (k % base) } return r }
  let hits = 0
  for (let i = 1; i <= N; i++) {
    const p = { x: box.lo.x + size.x * halton(i, 2), y: box.lo.y + size.y * halton(i, 3), z: box.lo.z + size.z * halton(i, 5) }
    const a = la.classify(p, tol) !== "out", b = lb.classify(p, tol) !== "out"
    if (op === "union" ? a || b : op === "intersect" ? a && b : a && !b) hits++
  }
  const f = hits / N
  const estimate = f * boxVolume
  const sigma = boxVolume * Math.sqrt(Math.max(f * (1 - f), 1 / N) / N)
  const actual = exactVolume(result)
  return Math.abs(actual - estimate) <= 6 * sigma + 1e-3 * boxVolume
}

/** Exact volume of a solid, kept per solid: the recovery asks for it several times. */
const VOLUMES = new WeakMap<Brep, number>()
const exactVolume = (b: Brep): number => {
  if (b.faces.length === 0) return 0
  let v = VOLUMES.get(b)
  if (v === undefined) { v = massProperties(b).volume; VOLUMES.set(b, v) }
  return v
}

const SETS = new WeakMap<Brep, WeakMap<Brep, Map<string, DisplacedSet>>>()

interface DisplacedSet {
  readonly A: Brep
  readonly B: Brep
  /** The operation's result on the displaced pair (computed once, whoever asks first); throws the pipeline's `BooleanError`. */
  get(op: BooleanOp): Brep
  stats(op: BooleanOp): BooleanStats
  /** The volume identities of union, intersection and difference (computes the three). */
  identitiesHold(): boolean
}

/**
 * The three operations on a modified copy of the pair (B displaced, or a sphere re-parametrised), kept for the next ask: a union,
 * an intersection and a difference of one pair share them. `idTol` is the relative bound of the volume identities.
 */
const pairSet = (A: Brep, B: Brep, key: string, make: () => { readonly A: Brep; readonly B: Brep }, options: BooleanOptions, idTol = 1e-5): DisplacedSet => {
  let byB = SETS.get(A)
  if (byB === undefined) { byB = new WeakMap(); SETS.set(A, byB) }
  let sets = byB.get(B)
  if (sets === undefined) { sets = new Map(); byB.set(B, sets) }
  const hit = sets.get(key)
  if (hit !== undefined) return hit
  const { A: A2, B: B2 } = make()
  const done = new Map<BooleanOp, BooleanResult | BooleanError>()
  const run = (op: BooleanOp): BooleanResult => {
    let r = done.get(op)
    if (r === undefined) {
      try { r = booleanStrict(A2, B2, op, options) } catch (err) { if (!(err instanceof BooleanError)) throw err; r = err }
      done.set(op, r)
    }
    if (r instanceof BooleanError) throw r
    return r
  }
  const vol = exactVolume
  let holds: boolean | undefined
  const set: DisplacedSet = {
    A: A2,
    B: B2,
    get: (op) => run(op).brep,
    stats: (op) => run(op).stats,
    identitiesHold: () => {
      if (holds === undefined) {
        try {
          const u = vol(run("union").brep), i = vol(run("intersect").brep), d = vol(run("subtract").brep)
          const va = vol(A2), vb = vol(B2)
          const tol = idTol * (va + vb)
          holds = Math.abs(u + i - va - vb) <= tol && Math.abs(d + i - va) <= tol
        } catch (err) {
          if (!(err instanceof BooleanError)) throw err
          holds = false
        }
      }
      return holds
    }
  }
  sets.set(key, set)
  return set
}
