import { describe, expect, test } from "bun:test"
import { runJob, type KernelProgress, type ManufacturingJob } from "./index.ts"
import { findMachine } from "./machines.ts"

const job: ManufacturingJob = {
  schemaVersion: 1, id: "p", name: "Plate", material: "6061", part: { kind: "elements", elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5 }] },
  machine: findMachine("vmc-standard")!, quality: { resolution: 0.4 }
}

describe("run options: progress and cancellation checkpoints", () => {
  test("progress is reported before each operation, then post, replay and evidence, in order", () => {
    const seen: KernelProgress[] = []
    const r = runJob(job, { onProgress: (p) => seen.push(p) })
    expect(r.status).toBe("ok")
    const ops = seen.filter((p) => p.stage === "operations")
    expect(ops.length).toBeGreaterThan(0)
    expect(ops.map((p) => p.operation!.index)).toEqual(ops.map((_, i) => i))
    expect(ops.every((p) => p.operation!.count === ops.length)).toBe(true)
    expect(seen.filter((p) => p.stage !== "operations").map((p) => p.stage)).toEqual(["post", "replay", "evidence"])
  })

  test("a signal that aborts during the run stops it at the next checkpoint with a typed issue and no artifact", () => {
    const signal = { aborted: false }
    const r = runJob(job, { signal, onProgress: (p) => { if (p.stage === "operations" && p.operation!.index === 0) signal.aborted = true } })
    expect(r.status).toBe("failed")
    if (r.status === "failed") expect(r.issues.map((i) => i.tag)).toEqual(["Cancelled"])
  })

  test("an abort before the run stops it at the first checkpoint", () => {
    const r = runJob(job, { signal: { aborted: true } })
    expect(r.status).toBe("failed")
  })

  test("the options change nothing about the result: same NC with and without hooks", () => {
    const a = runJob(job), b = runJob(job, { onProgress: () => undefined, signal: { aborted: false } })
    if (a.status !== "ok" || b.status !== "ok") throw new Error("the job must run")
    expect(b.value.nc).toBe(a.value.nc)
  })
})
