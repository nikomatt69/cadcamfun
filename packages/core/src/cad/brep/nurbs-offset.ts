/**
 * The offset and the draft of a free-form face on the exact model (spec 40 U2) — **approximate, and said so**. The offset of a NURBS surface
 * along its normals is not a NURBS surface, and neither is a drafted one (each point moves by an amount that depends on where it is), so there is
 * no exact answer in the kernel's surfaces (`nurbs-edit.ts` moves the face rigidly, which is exact). Here the displaced surface is *fitted*: the
 * point at every Greville abscissa of a clamped cubic control net is displaced (`P + d N` for the offset, `P - (h - neutral) tan(a) n_h` for the
 * draft, `n_h` the unit horizontal part of the normal) and the net that passes through them is solved for; the net is refined (8, 12, 16, 24, 32,
 * 48 points a side) until the fitted surface is within `tolerance` of the displaced one at the midpoints of a 17 x 17 grid, or the edit is refused.
 * The deviation reached is returned with the solid, so a caller can say how approximate it is: the edit is never presented as exact.
 *
 * The new face replaces the old one: the layer between a surface a little inside the solid (0.5 mm) and one further out than both faces is cut away,
 * and the layer between a surface deeper inside (1 mm) and the new face is put back. Both tools are slabs bounded by two fitted surfaces and four
 * exact ruled walls (the boundary rows and columns of the two nets), so no face of a tool is identical to the face being replaced; the walls
 * meet the neighbouring faces where they meet them (a step, as the mesh rebuild leaves on a face offset along its normals).
 */
import { add3, cross3, dot3, length3, normalize3, scale3, sub3 } from "../vec.ts"
import { booleanBrep } from "./boolean.ts"
import { surfaceNormal, surfacePoint, surfaceProject } from "./geom.ts"
import type { Vec3 } from "./math.ts"
import { basisFuns, clampedUniformKnots, findSpan, nurbsSurfaceDerivs, type NurbsSurfaceData } from "./nurbs.ts"
import { readPatch, tessellatedVolume, type Patch } from "./nurbs-edit.ts"
import { BrepBuilder, type Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

const DEGREE = 3
const SIZES = [8, 12, 16, 24, 32, 48]
const CHECK = 17
const INSIDE_CUT = 0.5
const INSIDE_FILL = 1
const OUTSIDE = 0.5

type Displace = (point: Vec3, normal: Vec3) => Vec3

/** Greville abscissae of a clamped knot vector of `count` points of degree `p`. */
const greville = (knots: ReadonlyArray<number>, count: number, p: number): number[] => {
  const g: number[] = []
  for (let i = 0; i < count; i++) { let sum = 0; for (let k = 1; k <= p; k++) sum += knots[i + k]!; g.push(sum / p) }
  return g
}

/** Solves A X = B (A n x n, B n x c) by Gaussian elimination with partial pivoting. */
const solve = (A: number[][], B: number[][]): number[][] => {
  const n = A.length, c = B[0]!.length
  const M = A.map((row, i) => [...row, ...B[i]!])
  for (let col = 0; col < n; col++) {
    let best = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[best]![col]!)) best = r
    if (Math.abs(M[best]![col]!) < 1e-14) throw new RangeError("the fit is singular")
    ;[M[col], M[best]] = [M[best]!, M[col]!]
    for (let r = col + 1; r < n; r++) {
      const f = M[r]![col]! / M[col]![col]!
      if (f !== 0) for (let k = col; k < n + c; k++) M[r]![k] = M[r]![k]! - f * M[col]![k]!
    }
  }
  const X: number[][] = Array.from({ length: n }, () => new Array<number>(c).fill(0))
  for (let r = n - 1; r >= 0; r--) {
    for (let k = 0; k < c; k++) {
      let v = M[r]![n + k]!
      for (let j = r + 1; j < n; j++) v -= M[r]![j]! * X[j]![k]!
      X[r]![k] = v / M[r]![r]!
    }
  }
  return X
}

/** The collocation matrix of a clamped knot vector at the given parameters. */
const collocation = (knots: ReadonlyArray<number>, count: number, p: number, at: ReadonlyArray<number>): number[][] =>
  at.map((t) => {
    const row = new Array<number>(count).fill(0)
    const span = findSpan(count - 1, p, Math.min(t, 1 - 1e-12), knots)
    const N = basisFuns(span, Math.min(t, 1 - 1e-12), p, knots)
    for (let k = 0; k <= p; k++) row[span - p + k] = N[k]!
    return row
  })

