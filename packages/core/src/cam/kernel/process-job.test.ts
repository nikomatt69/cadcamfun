import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { runJob, type CamArtifact, type ManufacturingJob, type OperationSpec } from "./index.ts"

setDefaultTimeout(100_000)

const block = {
  positions: [0, 0, 0, 60, 0, 0, 60, 40, 0, 0, 40, 0, 0, 0, 10, 60, 0, 10, 60, 40, 10, 0, 40, 10],
  indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
}
const stock = { min: { x: -3, y: -3, z: 0 }, max: { x: 63, y: 43, z: 10 } }
const ring = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }, { x: 0, y: 40 }]
const outline: OperationSpec = { id: "outline", strategy: "profile", tool: "flat-6", loop: ring, side: "outside", top: 10, bottom: 0, allowance: 0, finish: true, leadIn: "direct" } as OperationSpec

const job = (over: Partial<ManufacturingJob> = {}): ManufacturingJob => ({
  schemaVersion: 1, id: "proc", name: "Process", material: "6061", part: { kind: "meshes", meshes: [block] }, stock, operations: [outline], ...over
})
const ok = (r: ReturnType<typeof runJob>): CamArtifact => {
  if (r.status !== "ok") throw new Error(r.issues.map((i) => i.message).join("; "))
  return r.value
}

describe("process physics in a kernel job (spec 61, spec 69 G0 to G2)", () => {
  const plain = ok(runJob(job()))

  test("without `process` the artifact has no process evidence", () => {
    expect(plain.process).toBeUndefined()
  })
  test("feed optimisation `off` leaves the NC byte-identical and adds the uncalibrated report", () => {
    const a = ok(runJob(job({ process: { feedOptimisation: "off" } })))
    expect(a.nc).toBe(plain.nc)
    expect(a.process).toBeDefined()
    expect(a.process!.calibrated).toBe(false)
    expect(a.process!.label).toContain("uncalibrated")
    expect(a.process!.feedOptimisation.operations).toEqual([])
    expect(a.process!.stability.every((s) => s.result.status === "indicative" && !s.result.calibrated)).toBe(true)
  })
  test("the dynamic cycle time is not below length over feed and the tool life is reported per tool", () => {
    const p = ok(runJob(job({ process: {} }))).process!
    expect(p.cycleTime.seconds).toBeGreaterThanOrEqual(p.cycleTime.kinematicSeconds)
    expect(p.cycleTime.withToolChangesSeconds).toBeGreaterThan(p.cycleTime.seconds)
    expect(p.toolLife.length).toBeGreaterThan(0)
    for (const t of p.toolLife) {
      expect(t.lifeUsed).toBeGreaterThan(0)
      expect(t.calibrated).toBe(false)
    }
    const fast = ok(runJob(job({ process: { dynamics: { preset: "high-speed" } } }))).process!
    const slow = ok(runJob(job({ process: { dynamics: { preset: "economy" } } }))).process!
    expect(slow.cycleTime.seconds).toBeGreaterThan(fast.cycleTime.seconds)
  })
  test("a request Taylor constant replaces the table and shows in the life used", () => {
    const base = ok(runJob(job({ process: {} }))).process!.toolLife[0]!
    const worse = ok(runJob(job({ process: { taylor: { [base.toolId]: { n: 0.25, c: 1 } } } }))).process!.toolLife[0]!
    expect(worse.lifeUsed).toBeGreaterThan(base.lifeUsed)
  })
  test("constant chip feed optimisation changes the NC, reports every operation and never leaves the claim worse than it was", () => {
    const a = ok(runJob(job({ process: { feedOptimisation: "chip" } })))
    const reports = a.process!.feedOptimisation.operations
    expect(reports.length).toBeGreaterThan(0)
    expect(a.nc).not.toBe(plain.nc)
    for (const r of reports) {
      expect(r.report.worstRatioAfter).toBeLessThanOrEqual(Math.max(1, r.report.worstRatioBefore) + 1e-9)
      expect(r.report.feedMax).toBeLessThanOrEqual(a.operations.find((o) => o.id === r.operation)!.cutting!.feed * 3 + 1e-6)
    }
  })
})
