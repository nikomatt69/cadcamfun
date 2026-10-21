/**
 * Assembly kinematics: joints with limits, gear and rack couplings, a forward solver over the joint tree and a motion study that
 * moves the exact solids and looks for clashes along the way (Fusion's Motion Study / Contact Sets). Joints are given where they
 * are in the assembly as drawn (the zero pose): the origin and axis are world coordinates of that pose, and a part's pose is the
 * rigid transform that takes it from the zero pose to where the joint values put it.
 *
 *   fixed       no motion
 *   revolute    a turn about the axis through `origin`, degrees
 *   prismatic   a slide along the axis, mm
 *   cylindrical turn and slide along the same axis (two values: `angle`, `slide`)
 *
 * Couplings tie one joint to another: a `gear` pair (the driven revolute turns `ratio` times the driver, a negative ratio for
 * two external gears turning opposite ways) and a `rack` (a revolute and a prismatic: the slide is the arc the pitch radius rolls).
 */
import { assemblyInterference, type AssemblyPart, type Interference } from "./assembly-analysis.ts"
import { compose, IDENTITY, normalize3, rotation, transformBrep, translation, applyPoint, type Transform, type Vec3 } from "./brep/index.ts"

export type JointKind = "fixed" | "revolute" | "prismatic" | "cylindrical"

export interface KJoint {
  readonly id: string
  readonly parent: string
  readonly child: string
  readonly kind: JointKind
  readonly origin: Vec3
  readonly axis: Vec3
  /** Limits of the joint's value (degrees for a turn, mm for a slide); a cylindrical joint limits `angle` here and `slideLimits` its slide. */
  readonly limits?: { readonly min: number; readonly max: number }
  readonly slideLimits?: { readonly min: number; readonly max: number }
}

export type Coupling =
  | { readonly kind: "gear"; readonly driver: string; readonly driven: string; readonly ratio: number }
  | { readonly kind: "rack"; readonly pinion: string; readonly rack: string; readonly pitchRadius: number }

/** A joint's value(s): a number for revolute and prismatic, both for cylindrical. */
export type JointValue = number | { readonly angle?: number; readonly slide?: number }

export interface KinematicModel {
  readonly ground: string
  readonly joints: ReadonlyArray<KJoint>
  readonly couplings?: ReadonlyArray<Coupling>
}

export interface LimitViolation { readonly joint: string; readonly quantity: "angle" | "slide"; readonly value: number; readonly limit: number }

export interface Pose {
  readonly transforms: ReadonlyMap<string, Transform>
  /** The value each joint ended with, couplings applied. */
  readonly values: ReadonlyMap<string, { readonly angle: number; readonly slide: number }>
  readonly violations: ReadonlyArray<LimitViolation>
}

const RAD = Math.PI / 180

/** Checks a model: unique joint ids, every part reached from the ground once, couplings between joints of the right kind. */
export const validateKinematics = (m: KinematicModel): string | undefined => {
  const ids = new Set<string>()
  for (const j of m.joints) {
    if (ids.has(j.id)) return `joint '${j.id}' is defined twice`
    ids.add(j.id)
    if (j.kind !== "fixed" && Math.hypot(j.axis.x, j.axis.y, j.axis.z) < 1e-12) return `joint '${j.id}' has no axis`
    if (j.limits !== undefined && j.limits.min > j.limits.max) return `joint '${j.id}' has min above max`
  }
  const reached = new Set<string>([m.ground])
  for (let again = true; again;) {
    again = false
    for (const j of m.joints) if (reached.has(j.parent) && !reached.has(j.child)) { reached.add(j.child); again = true }
  }
  for (const j of m.joints) {
    if (!reached.has(j.parent)) return `joint '${j.id}' hangs from '${j.parent}', which the ground does not reach`
  }
  const children = m.joints.map((j) => j.child)
  if (new Set(children).size !== children.length) return "a part is the child of two joints (a closed loop); give the second as a coupling or leave it out"
  const byId = new Map(m.joints.map((j) => [j.id, j]))
  for (const c of m.couplings ?? []) {
    const a = byId.get(c.kind === "gear" ? c.driver : c.pinion), b = byId.get(c.kind === "gear" ? c.driven : c.rack)
    if (a === undefined || b === undefined) return `a ${c.kind} coupling names a joint that does not exist`
    if (c.kind === "gear" && (a.kind !== "revolute" || b.kind !== "revolute")) return "a gear couples two revolute joints"
    if (c.kind === "rack" && (a.kind !== "revolute" || b.kind !== "prismatic")) return "a rack couples a revolute joint (the pinion) and a prismatic one (the rack)"
    if (c.kind === "gear" && (!Number.isFinite(c.ratio) || c.ratio === 0)) return "a gear ratio is finite and not zero"
    if (c.kind === "rack" && !(c.pitchRadius > 0)) return "the pitch radius is positive"
  }
  return undefined
}

const valueOf = (j: KJoint, v: JointValue | undefined): { angle: number; slide: number } => {
  if (v === undefined) return { angle: 0, slide: 0 }
  if (typeof v === "number") return j.kind === "prismatic" ? { angle: 0, slide: v } : { angle: v, slide: 0 }
  return { angle: v.angle ?? 0, slide: v.slide ?? 0 }
}

