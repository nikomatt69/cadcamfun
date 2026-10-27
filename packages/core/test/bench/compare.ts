/**
 * How bench numbers are judged (spec 55 §3): against the case's budget, not against absolute history, and never across runs
 * whose machine or load differ too much to compare.
 */
import { loadPerCpu, type Fingerprint } from "../corpus/fingerprint.ts"

export interface BenchConfig {
  readonly runs: number
  /** Share of the budget a change may add to a median before it is a regression (0.2 = 20 %). */
  readonly tolerance: number
  /** Above this load per logical CPU an over-budget median is inconclusive: the run competed for the processors. */
  readonly maxLoadPerCpu: number
  /** Two runs whose loads per CPU differ by more than this factor are not compared. */
  readonly maxLoadRatio: number
  /** Budget of each case's median, ms. */
  readonly budgets: Readonly<Record<string, number>>
}

export interface CaseResult {
  readonly id: string
  readonly runs: number
  readonly medianMs: number
  readonly p95Ms: number
  readonly checksum: number
}

export interface BenchReport {
  readonly generatedAt: string
  readonly machine: Fingerprint
  readonly results: ReadonlyArray<CaseResult>
}

/** Nearest-rank percentile of a sample. */
export const percentile = (values: ReadonlyArray<number>, p: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))]!
}

export type BudgetVerdict = "within" | "over" | "inconclusive" | "no-budget"

export const budgetVerdicts = (report: BenchReport, config: BenchConfig): ReadonlyArray<{ readonly id: string; readonly medianMs: number; readonly budgetMs?: number; readonly verdict: BudgetVerdict }> =>
  report.results.map((r) => {
    const budgetMs = config.budgets[r.id]
    if (budgetMs === undefined) return { id: r.id, medianMs: r.medianMs, verdict: "no-budget" as const }
    const verdict: BudgetVerdict = r.medianMs <= budgetMs ? "within" : loadPerCpu(report.machine) > config.maxLoadPerCpu ? "inconclusive" : "over"
    return { id: r.id, medianMs: r.medianMs, budgetMs, verdict }
  })

export type RunComparison =
  | { readonly comparable: false; readonly reason: string }
  | { readonly comparable: true; readonly cases: ReadonlyArray<{ readonly id: string; readonly verdict: "regressed" | "improved" | "unchanged" | "new" | "removed" | "no-budget"; readonly deltaOfBudget?: number }> }

/**
 * A case regressed when its median grew by more than `tolerance` of its budget since the baseline (spec 55 §3 gate: such a
 * change needs a recorded justification). Runs on another processor or platform, or under a load more than `maxLoadRatio`
 * apart, are refused rather than compared.
 */
export const compareRuns = (current: BenchReport, baseline: BenchReport, config: BenchConfig): RunComparison => {
  if (current.machine.cpu !== baseline.machine.cpu || current.machine.platform !== baseline.machine.platform) {
    return { comparable: false, reason: `different machines (${baseline.machine.cpu} ${baseline.machine.platform} vs ${current.machine.cpu} ${current.machine.platform})` }
  }
  const a = Math.max(0.05, loadPerCpu(current.machine)), b = Math.max(0.05, loadPerCpu(baseline.machine))
  const ratio = Math.max(a, b) / Math.min(a, b)
  if (ratio > config.maxLoadRatio) return { comparable: false, reason: `load per CPU ${b.toFixed(2)} then ${a.toFixed(2)}: ${ratio.toFixed(1)}x apart, more than ${config.maxLoadRatio}x` }
  const before = new Map(baseline.results.map((r) => [r.id, r]))
  const cases = current.results.map((r) => {
    const base = before.get(r.id)
    if (base === undefined) return { id: r.id, verdict: "new" as const }
    const budget = config.budgets[r.id]
    if (budget === undefined) return { id: r.id, verdict: "no-budget" as const }
    const deltaOfBudget = (r.medianMs - base.medianMs) / budget
    return { id: r.id, deltaOfBudget, verdict: deltaOfBudget > config.tolerance ? "regressed" as const : deltaOfBudget < -config.tolerance ? "improved" as const : "unchanged" as const }
  })
  const removed = baseline.results.filter((r) => !current.results.some((c) => c.id === r.id)).map((r) => ({ id: r.id, verdict: "removed" as const }))
  return { comparable: true, cases: [...cases, ...removed] }
}
