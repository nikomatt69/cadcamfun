/**
 * Push/pull of a free-form face on the exact model (spec 40 U2), done the one way a NURBS surface allows exactly: the face is **moved along a
 * declared direction** (by default its mean outward normal), not offset along its normals. The offset of a NURBS surface is not a NURBS
 * surface, and the kernel says so (`thickenSurfacePatch`: "an exact normal offset of a general NURBS surface is not supported"); the
 * translate of one is, control net and all. The edit is the exact Boolean of the slab between the face and its translate (the kernel's
 * translational thickening, with exact extruded side walls): united with the solid when the face moves out, subtracted when it moves in.
 * The slab reaches a little into the solid past the face (`SKIN`) so that no face of it is identical to the face being moved; the walls
 * stay where they were, so the neighbouring faces are extended or cut by them exactly as an extrusion would.
 *
 * Read from the faces: a NURBS face. One trimmed by its four isoparametric boundary curves (a patch: what the surface operations and their
 * thickened solids make) moves exactly. Any other trim (a STEP face cut by arbitrary curves, with holes) is followed by its **footprint along the
 * direction**: the slab is built over the bounding rectangle of the trim in parameters and cut by the prism of the trim's polyline projected along
 * the direction (a chord within `FOOTPRINT_CHORD`, 0.002 mm), and the result says it is approximate by that deviation. A face that folds across the
 * direction (some normal turning away from it) and an edit that runs into a neighbouring feature are refused with the reason, the solid
 * unchanged. The volume is checked against the volume of the slab.
 */
import { add3, cross3, dot3, length3, normalize3, scale3, sub3 } from "../vec.ts"
import { surfaceDerivs, surfacePoint, surfaceProject } from "./geom.ts"
import { booleanBrep } from "./boolean.ts"
import { curvePoint } from "./geom.ts"
import { tessellateBrep } from "./tessellate.ts"
import { frame, type Vec3 } from "./math.ts"
import { extrudeProfile, loopArea, offsetLoop, polygonProfileLoop } from "./sweep.ts"
import type { NurbsSurfaceData } from "./nurbs.ts"
import { surfaceDomain } from "./nurbs.ts"
import { surfacePatch, thickenSurfacePatch, type PatchDomain } from "./surface-patch.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

/**
 * Volume of the tessellation of a solid at a chord of 0.005 mm (divergence theorem on its triangles). The exact integral of a NURBS solid
 * (`massProperties`) costs seconds a face; the checks of the free-form edits only need the volume to a few parts in 10^5, and the vertices of the
 * tessellation lie on the exact surfaces.
 */
export const tessellatedVolume = (b: Brep): number => {
  const m = tessellateBrep(b, { chordTol: 0.005 })
  const P = m.positions
  let v = 0
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i]! * 3, q = m.indices[i + 1]! * 3, c = m.indices[i + 2]! * 3
    v += (P[a]! * (P[q + 1]! * P[c + 2]! - P[q + 2]! * P[c + 1]!) - P[a + 1]! * (P[q]! * P[c + 2]! - P[q + 2]! * P[c]!) + P[a + 2]! * (P[q]! * P[c + 1]! - P[q + 1]! * P[c]!)) / 6
  }
  return v
}

/** How far the slab reaches into the solid past the face it moves, mm. */
const SKIN = 0.5
const GRID = 12

export interface RecognizedNurbsFace {
  readonly face: number
  /** Mean outward unit normal: the default direction of the move. */
  readonly normal: Vec3
  /** Largest angle between a normal of the face and the mean one, degrees. */
  readonly spread: number
  /** True when the face is trimmed by anything but its four isoparametric boundary curves: an edit then follows a polyline footprint of the trim and says so. */
  readonly trimmed: boolean
}

