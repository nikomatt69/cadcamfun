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
 *   ball        three turns about the world x, y and z axes through `origin`, applied in that order (`rx`, `ry`, `rz`, degrees)
 *   planar      two slides (`u`, `v`) in the plane square to the axis (x and y of the frame the axis defines) and a turn `angle` about it
 *
 * Couplings tie one joint to another: a `gear` pair (the driven revolute turns `ratio` times the driver, a negative ratio for
 * two external gears turning opposite ways) and a `rack` (a revolute and a prismatic: the slide is the arc the pitch radius rolls).
 */
import { assemblyInterference, type AssemblyPart, type Interference } from "./assembly-analysis.ts"
import { compose, frame, IDENTITY, minimumDistance, normalize3, rotation, transformBrep, translation, applyPoint, applyDir, cross3, sub3, dot3, type Transform, type Vec3 } from "./brep/index.ts"

export type JointKind = "fixed" | "revolute" | "prismatic" | "cylindrical" | "ball" | "planar"

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
  /** This joint closes a loop: it is not part of the pose tree but a constraint — its origin, attached to both parts, must
   * coincide after the pose. The free tree joints are solved so it does (see `solvePose`). */
  readonly closesLoop?: boolean
}

/** A declared contact pair: the motion study reports the exact distance of the two parts at every frame. */
export interface ContactPair {
  readonly a: string
  readonly b: string
  /** Distance at or below which the pair counts as in contact, mm (default 0: touching or overlapping). */
  readonly clearance?: number
}

export type Coupling =
  | { readonly kind: "gear"; readonly driver: string; readonly driven: string; readonly ratio: number }
  | { readonly kind: "rack"; readonly pinion: string; readonly rack: string; readonly pitchRadius: number }

/** A joint's value(s): a number for revolute and prismatic, both for cylindrical. */
export type JointValue = number | { readonly angle?: number; readonly slide?: number; readonly rx?: number; readonly ry?: number; readonly rz?: number; readonly u?: number; readonly v?: number }

export interface KinematicModel {
  readonly ground: string
  readonly joints: ReadonlyArray<KJoint>
  readonly couplings?: ReadonlyArray<Coupling>
  readonly contacts?: ReadonlyArray<ContactPair>
}

export interface LimitViolation { readonly joint: string; readonly quantity: "angle" | "slide"; readonly value: number; readonly limit: number }

/** What a joint ended with: the turn and slide of a single-axis joint, the three turns of a ball, the two slides of a plane. */
export interface JointState { angle: number; slide: number; rx: number; ry: number; rz: number; u: number; v: number }

export interface Pose {
  readonly transforms: ReadonlyMap<string, Transform>
  /** The value each joint ended with, couplings applied. */
  readonly values: ReadonlyMap<string, JointState>
  readonly violations: ReadonlyArray<LimitViolation>
  readonly closure: ReadonlyArray<{ readonly joint: string; readonly positionError: number; readonly angularError: number }>
}

const RAD = Math.PI / 180

