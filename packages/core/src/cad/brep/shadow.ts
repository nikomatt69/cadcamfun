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
import { add3, cross3, dot3, normalize3, scale3, sub3 } from "../vec.ts"
import { booleanBrep } from "./boolean.ts"
import { faceProfile, type PlanarFacePick } from "./draft.ts"
import { recognizeDome } from "./dome-edit.ts"
import { curvePoint } from "./geom.ts"
import { frame, MODEL_TOL, type Vec3 } from "./math.ts"
import { extrudeProfile, revolveProfile, type ProfileSegment } from "./sweep.ts"
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
  const ups: Array<{ readonly make: () => Brep | string; readonly height: number }> = []
  for (let fi = 0; fi < b.faces.length; fi++) {
    const f = b.faces[fi]!, s = f.surface
    if (s.kind === "plane") {
      const n = f.reversed ? scale3(s.frame.z, -1) : s.frame.z
      if (Math.abs(n.z) < 1e-6) continue // a vertical wall
      if (n.z < 0) continue // looks down
      if (n.z < 1 - 1e-6) return "has a sloped plane that looks up; its shadow is not a prism"
      const height = s.frame.origin.z - zMin
      if (height <= MODEL_TOL) continue // the underside itself
      const pick: PlanarFacePick = { face: fi, origin: s.frame.origin, normal: Z, u: s.frame.x, v: cross3(Z, s.frame.x), distance: 0 }
      ups.push({
        height,
        make: () => {
          const profile = faceProfile(b, pick)
          // The prism hangs from the face: extruded down from the face's plane by its height above the underside.
          return typeof profile === "string" ? profile : extrudeProfile({ loops: profile }, -height, { placement: frame(pick.origin, Z, pick.u) })
        }
      })
    } else if (s.kind === "cylinder") {
      if (Math.abs(Math.abs(s.frame.z.z) - 1) > 1e-9 && visibleFromAbove(fi)) {
        const under = underCylinder(b, fi, zMin)
        if (typeof under === "string") return `has a cylinder across Z that can be seen from above, and ${under}`
        ups.push({ height: under.top - zMin, make: () => under.brep })
      }
    } else if (s.kind === "sphere") {
      if (visibleFromAbove(fi)) {
        const under = underDome(b, fi, zMin)
        if (typeof under === "string") return `has a sphere face that can be seen from above, and ${under}`
        ups.push({ height: under.top - zMin, make: () => under.brep })
      }
    } else if (visibleFromAbove(fi)) return `has a ${s.kind} face that can be seen from above; its shadow is not a prism`
  }
  if (ups.length === 0) return "no face looks up"
  if (ups.length > MAX_FACES) return `has ${ups.length} faces that look up (more than ${MAX_FACES})`
  // Largest height first: the broad slabs go in before the small steps that sit on them.
  ups.sort((p, q) => q.height - p.height)
  try {
    let solid: Brep | undefined
    for (const { make } of ups) {
      const prism = make()
      if (typeof prism === "string") return prism
      solid = solid === undefined ? prism : booleanBrep(solid, prism, "union").brep
    }
    const report = validateBrep(solid!)
    if (!report.valid) return `the shadow is not a valid solid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    return { brep: solid!, hidden: Math.max(0, b.faces.length - ups.length), prisms: ups.length }
  } catch (cause) {
    return `the shadow could not be built (${cause instanceof Error ? cause.message : String(cause)})`
  }
}


/**
 * What is under a convex horizontal cylinder that a tool from above sees: every column below its upper half, down to the underside.
 * Extruded along the axis from the profile (the chord of the slab it spans, the arc over it), so it is exact and has no tangent
 * contact. A face that goes on below the axis reaches the full radius on that side: the columns under the overhang are the
 * same columns. A concave channel and a tilted axis are refused.
 */
const underCylinder = (b: Brep, face: number, zMin: number): { readonly brep: Brep; readonly top: number } | string => {
  const f = b.faces[face]!, s = f.surface
  if (s.kind !== "cylinder") return "is not a cylinder"
  if (f.reversed) return "the cylinder is a concave channel, whose floor is a pocket's"
  const d = normalize3(s.frame.z)
  if (Math.abs(d.z) > 1e-9) return "the cylinder axis is tilted"
  const e = normalize3(cross3({ x: 0, y: 0, z: 1 }, d))
  const O = s.frame.origin, zc = O.z, r = s.radius
  let s0 = Infinity, s1 = -Infinity, w0 = Infinity, w1 = -Infinity
  for (const loop of f.loops) for (const c of loop.coedges) {
    const edge = b.edges[c.edge]!
    for (let k = 0; k <= 16; k++) {
      const q = sub3(curvePoint(edge.curve, edge.t0 + ((edge.t1 - edge.t0) * k) / 16), O)
      const t = dot3(q, d), w = dot3(q, e)
      // A face that goes on below the axis has passed the widest point on that side: the columns reach the full radius there.
      if (q.z < -1e-6) { if (w < 0) w0 = -r; else w1 = r }
      s0 = Math.min(s0, t); s1 = Math.max(s1, t); w0 = Math.min(w0, w); w1 = Math.max(w1, w)
    }
  }
  if (!(s1 - s0 > 1e-6 && w1 - w0 > 1e-6)) return "the face has no extent"
  if (zc - zMin < 1e-6) return "the axis is at the underside"
  const edgeY = (w: number): number => Math.sqrt(Math.max(0, r * r - w * w))
  const lo = Math.max(-r, w0), hi = Math.min(r, w1)
  const base = zMin - zc
  // Profile in (across, up) from the axis: the slab's floor, its two walls and the arc over the top.
  const arc: ProfileSegment = { kind: "arc", center: { x: 0, y: 0 }, radius: r, start: Math.atan2(edgeY(hi), hi), end: Math.atan2(edgeY(lo), lo) }
  const loop: ProfileSegment[] = [
    { kind: "line", a: { x: lo, y: base }, b: { x: hi, y: base } },
    { kind: "line", a: { x: hi, y: base }, b: { x: hi, y: edgeY(hi) } },
    arc,
    { kind: "line", a: { x: lo, y: edgeY(lo) }, b: { x: lo, y: base } }
  ]
  const placement = frame(add3(O, scale3(d, s0)), d, e)
  return { brep: extrudeProfile({ loops: [loop] }, s1 - s0, { placement }), top: zc + r }
}

/** What is under the dome that ends a round boss: the column below its rim, and the cap over it, revolved about the dome's axis. */
const underDome = (b: Brep, face: number, zMin: number): { readonly brep: Brep; readonly top: number } | string => {
  const dome = recognizeDome(b, face)
  if (typeof dome === "string") return dome
  if (dome.axis.z < 1 - 1e-9) return "the dome does not point up"
  const zc = dome.centre.z, zRim = zc + dome.rim
  if (zRim - zMin < 1e-6) return "the rim is at the underside"
  const R = dome.radius, a = dome.boss
  const loop: ProfileSegment[] = [
    { kind: "line", a: { x: 0, y: 0 }, b: { x: a, y: 0 } },
    { kind: "line", a: { x: a, y: 0 }, b: { x: a, y: zRim - zMin } },
    { kind: "arc", center: { x: 0, y: zc - zMin }, radius: R, start: Math.atan2(dome.rim, a), end: Math.PI / 2 },
    { kind: "line", a: { x: 0, y: zc - zMin + R }, b: { x: 0, y: 0 } }
  ]
  return { brep: revolveProfile({ loops: [loop] }, 2 * Math.PI, { origin: { x: dome.centre.x, y: dome.centre.y, z: zMin }, axis: { x: 0, y: 0, z: 1 }, radial: { x: 1, y: 0, z: 0 } }), top: zc + R }
}
