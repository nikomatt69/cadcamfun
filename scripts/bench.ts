/**
 * `bun run bench` (spec 55 E2): times the fixed case list, writes `data/bench.json` (median and p95 of each case, machine
 * fingerprint) and judges each median against its budget in `bench.config.json`.
 *   --runs=<n>               timed runs per case (3..30, default from the config)
 *   --only=<id>[,<id>]       run only these cases
 *   --baseline=<bench.json>  compare with an earlier run; exit 1 when a case regressed (refused when not comparable)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import config from "../packages/core/test/bench/bench.config.json"
import { BENCH_CASES } from "../packages/core/test/bench/cases.ts"
import { budgetVerdicts, compareRuns, percentile, type BenchConfig, type BenchReport, type CaseResult } from "../packages/core/test/bench/compare.ts"
import { fingerprint } from "../packages/core/test/corpus/fingerprint.ts"

const arg = (name: string): string | undefined => Bun.argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1)
const cfg = config as BenchConfig
const runs = Number(arg("--runs") ?? cfg.runs)
if (!Number.isInteger(runs) || runs < 3 || runs > 30) throw new Error("--runs must be an integer from 3 to 30")
const only = arg("--only")?.split(",").filter((s) => s !== "")
const unknown = (only ?? []).filter((id) => !BENCH_CASES.some((c) => c.id === id))
if (unknown.length > 0) throw new Error(`unknown bench cases: ${unknown.join(", ")}`)

const machine = fingerprint()
const results: CaseResult[] = []
for (const c of BENCH_CASES.filter((c) => only === undefined || only.includes(c.id))) {
  c.run() // build lazy inputs, warm caches and the JIT before timing
  const timings: number[] = []
  let checksum = 0
  for (let i = 0; i < runs; i++) {
    const started = performance.now()
    checksum = c.run()
    timings.push(performance.now() - started)
  }
  const round = (ms: number) => Math.round(ms * 10) / 10
  results.push({ id: c.id, runs, medianMs: round(percentile(timings, 0.5)), p95Ms: round(percentile(timings, 0.95)), checksum: Number(checksum.toFixed(6)) })
  console.error(`${c.id} ${round(percentile(timings, 0.5))} ms`)
}
const report: BenchReport = { generatedAt: new Date().toISOString(), machine, results }
const path = join(import.meta.dir, "..", "data", "bench.json")
mkdirSync(dirname(path), { recursive: true })
writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)

const width = Math.max(...results.map((r) => r.id.length))
console.log(`load per CPU ${(machine.loadAverage[0] / machine.logicalCpus).toFixed(2)} (${machine.cpu}, ${machine.logicalCpus} CPUs)`)
for (const v of budgetVerdicts(report, cfg)) console.log(`${v.id.padEnd(width)}  ${String(v.medianMs).padStart(9)} ms  budget ${String(v.budgetMs ?? "-").padStart(6)} ms  ${v.verdict}`)
console.log(`report: ${path}`)

const baselinePath = arg("--baseline")
if (baselinePath !== undefined) {
  const comparison = compareRuns(report, JSON.parse(readFileSync(baselinePath, "utf8")) as BenchReport, cfg)
  if (!comparison.comparable) {
    console.log(`not compared: ${comparison.reason}`)
  } else {
    for (const c of comparison.cases) console.log(`${c.id.padEnd(width)}  ${c.verdict}${c.deltaOfBudget !== undefined ? ` (${(c.deltaOfBudget * 100).toFixed(0)} % of budget)` : ""}`)
    if (comparison.cases.some((c) => c.verdict === "regressed")) process.exit(1)
  }
}
