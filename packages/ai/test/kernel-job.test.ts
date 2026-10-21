import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { KernelJobError, kernelWorkerUrl, runKernelJob, runKernelJobInline } from "../src/kernel-job.ts"
import type { AcceptanceCheck } from "../src/acceptance.ts"
import { cam } from "@cadcamfun/core"

setDefaultTimeout(120_000)

const plate = {
  parameters: { width: 40, height: 25, thick: 6 },
  features: [
    { id: "s1", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "width", height: "height" }] } },
    { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new" },
    { id: "h1", type: "hole", plane: "XY", offset: "thick", at: [20, 12.5], diameter: 8, depth: "thick" }
  ]
}
const checks: ReadonlyArray<AcceptanceCheck> = [
  { kind: "extent", name: "length", axis: "x", nominal: 40, tolerance: { plus: 0.05, minus: 0.05 } },
  { kind: "hole", name: "bore", feature: "h1", diameter: { nominal: 8, tolerance: { plus: 0.02, minus: 0.02 } } }
]

/** A part heavy enough to keep a thread busy for a while: a plate with many holes. */
const heavy = {
  parameters: { width: 200, height: 200, thick: 10 },
  features: [
    { id: "s1", type: "sketch", plane: "XY", sketch: { shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "width", height: "height" }] } },
    { id: "plate", type: "extrude", sketch: "s1", depth: "thick", operation: "new" },
    ...Array.from({ length: 64 }, (_, i) => ({ id: `h${i}`, type: "hole", plane: "XY", offset: "thick", at: [12 + (i % 8) * 25, 12 + Math.floor(i / 8) * 25], diameter: 6, depth: "thick" }))
  ]
}

describe("kernel jobs in a scoped worker (AI-11 Step 10)", () => {
  test("the worker path returns exactly what the inline path returns", async () => {
    for (const [name, input] of [["acceptance", { history: plate, checks }], ["parametric-report", { history: plate }]] as const) {
      const inline = runKernelJobInline(name, input as never)
      const worker = await runKernelJob(name, input as never)
      expect(JSON.parse(JSON.stringify(worker))).toEqual(JSON.parse(JSON.stringify(inline)))
    }
  })

  test("the main thread keeps its heartbeat while the worker works, and the whole job has a deadline", async () => {
    let beats = 0
    const heartbeat = setInterval(() => { beats++ }, 10)
    const started = performance.now()
    const outcome = await runKernelJob("parametric-report", { history: heavy }, { deadlineMs: 300 }).then(() => "finished", (error: unknown) => error)
    const elapsed = performance.now() - started
    clearInterval(heartbeat)
    // Either it finished, or the deadline stopped it; in both cases the thread was never blocked.
    if (outcome !== "finished") expect(outcome).toMatchObject({ _tag: "KernelJobError", reason: "deadline" })
    expect(beats).toBeGreaterThanOrEqual(Math.floor(elapsed / 10) - 10)
    expect(beats).toBeGreaterThan(5)
  })

  test("cancelling ends the job at once", async () => {
    const controller = new AbortController()
    const job = runKernelJob("parametric-report", { history: heavy }, { signal: controller.signal })
    setTimeout(() => controller.abort(), 20)
    const started = performance.now()
    const error = await job.catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(KernelJobError)
    expect((error as KernelJobError).reason).toBe("cancelled")
    expect(performance.now() - started).toBeLessThan(1_000)
    // Already aborted: nothing starts.
    expect(await runKernelJob("acceptance", { history: plate, checks }, { signal: controller.signal }).catch((cause: KernelJobError) => cause.reason)).toBe("cancelled")
  })

  test("a failing job reports why; the worker URL resolves in a compiled executable", async () => {
    expect(await runKernelJob("parametric-report", { history: { parameters: {}, features: "nope" } }).catch((cause: KernelJobError) => cause.reason)).toBe("failed")
    expect(kernelWorkerUrl("file:///$bunfs/root/cadcamfun-sidecar")).toBe("file:///$bunfs/root/packages/ai/src/kernel-worker.ts")
    expect(kernelWorkerUrl("file:///home/x/packages/ai/src/kernel-job.ts")).toBe("file:///home/x/packages/ai/src/kernel-worker.ts")
  })
})

describe("the CAM kernel as a worker job", () => {
  const camJob = {
    schemaVersion: 1 as const, id: "w", name: "Plate", material: "6061", part: { kind: "elements" as const, elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5 }] },
    machine: cam.kernel.findMachine("vmc-standard")!, quality: { resolution: 0.4 }
  }

  test("the worker returns the NC the inline run returns, and reports progress on the way", async () => {
    const seen: string[] = []
    const inline = runKernelJobInline("cam-manufacture", camJob)
    const worker = await runKernelJob("cam-manufacture", camJob, { onProgress: (p) => seen.push(p.stage) })
    if (inline.status !== "ok" || worker.status !== "ok") throw new Error("the job must run")
    expect(worker.value.nc).toBe(inline.value.nc)
    expect(seen).toContain("operations")
    expect(seen.slice(-3)).toEqual(["post", "replay", "evidence"])
  })

  test("aborting the caller's signal ends the job at once with a cancelled error", async () => {
    const controller = new AbortController()
    const run = runKernelJob("cam-manufacture", camJob, { signal: controller.signal })
    controller.abort()
    await expect(run).rejects.toMatchObject({ _tag: "KernelJobError", reason: "cancelled" })
  })

  test("the plan is a job too", async () => {
    const plan = await runKernelJob("cam-plan", camJob)
    expect(plan.status).toBe("ok")
  })

  test("stock placed from the part bottom is resolved in the worker with identical NC and evidence", async () => {
    const stockFromPartBottom = { x: 0, y: 0, width: 34, height: 24, depth: 6 }
    const explicit = { ...camJob, stock: { min: { x: -17, y: -12, z: -2.5 }, max: { x: 17, y: 12, z: 3.5 } } }
    for (const setupOrientation of ["+Z", "+X"] as const) {
      const direct = runKernelJobInline("cam-manufacture", { ...explicit, setupOrientation })
      const worker = await runKernelJob("cam-manufacture", { ...camJob, setupOrientation, stockFromPartBottom })
      expect(worker).toEqual(direct)
      expect(await runKernelJob("cam-plan", { ...camJob, setupOrientation, stockFromPartBottom }))
        .toEqual(runKernelJobInline("cam-plan", { ...explicit, setupOrientation }))
    }
  })
})
