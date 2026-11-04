/**
 * A probe run as the stored report carries it (`ProbeReport.data`, spec 73 §1): plain JSON, core units, versioned, without the tip's
 * path (it is large and the contacts say where the probe touched). A report that does not read back is refused with the reason, never
 * partly shown.
 */
import type { ProbeContact, ProbeSimOutcome } from "./contract.ts"
import { verdictOfRun, type ProbeRunResult, type RunSource, type RunVerdict } from "./result.ts"

export interface ReportData {
  readonly version: 1
  readonly outcome: Omit<ProbeSimOutcome, "path">
  readonly expected: ReadonlyArray<ProbeContact>
  readonly workOffset?: string
}

export const reportData = (result: ProbeRunResult): ReportData => {
  const { path: _path, ...outcome } = result.outcome
  return { version: 1, outcome, expected: result.expected, ...(result.workOffset !== undefined ? { workOffset: result.workOffset } : {}) }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)

/** The run a stored report holds. */
export const resultOfReport = (report: {
  readonly id: string; readonly toolpathId: string | null; readonly source: RunSource; readonly verdict: RunVerdict; readonly measuredAt: string
  readonly runId: string | null; readonly programHash: string | null; readonly workOffset: string | null; readonly data: unknown
}): { readonly ok: true; readonly result: ProbeRunResult } | { readonly ok: false; readonly reason: string } => {
  const data = report.data
  if (!isRecord(data) || data["version"] !== 1 || !isRecord(data["outcome"]) || !Array.isArray(data["expected"])) return { ok: false, reason: "the report is not a probe run this version reads" }
  const o = data["outcome"]
  if (!Array.isArray(o["contacts"]) || !Array.isArray(o["inspections"]) || !Array.isArray(o["updates"]) || !Array.isArray(o["alarms"])) return { ok: false, reason: "the report's measurements are incomplete" }
  const outcome = { path: [], variables: {}, results: {}, offsets: {}, tools: [], reports: [], ...(o as object) } as unknown as ProbeSimOutcome
  const expected = data["expected"] as ReadonlyArray<ProbeContact>
  return {
    ok: true,
    result: {
      operationId: report.toolpathId ?? report.id, ...(report.runId !== null ? { runId: report.runId } : {}), source: report.source, outcome, expected,
      verdicts: outcome.inspections, verdict: report.verdict ?? verdictOfRun(outcome, expected), measuredAt: report.measuredAt,
      ...(report.programHash !== null ? { programHash: report.programHash } : {}), reportId: report.id, ...(report.workOffset !== null ? { workOffset: report.workOffset } : {})
    }
  }
}
