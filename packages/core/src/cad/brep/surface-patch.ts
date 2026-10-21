/** Open tensor-product patches, exact isoparametric trimming, stitching and translational thickening. */
import { basisFuns, findSpan, surfaceDomain, type NurbsCurveData, type NurbsSurfaceData } from "./nurbs.ts"
import { surfaceDerivs, type Curve3, type Surface } from "./geom.ts"
import { BrepBuilder, edgeUses, mergeBreps, type Brep, type Coedge } from "./topology.ts"
import { healBrep } from "./heal.ts"
import { validateBrep } from "./validate.ts"
import { cross3, dot3, length3, normalize3, scale3, type Vec3 } from "./math.ts"

/** Open surfaces are a different body kind; a valid open patch is never labelled a closed solid. */
export interface SurfaceBody { readonly kind: "surface"; readonly brep: Brep }
export interface PatchDomain { readonly u0: number; readonly u1: number; readonly v0: number; readonly v1: number }

export const nurbsSurfaceProblem = (s: NurbsSurfaceData): string | undefined => {
  const n = s.points.length, m = s.points[0]?.length ?? 0
  if (n > 64 || m > 64 || s.points.some((r) => r.length !== m || r.some((p) => p.length !== 3 || !p.every(Number.isFinite)))) return "the control net must be rectangular, finite, three-dimensional and at most 64 by 64"
  const knotsOk = (knots: ReadonlyArray<number>, degree: number, count: number) => Number.isInteger(degree) && degree >= 1 && degree <= 8 && count > degree && knots.length === count + degree + 1 && knots.every((v, i) => Number.isFinite(v) && (i === 0 || v >= knots[i - 1]!)) && knots[degree]! < knots[count]!
  if (!knotsOk(s.knotsU, s.degreeU, n) || !knotsOk(s.knotsV, s.degreeV, m)) return "invalid NURBS degree, knot count, order or domain"
  if (s.weights !== undefined && (s.weights.length !== n || s.weights.some((r) => r.length !== m || r.some((w) => !Number.isFinite(w) || w <= 0)))) return "weights must be positive finite and match the control net"
  return undefined
}

/** Restricting a tensor product to a fixed u/v gives an exact rational curve, without fitting samples. */
const isoCurve = (s: NurbsSurfaceData, varyingU: boolean, value: number): Curve3 => {
  const fixedCount = varyingU ? s.points[0]!.length : s.points.length
  const fixedDegree = varyingU ? s.degreeV : s.degreeU
  const fixedKnots = varyingU ? s.knotsV : s.knotsU
  const span = findSpan(fixedCount - 1, fixedDegree, value, fixedKnots)
  const basis = basisFuns(span, value, fixedDegree, fixedKnots)
  const weights: number[] = []
  const points = Array.from({ length: varyingU ? s.points.length : s.points[0]!.length }, (_, i) => {
    const p = [0, 0, 0]
    let weight = 0
    for (let k = 0; k <= fixedDegree; k++) {
      const j = span - fixedDegree + k, u = varyingU ? i : j, v = varyingU ? j : i
      const w = basis[k]! * (s.weights?.[u]?.[v] ?? 1)
      weight += w
      for (let c = 0; c < 3; c++) p[c] = p[c]! + w * s.points[u]![v]![c]!
    }
    weights.push(weight)
    return p.map((v) => v / weight)
  })
  const data: NurbsCurveData = { degree: varyingU ? s.degreeU : s.degreeV, knots: varyingU ? s.knotsU : s.knotsV, points, weights }
  return { kind: "nurbs", data }
}

export const surfacePatch = (data: NurbsSurfaceData, domain?: PatchDomain): SurfaceBody => {
  const problem = nurbsSurfaceProblem(data)
  if (problem !== undefined) throw new RangeError(problem)
  const [a, b, c, d] = surfaceDomain(data)
  const { u0, u1, v0, v1 } = domain ?? { u0: a, u1: b, v0: c, v1: d }
  if (![u0, u1, v0, v1].every(Number.isFinite) || !(a <= u0 && u0 < u1 && u1 <= b && c <= v0 && v0 < v1 && v1 <= d)) throw new RangeError("trim rectangle must have positive area inside the surface domain")
  const surface: Surface = { kind: "nurbs", data }
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
    const e = surfaceDerivs(surface, u0 + (u1 - u0) * i / 8, v0 + (v1 - v0) * j / 8)
    if (length3(cross3(e.su, e.sv)) < 1e-10) throw new RangeError("the patch is singular in its trimmed domain")
  }
  const builder = new BrepBuilder()
  const bottom = builder.edge(isoCurve(data, true, v0), u0, u1)
  const right = builder.edge(isoCurve(data, false, u1), v0, v1)
  const top = builder.edge(isoCurve(data, true, v1), u0, u1)
  const left = builder.edge(isoCurve(data, false, u0), v0, v1)
  builder.face(surface, false, [[[bottom, false], [right, false], [top, true], [left, true]]], "patch")
  const brep = builder.build(false)
  const report = validateBrep(brep)
  if (!report.valid) throw new RangeError(`patch does not validate: ${report.issues[0]?.message}`)
  return { kind: "surface", brep }
}