/** Checks a model: unique joint ids, every part reached from the ground once, couplings between joints of the right kind. */
export const validateKinematics = (m: KinematicModel): string | undefined => {
  const ids = new Set<string>()
  for (const j of m.joints) {
    if (ids.has(j.id)) return `joint '${j.id}' is defined twice`
    ids.add(j.id)
    if (![j.origin.x, j.origin.y, j.origin.z, j.axis.x, j.axis.y, j.axis.z].every(Number.isFinite)) return `joint '${j.id}' has non-finite geometry`
    if (j.child === m.ground && j.closesLoop !== true) return "the ground cannot be a child of the pose tree"
    for (const lim of [j.limits, j.slideLimits]) if (lim !== undefined && (!Number.isFinite(lim.min) || !Number.isFinite(lim.max) || lim.min > lim.max)) return `joint '${j.id}' has invalid limits`
    if (j.kind !== "fixed" && j.kind !== "ball" && Math.hypot(j.axis.x, j.axis.y, j.axis.z) < 1e-12) return `joint '${j.id}' has no axis`
    if (j.limits !== undefined && j.limits.min > j.limits.max) return `joint '${j.id}' has min above max`
  }
  const reached = new Set<string>([m.ground])
  for (let again = true; again;) {
    again = false
    for (const j of m.joints) if (j.closesLoop !== true && reached.has(j.parent) && !reached.has(j.child)) { reached.add(j.child); again = true }
  }
  for (const j of m.joints) {
    if (!reached.has(j.parent)) return `joint '${j.id}' hangs from '${j.parent}', which the ground does not reach`
  }
  const treeChildren = m.joints.filter((j) => j.closesLoop !== true).map((j) => j.child)
  if (new Set(treeChildren).size !== treeChildren.length) return "a part is the child of two joints (a closed loop); mark the second joint closesLoop or give it as a coupling"
  for (const j of m.joints) {
    if (j.closesLoop !== true) continue
    if (!treeChildren.includes(j.child)) return `loop joint '${j.id}': '${j.child}' has no joint of the pose tree to close against`
    if (!reached.has(j.parent)) return `loop joint '${j.id}' hangs from '${j.parent}', which the ground does not reach`
  }
  const partIds = new Set<string>([m.ground, ...m.joints.map((j) => j.child), ...m.joints.map((j) => j.parent)])
  for (const c of m.contacts ?? []) {
    if (!partIds.has(c.a) || !partIds.has(c.b)) return `a contact names a part that is not in the model ('${c.a}', '${c.b}')`
    if (c.a === c.b) return "a contact needs two different parts"
    if (c.clearance !== undefined && (!(c.clearance >= 0) || !Number.isFinite(c.clearance))) return "a contact clearance must be finite and not negative"
  }
  const byId = new Map(m.joints.map((j) => [j.id, j]))
  const coupled = new Set<string>()
  for (const c of m.couplings ?? []) {
    const a = byId.get(c.kind === "gear" ? c.driver : c.pinion), b = byId.get(c.kind === "gear" ? c.driven : c.rack)
    if (a === undefined || b === undefined) return `a ${c.kind} coupling names a joint that does not exist`
    if (c.kind === "gear" && (a.kind !== "revolute" || b.kind !== "revolute")) return "a gear couples two revolute joints"
    if (c.kind === "rack" && (a.kind !== "revolute" || b.kind !== "prismatic")) return "a rack couples a revolute joint (the pinion) and a prismatic one (the rack)"
    if (a.id === b.id || coupled.has(b.id) || a.closesLoop === true || b.closesLoop === true) return "couplings need distinct tree joints and one coupling per driven joint"
    coupled.add(b.id)
    if (c.kind === "gear" && (!Number.isFinite(c.ratio) || c.ratio === 0)) return "a gear ratio is finite and not zero"
    if (c.kind === "rack" && (!(c.pitchRadius > 0) || !Number.isFinite(c.pitchRadius))) return "the pitch radius is finite and positive"
  }
  const dependencies = new Map((m.couplings ?? []).map((c) => [c.kind === "gear" ? c.driven : c.rack, c.kind === "gear" ? c.driver : c.pinion]))
  for (const id of dependencies.keys()) {
    const path = new Set<string>()
    for (let at: string | undefined = id; at !== undefined; at = dependencies.get(at)) {
      if (path.has(at)) return "couplings form a cycle"
      path.add(at)
    }
  }
  return undefined
}

const valueOf = (j: KJoint, v: JointValue | undefined): JointState => {
  const zero: JointState = { angle: 0, slide: 0, rx: 0, ry: 0, rz: 0, u: 0, v: 0 }
  if (v === undefined) return zero
  if (typeof v === "number") return j.kind === "prismatic" ? { ...zero, slide: v } : { ...zero, angle: v }
  return { angle: v.angle ?? 0, slide: v.slide ?? 0, rx: v.rx ?? 0, ry: v.ry ?? 0, rz: v.rz ?? 0, u: v.u ?? 0, v: v.v ?? 0 }
}

