/**
 * The record of a probe run (spec 73 §3, §5.10): what each operation touched, what it measured, how every characteristic stands against
 * its limits, which offsets the run moved, and one verdict. It is what the API stores (`ProbeReport` rows), the desktop shows (the inspection
 * list) and the assistant reads. Built from the outcomes of `runProbeMoves` / `simulateNc`; lengths in mm, angles in radians in the
 * record and in degrees on the wire (`probeReportToWire`).
 */
import type { Vec3 } from "../../cad/vec.ts"
import { offsetKey } from "../work-offset.ts"
import type { OffsetEntry } from "../work-offset.ts"
import { INSPECTION_ALARM, OFFSET_ALARM, WEAR_ALARM } from "./actions.ts"
import { PROBE_COLLISION_ALARM, PROBE_MISS_ALARM, evaluateInspection } from "./simulate.ts"
import { calibrationToWire, type ProbeCalibration } from "./calibration.ts"
import type { Characteristic, InspectionVerdict, ProbeCycleKind, ProbeSimOutcome } from "./types.ts"

const DEG = Math.PI / 180

export type ReportVerdict = "pass" | "warn" | "fail" | "missed" | "incomplete"
export type CheckStatus = "pass" | "warn" | "fail"

export interface ReportCheck {
  readonly operationId: string
  readonly name: string
  readonly kind: Characteristic["kind"]
  readonly measured: number
  readonly nominal: number
  readonly deviation: number
  readonly lower: number
  readonly upper: number
  readonly status: CheckStatus
}

export interface ReportOperation {
  readonly operationId: string
  readonly cycle: ProbeCycleKind
  readonly contacts: ReadonlyArray<{ readonly name?: string; readonly tip: Vec3; readonly line?: number }>
  readonly results: Readonly<Record<string, number>>
  readonly nominal: Readonly<Record<string, number>>
  readonly units: Readonly<Record<string, "mm" | "deg">>
  readonly alarms: ReadonlyArray<{ readonly code: number; readonly text: string; readonly line?: number }>
  readonly stopped?: string
  /** What a calibration cycle found. Reported, never written to the machine's parameters. */
  readonly calibration?: ProbeCalibration
}

export interface ReportUpdate { readonly operationId: string; readonly offset: string; readonly axis: string; readonly before: number; readonly after: number; /** 1-based NC line of the write. */ readonly line?: number }

export interface ProbeReport {
  readonly verdict: ReportVerdict
  readonly operations: ReadonlyArray<ReportOperation>
  readonly checks: ReadonlyArray<ReportCheck>
  readonly updates: ReadonlyArray<ReportUpdate>
  readonly tools: ReadonlyArray<{ readonly operationId: string; readonly tool: number; readonly quantity: "length" | "radius"; readonly part: "geometry" | "wear"; readonly before: number; readonly after: number }>
  /** The offsets after the run, by `offsetKey`. */
  readonly offsets: Readonly<Record<string, OffsetEntry>>
  readonly failed: number
  readonly warned: number
  /** The largest |deviation| of a length characteristic, mm. */
  readonly maxDeviationMm?: number
}

export interface ReportRun {
  readonly operationId: string
  readonly cycle: ProbeCycleKind
  readonly outcome: ProbeSimOutcome
  readonly nominal: Readonly<Record<string, number>>
  readonly units: Readonly<Record<string, "mm" | "deg">>
  readonly characteristics?: ReadonlyArray<Characteristic>
  readonly calibration?: ProbeCalibration
}

/** A check inside this fraction of the way to its limit but not past it is a warning (the part is drifting, still good). */
export const WARN_FRACTION = 0.8

const statusOf = (v: InspectionVerdict, warn: number): CheckStatus => {
  if (!v.pass) return "fail"
  const half = (v.upper - v.lower) / 2
  if (!(half > 0)) return "pass"
  const mid = (v.upper + v.lower) / 2
  return Math.abs(v.deviation - mid) > warn * half ? "warn" : "pass"
}

/**
 * The report of the runs of a job's probe operations, in order. Verdict: `missed` when a touch found nothing, `incomplete` when a run
 * stopped for another reason (a contact on a protected move, a stop), `fail` when a characteristic or an offset policy failed, `warn`
 * when everything passed but some figure is past `warnFraction` of its band, else `pass`.
 */
