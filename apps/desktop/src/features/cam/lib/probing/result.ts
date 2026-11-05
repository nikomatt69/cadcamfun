/**
 * What a probe run returned, as the panel and the 3D overlay read it (spec 73 §4): the outcome of the core executor with the
 * contacts the cycle expected, an overall verdict (the same word the stored report carries) and the work offset before and after.
 */
import { offsetKey, type InspectionVerdict, type OffsetEntry, type ProbeContact, type ProbeSimOutcome, type WorkOffsetRef } from "./contract.ts"
import { statusOf, WARN_SHARE } from "./inspection.ts"

export type RunVerdict = "pass" | "warn" | "fail" | "missed" | "incomplete"
export type RunSource = "simulated" | "machine" | "imported"

/** What a calibration run found, ready for the machine (wire units: degrees). */
export type RunCalibration =
  | { readonly kind: "rotary"; readonly rotary: import("./contract.ts").MachineRotaryCalibration; readonly centres?: ReadonlyArray<import("@cadcamfun/core").Vec3> }
  | { readonly kind: "stylus"; readonly stylus: NonNullable<import("./contract.ts").MachineProbing["calibration"]> }

export interface ProbeRunResult {
  /** The probe cycle (toolpath id) it measured. */
  readonly operationId: string
  readonly runId?: string
  readonly source: RunSource
  readonly outcome: ProbeSimOutcome
  /** The touches the planned cycle expects, in order (matched to `outcome.contacts` for the deviation arrows). */
  readonly expected: ReadonlyArray<ProbeContact>
  readonly verdicts: ReadonlyArray<InspectionVerdict>
  readonly verdict: RunVerdict
  readonly measuredAt: string
  /** The NC text the run replayed and its hash, when the run came from a program. */
  readonly programHash?: string
  readonly reportId?: string
  /** The offset the run updated. */
  readonly workOffset?: string
  /** What a rotary calibration measured, ready for the machine. */
  readonly calibration?: RunCalibration
  /** Fingerprint of the operation the run measured (`fingerprintOf`): a changed operation makes the result stale. */
  readonly fingerprint?: string
}

/** A short stable text of an operation's figures; a result or program whose fingerprint differs belongs to an older edit. */
export const fingerprintOf = (operation: unknown): string => JSON.stringify(operation)

/** Alarm code of a touch that found nothing (the core executor's `PROBE_MISS_ALARM`). */
export const MISS_ALARM = 991

/**
 * One word for the run: `missed` when a touch found no surface, `incomplete` when it stopped (or made fewer touches than planned),
 * `fail` / `warn` from the inspection, otherwise `pass`.
 */
export const verdictOfRun = (outcome: ProbeSimOutcome, expected: ReadonlyArray<ProbeContact>, warnShare = WARN_SHARE): RunVerdict => {
  if (outcome.alarms.some((alarm) => alarm.code === MISS_ALARM)) return "missed"
  if (outcome.stopped !== undefined || (expected.length > 0 && outcome.contacts.length < expected.length)) return "incomplete"
  const statuses = outcome.inspections.map((v) => statusOf(v, warnShare))
  if (statuses.includes("fail")) return "fail"
  return statuses.includes("warn") ? "warn" : "pass"
}

const AXES = ["X", "Y", "Z", "A", "B", "C", "R"] as const

/** The offset `ref` before and after the run (core units), read from the executor's updates; absent when the run did not touch it. */
export const offsetChange = (outcome: ProbeSimOutcome, ref: WorkOffsetRef | undefined): { readonly before: OffsetEntry; readonly after: OffsetEntry } | undefined => {
  const key = ref === undefined ? undefined : offsetKey(ref)
  const updates = outcome.updates.filter((u) => key === undefined || offsetKey(u.ref) === key)
  if (updates.length === 0) return undefined
  const before: Record<string, number> = { x: 0, y: 0, z: 0 }
  const after: Record<string, number> = { x: 0, y: 0, z: 0 }
  const name = (axis: (typeof AXES)[number]): string => (axis === "R" ? "rotation" : axis.toLowerCase())
  for (const u of updates) { before[name(u.axis)] = u.before; after[name(u.axis)] = u.after }
  // An axis the run did not touch keeps one value on both sides, so the triad moves only along what was corrected.
  for (const axis of ["x", "y", "z"]) if (!updates.some((u) => name(u.axis) === axis)) after[axis] = before[axis]!
  return { before: before as unknown as OffsetEntry, after: after as unknown as OffsetEntry }
}

/** The run's verdicts (inspection characteristics), failures first, for the list. */
export const failedCount = (result: Pick<ProbeRunResult, "verdicts">, warnShare = WARN_SHARE): number => result.verdicts.filter((v) => statusOf(v, warnShare) === "fail").length