/** The pose of every part for the given driver values (joints not named stay at zero). Couplings set their driven joint. */
export const solvePose = (m: KinematicModel, drivers: Readonly<Record<string, JointValue>> = {}): Pose => {
  const bad = validateKinematics(m)
  if (bad !== undefined) throw new RangeError(bad)
  const vals = new Map<string, { angle: number; slide: number }>()
  for (const j of m.joints) vals.set(j.id, valueOf(j, drivers[j.id]))
  for (const c of m.couplings ?? []) {
    if (c.kind === "gear") vals.get(c.driven)!.angle = vals.get(c.driver)!.angle * c.ratio
    else vals.get(c.rack)!.slide = vals.get(c.pinion)!.angle * RAD * c.pitchRadius
  }
  const violations: LimitViolation[] = []
  for (const j of m.joints) {
    const v = vals.get(j.id)!
    const check = (q: "angle" | "slide", lim: { min: number; max: number } | undefined, x: number) => {
      if (lim === undefined) return
      if (x < lim.min - 1e-9) violations.push({ joint: j.id, quantity: q, value: x, limit: lim.min })
      else if (x > lim.max + 1e-9) violations.push({ joint: j.id, quantity: q, value: x, limit: lim.max })
    }
    if (j.kind === "revolute") check("angle", j.limits, v.angle)
    else if (j.kind === "prismatic") check("slide", j.limits, v.slide)
    else if (j.kind === "cylindrical") { check("angle", j.limits, v.angle); check("slide", j.slideLimits, v.slide) }
  }
  const transforms = new Map<string, Transform>([[m.ground, IDENTITY]])
  for (let again = true; again;) {
    again = false
    for (const j of m.joints) {
      if (transforms.has(j.child) || !transforms.has(j.parent)) continue
      const v = vals.get(j.id)!
      const axis = normalize3(j.axis)
      let motion: Transform = IDENTITY
      if ((j.kind === "revolute" || j.kind === "cylindrical") && v.angle !== 0) motion = rotation(axis, v.angle * RAD, j.origin)
      if ((j.kind === "prismatic" || j.kind === "cylindrical") && v.slide !== 0) motion = compose(motion, translation({ x: axis.x * v.slide, y: axis.y * v.slide, z: axis.z * v.slide }))
      // The motion is defined in the zero pose; the parent then carries the result to where it has moved.
      transforms.set(j.child, compose(motion, transforms.get(j.parent)!))
      again = true
    }
  }
  return { transforms, values: vals, violations }
}

export interface MotionFrame {
  readonly value: number
  readonly violations: ReadonlyArray<LimitViolation>
  readonly clashes: ReadonlyArray<Interference>
}

export interface MotionStudy {
  readonly frames: ReadonlyArray<MotionFrame>
  /** The first frame with a clash, or undefined. */
  readonly firstClash: MotionFrame | undefined
  /** The first frame outside a joint limit, or undefined. */
  readonly firstViolation: MotionFrame | undefined
}

/**
 * Drives joint `driver` from `from` to `to` in `steps` equal steps and checks the solids at each: limits, and the exact clash of
 * every pair of parts (pairs the caller declares `expected` do not count). The ground part is in `parts` with the others.
 */
export const motionStudy = (
  parts: ReadonlyArray<AssemblyPart>,
  model: KinematicModel,
  driver: { readonly joint: string; readonly from: number; readonly to: number; readonly steps: number; readonly quantity?: "angle" | "slide" },
  options: { readonly expected?: (a: string, b: string) => boolean; readonly others?: Readonly<Record<string, JointValue>> } = {}
): MotionStudy => {
  const j = model.joints.find((x) => x.id === driver.joint)
  if (j === undefined) throw new RangeError(`no joint '${driver.joint}'`)
  if (!Number.isInteger(driver.steps) || driver.steps < 1) throw new RangeError("a motion study needs at least one step")
  const frames: MotionFrame[] = []
  for (let k = 0; k <= driver.steps; k++) {
    const value = driver.from + ((driver.to - driver.from) * k) / driver.steps
    const q = driver.quantity ?? (j.kind === "prismatic" ? "slide" : "angle")
    const pose = solvePose(model, { ...(options.others ?? {}), [j.id]: j.kind === "cylindrical" ? (q === "slide" ? { slide: value } : { angle: value }) : value })
    const moved = parts.map((p) => {
      const tr = pose.transforms.get(p.id)
      return tr === undefined ? p : { ...p, brep: transformBrep(p.brep, tr) }
    })
    const report = assemblyInterference(moved, { expected: (a, b) => (options.expected?.(a, b) === true ? "declared" : undefined) })
    frames.push({ value, violations: pose.violations, clashes: report.interferences.filter((i) => i.kind === "clash") })
  }
  return { frames, firstClash: frames.find((f) => f.clashes.length > 0), firstViolation: frames.find((f) => f.violations.length > 0) }
}

/** The world position of a point attached to a part after the pose (for a report or a trace). */
export const poseOfPoint = (pose: Pose, part: string, p: Vec3): Vec3 => applyPoint(pose.transforms.get(part) ?? IDENTITY, p)