/** An exact trim by four isoparametric curves. The rectangle must also stay inside the current trim. */
export const trimSurfacePatch = (body: SurfaceBody, domain: PatchDomain): SurfaceBody => {
  const face = body.brep.faces[0]
  if (body.brep.faces.length !== 1 || face?.surface.kind !== "nurbs") throw new RangeError("trim needs one tensor-product patch")
  const current = body.brep.edges
  const u0 = current[0]!.t0, u1 = current[0]!.t1, v0 = current[1]!.t0, v1 = current[1]!.t1
  if (domain.u0 < u0 || domain.u1 > u1 || domain.v0 < v0 || domain.v1 > v1) throw new RangeError("a trim cannot extend the existing patch")
  return surfacePatch(face.surface.data, domain)
}

/** Stitch matching full boundary curves; disconnected components stay separate shells and open components stay surfaces. */
export const stitchSurfacePatches = (bodies: ReadonlyArray<SurfaceBody>, tolerance = 1e-6): { readonly kind: "surface" | "solid"; readonly brep: Brep; readonly boundaryEdges: number } => {
  if (bodies.length === 0 || bodies.length > 64 || !(tolerance > 0) || !Number.isFinite(tolerance)) throw new RangeError("stitch needs 1..64 patches and a finite positive tolerance")
  const merged = mergeBreps(bodies.map((b) => b.brep))
  const healed = healBrep({ ...merged, shells: [{ faces: merged.faces.map((_, i) => i), closed: false }] }, { tol: tolerance }).brep
  const uses = edgeUses(healed)
  const seen = new Set<number>()
  const shells: Array<{ faces: number[]; closed: boolean }> = []
  for (let i = 0; i < healed.faces.length; i++) {
    if (seen.has(i)) continue
    const faces = [i]; seen.add(i)
    for (let k = 0; k < faces.length; k++) for (const l of healed.faces[faces[k]!]!.loops) for (const coedge of l.coedges) for (const u of uses[coedge.edge]!) if (!seen.has(u.face)) { seen.add(u.face); faces.push(u.face) }
    const edges = new Set(faces.flatMap((fi) => healed.faces[fi]!.loops.flatMap((l) => l.coedges.map((coedge) => coedge.edge))))
    shells.push({ faces, closed: [...edges].every((ei) => uses[ei]!.length === 2) })
  }
  const brep: Brep = { ...healed, shells }
  const report = validateBrep(brep)
  if (!report.valid) throw new RangeError(`stitch does not validate: ${report.issues[0]?.message}`)
  return { kind: report.manifoldSolid ? "solid" : "surface", brep, boundaryEdges: uses.filter((u) => u.length === 1).length }
}

/**
 * Exact translational thickening, with the direction declared. Curved faces keep their NURBS surfaces and side walls are
 * exact extrusions. This is an axial thickness, not an undocumented approximation to a normal offset of a freeform face.
 * A positive directional Jacobian is required across the patch so a folded net cannot silently become a solid.
 */
