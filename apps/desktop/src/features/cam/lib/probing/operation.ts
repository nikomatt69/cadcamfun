/**
 * A probe operation as the panel keeps it (spec 73 §4): the cycle in its wire units, what to do with the result (update mode,
 * work offset, tolerance), the inspection checks, a tilted plane for 5-axis probing and the figures it overrides. It is plain JSON
 * (it is stored on the element toolpath and persisted), and `operationWire` turns it into the wire record the sidecar plans.
 */
import { parseOffsetRef, probing, type Characteristic, type ProbeAction, type ProbeCycleKind, type ProbeRoutine, type ProbeSettings, type UpdateMode, type WorkOffsetRef } from "./contract.ts"
import { cycleOfSpec, defaultSpecOf, wireOf, type CycleSpec } from "./cycle-fields.ts"
import { contextOf, resolveSettings, type ProbeOverrides, type ResolveInput } from "./resolve.ts"
import type { ProbingDefaults } from "../../../../shared/state/settings.ts"

/** A tilted probing plane, degrees (the machine's A / B / C of the plane the cycle runs in). */
export interface TiltedFrame { readonly a: number; readonly b: number; readonly c: number }

export type CheckKind = "size" | "position" | "true-position" | "flatness" | "angle"

/** One characteristic in wire units (mm; an angle's nominal and limits in degrees). */
export interface CheckSpec {
  readonly name: string
  readonly kind: CheckKind
  readonly result: string
  readonly result2?: string
  readonly nominal: number
  readonly nominal2?: number
  readonly lower: number
  readonly upper: number
}

export type OffsetFollow = "X" | "Y" | "Z" | "R"

export interface ProbeOperation {
  readonly name: string
  readonly cycle: CycleSpec
  readonly updateMode: UpdateMode
  /** The work offset the cycle updates (`G54`, `G54.1 P3`, `G505`...). */
  readonly workOffset: string
  /** mm: the band of the two tolerance modes. */
  readonly tolerance: number
  /** mm: a correction smaller than this is not written. */
  readonly deadband: number
  /** mm: a correction larger than this is an alarm (a wrong datum). */
  readonly limit: number
  /** The offset axes the result moves (R: the rotation, through the offset's rotation). */
  readonly follow: ReadonlyArray<OffsetFollow>
  readonly frame?: TiltedFrame
  readonly checks: ReadonlyArray<CheckSpec>
  readonly overrides: ProbeOverrides
  /** Write the control's own cycle instead of the inline touches. */
  readonly native?: boolean
  /** The control the program is written for (a post id); absent: the machine's own. */
  readonly dialect?: string
}

/** Which offset axes a cycle's results can move. */
const FOLLOW: Readonly<Partial<Record<ProbeCycleKind, ReadonlyArray<OffsetFollow>>>> = {
  "z-surface": ["Z"], edge: ["X", "Y"], corner: ["X", "Y", "R"], web: ["X", "Y"], pocket: ["X", "Y"], rectangle: ["X", "Y"],
  bore: ["X", "Y"], boss: ["X", "Y"], "edge-angle": ["R"], plane: ["Z"], sphere: ["X", "Y", "Z"]
}

/** The kinds that move a work offset (the others measure a tool or the machine). */
export const movesOffset = (kind: ProbeCycleKind): boolean => FOLLOW[kind] !== undefined
export const followOf = (kind: ProbeCycleKind): ReadonlyArray<OffsetFollow> => FOLLOW[kind] ?? []

/** A new operation of `kind`, with the defaults of Settings > Machining. */
export const defaultOperation = (kind: ProbeCycleKind, defaults: ProbingDefaults, options: { readonly at?: { readonly x: number; readonly y: number }; readonly inspect?: boolean; readonly name?: string } = {}): ProbeOperation => ({
  name: options.name ?? kind,
  cycle: defaultSpecOf(kind, options.at),
  updateMode: options.inspect === true ? "report" : movesOffset(kind) ? defaults.defaultUpdateMode : "report",
  workOffset: defaults.defaultWorkOffset,
  tolerance: defaults.defaultTolerance,
  deadband: 0.001,
  limit: 5,
  follow: followOf(kind),
  checks: [],
  overrides: {}
})

const CHECK_KIND: Readonly<Record<string, CheckKind>> = {
  x: "position", y: "position", z: "position", diameter: "size", width: "size", sizeX: "size", sizeY: "size", flatness: "flatness",
  angle: "angle", rotation: "angle", tiltA: "angle", tiltB: "angle", radius: "size", s: "position"
}
/** The results an inspection reads by default: the measured sizes, the angles and the flatness (positions only when asked for). */
const INSPECT_BY_DEFAULT = new Set(["diameter", "width", "sizeX", "sizeY", "flatness", "angle", "rotation", "tiltA", "tiltB", "z"])

/** The figures a cycle measures, with their nominal values: from the core planner (`planLocal`). */
export const resultsOf = (routine: ProbeRoutine): ReadonlyArray<{ readonly name: string; readonly nominal: number; readonly unit: "mm" | "deg"; readonly kind: CheckKind }> =>
  Object.keys(routine.nominal).map((name) => ({ name, nominal: routine.nominal[name]!, unit: routine.units[name] ?? "mm", kind: CHECK_KIND[name] ?? "size" }))

/** One characteristic for each result the cycle measures that an inspection reads, nominal from the drawn cycle, limits ± `tolerance`. */
export const defaultChecks = (routine: ProbeRoutine, tolerance: number): ReadonlyArray<CheckSpec> =>
  resultsOf(routine).filter((r) => INSPECT_BY_DEFAULT.has(r.name)).map((r) => ({
    name: r.name, kind: r.kind, result: r.name, nominal: r.nominal,
    lower: r.kind === "flatness" ? 0 : r.unit === "deg" ? -tolerance : -tolerance, upper: tolerance
  }))

