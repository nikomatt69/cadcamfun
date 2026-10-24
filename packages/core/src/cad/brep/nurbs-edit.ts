/**
 * Push/pull of a free-form face on the exact model (spec 40 U2), done the one way a NURBS surface allows exactly: the face is **moved along a
 * declared direction** (by default its mean outward normal), not offset along its normals. The offset of a NURBS surface is not a NURBS
 * surface, and the kernel says so (`thickenSurfacePatch`: "an exact normal offset of a general NURBS surface is not supported"); the
 * translate of one is, control net and all. The edit is the exact Boolean of the slab between the face and its translate (the kernel's
 * translational thickening, with exact extruded side walls): united with the solid when the face moves out, subtracted when it moves in.
 * The slab reaches a little into the solid past the face (`SKIN`) so that no face of it is identical to the face being moved; the walls
 * stay where they were, so the neighbouring faces are extended or cut by them exactly as an extrusion would.
 *
 * Read from the faces: a NURBS face trimmed by four isoparametric curves (a patch: what the surface operations and their thickened
 * solids make). A face trimmed any other way, one that folds across the direction (some normal turning away from it), and an edit that
 * runs into a neighbouring feature are refused with the reason, the solid unchanged. The volume is checked against the volume of the
 * slab.
 */
import { add3, cross3, dot3, length3, normalize3, scale3 } from "../vec.ts"
import { surfaceDerivs, surfaceProject } from "./geom.ts"
import { booleanBrep } from "./boolean.ts"
import { curvePoint } from "./geom.ts"
import { tessellateBrep } from "./tessellate.ts"
import type { Vec3 } from "./math.ts"
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
}

export interface Patch {
  readonly data: NurbsSurfaceData
  readonly domain: PatchDomain
  /** Outward unit normals on a grid over the face. */
  readonly normals: ReadonlyArray<Vec3>
  /** Sign of the parametric normal against the outward one: +1 when they agree. */
  readonly sense: 1 | -1
  readonly mean: Vec3
}

export const readPatch = (b: Brep, face: number): Patch | string => {
  const f = b.faces[face]
  if (f === undefined || f.surface.kind !== "nurbs") return "not a NURBS face"
  const s = f.surface
  const uv: Array<{ u: number; v: number }> = []
  for (const loop of f.loops) for (const c of loop.coedges) {
    const e = b.edges[c.edge]!
    for (let k = 0; k <= 12; k++) {
      const p = surfaceProject(s, curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 12))
      uv.push({ u: p.u, v: p.v })
    }
  }
  if (uv.length === 0 || f.loops.length !== 1) return "the face has no single boundary"
  const [a0, a1, b0, b1] = surfaceDomain(s.data)
  const u0 = Math.min(...uv.map((p) => p.u)), u1 = Math.max(...uv.map((p) => p.u))
  const v0 = Math.min(...uv.map((p) => p.v)), v1 = Math.max(...uv.map((p) => p.v))
  const tol = 1e-6 * Math.max(1, a1 - a0, b1 - b0)
  if (!(u1 - u0 > tol && v1 - v0 > tol)) return "the face has no area in its parameters"
  for (const p of uv) if (Math.abs(p.u - u0) > tol && Math.abs(p.u - u1) > tol && Math.abs(p.v - v0) > tol && Math.abs(p.v - v1) > tol) return "the face is not a patch: its boundary is not four isoparametric curves (a trimmed free-form face has no exact move here)"
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2
  const mid = surfaceDerivs(s, um, vm)
  const nMid = normalize3(cross3(mid.su, mid.sv))
  const sense: 1 | -1 = f.reversed ? -1 : 1
  const normals: Vec3[] = []
  let sum: Vec3 = { x: 0, y: 0, z: 0 }
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
    const d = surfaceDerivs(s, u0 + ((u1 - u0) * i) / GRID, v0 + ((v1 - v0) * j) / GRID)
    const c = cross3(d.su, d.sv)
    if (length3(c) < 1e-10) return "the face is singular"
    const n = scale3(normalize3(c), sense)
    normals.push(n); sum = add3(sum, n)
  }
  void nMid
  return { data: s.data, domain: { u0, u1, v0, v1 }, normals, sense, mean: normalize3(sum) }
}

/** The free-form patch faces of a solid that can be moved, with their mean outward normals. */
export const recognizeNurbsFaces = (b: Brep): ReadonlyArray<RecognizedNurbsFace> => {
  const out: RecognizedNurbsFace[] = []
  b.faces.forEach((f, face) => {
    if (f.surface.kind !== "nurbs") return
    const p = readPatch(b, face)
    if (typeof p === "string") return
    const spread = Math.max(...p.normals.map((n) => (Math.acos(Math.min(1, Math.max(-1, dot3(n, p.mean)))) * 180) / Math.PI))
    out.push({ face, normal: p.mean, spread })
  })
  return out
}

const shifted = (data: NurbsSurfaceData, by: Vec3): NurbsSurfaceData => ({ ...data, points: data.points.map((row) => row.map((p) => [p[0]! + by.x, p[1]! + by.y, p[2]! + by.z])) })

/**
 * The solid with the free-form face `face` moved by `distance` along `direction` (the face's mean outward normal when absent): out of the
 * solid when positive, into it when negative. The move is along the direction, so a face that is not flat moves as a rigid piece.
 */
export const pushPullNurbsFace = (b: Brep, face: number, distance: number, direction?: Vec3): Brep | string => {
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
  // The slab between the surface moved by `a` and by `c` along the direction (a < c), built from the lower surface when the parametric
  // normal points along it and from the upper one, thickened back, when it points against it.
  const slab = (a: number, c: number): Brep => {
    const base = patch.sense === 1 ? scale3(w, a) : scale3(w, c)
    const body = surfacePatch(shifted(patch.data, base), patch.domain)
    return thickenSurfacePatch(body, c - a, patch.sense === 1 ? w : scale3(w, -1))
  }
  try {
    const pure = slab(out ? 0 : -t, out ? t : 0)
    const tool = out ? slab(-SKIN, t) : slab(-t, SKIN)
    const before = tessellatedVolume(b)
    const solid = booleanBrep(b, tool, out ? "union" : "subtract").brep
    const report = validateBrep(solid)
    if (!report.valid) return `the edited solid is not valid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    const expected = (out ? 1 : -1) * tessellatedVolume(pure)
    const after = tessellatedVolume(solid)
    if (Math.abs(after - before - expected) > 1e-4 * Math.max(before, 1) + 1e-4 * Math.abs(expected)) {
      return `the edit changed the volume by ${(after - before).toFixed(6)} mm³ where the slab accounts for ${expected.toFixed(6)} mm³: the move runs into a neighbouring feature or the solid is thinner than the slab`
    }
    return solid
  } catch (cause) {
    return `the move failed (${cause instanceof Error ? cause.message : String(cause)})`
  }
}
