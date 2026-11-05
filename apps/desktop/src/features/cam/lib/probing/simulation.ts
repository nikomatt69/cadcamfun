/**
 * The sidecar's probing answers in the panel's records (spec 73 §4): the request a cycle sends (its settings resolved the same way the
 * editor shows them, the core records the typed client encodes) and a `CamProbingSimulation` read back as the `ProbeRunResult` the
 * inspection list and the 3D overlay use. The wire carries degrees; the run record is in core units, like a local run.
 */
import type { CamProbingFrame, CamProbingSettingsInput, CamProbingSimulation, CamRotaryCalibrationResult } from "@cadcamfun/api"
import { Schema } from "effect"
import { parseOffsetRef, probing, type InspectionVerdict, type MachineRotaryCalibration, type OffsetAxis, type ProbeAction, type ProbeContact, type ProbeSimOutcome, type ProbeSimUpdate, type MachineProbing } from "./contract.ts"
import { cycleOfSpec } from "./cycle-fields.ts"
import { actionsOf, characteristicOf, type ProbeOperation } from "./operation.ts"
import { resolveSettings, type ResolveInput } from "./resolve.ts"
import { fingerprintOf, verdictOfRun, type ProbeRunResult } from "./result.ts"

const DEG = Math.PI / 180

export interface OperationRequest {
  readonly operation: import("./contract.ts").ProbeCycle
  readonly settings: CamProbingSettingsInput
  readonly frame?: CamProbingFrame
  readonly actions?: ReadonlyArray<ProbeAction>
  readonly checks?: ReadonlyArray<import("./contract.ts").Characteristic>
}

/** The request of an operation, or why the core refuses it. `machineConfig` names a stored machine: the sidecar reads its probe and setter. */
export const requestOf = (op: ProbeOperation, input: ResolveInput & { readonly machineConfig?: string | undefined }): OperationRequest | { readonly refused: string } => {
  const decoded = cycleOfSpec(op.cycle)
  if (!decoded.ok) return { refused: decoded.issues[0] ?? "invalid cycle" }
  const s = resolveSettings({ ...input, overrides: op.overrides, workOffset: op.workOffset })
  const settings: CamProbingSettingsInput = {
    stylusDiameter: s.stylusDiameter, feed: s.feed, fastFeed: s.fastFeed, positioningFeed: s.positioningFeed, search: s.search, clearance: s.clearance, safeZ: s.safeZ,
    overtravel: s.overtravel, backoff: s.backoff, doubleTouch: s.doubleTouch, workOffset: op.workOffset,
    ...(s.toolNumber !== undefined ? { toolNumber: s.toolNumber } : {}), ...(s.effectiveRadius !== undefined ? { effectiveRadius: s.effectiveRadius } : {}),
    ...(s.orientSpindle !== undefined ? { orientSpindle: s.orientSpindle / DEG } : {}),
    ...(input.machineConfig !== undefined ? { machineConfig: input.machineConfig } : {})
  }
  // The inspect action of the wire list is sent as `checks`: the sidecar compiles both the same way and records the characteristics.
  const actions = Schema.decodeUnknownSync(Schema.Array(probing.ProbeActionSchema))(actionsOf(op).filter((a) => a["kind"] !== "inspect"))
  return {
    operation: decoded.cycle, settings,
    ...(op.frame !== undefined ? { frame: op.frame } : {}),
    ...(actions.length > 0 ? { actions } : {}),
    ...(op.checks.length > 0 ? { checks: op.checks.map(characteristicOf) } : {})
  }
}

const angular = (axis: string): boolean => axis === "A" || axis === "B" || axis === "C" || axis === "R"