interface Sampler {
  /** The point of the displaced surface for parameters in [0, 1]^2 of the patch. */
  readonly at: (t: number, s: number, d: Displace) => Vec3
}

export const sampler = (b: Brep, face: number, patch: Patch): Sampler => {
  const f = b.faces[face]!
  const surface = f.surface
  const { u0, u1, v0, v1 } = patch.domain
  return {
    at: (t, s, d) => {
      const u = u0 + t * (u1 - u0), v = v0 + s * (v1 - v0)
      const p = surfacePoint(surface, u, v)
      const n0 = surfaceNormal(surface, u, v)
      const n = patch.sense === 1 ? n0 : scale3(n0, -1)
      return add3(p, d(p, n))
    }
  }
}

/** A fitted non-rational clamped cubic net through the displaced surface, and how far it is from it at the midpoints of the check grid. */
export const fit = (smp: Sampler, d: Displace, count: number): { readonly data: NurbsSurfaceData; readonly deviation: number } => {
  const knots = clampedUniformKnots(count, DEGREE)
  const g = greville(knots, count, DEGREE)
  // The displaced points Q[i][j] at the abscissae, then the net X with N_u X N_v^T = Q: first along u (every column j and coordinate c is one
  // right-hand side), then along v.
  const Q: number[][] = Array.from({ length: count }, () => new Array<number>(count * 3).fill(0))
  for (let i = 0; i < count; i++) for (let j = 0; j < count; j++) { const p = smp.at(g[i]!, g[j]!, d); Q[i]![j * 3] = p.x; Q[i]![j * 3 + 1] = p.y; Q[i]![j * 3 + 2] = p.z }
  const A = collocation(knots, count, DEGREE, g)
  const X1 = solve(A, Q)
  const B2: number[][] = Array.from({ length: count }, (_, j) => Array.from({ length: count * 3 }, (_, k) => X1[Math.floor(k / 3)]![j * 3 + (k % 3)]!))
  const X2 = solve(A, B2)
  const out: number[][][] = Array.from({ length: count }, (_, i) => Array.from({ length: count }, (_, j) => [X2[j]![i * 3]!, X2[j]![i * 3 + 1]!, X2[j]![i * 3 + 2]!]))
  const data: NurbsSurfaceData = { degreeU: DEGREE, degreeV: DEGREE, knotsU: knots, knotsV: knots, points: out }
  let deviation = 0
  for (let i = 0; i < CHECK; i++) for (let j = 0; j < CHECK; j++) {
    const t = (i + 0.5) / CHECK, s = (j + 0.5) / CHECK
    const target = smp.at(t, s, d)
    const e = nurbsSurfaceDerivs(data, t, s, 0)[0]![0]!
    deviation = Math.max(deviation, Math.hypot(e[0]! - target.x, e[1]! - target.y, e[2]! - target.z))
  }
  return { data, deviation }
}

const net = (data: NurbsSurfaceData, i: number, j: number): Vec3 => ({ x: data.points[i]![j]![0]!, y: data.points[i]![j]![1]!, z: data.points[i]![j]![2]! })