export type LocalPlan = { readonly ok: true; readonly routine: ProbeRoutine; readonly settings: ProbeSettings } | { readonly ok: false; readonly reason: string }

/**
 * Plans the cycle in this process with the resolved settings: the contacts the program will make, the results it computes and
 * their nominal values. The sidecar plans the same cycle for the program text; this is the instant answer the editor shows while
 * a figure is typed (the core refuses what it refuses: a stylus that does not fit, collinear points).
 */
export const planLocal = (op: ProbeOperation, input: ResolveInput): LocalPlan => {
  const decoded = cycleOfSpec(op.cycle)
  if (!decoded.ok) return { ok: false, reason: decoded.issues[0] ?? "invalid cycle" }
  const settings = resolveSettings({ ...input, overrides: op.overrides, workOffset: op.workOffset })
  const planned = probing.planProbeCycle(decoded.cycle, contextOf(settings, input))
  return "refused" in planned ? { ok: false, reason: planned.refused } : { ok: true, routine: planned, settings }
}

/** The offset axes a set-offset follows, each reading the cycle result of the same letter (`X` reads `x`). */
const axesOf = (follow: ReadonlyArray<OffsetFollow>): Partial<Record<"X" | "Y" | "Z", string>> => {
  const out: Partial<Record<"X" | "Y" | "Z", string>> = {}
  for (const axis of follow) if (axis !== "R") out[axis] = axis.toLowerCase()
  return out
}

/** The wire of a work-offset reference (`{kind: "g5x", code: "G54"}`), or the reason the key is not an offset. */
export const refWire = (key: string): WorkOffsetRef | undefined => parseOffsetRef(key)

/** The wire actions of an operation: set the offset (and its rotation), then inspect. Absent actions: a pure measurement. */
export const actionsOf = (op: ProbeOperation): ReadonlyArray<Record<string, unknown>> => {
  const out: Array<Record<string, unknown>> = []
  const ref = refWire(op.workOffset)
  const kind = op.cycle.kind
  const policy = (angular: boolean): Record<string, unknown> => ({
    mode: op.updateMode,
    ...(op.updateMode === "update-within-tolerance" || op.updateMode === "alarm-outside-tolerance" ? (angular ? { angleTolerance: op.tolerance } : { tolerance: op.tolerance }) : {}),
    ...(op.deadband > 0 ? { deadband: op.deadband } : {}),
    ...(op.limit > 0 ? { limit: op.limit } : {})
  })
  if (ref !== undefined && movesOffset(kind)) {
    const axes = axesOf(op.follow)
    if (Object.keys(axes).length > 0) out.push({ kind: "set-offset", ref, axes, policy: policy(false) })
    if (op.follow.includes("R")) {
      const result = kind === "edge-angle" ? "angle" : "rotation"
      out.push({ kind: "rotation", result, via: "offset-r", ref, policy: policy(true) })
    }
  }
  if (kind === "tool-length" || kind === "tool-radius") {
    const tool = (op.cycle as { tool?: number }).tool ?? 1
    out.push({ kind: "tool-offset", tool, quantity: kind === "tool-length" ? "length" : "radius", result: kind === "tool-length" ? "length" : "radius", part: "geometry" })
  }
  if (op.checks.length > 0) out.push({ kind: "inspect", characteristics: op.checks, onFail: "flag", flag: "fail" })
  return out
}

/** The probe operation fields of the wire (`ProbeOperationFields`): the cycle with its unit vectors, the actions and the overrides. */
export const operationWire = (op: ProbeOperation): Record<string, unknown> => ({
  cycle: cycleWire(op.cycle),
  ...(actionsOf(op).length > 0 ? { actions: actionsOf(op) } : {}),
  ...(op.overrides.search !== undefined ? { search: op.overrides.search } : {}),
  ...(op.overrides.clearance !== undefined ? { clearance: op.overrides.clearance } : {}),
  ...(op.overrides.doubleTouch !== undefined ? { doubleTouch: op.overrides.doubleTouch } : {}),
  ...(op.native === true ? { native: true } : {})
})

export const cycleWire = (spec: CycleSpec): Record<string, unknown> => wireOf(spec)

/** The problems of an operation the panel can name before it asks the sidecar: the core's cycle refusals, a bad offset, a bad policy. */
export const operationIssues = (op: ProbeOperation): ReadonlyArray<string> => {
  const issues: string[] = []
  const decoded = cycleOfSpec(op.cycle)
  if (!decoded.ok) issues.push(...decoded.issues)
  if (movesOffset(op.cycle.kind) && refWire(op.workOffset) === undefined) issues.push(`'${op.workOffset}' is not a work offset`)
  const needsTolerance = op.updateMode === "update-within-tolerance" || op.updateMode === "alarm-outside-tolerance"
  if (needsTolerance && !(op.tolerance > 0)) issues.push(`the update mode '${op.updateMode}' needs a tolerance`)
  for (const check of op.checks) if (check.lower > check.upper) issues.push(`${check.name}: the lower limit is above the upper limit`)
  return issues
}

/** The characteristic of a check in the core's record (for the same evaluation the sidecar runs). */
export const characteristicOf = (c: CheckSpec): Characteristic => {
  const DEG = Math.PI / 180
  return c.kind === "angle" ? { ...c, nominal: c.nominal * DEG, lower: c.lower * DEG, upper: c.upper * DEG } : c
}

export type { ProbeAction }