/** The pose of every part for the given driver values (joints not named stay at zero). Couplings set their driven joint. */
export const solvePose = (m: KinematicModel, drivers: Readonly<Record<string, JointValue>> = {}): Pose => {
  const bad = validateKinematics(m)
  if (bad !== undefined) throw new RangeError(bad)
  const vals = new Map<string, JointState>()
  for (const [id, value] of Object.entries(drivers)) {
    if (!m.joints.some((j) => j.id === id && j.closesLoop !== true)) throw new RangeError(`driver '${id}' is not a tree joint`)
    if (!(typeof value === "number" ? [value] : Object.values(value)).every(Number.isFinite)) throw new RangeError(`driver '${id}' must be finite`)
  }
  for (const j of m.joints) vals.set(j.id, valueOf(j, drivers[j.id]))
  const couple = (values: Map<string, JointState>): void => {
    const pending = [...(m.couplings ?? [])]
    while (pending.length > 0) {
      const index = pending.findIndex((c) => !pending.some((p) => (p.kind === "gear" ? p.driven : p.rack) === (c.kind === "gear" ? c.driver : c.pinion)))
      const c = pending.splice(index, 1)[0]!
      if (c.kind === "gear") values.get(c.driven)!.angle = values.get(c.driver)!.angle * c.ratio
      else values.get(c.rack)!.slide = values.get(c.pinion)!.angle * RAD * c.pitchRadius
    }
  }
  const poseFrom = (values: Map<string, JointState>): Map<string, Transform> => {
  couple(values)
  const transforms = new Map<string, Transform>([[m.ground, IDENTITY]])
  for (let again = true; again;) {
    again = false
    for (const j of m.joints) {
      if (j.closesLoop === true) continue
      if (transforms.has(j.child) || !transforms.has(j.parent)) continue
      const v = values.get(j.id)!
      const axis = j.kind === "ball" || j.kind === "fixed" ? { x: 0, y: 0, z: 1 } : normalize3(j.axis)
      let motion: Transform = IDENTITY
      if ((j.kind === "revolute" || j.kind === "cylindrical") && v.angle !== 0) motion = rotation(axis, v.angle * RAD, j.origin)
      if ((j.kind === "prismatic" || j.kind === "cylindrical") && v.slide !== 0) motion = compose(motion, translation({ x: axis.x * v.slide, y: axis.y * v.slide, z: axis.z * v.slide }))
      if (j.kind === "ball") {
        for (const [a, deg] of [[{ x: 1, y: 0, z: 0 }, v.rx], [{ x: 0, y: 1, z: 0 }, v.ry], [{ x: 0, y: 0, z: 1 }, v.rz]] as const) if (deg !== 0) motion = compose(motion, rotation(a, deg * RAD, j.origin))
      }
      if (j.kind === "planar") {
        const f = frame(j.origin, axis)
        if (v.angle !== 0) motion = rotation(axis, v.angle * RAD, j.origin)
        if (v.u !== 0 || v.v !== 0) motion = compose(motion, translation({ x: f.x.x * v.u + f.y.x * v.v, y: f.x.y * v.u + f.y.y * v.v, z: f.x.z * v.u + f.y.z * v.v }))
      }
      // The motion is defined in the zero pose; the parent then carries the result to where it has moved.
      transforms.set(j.child, compose(motion, transforms.get(j.parent)!))
      again = true
    }
  }
  return transforms
  }
  // Closed loops: the loop joints' origins, carried by each of their two parts, must coincide. The free tree joints
  // (not driven, not coupled) are the unknowns of a Gauss-Newton solve on that residual (numeric Jacobian).
  const loops = m.joints.filter((j) => j.closesLoop === true)
  const loopErrors = (t: ReadonlyMap<string, Transform>, lj: KJoint): { position: number[]; angular: number[] } => {
    const a = t.get(lj.parent)!, b = t.get(lj.child)!
    const d = sub3(applyPoint(a, lj.origin), applyPoint(b, lj.origin))
    const f = frame(lj.origin, lj.kind === "ball" || lj.kind === "fixed" ? { x: 0, y: 0, z: 1 } : lj.axis)
    const za = applyDir(a, f.z), zb = applyDir(b, f.z)
    const axisError = sub3(za, zb)
    const xa = applyDir(a, f.x), xb = applyDir(b, f.x)
    const sideError = sub3(xa, xb)
    const position = lj.kind === "prismatic" || lj.kind === "cylindrical" ? cross3(d, zb) : lj.kind === "planar" ? { x: dot3(d, zb), y: 0, z: 0 } : d
    return { position: [position.x, position.y, position.z], angular: lj.kind === "ball" ? [] : [axisError.x, axisError.y, axisError.z, ...(lj.kind === "fixed" || lj.kind === "prismatic" ? [sideError.x, sideError.y, sideError.z] : [])] }
  }
  let transforms = poseFrom(vals)
  if (loops.length > 0) {
    const driven = new Set<string>([...Object.keys(drivers), ...(m.couplings ?? []).map((c) => (c.kind === "gear" ? c.driven : c.rack))])
    const keys = (j: KJoint): Array<keyof JointState> => j.kind === "fixed" ? [] : j.kind === "ball" ? ["rx", "ry", "rz"] : j.kind === "planar" ? ["angle", "u", "v"] : j.kind === "cylindrical" ? ["angle", "slide"] : [j.kind === "prismatic" ? "slide" : "angle"]
    const free = m.joints.filter((j) => j.closesLoop !== true && !driven.has(j.id)).flatMap((j) => keys(j).map((key) => ({ id: j.id, key })))
    const residual = (values: Map<string, JointState>): number[] => {
      const t = poseFrom(values)
      const out: number[] = []
      for (const lj of loops) {
        const error = loopErrors(t, lj)
        out.push(...error.position, ...error.angular)
      }
      return out
    }
    const norm = (r: number[]) => Math.hypot(...r)
    let r = residual(vals)
    for (let iter = 0; iter < 60 && norm(r) > 1e-7; iter++) {
      if (free.length === 0) break
      const cols: number[][] = free.map((j) => {
        const saved = vals.get(j.id)!
        const key = j.key
        const h = key === "angle" ? 1e-4 : 1e-6
        vals.set(j.id, { ...saved, [key]: saved[key] + h })
        const rp = residual(vals)
        vals.set(j.id, saved)
        couple(vals)
        return rp.map((v, i) => (v - r[i]!) / h)
      })
      // Normal equations (J^T J + 1e-9 I) d = -J^T r, solved by Gaussian elimination.
      const n = free.length
      const A: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, k) => cols[i]!.reduce((s, v, row) => s + v * cols[k]![row]!, 0) + (i === k ? 1e-9 : 0)))
      const g: number[] = cols.map((c) => -c.reduce((s, v, row) => s + v * r[row]!, 0))
      for (let i = 0; i < n; i++) {
        let piv = i
        for (let k = i + 1; k < n; k++) if (Math.abs(A[k]![i]!) > Math.abs(A[piv]![i]!)) piv = k
        if (piv !== i) { const tA = A[i]!; A[i] = A[piv]!; A[piv] = tA; const tg = g[i]!; g[i] = g[piv]!; g[piv] = tg }
        for (let k = i + 1; k < n; k++) {
          const f = (A[k]![i] ?? 0) / (A[i]![i] || 1e-12)
          for (let c = i; c < n; c++) A[k]![c] = A[k]![c]! - f * A[i]![c]!
          g[k] = g[k]! - f * g[i]!
        }
      }
      const d = new Array<number>(n).fill(0)
      for (let i = n - 1; i >= 0; i--) d[i] = (g[i]! - A[i]!.reduce((s, v, c) => (c > i ? s + v * d[c]! : s), 0)) / (A[i]![i] || 1e-12)
      const before = new Map([...vals].map(([id, value]) => [id, { ...value }]))
      let accepted = false
      for (let alpha = 1; alpha >= 1 / 128; alpha /= 2) {
        for (const [id, value] of before) vals.set(id, { ...value })
        free.forEach((j, i) => {
          const step = alpha * Math.max(-10, Math.min(10, d[i]!))
          vals.set(j.id, { ...vals.get(j.id)!, [j.key]: vals.get(j.id)![j.key] + step })
        })
        const next = residual(vals)
        if (norm(next) < norm(r)) { r = next; accepted = true; break }
      }
      if (!accepted) { for (const [id, value] of before) vals.set(id, value); break }
    }
    if (!Number.isFinite(norm(r)) || norm(r) > 1e-6) throw new RangeError(`the loop does not close: residual ${norm(r).toExponential(4)} (position in mm, axis error dimensionless; free joints: ${free.map((j) => `${j.id}.${j.key}`).join(", ") || "none"})`)
    transforms = poseFrom(vals)
  }
  const violations: LimitViolation[] = []
  for (const j of m.joints) {
    if (j.closesLoop === true) continue
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
  return { transforms, values: vals, violations, closure: loops.map((lj) => { const e = loopErrors(transforms, lj); return { joint: lj.id, positionError: Math.hypot(...e.position), angularError: Math.hypot(...e.angular) } }) }
}