/** The solid between two fitted surfaces of the same net (A towards B along the normal) with four exact ruled walls. */
export const slab = (a: NurbsSurfaceData, bData: NurbsSurfaceData): Brep => {
  const n = a.points.length, m = a.points[0]!.length
  const builder = new BrepBuilder()
  // Boundary curves of a clamped net: its first and last rows and columns.
  const edgePoints = (data: NurbsSurfaceData): ReadonlyArray<{ readonly pts: number[][]; readonly knots: ReadonlyArray<number> }> => [
    { pts: data.points.map((r) => [...r[0]!]), knots: data.knotsU },
    { pts: data.points[n - 1]!.map((p) => [...p]), knots: data.knotsV },
    { pts: data.points.map((r) => [...r[m - 1]!]), knots: data.knotsU },
    { pts: data.points[0]!.map((p) => [...p]), knots: data.knotsV }
  ]
  const ea = edgePoints(a), eb = edgePoints(bData)
  const curve = (e: { pts: number[][]; knots: ReadonlyArray<number> }) => ({ kind: "nurbs" as const, data: { degree: DEGREE, knots: e.knots, points: e.pts } })
  const A = ea.map((e) => builder.edge(curve(e), 0, 1))
  const B = eb.map((e) => builder.edge(curve(e), 0, 1))
  // Corners: c0 (0,0), c1 (1,0), c2 (1,1), c3 (0,1); verticals run from A to B.
  const corner = (data: NurbsSurfaceData, c: number): Vec3 => net(data, c === 1 || c === 2 ? n - 1 : 0, c >= 2 ? m - 1 : 0)
  const V = [0, 1, 2, 3].map((c) => { const p = corner(a, c), q = corner(bData, c), d = sub3(q, p), len = length3(d); return builder.edge({ kind: "line", origin: p, dir: scale3(d, 1 / len) }, 0, len) })
  // Which way is out: for the two big faces, away from the other one; for a wall, away from the middle of the slab (a wall is at the edge, so
  // this is horizontal, however much the faces bulge).
  const evalAt = (data: NurbsSurfaceData): Vec3 => { const e = nurbsSurfaceDerivs(data, 0.5, 0.5, 0)[0]![0]!; return { x: e[0]!, y: e[1]!, z: e[2]! } }
  const midA = evalAt(a), midB = evalAt(bData)
  const centre = scale3(add3(midA, midB), 0.5)
  const across = sub3(midB, midA)
  const face = (surface: { kind: "nurbs"; data: NurbsSurfaceData }, loop: ReadonlyArray<readonly [number, boolean]>, name: string, outwardOf: (n: Vec3, p: Vec3) => number): void => {
    const mid = nurbsSurfaceDerivs(surface.data, 0.5, 0.5, 1)
    const p = { x: mid[0]![0]![0]!, y: mid[0]![0]![1]!, z: mid[0]![0]![2]! }
    const su = { x: mid[1]![0]![0]!, y: mid[1]![0]![1]!, z: mid[1]![0]![2]! }, sv = { x: mid[0]![1]![0]!, y: mid[0]![1]![1]!, z: mid[0]![1]![2]! }
    const reversed = outwardOf(cross3(su, sv), p) < 0
    builder.face(surface, reversed, [reversed ? [...loop].reverse().map(([e, r]) => [e, !r] as const) : loop], name)
  }
  face({ kind: "nurbs", data: a }, [[A[0]!, false], [A[1]!, false], [A[2]!, true], [A[3]!, true]], "fit.bottom", (n) => -dot3(n, across))
  face({ kind: "nurbs", data: bData }, [[B[0]!, false], [B[1]!, false], [B[2]!, true], [B[3]!, true]], "fit.top", (n) => dot3(n, across))
  // Edge k of the net runs from corner s to corner t: e0 c0-c1, e1 c1-c2, e2 c3-c2, e3 c0-c3.
  const ends = [[0, 1], [1, 2], [3, 2], [0, 3]] as const
  for (let k = 0; k < 4; k++) {
    const [s, t] = ends[k]!
    const wall: NurbsSurfaceData = { degreeU: DEGREE, degreeV: 1, knotsU: ea[k]!.knots, knotsV: [0, 0, 1, 1], points: ea[k]!.pts.map((p, i) => [p, eb[k]!.pts[i]!]) }
    face({ kind: "nurbs", data: wall }, [[A[k]!, false], [V[t]!, false], [B[k]!, true], [V[s]!, true]], "fit.wall", (n, p) => dot3(n, sub3(p, centre)))
  }
  return builder.build()
}

const normalAt = (smp: Sampler): ((t: number, s: number) => Vec3) => (t, s) => {
  const p = smp.at(t, s, () => ({ x: 0, y: 0, z: 0 }))
  const q = smp.at(t, s, (_p, n) => n)
  return normalize3(sub3(q, p))
}

export interface ApproximateEdit { readonly brep: Brep; /** The largest distance, mm, between the fitted new face and the exact displaced surface at the check points. */ readonly deviation: number }