export interface Patch {
  readonly data: NurbsSurfaceData
  /** The rectangle of parameters the slabs are built over: the face itself for a patch, the bounding rectangle of its trim otherwise. */
  readonly domain: PatchDomain
  /** True when the face is trimmed by anything but its four boundary isoparametric curves: its slabs are cut to the footprint of the trim. */
  readonly trimmed: boolean
  /** The boundary loops as polylines in space (a chord within `FOOTPRINT_CHORD` of the edges). */
  readonly loops: ReadonlyArray<ReadonlyArray<Vec3>>
  /** Outward unit normals on a grid over the face (the grid points inside the trim). */
  readonly normals: ReadonlyArray<Vec3>
  /** Sign of the parametric normal against the outward one: +1 when they agree. */
  readonly sense: 1 | -1
  readonly mean: Vec3
}

/** How far the polyline of a trim may leave the edge it follows, mm: what a trimmed free-form edit declares as its deviation. */
export const FOOTPRINT_CHORD = 0.002

/** The points of an edge, dense enough that no chord leaves the curve by more than `FOOTPRINT_CHORD`. */
const sampleEdge = (e: Brep["edges"][number]): Vec3[] => {
  for (let n = 32; ; n *= 2) {
    const pts: Vec3[] = []
    for (let k = 0; k <= n; k++) pts.push(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / n))
    let worst = 0
    for (let k = 0; k < n; k++) {
      const m = curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * (k + 0.5)) / n)
      const a = pts[k]!, c = pts[k + 1]!
      const chord = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, z: (a.z + c.z) / 2 }
      worst = Math.max(worst, length3(sub3(m, chord)))
    }
    if (worst <= FOOTPRINT_CHORD || n >= 2048) return pts
  }
}

const insideUv = (loops: ReadonlyArray<ReadonlyArray<{ u: number; v: number }>>, u: number, v: number): boolean => {
  let inside = false
  for (const loop of loops) for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!, c = loop[(i + 1) % loop.length]!
    if ((a.v > v) !== (c.v > v) && u < a.u + ((v - a.v) / (c.v - a.v)) * (c.u - a.u)) inside = !inside
  }
  return inside
}

export const readPatch = (b: Brep, face: number): Patch | string => {
  const f = b.faces[face]
  if (f === undefined || f.surface.kind !== "nurbs") return "not a NURBS face"
  const s = f.surface
  const loops3: Vec3[][] = []
  const loopsUv: Array<Array<{ u: number; v: number }>> = []
  for (const loop of f.loops) {
    const pts: Vec3[] = []
    for (const c of loop.coedges) {
      const edgePts = sampleEdge(b.edges[c.edge]!)
      const run = c.reversed ? [...edgePts].reverse() : edgePts
      pts.push(...(pts.length === 0 ? run : run.slice(1)))
    }
    if (pts.length > 1 && length3(sub3(pts[0]!, pts[pts.length - 1]!)) < 1e-9) pts.pop()
    loops3.push(pts)
    loopsUv.push(pts.map((p) => { const q = surfaceProject(s, p); return { u: q.u, v: q.v } }))
  }
  const uv = loopsUv.flat()
  if (uv.length < 3) return "the face has no boundary"
  const [a0, a1, b0, b1] = surfaceDomain(s.data)
  const u0 = Math.max(a0, Math.min(...uv.map((p) => p.u))), u1 = Math.min(a1, Math.max(...uv.map((p) => p.u)))
  const v0 = Math.max(b0, Math.min(...uv.map((p) => p.v))), v1 = Math.min(b1, Math.max(...uv.map((p) => p.v)))
  const tol = 1e-6 * Math.max(1, a1 - a0, b1 - b0)
  if (!(u1 - u0 > tol && v1 - v0 > tol)) return "the face has no area in its parameters"
  const onBorder = uv.every((p) => Math.abs(p.u - u0) < tol || Math.abs(p.u - u1) < tol || Math.abs(p.v - v0) < tol || Math.abs(p.v - v1) < tol)
  const trimmed = !(onBorder && f.loops.length === 1)
  const sense: 1 | -1 = f.reversed ? -1 : 1
  const normals: Vec3[] = []
  let sum: Vec3 = { x: 0, y: 0, z: 0 }
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
    const u = u0 + ((u1 - u0) * i) / GRID, v = v0 + ((v1 - v0) * j) / GRID
    if (trimmed && !insideUv(loopsUv, u, v)) continue
    const d = surfaceDerivs(s, u, v)
    const c = cross3(d.su, d.sv)
    if (length3(c) < 1e-10) return "the face is singular"
    const n = scale3(normalize3(c), sense)
    normals.push(n); sum = add3(sum, n)
  }
  if (normals.length === 0) return "the trim encloses no point of the sampling grid: the face is too small or too thin"
  return { data: s.data, domain: { u0, u1, v0, v1 }, trimmed, loops: loops3, normals, sense, mean: normalize3(sum) }
}

