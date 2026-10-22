/**
 * Face edits on the exact model, with the mesh rebuild's semantics. Press-pull: a planar face's own outline, pushed along its
 * normal, united with the body (out) or subtracted from it (in); when the pushed prism shares the face exactly it is sewn on
 * without a Boolean. Mate: the rigid motion that lays one planar face flush on another (normals opposed, centres of area
 * together, an offset apart, slid along the target's axes, spun about its normal). The centre of area is exact (Green's
 * theorem over the face's lines and arcs).
 */
import { add3, cross3, dot3, length3, normalize3, scale3, sub3 } from "../vec.ts"
import { booleanBrep } from "./boolean.ts"
import { brepLocator } from "./classify.ts"
import { faceProfile, pickPlanarFace, type PlanarFacePick } from "./draft.ts"
import { compose, frame, rotation, translation, type Transform, type Vec3 } from "./math.ts"
import { sewSolids } from "./sew.ts"
import { extrudeProfile, loopMoments } from "./sweep.ts"
import type { Brep } from "./topology.ts"

/** The cosine a face's normal must reach to the hint (60 degrees, as the mesh rebuild selects). */
const HINT_COS = 0.5

export interface FaceQuery {
  readonly near: Vec3
  readonly normal?: Vec3
}

/**
 * The face nearest the query, as the mesh rebuild finds it: a planar face (when the nearest is planar) or `curved` when a
 * curved face facing the hint's way is nearer than every planar one.
 */
export const nearestFace = (b: Brep, q: FaceQuery): { readonly pick: PlanarFacePick } | { readonly curved: true; readonly distance: number } | undefined => {
  const hint = q.normal === undefined ? undefined : normalize3(q.normal)
  const pick = pickPlanarFace(b, q.near, hint, HINT_COS)
  const closest = brepLocator(b).closest(q.near)
  const curved = closest.face !== undefined && b.faces[closest.face]!.surface.kind !== "plane" && (hint === undefined || dot3(closest.normal, hint) >= HINT_COS)
  if (curved && closest.distance < (pick?.distance ?? Infinity) - 1e-9) return { curved: true, distance: closest.distance }
  return pick === undefined ? undefined : { pick }
}

export interface FaceFrame {
  /** Outward unit normal. */
  readonly normal: Vec3
  /** Centre of area, on the face's plane. */
  readonly centroid: Vec3
  /** In-plane axes, the mesh face selection's convention (u from X, or from Y for a face square to X). */
  readonly u: Vec3
  readonly v: Vec3
  readonly area: number
}

/** The frame of a planar face: its exact centre of area and the in-plane axes a slide is measured along. */
export const planarFaceFrame = (b: Brep, pick: PlanarFacePick): FaceFrame | string => {
  const profile = faceProfile(b, pick)
  if (typeof profile === "string") return profile
  let area = 0, mx = 0, my = 0
  for (const l of profile) { const m = loopMoments(l); area += m.area; mx += m.mx; my += m.my }
  if (!(area > 0)) return "the face has no area"
  const n = pick.normal
  const centroid = add3(pick.origin, add3(scale3(pick.u, mx / area), scale3(pick.v, my / area)))
  const u0 = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  const u = normalize3(cross3(n, cross3(u0, n)))
  return { normal: n, centroid, u, v: cross3(n, u), area }
}

export interface PushPullOptions extends FaceQuery {
  /** Out of the body (positive) or into it (negative), along the face's normal. */
  readonly distance: number
  /**
   * The face to push or pull, when the caller already knows it (a named reference): the face is then the named one, never
   * the nearest one to `near`, whose point may be stale after an edit.
   */
  readonly face?: number
}

/** The pick of a face the caller knows: its plane, its outward normal and its in-plane axes. */
const pickOfFace = (b: Brep, fi: number): PlanarFacePick | undefined => {
  const f = b.faces[fi]
  if (f === undefined || f.surface.kind !== "plane") return undefined
  const F = f.surface.frame
  const n = f.reversed ? scale3(F.z, -1) : F.z
  return { face: fi, origin: F.origin, normal: n, u: F.x, v: cross3(n, F.x), distance: 0 }
}

/** The body with one planar face pushed out or pulled in, or why it cannot be. */
export const pushPullFace = (b: Brep, o: PushPullOptions): Brep | string => {
  if (o.distance === 0) return b
  let pick: PlanarFacePick | undefined
  if (o.face !== undefined) {
    pick = pickOfFace(b, o.face)
    if (pick === undefined) return "the named face is not a planar face of this body"
  } else {
    const found = nearestFace(b, o)
    if (found === undefined) return "no planar face near the given point"
    if (!("pick" in found)) return "a push/pull of a curved face has no exact model yet"
    pick = found.pick
  }
  const profile = faceProfile(b, pick)
  if (typeof profile === "string") return profile
  const n = pick.normal
  // The moved face keeps its name: a later feature can still refer to it (the pushed face is the prism's far end).
  const original = b.faces[pick.face]!.name
  const prism = (from: number, to: number): Brep => {
    const solid = extrudeProfile({ loops: profile }, to - from, { placement: frame(add3(pick.origin, scale3(n, from)), n, pick.u), name: "pushpull" })
    if (original === undefined) return solid
    return { ...solid, faces: solid.faces.map((face) => face.name === "pushpull.top" ? { ...face, name: original } : face) }
  }
  // The overlap the mesh rebuild gives its tool, so the Boolean meets a volume and not a face.
  const margin = 0.01
  try {
    if (o.distance > 0) return sewSolids(b, prism(0, o.distance)) ?? booleanBrep(b, prism(-margin, o.distance), "union").brep
    return booleanBrep(b, prism(o.distance, margin), "subtract").brep
  } catch (err) {
    return `exact push/pull failed: ${err instanceof Error ? err.message : String(err)}`
  }
}

export interface MatePose {
  readonly offset: number
  /** Radians about the target face's normal. */
  readonly spin: number
  readonly slideU: number
  readonly slideV: number
}

/** The rigid motion laying `mine` flush on `theirs`, as the mesh rebuild's mate does it. */
export const mateTransform = (mine: Pick<FaceFrame, "normal" | "centroid">, theirs: Pick<FaceFrame, "normal" | "centroid" | "u" | "v">, pose: MatePose): Transform => {
  const target = scale3(theirs.normal, -1)
  const d = Math.max(-1, Math.min(1, dot3(mine.normal, target)))
  let tr: Transform = translation({ x: 0, y: 0, z: 0 })
  if (d < 1 - 1e-12) {
    let axis = cross3(mine.normal, target)
    if (length3(axis) < 1e-9) axis = cross3(mine.normal, Math.abs(mine.normal.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 })
    tr = rotation(normalize3(axis), Math.acos(d), mine.centroid)
  }
  const goal = add3(add3(add3(theirs.centroid, scale3(theirs.normal, pose.offset)), scale3(theirs.u, pose.slideU)), scale3(theirs.v, pose.slideV))
  tr = compose(tr, translation(sub3(goal, mine.centroid)))
  return Math.abs(pose.spin) < 1e-12 ? tr : compose(tr, rotation(theirs.normal, pose.spin, goal))
}