const replaceFace = (b: Brep, face: number, displace: Displace, tolerance: number): ApproximateEdit | string => {
  if (!(tolerance > 0)) return "the tolerance must be positive"
  const patch = readPatch(b, face)
  if (typeof patch === "string") return patch
  const smp = sampler(b, face, patch)
  // How far the new face lies out of the old one and into it on the grid: the cutting layer must reach beyond both ways, and the layer put back
  // must start deeper than the cut.
  let outReach = 0, inReach = 0
  for (let i = 0; i <= CHECK; i++) for (let j = 0; j <= CHECK; j++) {
    const t = i / CHECK, s = j / CHECK
    const p0 = smp.at(t, s, () => ({ x: 0, y: 0, z: 0 }))
    const n = normalAt(smp)(t, s)
    const along = dot3(sub3(smp.at(t, s, displace), p0), n)
    outReach = Math.max(outReach, along, 0); inReach = Math.max(inReach, -along, 0)
  }
  const cutDepth = inReach + INSIDE_CUT, fillDepth = inReach + INSIDE_FILL, cutHeight = outReach + OUTSIDE
  const inward = (depth: number): Displace => (_p, n) => scale3(n, -depth)
  const outward = (height: number): Displace => (_p, n) => scale3(n, height)
  try {
    let chosen: { readonly cutLow: NurbsSurfaceData; readonly cutHigh: NurbsSurfaceData; readonly fillLow: NurbsSurfaceData; readonly fillTop: NurbsSurfaceData; readonly plain: NurbsSurfaceData; readonly deviation: number } | undefined
    for (const count of SIZES) {
      const cutLow = fit(smp, inward(cutDepth), count), cutHigh = fit(smp, outward(cutHeight), count)
      const fillLow = fit(smp, inward(fillDepth), count), fillTop = fit(smp, displace, count), plain = fit(smp, () => ({ x: 0, y: 0, z: 0 }), count)
      const deviation = Math.max(fillTop.deviation, plain.deviation, cutLow.deviation, cutHigh.deviation, fillLow.deviation)
      chosen = { cutLow: cutLow.data, cutHigh: cutHigh.data, fillLow: fillLow.data, fillTop: fillTop.data, plain: plain.data, deviation }
      if (fillTop.deviation <= tolerance && plain.deviation <= tolerance) break
    }
    if (chosen === undefined) return "the fit failed"
    if (chosen.deviation > tolerance * 4) return `the displaced surface cannot be fitted to ${tolerance} mm with a 48 x 48 net (it reaches ${chosen.deviation.toFixed(4)} mm): the face is too strongly curved or too large for this edit`
    const before = tessellatedVolume(b)
    const cut = booleanBrep(b, slab(chosen.cutLow, chosen.cutHigh), "subtract").brep
    const solid = booleanBrep(cut, slab(chosen.fillLow, chosen.fillTop), "union").brep
    const report = validateBrep(solid)
    if (!report.valid) return `the edited solid is not valid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    const plainSlab = Math.abs(tessellatedVolume(slab(chosen.fillLow, chosen.plain)))
    const expected = Math.abs(tessellatedVolume(slab(chosen.fillLow, chosen.fillTop))) - plainSlab
    const after = tessellatedVolume(solid)
    // The volume must follow the slabs to within what the fit's deviation allows over the face's area.
    const area = plainSlab / fillDepth
    const allowed = 2 * chosen.deviation * area + 1e-4 * Math.max(before, 1)
    if (Math.abs(after - before - expected) > allowed) {
      return `the edit changed the volume by ${(after - before).toFixed(5)} mm³ where the fitted layers account for ${expected.toFixed(5)} mm³ (within ${allowed.toFixed(5)}): it ran into a neighbouring feature or the solid is thinner than the 1 mm the new layer sits in`
    }
    return { brep: solid, deviation: chosen.deviation }
  } catch (cause) {
    return `the fitted edit failed (${cause instanceof Error ? cause.message : String(cause)})`
  }
}

/** The free-form face offset along its normals by `distance` (out of the solid when positive), approximately: see the module comment. */
export const offsetNurbsFace = (b: Brep, face: number, distance: number, tolerance = 0.01): ApproximateEdit | string => {
  if (!(Math.abs(distance) > 1e-9) || !Number.isFinite(distance)) return "the distance must be a non-zero number"
  return replaceFace(b, face, (_p, n) => scale3(n, distance), tolerance)
}

/**
 * The free-form face drafted `angle` degrees about the plane at height `neutral` along the unit `pull`, approximately: every point moves along the
 * horizontal part of its normal by -(height - neutral) tan(angle), the law of the draft of a cylinder (positive narrows a boss in the pull direction).
 */
export const draftNurbsFace = (b: Brep, face: number, draft: { readonly pull: Vec3; readonly neutral: number; readonly angle: number }, tolerance = 0.01): ApproximateEdit | string => {
  const tan = Math.tan((draft.angle * Math.PI) / 180)
  if (!Number.isFinite(tan) || tan === 0) return "the draft angle must be a non-zero angle under 90 degrees"
  const pull = normalize3(draft.pull)
  return replaceFace(b, face, (p, n) => {
    const horizontal = sub3(n, scale3(pull, dot3(n, pull)))
    const l = length3(horizontal)
    return l < 1e-9 ? { x: 0, y: 0, z: 0 } : scale3(horizontal, (-(dot3(p, pull) - draft.neutral) * tan) / l)
  }, tolerance)
}
void surfaceProject
