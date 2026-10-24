/**
 * The shadow of a solid seen from above: everything between the underside and the first surface a tool coming down along -Z meets.
 * It is what a three-axis machine can make from that side, and nothing hidden under a roof (a pocket that opens sideways, a cavity,
 * an undercut) is in it: those voids are filled. It is how a manual setup sees a part, so a part with features on every side can
 * be read one side at a time.
 *
 * The shadow is the union of the prisms that go straight down from every face that looks up, each to the underside. A face of
 * the solid that looks up is a planar horizontal face; a vertical wall (planar or a cylinder along Z) and a face that looks down
 * add nothing of their own. Anything else that could be seen from above (a sloped plane, a dome, a cone, a surface of
 * revolution) has no exact prism here and the solid is refused with the reason, never approximated. Whether such a face can be seen
 * from above is the line-of-sight test of `visibility.ts`: a bore along X inside the part is under the material above it and adds
 * nothing; the same bore open to the top would be seen, and refuses.
 */
import { cross3, scale3 } from "../vec.ts"
import { booleanBrep } from "./boolean.ts"
import { faceProfile, type PlanarFacePick } from "./draft.ts"
import { frame, MODEL_TOL, type Vec3 } from "./math.ts"
import { extrudeProfile } from "./sweep.ts"
import { bodyTessellation } from "./tessellate.ts"
import { EPS, reachShares, START } from "./visibility.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

/** Most up-facing faces a shadow is built from: each is one Boolean. */
const MAX_FACES = 48

export interface Shadow {
  readonly brep: Brep
  /** Faces of the solid that no tool from above can reach (hidden under a roof or facing down above the underside). */
  readonly hidden: number
  /** Up-facing faces the shadow was built from. */
  readonly prisms: number
}

/** The shadow of `b` along -Z, or the reason there is none. */
export const shadowSolid = (b: Brep): Shadow | string => {
  let zMin = Infinity
  for (const v of b.vertices) zMin = Math.min(zMin, v.point.z)
  if (!Number.isFinite(zMin)) return "the solid has no vertices"
  const Z: Vec3 = { x: 0, y: 0, z: 1 }
  /** Share of each face a tool from above sees; computed once, and only when a face that is not a prism asks. */
  let seen: Float64Array | undefined
  const visibleFromAbove = (fi: number): boolean => {
    if (seen === undefined) {
      let lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
      for (const v of b.vertices) {
        lo = { x: Math.min(lo.x, v.point.x), y: Math.min(lo.y, v.point.y), z: Math.min(lo.z, v.point.z) }
        hi = { x: Math.max(hi.x, v.point.x), y: Math.max(hi.y, v.point.y), z: Math.max(hi.z, v.point.z) }
      }
      const chord = Math.max(0.02, Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) / 1000)
      seen = reachShares(bodyTessellation(b, { chordTol: chord }), "+Z", Math.max(EPS, START * chord))
    }
    return seen[fi]! > 1e-9
  }
  const ups: Array<{ readonly pick: PlanarFacePick; readonly height: number }> = []
  for (let fi = 0; fi < b.faces.length; fi++) {
    const f = b.faces[fi]!, s = f.surface
    if (s.kind === "plane") {
      const n = f.reversed ? scale3(s.frame.z, -1) : s.frame.z
      if (Math.abs(n.z) < 1e-6) continue // a vertical wall
      if (n.z < 0) continue // looks down
      if (n.z < 1 - 1e-6) return "has a sloped plane that looks up; its shadow is not a prism"
      const height = s.frame.origin.z - zMin
      if (height <= MODEL_TOL) continue // the underside itself
      ups.push({ pick: { face: fi, origin: s.frame.origin, normal: Z, u: s.frame.x, v: cross3(Z, s.frame.x), distance: 0 }, height })
    } else if (s.kind === "cylinder") {
      if (Math.abs(Math.abs(s.frame.z.z) - 1) > 1e-9 && visibleFromAbove(fi)) return "has a cylinder across Z that can be seen from above; its shadow is not a prism"
    } else if (visibleFromAbove(fi)) return `has a ${s.kind} face that can be seen from above; its shadow is not a prism`
  }
  if (ups.length === 0) return "no face looks up"
  if (ups.length > MAX_FACES) return `has ${ups.length} faces that look up (more than ${MAX_FACES})`
  // Largest height first: the broad slabs go in before the small steps that sit on them.
  ups.sort((p, q) => q.height - p.height)
  try {
    let solid: Brep | undefined
    for (const { pick, height } of ups) {
      const profile = faceProfile(b, pick)
      if (typeof profile === "string") return profile
      // The prism hangs from the face: extruded down from the face's plane by its height above the underside.
      const prism = extrudeProfile({ loops: profile }, -height, { placement: frame(pick.origin, Z, pick.u) })
      solid = solid === undefined ? prism : booleanBrep(solid, prism, "union").brep
    }
    const report = validateBrep(solid!)
    if (!report.valid) return `the shadow is not a valid solid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    return { brep: solid!, hidden: Math.max(0, b.faces.length - ups.length), prisms: ups.length }
  } catch (cause) {
    return `the shadow could not be built (${cause instanceof Error ? cause.message : String(cause)})`
  }
}

