/**
 * Push/pull of a spherical dome on the exact model (spec 40 U2): the cap that ends a round boss or a pin (a ball-ended pin, a domed
 * head). The dome moves along its normal by `distance`, which for a sphere is the same centre and a radius of R + distance; the new
 * surface meets the wall of the boss where it meets it, and everything else is untouched:
 *
 *  - **grow**: the part of the larger ball that is inside the boss's cylinder and above the old rim is united with the solid;
 *  - **shrink**: what is inside the cylinder above the new rim and outside the smaller ball is subtracted.
 *
 * The dome is read from the faces: a sphere face whose boundary is one circle in a plane square to the axis through the sphere's
 * centre, with the cylinder wall of that radius continuing below the rim. The result is checked like every edit of the kind: a valid
 * solid whose volume moved by exactly  (2 pi / 3) [ (R'^3 - (R'^2 - a^2)^1.5) - (R^3 - (R^2 - a^2)^1.5) ]  (a: the boss radius).
 *
 * A dome that is more than a hemisphere (an overhang), one whose sphere is tangent to the wall (a radius within 0.02 mm of the boss's)
 * before or after the edit, and a sphere that is not the end of a boss are refused with the reason.
 */
import { add3, cross3, dot3, length3, normalize3, scale3, sub3 } from "../vec.ts"
import { booleanBrep } from "./boolean.ts"
import { brepLocator } from "./classify.ts"
import { curvePoint } from "./geom.ts"
import { massProperties } from "./mass.ts"
import { frame, type Vec3 } from "./math.ts"
import { makeCylinder, makeSphere } from "./primitives.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

/** Smallest gap between the sphere and the boss wall the Boolean can decide (see the thread's crest trim). */
const MIN_GAP = 0.02

export interface RecognizedDome {
  readonly face: number
  readonly centre: Vec3
  readonly radius: number
  /** Unit axis, pointing from the boss to the apex. */
  readonly axis: Vec3
  /** The boss radius (the rim circle). */
  readonly boss: number
  /** Height of the rim above the sphere's centre along the axis; positive for a cap smaller than a hemisphere. */
  readonly rim: number
}

/** The dome whose sphere face is `face`, or why that face is not one. */
export const recognizeDome = (b: Brep, face: number): RecognizedDome | string => {
  const f = b.faces[face]
  if (f === undefined || f.surface.kind !== "sphere") return "the face is not a sphere"
  if (f.reversed) return "the sphere face is concave (a socket), not a dome"
  const s = f.surface
  const pts: Vec3[] = []
  // The seam of a sphere is an edge the loop walks twice; the rim is what is walked once.
  const walked = new Map<number, number>()
  for (const loop of f.loops) for (const c of loop.coedges) walked.set(c.edge, (walked.get(c.edge) ?? 0) + 1)
  for (const loop of f.loops) for (const c of loop.coedges) {
    if (walked.get(c.edge) !== 1) continue
    const e = b.edges[c.edge]!
    for (let k = 0; k <= 8; k++) pts.push(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 8))
  }
  if (pts.length < 3 || f.loops.length !== 1) return "the sphere face has no single rim circle (it is not the cap of a boss)"
  // The rim is a circle in a plane square to the line through the centre: its centre (from three of its points) lies on that line,
  // and every point is at one height and one distance from it.
  const [p0, p1, p2] = [pts[0]!, pts[Math.floor(pts.length / 3)]!, pts[Math.floor((2 * pts.length) / 3)]!]
  const u = sub3(p1, p0), v = sub3(p2, p0), w = cross3(u, v)
  if (length3(w) < 1e-9) return "the rim of the sphere face is degenerate"
  const centre = add3(p0, scale3(add3(scale3(cross3(w, u), dot3(v, v)), scale3(cross3(v, w), dot3(u, u))), 1 / (2 * dot3(w, w))))
  const toMean = sub3(centre, s.frame.origin)
  if (length3(toMean) < 1e-9) return "the rim passes through the sphere's centre (a hemisphere's rim is tangent to the wall)"
  const axis = normalize3(toMean)
  const tol = 1e-6 * Math.max(1, s.radius)
  const rim = dot3(toMean, axis)
  let a = 0
  for (const p of pts) {
    const q = sub3(p, s.frame.origin)
    if (Math.abs(dot3(q, axis) - rim) > tol) return "the rim of the sphere face is not a circle square to the axis through its centre"
    a = Math.max(a, length3(sub3(q, scale3(axis, dot3(q, axis)))))
  }
  if (!(rim > 0)) return "the dome is a hemisphere or more (an overhang), which has no exact push/pull yet"
  // The apex must belong to this face (the cap, not the rest of the sphere), and the boss wall must continue below the rim.
  const locator = brepLocator(b)
  const apex = add3(s.frame.origin, scale3(axis, s.radius))
  const onApex = locator.closest(apex)
  if (onApex.face !== face) return "the apex of the sphere is not on this face: it is not the cap of a boss"
  const below = add3(s.frame.origin, scale3(axis, rim - Math.min(1, rim * 0.5)))
  if (locator.classify(add3(below, { x: 0, y: 0, z: 0 }), 1e-6) === "out") return "the boss does not continue below the dome"
  return { face, centre: s.frame.origin, radius: s.radius, axis, boss: a, rim }
}