export const buildProbeReport = (runs: ReadonlyArray<ReportRun>, options: { readonly warnFraction?: number } = {}): ProbeReport => {
  const warn = options.warnFraction ?? WARN_FRACTION
  const operations: ReportOperation[] = []
  const checks: ReportCheck[] = []
  const updates: ReportUpdate[] = []
  const tools: Array<ProbeReport["tools"][number]> = []
  let offsets: Record<string, OffsetEntry> = {}
  let verdict: ReportVerdict = "pass"
  const worse = (v: ReportVerdict): void => {
    const order: ReportVerdict[] = ["pass", "warn", "fail", "incomplete", "missed"]
    if (order.indexOf(v) > order.indexOf(verdict)) verdict = v
  }
  for (const run of runs) {
    const o = run.outcome
    operations.push({
      operationId: run.operationId, cycle: run.cycle, contacts: o.contacts.map((c) => ({ ...(c.name !== undefined ? { name: c.name } : {}), tip: c.tip, ...(c.line !== undefined ? { line: c.line } : {}) })),
      results: o.results, nominal: run.nominal, units: run.units, alarms: o.alarms.map((a) => ({ code: a.code, text: a.text, ...(a.line !== undefined ? { line: a.line } : {}) })),
      ...(o.stopped !== undefined ? { stopped: o.stopped } : {}),
      ...(run.calibration !== undefined ? { calibration: run.calibration } : {})
    })
    const verdicts = run.characteristics === undefined ? o.inspections : evaluateInspection(o.results, run.characteristics)
    for (const v of verdicts) {
      const status = statusOf(v, warn)
      checks.push({ operationId: run.operationId, name: v.name, kind: v.kind, measured: v.measured, nominal: v.nominal, deviation: v.deviation, lower: v.lower, upper: v.upper, status })
      if (status === "fail") worse("fail")
      else if (status === "warn") worse("warn")
    }
    for (const u of o.updates) updates.push({ operationId: run.operationId, offset: offsetKey(u.ref), axis: u.axis, before: u.before, after: u.after, ...(u.line !== undefined ? { line: u.line } : {}) })
    for (const t of o.tools) tools.push({ operationId: run.operationId, ...t })
    offsets = { ...offsets, ...o.offsets }
    for (const a of o.alarms) {
      if (a.code === PROBE_MISS_ALARM) worse("missed")
      else if (a.code === PROBE_COLLISION_ALARM) worse("incomplete")
      else if (a.code >= INSPECTION_ALARM && a.code < INSPECTION_ALARM + 10) worse("fail")
      else if (a.code === OFFSET_ALARM || a.code === WEAR_ALARM) worse("fail")
      else worse("incomplete")
    }
    if (o.stopped !== undefined && o.alarms.length === 0) worse("incomplete")
  }
  const lengthDeviations = checks.filter((c) => c.kind !== "angle").map((c) => Math.abs(c.kind === "true-position" ? c.deviation : c.deviation))
  return {
    verdict, operations, checks, updates, tools, offsets,
    failed: checks.filter((c) => c.status === "fail").length, warned: checks.filter((c) => c.status === "warn").length,
    ...(lengthDeviations.length > 0 ? { maxDeviationMm: Math.max(...lengthDeviations) } : {})
  }
}

const roundTo = (v: number, d = 6): number => Number(v.toFixed(d))
const angular = (axis: string): boolean => axis === "A" || axis === "B" || axis === "C" || axis === "R"

/** The report as JSON for the wire and the database: angles in degrees (offset rotations, angle characteristics, angle results). */
export const probeReportToWire = (r: ProbeReport): unknown => ({
  verdict: r.verdict, failed: r.failed, warned: r.warned, ...(r.maxDeviationMm !== undefined ? { maxDeviationMm: roundTo(r.maxDeviationMm) } : {}),
  operations: r.operations.map((op) => ({
    ...op,
    results: Object.fromEntries(Object.entries(op.results).map(([k, v]) => [k, roundTo(op.units[k] === "deg" ? v / DEG : v)])),
    nominal: Object.fromEntries(Object.entries(op.nominal).map(([k, v]) => [k, roundTo(v)])),
    contacts: op.contacts.map((c) => ({ ...c, tip: { x: roundTo(c.tip.x), y: roundTo(c.tip.y), z: roundTo(c.tip.z) } })),
    ...(op.calibration !== undefined ? { calibration: calibrationToWire(op.calibration) } : {})
  })),
  checks: r.checks.map((c) => (c.kind === "angle" ? { ...c, measured: roundTo(c.measured / DEG), nominal: roundTo(c.nominal / DEG), deviation: roundTo(c.deviation / DEG), lower: roundTo(c.lower / DEG), upper: roundTo(c.upper / DEG) } : { ...c, measured: roundTo(c.measured), nominal: roundTo(c.nominal), deviation: roundTo(c.deviation), lower: roundTo(c.lower), upper: roundTo(c.upper) })),
  updates: r.updates.map((u) => ({ ...u, before: roundTo(angular(u.axis) ? u.before / DEG : u.before), after: roundTo(angular(u.axis) ? u.after / DEG : u.after) })),
  tools: r.tools,
  offsets: Object.fromEntries(Object.entries(r.offsets).map(([k, e]) => [k, { x: roundTo(e.x), y: roundTo(e.y), z: roundTo(e.z), ...(e.a !== undefined ? { a: roundTo(e.a / DEG) } : {}), ...(e.b !== undefined ? { b: roundTo(e.b / DEG) } : {}), ...(e.c !== undefined ? { c: roundTo(e.c / DEG) } : {}), ...(e.rotation !== undefined ? { rotation: roundTo(e.rotation / DEG) } : {}) }]))
})
