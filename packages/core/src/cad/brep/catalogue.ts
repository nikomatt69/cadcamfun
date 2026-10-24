/**
 * Exact solids of the 3D catalogue that the analytic primitive builders do not cover (spec 40 U5).
 *
 * The catalogue is drawn in the editor as a mesh; the exact replay needs the same solid as a B-rep, so that the
 * viewport, the CAM planner and the STEP export all see one model. A capsule is the case here: a cylinder with two
 * hemispherical caps, which is one surface of revolution whose profile is two arcs and two lines.
 */
import { frame, WORLD, type Frame, type Vec3 } from "./math.ts"
import { revolveProfile, type ProfileLoop } from "./sweep.ts"
import { transformBrep, type Brep } from "./topology.ts"

/** The rotation the editor lays a capsule along its axis: it is built along Z and then turned. */
const AXIS_ROTATION: Readonly<Record<"x" | "y" | "z", readonly [number, number, number, number, number, number, number, number, number]>> = {
  // (x, y, z) → (z, x, y): Z becomes X.
  x: [0, 0, 1, 1, 0, 0, 0, 1, 0],
  // (x, y, z) → (x, z, −y): Z becomes Y.
  y: [1, 0, 0, 0, 0, 1, 0, -1, 0],
  z: [1, 0, 0, 0, 1, 0, 0, 0, 1]
}

/**
 * A capsule of radius `r` and cylinder length `length`, centred on the placement origin, its axis along
 * `direction` (x | y | z). The caps are hemispheres of the same radius: the solid is tangent (C1) along the caps.
 */
export const makeCapsule = (r: number, length: number, direction: "x" | "y" | "z" = "z", placement: Frame = WORLD): Brep => {
  if (!(r > 0)) throw new RangeError(`capsule radius must be positive, got ${r}`)
  if (!(length > 0)) throw new RangeError(`capsule length must be positive, got ${length}`)
  const half = length / 2
  // The profile in the revolve frame: x is the distance from the axis, y the position along it. The two arcs are the
  // hemispherical caps (centred on the axis), the line between them the cylindrical band, the last line closes the
  // profile on the axis and produces no face.
  const loop: ProfileLoop = [
    { kind: "arc", center: { x: 0, y: -half }, radius: r, start: -Math.PI / 2, end: 0 },
    { kind: "line", a: { x: r, y: -half }, b: { x: r, y: half } },
    { kind: "arc", center: { x: 0, y: half }, radius: r, start: 0, end: Math.PI / 2 },
    { kind: "line", a: { x: 0, y: half + r }, b: { x: 0, y: -half - r } }
  ]
  const alongZ = revolveProfile({ loops: [loop] }, 2 * Math.PI, {
    origin: placement.origin,
    axis: { x: 0, y: 0, z: 1 },
    radial: { x: 1, y: 0, z: 0 },
    name: "capsule"
  })
  if (direction === "z") return alongZ
  return transformBrep(alongZ, { m: AXIS_ROTATION[direction], t: { x: 0, y: 0, z: 0 } })
}

/** The volume of a capsule from its measures: the cylinder and the two hemispheres. */
export const capsuleVolume = (r: number, length: number): number => Math.PI * r * r * length + (4 / 3) * Math.PI * r * r * r

/** The centre of a capsule: its bounding box is symmetric about it. */
export const capsuleCentre = (at: Vec3): Vec3 => ({ x: at.x, y: at.y, z: at.z })

/** The frame a capsule stands on: the placement's axes, its origin at `at`. */
export const capsuleFrame = (at: Vec3): Frame => frame(at)
