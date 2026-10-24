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
 * The twin of the dome is the **socket**: the spherical bottom of a bore (a ball-end hole). Its sphere is concave, its centre is in the void,
 * and the same closed form holds with the signs turned: the bottom moves up into the bore when pushed out of the solid (R' = R - d) and
 * deeper when pulled. A hemispherical dome or socket (rim through the centre, the sphere tangent to the wall: the end of a ball-nose
 * pin or of a ball-end bore) can be edited when the new sphere is not tangent; its axis is then read from the wall it ends.
 *
 * A cap that is more than a hemisphere (an overhang), a sphere that would be tangent to the wall (a radius within 0.02 mm of the
 * wall's) after the edit, one pulled in below the wall's radius and a sphere that is not the end of a straight wall are refused with the reason.
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
/** How much thicker than its socket the ball that fills it is taken, mm: more than the smallest gap a Boolean decides, so no sphere is coincident. */
const SKIN = 0.05

export interface RecognizedDome {
  readonly face: number
  readonly centre: Vec3
  readonly radius: number
  /** Unit axis, pointing from the sphere's centre to the pole of the cap (the apex of a dome, the lowest point of a socket). */
  readonly axis: Vec3
  /** The wall radius (the rim circle). */
  readonly boss: number
  /** Height of the rim from the sphere's centre along the axis: zero for a hemisphere, positive for a smaller cap, negative for a bigger one (a ball on a neck). */
  readonly rim: number
  /** True for a socket (the sphere is concave: the centre is in the void). */
  readonly concave: boolean
}

/** The face of the straight cylinder wall that shares the rim `edge`, with its axis and radius. */
const wallAt = (b: Brep, edge: number, not: number): { readonly axis: Vec3; readonly radius: number } | undefined => {
  for (let g = 0; g < b.faces.length; g++) {
    if (g === not) continue
    const s = b.faces[g]!.surface
    if (s.kind !== "cylinder") continue
    for (const loop of b.faces[g]!.loops) if (loop.coedges.some((c) => c.edge === edge)) return { axis: s.frame.z, radius: s.radius }
  }
  return undefined
}

/** The dome or socket whose sphere face is `face`, or why that face is not one. */
export const recognizeDome = (b: Brep, face: number): RecognizedDome | string => {
  const f = b.faces[face]
  if (f === undefined || f.surface.kind !== "sphere") return "the face is not a sphere"
  const s = f.surface
  const pts: Vec3[] = []
  // The seam of a sphere is an edge the loop walks twice; the rim is what is walked once.
  const walked = new Map<number, number>()
  for (const loop of f.loops) for (const c of loop.coedges) walked.set(c.edge, (walked.get(c.edge) ?? 0) + 1)
  let rimEdge = -1
  for (const loop of f.loops) for (const c of loop.coedges) {
    if (walked.get(c.edge) !== 1) continue
    rimEdge = c.edge
    const e = b.edges[c.edge]!
    for (let k = 0; k <= 8; k++) pts.push(curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 8))
  }
  if (pts.length < 3 || f.loops.length !== 1) return "the sphere face has no single rim circle (it is not the end of a round wall)"
  // The rim is a circle in a plane square to the line through the centre: its centre (from three of its points) lies on that line,
  // and every point is at one height and one distance from it.
  const [p0, p1, p2] = [pts[0]!, pts[Math.floor(pts.length / 3)]!, pts[Math.floor((2 * pts.length) / 3)]!]
  const u = sub3(p1, p0), v = sub3(p2, p0), w = cross3(u, v)
  if (length3(w) < 1e-9) return "the rim of the sphere face is degenerate"
  const rc = add3(p0, scale3(add3(scale3(cross3(w, u), dot3(v, v)), scale3(cross3(v, w), dot3(u, u))), 1 / (2 * dot3(w, w))))
  const toRim = sub3(rc, s.frame.origin)
  const R = s.radius
  const wall = wallAt(b, rimEdge, face)
  const locator = brepLocator(b)
  const onFace = (dir: Vec3): boolean => locator.closest(add3(s.frame.origin, scale3(dir, R))).face === face
  let axis: Vec3
  if (length3(toRim) < 1e-6 * R) {
    // A hemisphere: the rim passes through the centre, and the axis is the one of the wall the sphere ends.
    if (wall === undefined) return "the rim passes through the sphere's centre and no straight wall ends there: it is not the end of a round wall"
    const up = normalize3(wall.axis)
    axis = onFace(up) ? up : onFace(scale3(up, -1)) ? scale3(up, -1) : up
  } else {
    // The pole is on the face: towards the rim's side for a cap smaller than a hemisphere, on the other side for a bigger one.
    const towards = normalize3(toRim)
    axis = onFace(towards) ? towards : scale3(towards, -1)
  }
  const rim = dot3(toRim, axis)
  const tol = 1e-6 * Math.max(1, R)
  let a = 0
  for (const p of pts) {
    const q = sub3(p, s.frame.origin)
    if (Math.abs(dot3(q, axis) - rim) > tol) return "the rim of the sphere face is not a circle square to the axis through its centre"
    a = Math.max(a, length3(sub3(q, scale3(axis, dot3(q, axis)))))
  }
  if (!onFace(axis)) return "the pole of the sphere is not on this face: it is not the end of a round wall"
  if (wall === undefined) return "no straight wall of the rim's radius continues from the sphere"
  if (Math.abs(Math.abs(dot3(normalize3(wall.axis), axis)) - 1) > 1e-6 || Math.abs(wall.radius - a) > 1e-6 * Math.max(1, a)) return "the wall beside the sphere is not a cylinder on the same axis and radius"
  return { face, centre: s.frame.origin, radius: R, axis, boss: a, rim: Math.abs(rim) < tol ? 0 : rim, concave: f.reversed }
}

const cap = (R: number, a: number): number => R ** 3 - (R * R - a * a) ** 1.5

/**
 * The solid with the dome or socket `face` moved by `distance` along its outward normal, or why not. Positive grows a dome and shrinks
 * a socket (the material comes into the bore).
 */
export const pushPullDome = (b: Brep, face: number, distance: number): Brep | string => {
  const dome = recognizeDome(b, face)
  if (typeof dome === "string") return dome
  const R = dome.radius, a = dome.boss
  const R2 = dome.concave ? R - distance : R + distance
  if (dome.rim < -1e-9 * R) return pushPullBulb(b, dome, R2, distance)
  if (Math.abs(R2 - a) < MIN_GAP) return `the sphere would be tangent to the wall (radius ${R2.toFixed(3)} against ${a.toFixed(3)} mm): the Boolean cannot decide a gap under ${MIN_GAP} mm`
  if (!(R2 > a)) return `the new sphere (radius ${R2.toFixed(3)} mm) is smaller than the wall it ends (${a.toFixed(3)} mm): it would leave a shoulder, which this edit does not model`
  const rim2 = Math.sqrt(R2 * R2 - a * a)
  const before = massProperties(b).volume
  const at = (t: number): Vec3 => add3(dome.centre, scale3(dome.axis, t))
  const ball = makeSphere(R2, frame(dome.centre, dome.axis))
  try {
    let solid: Brep
    if (dome.concave) {
      if (distance > 0) {
        // The bottom comes up: what is inside the old ball and outside the new one, inside the bore's cylinder from the centre to the pole,
        // becomes material. The old ball is taken a little larger so that its sphere is not coincident with the socket's own (a coincident
        // sphere shifts the operand and costs 1e-4 of the volume): what the larger ball adds is material already, under the bottom.
        const old = makeSphere(R + SKIN, frame(dome.centre, dome.axis))
        const down = makeCylinder(a, R + SKIN + 1, frame(dome.centre, dome.axis))
        solid = booleanBrep(b, booleanBrep(booleanBrep(old, down, "intersect").brep, ball, "subtract").brep, "union").brep
      } else {
        // The bottom goes deeper: the bigger ball inside the bore's cylinder, from the centre to the pole, is cut away.
        const down = makeCylinder(a, R2 + 1, frame(dome.centre, dome.axis))
        solid = booleanBrep(b, booleanBrep(ball, down, "intersect").brep, "subtract").brep
      }
    } else if (distance >= 0) {
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
    const sign = dome.concave ? -1 : 1
    const expected = sign * ((2 * Math.PI) / 3) * (cap(R2, a) - cap(R, a))
    if (Math.abs(after - before - expected) > 1e-6 * Math.max(before, 1) + 1e-6 * Math.abs(expected)) {
      return `the edit changed the volume by ${(after - before).toFixed(6)} mm³ where the ${dome.concave ? "socket" : "dome"} accounts for ${expected.toFixed(6)} mm³: it ran into a neighbouring feature`
    }
    return solid
  } catch (cause) {
    return `the Boolean failed (${cause instanceof Error ? cause.message : String(cause)})`
  }
}

/** Volume of the segment of a ball of radius R standing `h` above a plane that cuts it at height `h` from the pole side: pi h^2 (3R - h) / 3. */
const segment = (R: number, h: number): number => (Math.PI * h * h * (3 * R - h)) / 3

/**
 * A cap of more than a hemisphere: the ball on a neck (a dome) or the round cavity behind a narrow bore (a socket). The sphere meets the
 * wall below its centre, at a distance q = sqrt(R^2 - a^2); the new sphere (same centre, radius R') meets it at q' = sqrt(R'^2 - a^2).
 *
 *  - **dome, bigger**: the part of the bigger ball above the new rim's plane is united (the neck gets shorter by q' - q);
 *  - **dome, smaller**: what is inside the slightly larger old ball above the old rim's plane and outside the new ball and the neck
 *    prolonged up to the new rim is subtracted;
 *  - **socket**: the same two tools, the other way round (a bigger cavity is cut, a smaller one filled).
 *
 * The solid's volume moves by V(R', H') - V(R, H) + pi a^2 (q - q') (H = R + q: the segment of the ball above the rim's plane), with the sign
 * turned for a socket.
 */
const pushPullBulb = (b: Brep, dome: RecognizedDome, R2: number, distance: number): Brep | string => {
  const R = dome.radius, a = dome.boss
  if (Math.abs(R2 - a) < MIN_GAP) return `the sphere would be tangent to the wall (radius ${R2.toFixed(3)} against ${a.toFixed(3)} mm): the Boolean cannot decide a gap under ${MIN_GAP} mm`
  if (!(R2 > a)) return `the new sphere (radius ${R2.toFixed(3)} mm) is smaller than the wall it meets (${a.toFixed(3)} mm): it would leave a shoulder, which this edit does not model`
  const q = Math.sqrt(R * R - a * a), q2 = Math.sqrt(R2 * R2 - a * a)
  const before = massProperties(b).volume
  const at = (t: number): Vec3 => add3(dome.centre, scale3(dome.axis, t))
  const up = (from: number, to: number) => makeCylinder(R + R2 + 2, to - from, frame(at(from), dome.axis))
  try {
    let solid: Brep
    const growing = R2 > R
    if (growing) {
      // The bigger ball above its own rim's plane (the plane crosses the neck: the disc is inside the solid or the void of the bore).
      const tool = booleanBrep(makeSphere(R2, frame(dome.centre, dome.axis)), up(-q2, R2 + 1), "intersect").brep
      solid = booleanBrep(b, tool, dome.concave ? "subtract" : "union").brep
    } else {
      // Old ball (a little larger, so its sphere is not the solid's own) above the old rim, less the new ball and the neck up to the new rim.
      // Both start a little below the old rim's plane, so that no face of the tool passes through the solid's own rim circle.
      const below = 0.1
      const old = booleanBrep(makeSphere(R + SKIN, frame(dome.centre, dome.axis)), up(-q - below, R + SKIN + 1), "intersect").brep
      const keep = booleanBrep(makeSphere(R2, frame(dome.centre, dome.axis)), makeCylinder(a, q - q2 + below, frame(at(-q - below), dome.axis)), "union").brep
      const tool = booleanBrep(old, keep, "subtract").brep
      solid = booleanBrep(b, tool, dome.concave ? "union" : "subtract").brep
    }
    const report = validateBrep(solid)
    if (!report.valid) return `the edited solid is not valid (${report.issues.slice(0, 2).map((i) => i.message).join("; ")})`
    const after = massProperties(solid).volume
    const delta = segment(R2, R2 + q2) - segment(R, R + q) + Math.PI * a * a * (q - q2)
    const expected = dome.concave ? -delta : delta
    if (Math.abs(after - before - expected) > 1e-6 * Math.max(before, 1) + 1e-6 * Math.abs(expected)) {
      return `the edit changed the volume by ${(after - before).toFixed(6)} mm³ where the ${dome.concave ? "cavity" : "ball"} accounts for ${expected.toFixed(6)} mm³: it ran into a neighbouring feature`
    }
    void distance
    return solid
  } catch (cause) {
    return `the Boolean failed (${cause instanceof Error ? cause.message : String(cause)})`
  }
}