export const thickenSurfacePatch = (body: SurfaceBody, thickness: number, direction?: Vec3): Brep => {
  if (!(thickness > 0) || !Number.isFinite(thickness)) throw new RangeError("thickness must be finite and positive")
  const b = body.brep, f = b.faces[0]
  if (b.faces.length !== 1 || f?.surface.kind !== "nurbs") throw new RangeError("thickening needs one trimmed tensor-product patch")
  const middle = surfaceDerivs(f.surface, (b.edges[0]!.t0 + b.edges[0]!.t1) / 2, (b.edges[1]!.t0 + b.edges[1]!.t1) / 2)
  const normal = normalize3(cross3(middle.su, middle.sv))
  const axis = direction === undefined ? normal : normalize3(direction)
  if (![axis.x, axis.y, axis.z].every(Number.isFinite) || length3(axis) < 0.5) throw new RangeError("thickening direction must be finite and nonzero")
  for (let i = 0; i <= 16; i++) for (let j = 0; j <= 16; j++) {
    const e = surfaceDerivs(f.surface, b.edges[0]!.t0 + (b.edges[0]!.t1 - b.edges[0]!.t0) * i / 16, b.edges[1]!.t0 + (b.edges[1]!.t1 - b.edges[1]!.t0) * j / 16)
    const n = normalize3(cross3(e.su, e.sv))
    if (direction === undefined && dot3(n, normal) < 1 - 1e-10) throw new RangeError("a curved patch needs an explicit direction for axial thickening; an exact normal offset of a general NURBS surface is not supported")
    if (dot3(n, axis) <= 1e-6) throw new RangeError("the patch folds across the thickening direction")
  }
  const delta = scale3(axis, thickness), builder = new BrepBuilder()
  const lower = b.edges.map((e) => builder.edge(e.curve, e.t0, e.t1))
  const shifted = (curve: Curve3): Curve3 => {
    if (curve.kind !== "nurbs") throw new RangeError("expected a rational patch boundary")
    return { kind: "nurbs", data: { ...curve.data, points: curve.data.points.map((p) => [p[0]! + delta.x, p[1]! + delta.y, p[2]! + delta.z]) } }
  }
  const upper = b.edges.map((e) => builder.edge(shifted(e.curve), e.t0, e.t1))
  const vertical = new Map<number, number>()
  for (const e of b.edges) for (const vi of [e.v0, e.v1]) if (!vertical.has(vi)) vertical.set(vi, builder.edge({ kind: "line", origin: b.vertices[vi]!.point, dir: delta }, 0, 1))
  const coedges = f.loops[0]!.coedges
  builder.face(f.surface, true, [[...coedges].reverse().map((c) => [lower[c.edge]!, !c.reversed] as const)], "thicken.bottom")
  const data = f.surface.data
  builder.face({ kind: "nurbs", data: { ...data, points: data.points.map((row) => row.map((p) => [p[0]! + delta.x, p[1]! + delta.y, p[2]! + delta.z])) } }, false, [coedges.map((c) => [upper[c.edge]!, c.reversed] as const)], "thicken.top")
  for (const c of coedges) {
    const e = b.edges[c.edge]!, start = c.reversed ? e.v1 : e.v0, end = c.reversed ? e.v0 : e.v1
    const loop: Coedge[] = [{ edge: lower[c.edge]!, reversed: c.reversed }, { edge: vertical.get(end)!, reversed: false }, { edge: upper[c.edge]!, reversed: !c.reversed }, { edge: vertical.get(start)!, reversed: true }]
    builder.face({ kind: "extrusion", curve: e.curve, dir: delta }, c.reversed, [loop], "thicken.wall")
  }
  const out = builder.build()
  const report = validateBrep(out)
  if (!report.valid) throw new RangeError(`thickening does not validate: ${report.issues[0]?.message}`)
  return out
}

export interface SurfaceOperation {
  readonly operation: "patch" | "stitch" | "thicken"
  readonly patches: ReadonlyArray<{ readonly data: NurbsSurfaceData; readonly trim?: PatchDomain }>
  readonly thickness?: number
  readonly direction?: Vec3
  readonly tolerance?: number
}

/** Shared implementation for preview and write adapters; no editor or persistence dependency. */
export const buildSurfaceOperation = (input: SurfaceOperation): { readonly kind: "surface" | "solid"; readonly brep: Brep } => {
  if (input.patches.length < 1 || input.patches.length > 32) throw new RangeError("use 1..32 patches per operation")
  const patches = input.patches.map((p) => surfacePatch(p.data, p.trim))
  if (input.operation === "stitch") {
    if (input.thickness !== undefined || input.direction !== undefined) throw new RangeError("stitch does not take a thickness or direction")
    return stitchSurfacePatches(patches, input.tolerance)
  }
  if (patches.length !== 1) throw new RangeError(`${input.operation} needs exactly one patch`)
  if (input.operation === "patch") {
    if (input.thickness !== undefined || input.direction !== undefined) throw new RangeError("patch does not take a thickness or direction")
    return patches[0]!
  }
  if (input.thickness === undefined) throw new RangeError("thicken needs a thickness")
  return { kind: "solid", brep: thickenSurfacePatch(patches[0]!, input.thickness, input.direction) }
}