export interface ContactState { readonly a: string; readonly b: string; readonly distance: number; readonly overlap: boolean; readonly inContact: boolean; readonly penetrating: boolean; readonly clearanceViolated: boolean }

export interface MotionFrame {
  readonly value: number
  readonly violations: ReadonlyArray<LimitViolation>
  readonly clashes: ReadonlyArray<Interference>
  /** Exact distances of the model's declared contact pairs at this frame. */
  readonly contacts: ReadonlyArray<ContactState>
  readonly closure: Pose["closure"]
  readonly jointValues: Readonly<Record<string, JointState>>
}

export interface MotionStudy {
  readonly frames: ReadonlyArray<MotionFrame>
  /** The first frame with a clash, or undefined. */
  readonly firstClash: MotionFrame | undefined
  /** The first frame outside a joint limit, or undefined. */
  readonly firstViolation: MotionFrame | undefined
  /** The first frame where a declared contact pair is at or under its clearance, or undefined. */
  readonly firstContact: MotionFrame | undefined
  readonly firstContactViolation: MotionFrame | undefined
}

/**
 * Drives joint `driver` from `from` to `to` in `steps` equal steps and checks the solids at each: limits, and the exact clash of
 * every pair of parts (pairs the caller declares `expected` do not count). The ground part is in `parts` with the others.
 */