/**
 * The prism over the footprint of a trimmed face along the unit `w`, from `lo` to `hi` along it: a slab built over the bounding rectangle of the
 * trim is cut to the face by intersecting it with this. The footprint is the polylines of the trim projected on the plane square to `w`.
 */
export const trimPrism = (patch: Patch, w: Vec3, lo: number, hi: number, grow = 0): Brep => {
  const origin = patch.loops[0]![0]!
  const f = frame(origin, w)
  const polygons = patch.loops.map((loop) => {
    const pts = loop.map((p) => { const q = sub3(p, origin); return { x: dot3(q, f.x), y: dot3(q, f.y) } })
    return polygonProfileLoop(pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) > 1e-9))
  })
  // `grow` widens the footprint (the outer loop out, the holes in), a negative one narrows it: a tool must not touch the trim's vertices, which
  // lie on the solid's own wall, because a Boolean cannot decide a plane that only grazes a cylinder along a line (the one that subtracts
  // is widened, the one that adds narrowed, so neither takes or gives material the trim does not bound).
  const outer = polygons.reduce((best, l, i) => (Math.abs(loopArea(l)) > Math.abs(loopArea(polygons[best]!)) ? i : best), 0)
  const loops = grow !== 0 ? polygons.map((l, i) => offsetLoop(l, i === outer ? -grow : grow)) : polygons
  return extrudeProfile({ loops }, hi - lo, { placement: frame(add3(origin, scale3(w, lo - dot3(origin, w))), w, f.x) })
}

/** The free-form patch faces of a solid that can be moved, with their mean outward normals. */
export const recognizeNurbsFaces = (b: Brep): ReadonlyArray<RecognizedNurbsFace> => {
  const out: RecognizedNurbsFace[] = []
  b.faces.forEach((f, face) => {
    if (f.surface.kind !== "nurbs") return
    const p = readPatch(b, face)
    if (typeof p === "string") return
    const spread = Math.max(...p.normals.map((n) => (Math.acos(Math.min(1, Math.max(-1, dot3(n, p.mean)))) * 180) / Math.PI))
    out.push({ face, normal: p.mean, spread, trimmed: p.trimmed })
  })
  return out
}

const shifted = (data: NurbsSurfaceData, by: Vec3): NurbsSurfaceData => ({ ...data, points: data.points.map((row) => row.map((p) => [p[0]! + by.x, p[1]! + by.y, p[2]! + by.z])) })

/** The range of the coordinate along the unit `w` the face spans over its parameter rectangle (a slab is built over that rectangle). */
export const extentAlong = (b: Brep, face: number, patch: Patch, w: Vec3): readonly [number, number] => {
  const surface = b.faces[face]!.surface
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
    const p = surfacePoint(surface, patch.domain.u0 + ((patch.domain.u1 - patch.domain.u0) * i) / GRID, patch.domain.v0 + ((patch.domain.v1 - patch.domain.v0) * j) / GRID)
    const c = dot3(p, w)
    lo = Math.min(lo, c); hi = Math.max(hi, c)
  }
  return [lo, hi]
}

export interface MovedFace {
  readonly brep: Brep
  /** Present when the face is trimmed: its footprint is a polyline within this many mm of the trim, so the edit is not exact to better than that. */
  readonly deviation?: number
}