/** A simulated report read as a run of one operation; `expected` are the planned touches (the overlay's deviation arrows). */
export const resultOfSimulation = (sim: CamProbingSimulation, input: {
  readonly operationId: string; readonly operation: ProbeOperation; readonly expected: ReadonlyArray<ProbeContact>
  readonly runId?: string; readonly programHash?: string; readonly at?: string
}): ProbeRunResult => {
  const { report } = sim
  const run = report.operations[0]
  const updates: ProbeSimUpdate[] = report.updates.flatMap((u) => {
    const ref = parseOffsetRef(u.offset)
    if (ref === undefined) return []
    const k = angular(u.axis) ? DEG : 1
    return [{ ref, axis: u.axis as OffsetAxis, before: u.before * k, after: u.after * k }]
  })
  const verdicts: ReadonlyArray<InspectionVerdict> = report.checks.map((c) => {
    const k = c.kind === "angle" ? DEG : 1
    return { name: c.name, kind: c.kind, measured: c.measured * k, nominal: c.nominal * k, deviation: c.deviation * k, lower: c.lower * k, upper: c.upper * k, pass: c.status !== "fail" }
  })
  const results = Object.fromEntries(Object.entries(run?.results ?? {}).map(([name, value]) => [name, run?.units[name] === "deg" ? value * DEG : value]))
  const outcome: ProbeSimOutcome = {
    contacts: (run?.contacts ?? []).map((c, moveIndex) => ({ ...(c.name !== undefined ? { name: c.name } : {}), tip: c.tip, moveIndex, ...(c.line !== undefined ? { line: c.line } : {}) })),
    variables: {}, results, updates, tools: report.tools.map((t) => ({ tool: t.tool, quantity: t.quantity, part: t.part, before: t.before, after: t.after })),
    offsets: Object.fromEntries(Object.entries(sim.offsetTable ?? report.offsets).map(([key, e]) => [key, probing.offsetEntryFromWire(e)])),
    inspections: verdicts, alarms: (run?.alarms ?? []).map((a, moveIndex) => ({ code: a.code, text: a.text, moveIndex, ...(a.line !== undefined ? { line: a.line } : {}) })),
    reports: [], ...(run?.stopped !== undefined ? { stopped: run.stopped } : {}), path: []
  }
  return {
    operationId: input.operationId, source: "simulated", outcome, expected: input.expected, verdicts, verdict: report.verdict, measuredAt: input.at ?? new Date().toISOString(),
    workOffset: input.operation.workOffset, fingerprint: fingerprintOf(input.operation),
    ...(input.runId !== undefined ? { runId: input.runId } : {}), ...(input.programHash !== undefined ? { programHash: input.programHash } : {})
  }
}

/** A rotary calibration read as a run: the ball's centre at each angle in `cal_<i>_*` (what the overlay draws). */
export const resultOfCalibration = (out: CamRotaryCalibrationResult, input: { readonly operationId: string; readonly operation: ProbeOperation; readonly at?: string }): ProbeRunResult => {
  const results: Record<string, number> = {}
  out.centres.forEach((c, i) => { results[`cal_${i}_x`] = c.x; results[`cal_${i}_y`] = c.y; results[`cal_${i}_z`] = c.z })
  const outcome: ProbeSimOutcome = { contacts: [], variables: {}, results, offsets: {}, updates: [], tools: [], inspections: [], alarms: [], reports: [], ...(out.refused !== undefined ? { stopped: out.refused } : {}), path: [] }
  const measuredAt = input.at ?? new Date().toISOString()
  const fit = out.calibration
  return {
    operationId: input.operationId, source: "simulated", outcome, expected: [], verdicts: [], verdict: fit === undefined ? "incomplete" : "pass", measuredAt, fingerprint: fingerprintOf(input.operation),
    ...(fit !== undefined ? { calibration: { kind: "rotary" as const, rotary: { pivotMeasured: fit.pivot, axisDirection: fit.axisDirection, axisError: Math.abs(fit.axisTilt), rms: fit.rms, at: measuredAt } } } : {})
  }
}

export type RunCalibration =
  | { readonly kind: "rotary"; readonly rotary: MachineRotaryCalibration }
  | { readonly kind: "stylus"; readonly stylus: NonNullable<MachineProbing["calibration"]> }

/** What a stylus calibration measured, as the machine stores it: the mean radius and the radius per direction (angle degrees from +X). */
export const stylusCalibrationOf = (result: ProbeRunResult, operation: ProbeOperation): RunCalibration | undefined => {
  if (operation.cycle.kind !== "stylus-calibrate" || result.verdict === "fail" || result.verdict === "missed" || result.verdict === "incomplete") return undefined
  const r = result.outcome.results
  const radius = r["radius"]
  if (radius === undefined) return undefined
  const named = Object.keys(r).filter((key) => /^r\d+$/.test(key)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
  return {
    kind: "stylus",
    stylus: {
      effectiveRadius: radius, calibratedAt: result.measuredAt.slice(0, 40),
      ...(named.length > 0 ? { directional: named.map((key, k) => ({ angle: 360 * k / named.length, radius: r[key]! })) } : {}),
      ...(r["zTrigger"] !== undefined ? { zTrigger: r["zTrigger"] } : {})
    }
  }
}