export const motionStudy = (
  parts: ReadonlyArray<AssemblyPart>,
  model: KinematicModel,
  driver: { readonly joint: string; readonly from: number; readonly to: number; readonly steps: number; readonly quantity?: keyof JointState },
  options: { readonly expected?: (a: string, b: string) => boolean; readonly others?: Readonly<Record<string, JointValue>> } = {}
): MotionStudy => {
  const j = model.joints.find((x) => x.id === driver.joint)
  if (j === undefined) throw new RangeError(`no joint '${driver.joint}'`)
  if (![driver.from, driver.to].every(Number.isFinite)) throw new RangeError("motion sweep values must be finite")
  const quantities: ReadonlyArray<keyof JointState> = j.kind === "fixed" ? [] : j.kind === "ball" ? ["rx", "ry", "rz"] : j.kind === "planar" ? ["angle", "u", "v"] : j.kind === "cylindrical" ? ["angle", "slide"] : [j.kind === "prismatic" ? "slide" : "angle"]
  const quantity = driver.quantity ?? quantities[0]
  if (quantity === undefined || !quantities.includes(quantity)) throw new RangeError(`joint '${j.id}' cannot drive '${driver.quantity ?? "fixed"}'`)
  const partIds = new Set(parts.map((p) => p.id))
  if (partIds.size !== parts.length) throw new RangeError("motion parts need unique ids")
  for (const contact of model.contacts ?? []) if (!partIds.has(contact.a) || !partIds.has(contact.b)) throw new RangeError("a contact part is absent from the motion study")
  if (!Number.isInteger(driver.steps) || driver.steps < 1) throw new RangeError("a motion study needs at least one step")
  const frames: MotionFrame[] = []
  for (let k = 0; k <= driver.steps; k++) {
    const value = driver.from + ((driver.to - driver.from) * k) / driver.steps
    const rest = options.others?.[j.id]
    const pose = solvePose(model, { ...(options.others ?? {}), [j.id]: { ...(typeof rest === "object" ? rest : {}), [quantity]: value } })
    const moved = parts.map((p) => {
      const tr = pose.transforms.get(p.id)
      return tr === undefined ? p : { ...p, brep: transformBrep(p.brep, tr) }
    })
    const report = assemblyInterference(moved, { expected: (a, b) => (options.expected?.(a, b) === true ? "declared" : undefined) })
    const byId = new Map(moved.map((p) => [p.id, p] as const))
    const contacts: ContactState[] = (model.contacts ?? []).flatMap((c) => {
      const pa = byId.get(c.a), pb = byId.get(c.b)
      if (pa === undefined || pb === undefined) return []
      const d = minimumDistance(pa.brep, pb.brep)
      const penetrating = report.interferences.some((i) => i.volume > 1e-9 && ((i.a === c.a && i.b === c.b) || (i.a === c.b && i.b === c.a)))
      return [{ a: c.a, b: c.b, distance: d.distance, overlap: d.overlap, inContact: d.overlap || d.distance <= (c.clearance ?? 0), penetrating, clearanceViolated: penetrating || d.distance < (c.clearance ?? 0) - 1e-6 }]
    })
    frames.push({ value, violations: pose.violations, clashes: report.interferences.filter((i) => i.kind === "clash"), contacts, closure: pose.closure, jointValues: Object.fromEntries(pose.values) })
  }
  return { frames, firstClash: frames.find((f) => f.clashes.length > 0), firstViolation: frames.find((f) => f.violations.length > 0), firstContact: frames.find((f) => f.contacts.some((c) => c.inContact)), firstContactViolation: frames.find((f) => f.contacts.some((c) => c.clearanceViolated)) }
}

/** The world position of a point attached to a part after the pose (for a report or a trace). */
export const poseOfPoint = (pose: Pose, part: string, p: Vec3): Vec3 => applyPoint(pose.transforms.get(part) ?? IDENTITY, p)
