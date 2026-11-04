/**
 * In-process inspection results as the panel lists them (spec 73 §4): a status per characteristic with a warning band near the
 * limits, failures first, a one-line summary, and the CSV a quality engineer pastes into a report (3 decimals, mm; angles degrees).
 */
import type { InspectionVerdict } from "./contract.ts"

export type InspectionStatus = "pass" | "warn" | "fail"

/** A deviation that uses more than this share of its tolerance band (towards the limit it is nearer) is a warning. */
export const WARN_SHARE = 0.8

const DEG = 180 / Math.PI

/**
 * `fail` when the core says it failed; `warn` when it passed but uses more than `warnShare` of the band on its side (a true position
 * or flatness, whose band is 0..upper, uses `upper`); `pass` otherwise.
 */
export const statusOf = (v: InspectionVerdict, warnShare = WARN_SHARE): InspectionStatus => {
  if (!v.pass) return "fail"
  const limit = v.deviation >= 0 ? v.upper : v.lower
  if (limit === 0) return v.deviation === 0 ? "pass" : "warn"
  return Math.abs(v.deviation / limit) > warnShare ? "warn" : "pass"
}

const RANK: Readonly<Record<InspectionStatus, number>> = { fail: 0, warn: 1, pass: 2 }

/** Failures first, then warnings, then passes; within a status the largest share of the band first, then by name. */
export const sortInspection = (verdicts: ReadonlyArray<InspectionVerdict>, warnShare = WARN_SHARE): ReadonlyArray<InspectionVerdict> => {
  const share = (v: InspectionVerdict) => {
    const limit = v.deviation >= 0 ? v.upper : v.lower
    return limit === 0 ? Math.abs(v.deviation) * 1e6 : Math.abs(v.deviation / limit)
  }
  return [...verdicts].sort((a, b) => RANK[statusOf(a, warnShare)] - RANK[statusOf(b, warnShare)] || share(b) - share(a) || a.name.localeCompare(b.name))
}

export interface InspectionSummary { readonly total: number; readonly pass: number; readonly warn: number; readonly fail: number; readonly status: InspectionStatus | "empty" }

export const summarizeInspection = (verdicts: ReadonlyArray<InspectionVerdict>, warnShare = WARN_SHARE): InspectionSummary => {
  const counts = { pass: 0, warn: 0, fail: 0 }
  for (const v of verdicts) counts[statusOf(v, warnShare)]++
  const status = verdicts.length === 0 ? "empty" : counts.fail > 0 ? "fail" : counts.warn > 0 ? "warn" : "pass"
  return { total: verdicts.length, ...counts, status }
}

/** A value as the report writes it: mm with 3 decimals, an angle in degrees with 3 decimals. */
export const displayValue = (v: InspectionVerdict, value: number): number => (v.kind === "angle" ? value * DEG : value)

/** Rounded first, so a deviation of -0.0004 is written 0.000, not -0.000. */
const fixed = (n: number) => { const r = Math.round(n * 1000) / 1000; return (r === 0 ? 0 : r).toFixed(3) }
const quote = (text: string) => (/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)

/** The CSV of the results in list order: name, kind, nominal, measured, deviation, lower, upper, status. */
export const inspectionCsv = (verdicts: ReadonlyArray<InspectionVerdict>, warnShare = WARN_SHARE): string => {
  const header = "name,kind,nominal,measured,deviation,lower,upper,status"
  const rows = sortInspection(verdicts, warnShare).map((v) => [
    quote(v.name), v.kind, fixed(displayValue(v, v.nominal)), fixed(displayValue(v, v.measured)), fixed(displayValue(v, v.deviation)),
    fixed(displayValue(v, v.lower)), fixed(displayValue(v, v.upper)), statusOf(v, warnShare)
  ].join(","))
  return [header, ...rows].join("\n") + "\n"
}