/**
 * The solid with the free-form face `face` moved by `distance` along `direction` (the face's mean outward normal when absent): out of the
 * solid when positive, into it when negative. The move is along the direction, so a face that is not flat moves as a rigid piece. A face
 * trimmed by anything but its four boundary isoparametric curves moves with its footprint along the direction (the slab is cut to the polyline of
 * its trim), and the result then carries the deviation of that polyline.
 */
export const moveNurbsFace = (b: Brep, face: number, distance: number, direction?: Vec3): MovedFace | string => {
  if (!(Math.abs(distance) > 1e-9) || !Number.isFinite(distance)) return "the distance must be a non-zero number"
  const patch = readPatch(b, face)
  if (typeof patch === "string") return patch
  const w = direction === undefined ? patch.mean : normalize3(direction)
  if (!Number.isFinite(w.x + w.y + w.z) || length3(w) < 0.5) return "the direction must be a finite non-zero vector"
  // The move must not fold: every outward normal of the face keeps a positive part along the direction.
  const least = Math.min(...patch.normals.map((n) => dot3(n, w)))
  if (!(least > 0.05)) return "the face folds across the direction of the move (a normal of the face turns away from it): choose a direction every normal of the face has a part along"
  const out = distance > 0
  const t = Math.abs(distance)
  const [lo, hi] = extentAlong(b, face, patch, w)
  // A tool that subtracts has a footprint wider than the trim by twice the chord of its polyline, one that adds a narrower one (see `trimPrism`).
  const cut = (slab: Brep, grow = 0): Brep => (patch.trimmed ? booleanBrep(slab, trimPrism(patch, w, lo - t - SKIN - 1, hi + t + SKIN + 1, grow), "intersect").brep : slab)
  // The slab between the surface moved by `a` and by `c` along the direction (a < c), built from the lower surface when the parametric
  // normal points along it and from the upper one, thickened back, when it points against it.
  const slab = (a: number, c: number, grow = 0): Brep => {
    const base = patch.sense === 1 ? scale3(w, a) : scale3(w, c)
    const body = surfacePatch(shifted(patch.data, base), patch.domain)
    return cut(thickenSurfacePatch(body, c - a, patch.sense === 1 ? w : scale3(w, -1)), grow)
  }
  try {
    const pure = slab(out ? 0 : -t, out ? t : 0)
    const tool = out ? slab(-SKIN, t, -2 * FOOTPRINT_CHORD) : slab(-t, SKIN, 2 * FOOTPRINT_CHORD)
    const before = tessellatedVolume(b)
    const solid = booleanBrep(b, tool, out ? "union" : "subtract").brep
    const report = validateBrep(solid)
    if (!report.valid) return `the edited solid is not valid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    const expected = (out ? 1 : -1) * tessellatedVolume(pure)
    const after = tessellatedVolume(solid)
    // The volumes are those of tessellations; a trimmed face adds the polyline of its trim, whose chord error is of the same order.
    const slack = patch.trimmed ? 2e-3 : 1e-4
    if (Math.abs(after - before - expected) > slack * Math.max(before, 1) + slack * Math.abs(expected)) {
      return `the edit changed the volume by ${(after - before).toFixed(6)} mm³ where the slab accounts for ${expected.toFixed(6)} mm³: the move runs into a neighbouring feature or the solid is thinner than the slab`
    }
    return { brep: solid, ...(patch.trimmed ? { deviation: 3 * FOOTPRINT_CHORD } : {}) }
  } catch (cause) {
    return `the move failed (${cause instanceof Error ? cause.message : String(cause)})`
  }
}

/** `moveNurbsFace`, the solid only (see it for what a trimmed face means). */
export const pushPullNurbsFace = (b: Brep, face: number, distance: number, direction?: Vec3): Brep | string => {
  const r = moveNurbsFace(b, face, distance, direction)
  return typeof r === "string" ? r : r.brep
}
