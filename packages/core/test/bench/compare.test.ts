import { describe, expect, test } from "bun:test"
import config from "./bench.config.json"
import { BENCH_CASES } from "./cases.ts"
import { budgetVerdicts, compareRuns, percentile, type BenchConfig, type BenchReport } from "./compare.ts"
import type { Fingerprint } from "../corpus/fingerprint.ts"

const cfg: BenchConfig = { runs: 5, tolerance: 0.2, maxLoadPerCpu: 1, maxLoadRatio: 1.5, budgets: { a: 100, b: 1000 } }
const machine = (load: number, cpu = "M-test"): Fingerprint => ({ bun: "1", platform: "darwin-arm64", cpu, logicalCpus: 10, totalMemoryBytes: 1, loadAverage: [load, load, load] })
const report = (load: number, medians: Record<string, number>, cpu?: string): BenchReport => ({
  generatedAt: "t", machine: machine(load, cpu), results: Object.entries(medians).map(([id, medianMs]) => ({ id, runs: 5, medianMs, p95Ms: medianMs, checksum: 0 }))
})

describe("bench judgement", () => {
  test("nearest-rank percentiles", () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3)
    expect(percentile([5, 1, 3, 2, 4], 0.95)).toBe(5)
    expect(percentile([], 0.5)).toBe(0)
  })

  test("a median is within or over its budget; over budget on a loaded machine proves nothing", () => {
    expect(budgetVerdicts(report(2, { a: 90, b: 1200, c: 5 }), cfg).map((v) => v.verdict)).toEqual(["within", "over", "no-budget"])
    expect(budgetVerdicts(report(20, { a: 90, b: 1200 }), cfg).map((v) => v.verdict)).toEqual(["within", "inconclusive"])
  })

  test("a regression is a growth of more than the tolerance of the budget, not of the old median", () => {
    const base = report(5, { a: 50, b: 500, gone: 1 })
    const now = report(5, { a: 75, b: 600, fresh: 1 })
    const c = compareRuns(now, base, cfg)
    expect(c.comparable).toBe(true)
    if (!c.comparable) return
    // a: +25 ms of a 100 ms budget = 25 % > 20 %: regressed. b: +100 ms of 1000 ms = 10 %: unchanged, although +20 % of its median.
    expect(Object.fromEntries(c.cases.map((x) => [x.id, x.verdict]))).toEqual({ a: "regressed", b: "unchanged", fresh: "new", gone: "removed" })
    const faster = compareRuns(report(5, { a: 20, b: 500 }), base, cfg)
    expect(faster.comparable && faster.cases.find((x) => x.id === "a")?.verdict).toBe("improved")
  })

  test("runs on another machine or under a load too far apart are not compared", () => {
    expect(compareRuns(report(5, { a: 1 }, "other"), report(5, { a: 1 }), cfg)).toMatchObject({ comparable: false, reason: expect.stringContaining("different machines") })
    expect(compareRuns(report(20, { a: 1 }), report(5, { a: 1 }), cfg)).toMatchObject({ comparable: false, reason: expect.stringContaining("apart") })
    expect(compareRuns(report(6, { a: 1 }), report(5, { a: 1 }), cfg).comparable).toBe(true)
  })

  test("every case has a budget and every budget a case", () => {
    const ids = BENCH_CASES.map((c) => c.id).sort()
    expect(Object.keys((config as BenchConfig).budgets).sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
