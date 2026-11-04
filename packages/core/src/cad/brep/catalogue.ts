/**
 * Exact solids of the 3D catalogue that the analytic primitive builders do not cover (spec 40 U5).
 *
 * The catalogue is drawn in the editor as a mesh; the exact replay needs the same solid as a B-rep, so that the
 * viewport, the CAM planner and the STEP export all see one model. A capsule is the case here: a cylinder with two
 * hemispherical caps, which is one surface of revolution whose profile is two arcs and two lines.
 */
import { frame, WORLD, type Frame, type Vec2, type Vec3 } from "./math.ts"
import { circleProfileLoop, extrudeProfile, polygonProfileLoop, revolveProfile, type ProfileLoop } from "./sweep.ts"
import type { Brep } from "./topology.ts"
import { gearDimensions, gearOutline, type GearSpec } from "../gear.ts"

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
  return revolveProfile({ loops: [loop] }, 2 * Math.PI, {
    origin: placement.origin,
    axis: placement[direction],
    radial: direction === "x" ? placement.y : placement.x,
    name: "capsule"
  })
}

/** The volume of a capsule from its measures: the cylinder and the two hemispheres. */
export const capsuleVolume = (r: number, length: number): number => Math.PI * r * r * length + (4 / 3) * Math.PI * r * r * r

const requirePositive = (name: string, value: number): void => {
  if (!(value > 0)) throw new RangeError(`${name} must be positive, got ${value}`)
}

/** Flat washer for a nominal diameter `d`: bore `d`, outer `outerDiameter`, `thickness` thick, centred on `at`, axis Z. Exact by revolution. */
export const makeWasher = (d: number, outerDiameter: number, thickness: number, at: Vec3 = { x: 0, y: 0, z: 0 }): Brep => {
  requirePositive("washer diameter", d)
  requirePositive("washer thickness", thickness)
  if (!(outerDiameter > d)) throw new RangeError(`washer outer diameter (${outerDiameter}) must exceed its bore (${d})`)
  const loop = polygonProfileLoop([
    { x: d / 2, y: -thickness / 2 }, { x: outerDiameter / 2, y: -thickness / 2 },
    { x: outerDiameter / 2, y: thickness / 2 }, { x: d / 2, y: thickness / 2 }
  ])
  return revolveProfile({ loops: [loop] }, 2 * Math.PI, { origin: at, name: "washer" })
}

/** Volume of the washer above, closed form. */
export const washerVolume = (d: number, outerDiameter: number, thickness: number): number =>
  Math.PI * ((outerDiameter / 2) ** 2 - (d / 2) ** 2) * thickness

/** Hex nut for nominal `d`: 1.8 d across corners, 0.8 d thick, bore `d`, centred on `at`, axis Z. The same measures the mesh catalogue draws. */
export const makeNut = (d: number, at: Vec3 = { x: 0, y: 0, z: 0 }): Brep => {
  requirePositive("nut diameter", d)
  const thickness = 0.8 * d, radius = 0.9 * d
  const hex: Vec2[] = Array.from({ length: 6 }, (_, k) => ({ x: radius * Math.cos((2 * Math.PI * k) / 6), y: radius * Math.sin((2 * Math.PI * k) / 6) }))
  return extrudeProfile(
    { loops: [polygonProfileLoop(hex), circleProfileLoop({ x: 0, y: 0 }, d / 2)] },
    thickness,
    { placement: frame({ x: at.x, y: at.y, z: at.z - thickness / 2 }), name: "nut" }
  )
}

/** Volume of the nut above: hexagon minus bore, times thickness. */
export const nutVolume = (d: number): number => {
  const radius = 0.9 * d
  return ((3 * Math.sqrt(3) / 2) * radius * radius - Math.PI * (d / 2) ** 2) * 0.8 * d
}

/**
 * Bolt or screw for nominal `d` and overall `length`: round head 1.8 d across and 0.8 d high (never more than half the
 * length) on a shank of `d`, centred on its length at `at`, head up. Exact by revolution; no cosmetic thread, as drawn.
 */
export const makeBolt = (d: number, length: number, at: Vec3 = { x: 0, y: 0, z: 0 }): Brep => {
  requirePositive("bolt diameter", d)
  requirePositive("bolt length", length)
  const head = Math.min(0.8 * d, length / 2)
  const loop = polygonProfileLoop([
    { x: 0, y: -length / 2 }, { x: d / 2, y: -length / 2 }, { x: d / 2, y: length / 2 - head },
    { x: 0.9 * d, y: length / 2 - head }, { x: 0.9 * d, y: length / 2 }, { x: 0, y: length / 2 }
  ])
  return revolveProfile({ loops: [loop] }, 2 * Math.PI, { origin: at, name: "bolt" })
}

/** Volume of the bolt above: shank plus head, closed form. */
export const boltVolume = (d: number, length: number): number => {
  const head = Math.min(0.8 * d, length / 2)
  return Math.PI * (d / 2) ** 2 * (length - head) + Math.PI * (0.9 * d) ** 2 * head
}

export interface GearBrepSpec extends GearSpec {
  readonly thickness: number
  /** Bore diameter; 0 or omitted leaves the gear solid. */
  readonly holeDiameter?: number
}

/**
 * Spur gear as an exact solid: the involute outline of `gear.ts` extruded `thickness`, centred on `at`, bore cut when
 * given. The flanks are planar chords of the involute at the sampling the mesh catalogue draws (8 points a flank),
 * declared like the faceted helicoid of a modelled thread: the axial widths and pitch are exact, the flank is the
 * chord polygon, and `gearVolume` is that polygon's volume, not the true involute's.
 */
export const makeGear = (spec: GearBrepSpec, at: Vec3 = { x: 0, y: 0, z: 0 }): Brep => {
  requirePositive("gear thickness", spec.thickness)
  const outline = gearOutline(spec)
  const bore = spec.holeDiameter ?? 0
  if (!(bore >= 0)) throw new RangeError(`gear bore must not be negative, got ${bore}`)
  if (bore > 0 && bore / 2 >= gearDimensions(spec).rootRadius) {
    throw new RangeError(`gear bore (${bore}) must be smaller than the root circle (${(2 * gearDimensions(spec).rootRadius).toFixed(2)} mm)`)
  }
  const loops: ProfileLoop[] = [polygonProfileLoop(outline)]
  if (bore > 0) loops.push(circleProfileLoop({ x: 0, y: 0 }, bore / 2))
  return extrudeProfile({ loops }, spec.thickness, { placement: frame({ x: at.x, y: at.y, z: at.z - spec.thickness / 2 }), name: "gear" })
}

/** Volume of the gear above: outline polygon area (shoelace) minus bore, times thickness. */
export const gearVolume = (spec: GearBrepSpec): number => {
  const outline = gearOutline(spec)
  let twice = 0
  outline.forEach((p, i) => { const q = outline[(i + 1) % outline.length]!; twice += p.x * q.y - q.x * p.y })
  const bore = spec.holeDiameter ?? 0
  return (Math.abs(twice) / 2 - (bore > 0 ? Math.PI * (bore / 2) ** 2 : 0)) * spec.thickness
}

/** The centre of a capsule: its bounding box is symmetric about it. */
export const capsuleCentre = (at: Vec3): Vec3 => ({ x: at.x, y: at.y, z: at.z })

/** The frame a capsule stands on: the placement's axes, its origin at `at`. */
export const capsuleFrame = (at: Vec3): Frame => frame(at)