const cap = (R: number, a: number): number => R ** 3 - (R * R - a * a) ** 1.5

/** The solid with the dome `face` moved by `distance` along its normal (positive grows it), or why not. */
export const pushPullDome = (b: Brep, face: number, distance: number): Brep | string => {
  const dome = recognizeDome(b, face)
  if (typeof dome === "string") return dome
  const R = dome.radius, a = dome.boss, R2 = R + distance
  if (Math.abs(R - a) < MIN_GAP || Math.abs(R2 - a) < MIN_GAP) return `the sphere would be tangent to the wall of the boss (radius ${R2.toFixed(3)} against ${a.toFixed(3)} mm): the Boolean cannot decide a gap under ${MIN_GAP} mm`
  if (!(R2 > a)) return `the new dome (radius ${R2.toFixed(3)} mm) is smaller than the boss it ends (${a.toFixed(3)} mm): it would leave a shoulder, which this edit does not model`
  const rim2 = Math.sqrt(R2 * R2 - a * a)
  const before = massProperties(b).volume
  const at = (t: number): Vec3 => add3(dome.centre, scale3(dome.axis, t))
  const ball = makeSphere(R2, frame(dome.centre, dome.axis))
  try {
    let solid: Brep
    if (distance >= 0) {
      // Above the old rim, inside the boss's cylinder, inside the bigger ball.
      const up = makeCylinder(a, R2 + 1 - dome.rim, frame(at(dome.rim), dome.axis))
      solid = booleanBrep(b, booleanBrep(ball, up, "intersect").brep, "union").brep
    } else {
      // Above the new rim, outside the smaller ball: the cutter is wider than the boss so no wall is coincident with the boss's own.
      const up = makeCylinder(a + 1, R + 1 - rim2, frame(at(rim2), dome.axis))
      solid = booleanBrep(b, booleanBrep(up, ball, "subtract").brep, "subtract").brep
    }
    const report = validateBrep(solid)
    if (!report.valid) return `the edited solid is not valid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    const after = massProperties(solid).volume
    const expected = ((2 * Math.PI) / 3) * (cap(R2, a) - cap(R, a))
    if (Math.abs(after - before - expected) > 1e-6 * Math.max(before, 1) + 1e-6 * Math.abs(expected)) {
      return `the edit changed the volume by ${(after - before).toFixed(6)} mm³ where the dome accounts for ${expected.toFixed(6)} mm³: it ran into a neighbouring feature`
    }
    return solid
  } catch (cause) {
    return `the Boolean failed (${cause instanceof Error ? cause.message : String(cause)})`
  }
}
