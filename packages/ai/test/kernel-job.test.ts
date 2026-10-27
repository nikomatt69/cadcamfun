import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { KERNEL_HISTORY_SIZE, KERNEL_QUEUE_LIMIT, KERNEL_WORKERS, KernelJobError, KernelJobsLive, clearKernelJobCache, kernelJobHistory, kernelJobStats, kernelWorkerUrl, reopenKernelJobs, runKernelJob, runKernelJobEffect, runKernelJobInline, shutdownKernelJobs } from "../src/kernel-job.ts"
import type { AcceptanceCheck } from "../src/acceptance.ts"
import { cam } from "@cadcamfun/core"
import { Effect, Exit, Fiber, Layer, Schema, Scope } from "effect"

setDefaultTimeout(120_000)

const testWorker = new URL("./test-worker.ts", import.meta.url).href

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
    clearKernelJobCache()
    const seen: string[] = []
    const inline = runKernelJobInline("cam-manufacture", camJob)
    const worker = await runKernelJob("cam-manufacture", camJob, { onProgress: (p) => seen.push(p.stage) })
    if (inline.status !== "ok" || worker.status !== "ok") throw new Error("the job must run")
    expect(worker.value.nc).toBe(inline.value.nc)
    expect(seen).toContain("operations")
    expect(seen.slice(-3)).toEqual(["post", "replay", "evidence"])
  })

  test("aborting the caller's signal ends the job at once with a cancelled error", async () => {
    clearKernelJobCache()
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

describe("the toolpath generator as a worker job", () => {
  const request = Schema.decodeUnknownSync(cam.generator.GenerateRequestSchema)({})

  test("the worker returns the program the inline run returns and reports each step on the way", async () => {
    const seen: Array<string> = []
    const inline = runKernelJobInline("cam-generate", request)
    const worker = await runKernelJob("cam-generate", request, { onProgress: (p) => seen.push(p.stage) })
    expect(worker.response.gcode).toBe(inline.response.gcode)
    expect(seen[0]).toBe("toolpath")
    expect(seen.slice(-2)).toEqual(["cycles", "record"])
  })
})

describe("the job queue, the shared runs and the result cache", () => {
  const base = {
    schemaVersion: 1 as const, id: "q", name: "Plate", material: "6061", part: { kind: "elements" as const, elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5 }] },
    machine: cam.kernel.findMachine("vmc-standard")!, quality: { resolution: 0.4 }
  }
  const distinct = (n: number) => ({ ...base, id: `q${n}` })

  test("an identical request that ran lately is answered from the cache, and a different one is not", async () => {
    clearKernelJobCache()
    const first = await runKernelJob("cam-manufacture", base)
    const before = kernelJobStats()
    const progress: string[] = []
    const again = await runKernelJob("cam-manufacture", { ...base }, { onProgress: (p) => progress.push(p.stage) })
    expect(again).toBe(first)
    expect(progress).toEqual([])
    expect(kernelJobStats().hits).toBe(before.hits + 1)
    const other = await runKernelJob("cam-manufacture", distinct(1))
    expect(other).not.toBe(first)
    expect(kernelJobStats().cached).toBe(2)
    clearKernelJobCache()
    expect(kernelJobStats().cached).toBe(0)
    expect(kernelJobStats().cachedBytes).toBe(0)
  })

  test("two identical requests at once run once; both get the result and the progress", async () => {
    clearKernelJobCache()
    const a: string[] = [], b: string[] = []
    const first = runKernelJob("cam-manufacture", base, { onProgress: (p) => a.push(p.stage) })
    const second = runKernelJob("cam-manufacture", base, { onProgress: (p) => b.push(p.stage) })
    expect(kernelJobStats().inFlight).toBe(1)
    const [x, y] = await Promise.all([first, second])
    expect(x).toBe(y)
    expect(a.slice(-3)).toEqual(["post", "replay", "evidence"])
    expect(b.slice(-3)).toEqual(["post", "replay", "evidence"])
    expect(kernelJobStats().inFlight).toBe(0)
  })

  test("one caller leaving does not cancel the run the other waits for; the last one leaving does", async () => {
    clearKernelJobCache()
    const one = new AbortController()
    const left = runKernelJob("cam-manufacture", base, { signal: one.signal })
    const stays = runKernelJob("cam-manufacture", base)
    one.abort()
    await expect(left).rejects.toMatchObject({ reason: "cancelled" })
    expect((await stays).status).toBe("ok")

    clearKernelJobCache()
    const alone = new AbortController()
    const only = runKernelJob("cam-manufacture", distinct(2), { signal: alone.signal })
    alone.abort()
    await expect(only).rejects.toMatchObject({ reason: "cancelled" })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(kernelJobStats().inFlight).toBe(0)
    expect(kernelJobStats().cached).toBe(0)
  })

  test("no more than the worker slots run at once; the rest wait, and past the queue limit a job is refused as busy", async () => {
    clearKernelJobCache()
    let peak = 0
    const watch = setInterval(() => { peak = Math.max(peak, kernelJobStats().running) }, 2)
    const jobs = Array.from({ length: KERNEL_WORKERS + KERNEL_QUEUE_LIMIT + 1 }, (_, i) => runKernelJob("cam-plan", distinct(100 + i)).then((r) => r.status, (e: KernelJobError) => e.reason))
    expect(kernelJobStats().running).toBe(KERNEL_WORKERS)
    expect(kernelJobStats().waiting).toBe(KERNEL_QUEUE_LIMIT)
    const outcomes = await Promise.all(jobs)
    clearInterval(watch)
    expect(peak).toBeLessThanOrEqual(KERNEL_WORKERS)
    expect(outcomes.filter((o) => o === "busy")).toHaveLength(1)
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(KERNEL_WORKERS + KERNEL_QUEUE_LIMIT)
    expect(kernelJobStats().running).toBe(0)
    expect(kernelJobStats().waiting).toBe(0)
  })

  test("a job that has to wait says so, with the jobs ahead of it, before its own progress", async () => {
    clearKernelJobCache()
    const running = Array.from({ length: KERNEL_WORKERS }, (_, i) => runKernelJob("cam-plan", distinct(200 + i)))
    const stages: Array<{ readonly stage: string; readonly ahead?: number }> = []
    const waited = runKernelJob("cam-manufacture", distinct(300), { onProgress: (p) => stages.push(p as never) })
    expect(stages[0]).toEqual({ stage: "queued", ahead: 0 })
    await Promise.all([...running, waited])
    expect(stages.slice(1).map((p) => p.stage)).toContain("operations")
    // A job that finds a free worker says nothing about waiting.
    const free: string[] = []
    await runKernelJob("cam-manufacture", distinct(301), { onProgress: (p) => free.push(p.stage) })
    expect(free).not.toContain("queued")
  })

  test("a job that fails is not cached", async () => {
    clearKernelJobCache()
    const bad = { ...base, part: { kind: "elements" as const, elements: "nope" as never } }
    await expect(runKernelJob("cam-manufacture", bad)).rejects.toBeInstanceOf(KernelJobError)
    expect(kernelJobStats().cached).toBe(0)
  })

  test("a worker the system kills is reported at once with its exit code, not at the deadline", async () => {
    const before = kernelJobStats().counters
    const started = performance.now()
    const error = await runKernelJob("parametric-report", { history: plate, mode: "exit" } as never, { workerUrl: testWorker, deadlineMs: 60_000 }).catch((cause: unknown) => cause)
    expect(performance.now() - started).toBeLessThan(5_000)
    expect(error).toBeInstanceOf(KernelJobError)
    expect((error as KernelJobError).reason).toBe("crashed")
    expect((error as KernelJobError).message).toMatch(/exit code 7.*out of memory or crashed/)
    expect(kernelJobStats().counters.workerExited).toBe(before.workerExited + 1)
    expect(kernelJobStats().running).toBe(0)
  })

  test("the counters tell what happened to the jobs", async () => {
    const c = kernelJobStats().counters
    expect(c.started).toBeGreaterThan(0)
    expect(c.completed).toBeGreaterThan(0)
    expect(c.busy).toBeGreaterThanOrEqual(1)
    expect(c.cacheHits).toBeGreaterThanOrEqual(1)
    expect(c.aborted).toBeGreaterThanOrEqual(1)
    expect(kernelJobStats().rssBytes).toBeGreaterThan(0)
  })
})

describe("the job history, the worker id and the shutdown", () => {
  const base = {
    schemaVersion: 1 as const, id: "h", name: "Plate", material: "6061", part: { kind: "elements" as const, elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5 }] },
    machine: cam.kernel.findMachine("vmc-standard")!, quality: { resolution: 0.4 }
  }

  test("every job leaves a line with how it ended, how long it waited and ran, and how large its program was", async () => {
    clearKernelJobCache()
    await runKernelJob("cam-manufacture", { ...base, id: "history-1" })
    await runKernelJob("cam-manufacture", { ...base, id: "history-1" })
    const [ran, cached] = kernelJobHistory().slice(-2)
    expect(ran).toMatchObject({ job: "cam-manufacture", outcome: "completed" })
    expect(ran!.ranMs).toBeGreaterThan(0)
    expect(ran!.bytes).toBeGreaterThan(1000)
    expect(ran!.moves).toBeGreaterThan(10)
    expect(cached).toMatchObject({ job: "cam-manufacture", outcome: "cached", waitedMs: 0, ranMs: 0, bytes: ran!.bytes, moves: ran!.moves })
    expect(Object.keys(ran!).sort()).toEqual(["at", "bytes", "id", "job", "moves", "outcome", "ranMs", "waitedMs"])
    const killed = await runKernelJob("parametric-report", { history: plate, mode: "exit" } as never, { workerUrl: testWorker }).catch((e: KernelJobError) => e.reason)
    expect(killed).toBe("crashed")
    expect(kernelJobHistory().at(-1)).toMatchObject({ job: "parametric-report", outcome: "crashed", bytes: 0 })
  })

  test("the history keeps the last jobs only", async () => {
    for (let i = 0; i < KERNEL_HISTORY_SIZE + 5; i++) await runKernelJob("cam-plan", { ...base, id: `many-${i % 3}` })
    expect(kernelJobHistory()).toHaveLength(KERNEL_HISTORY_SIZE)
  })

  test("the worker is told which job it runs, and a terminated worker is not counted as a leak", async () => {
    const seen = await runKernelJob("parametric-report", { history: plate }, { workerUrl: testWorker }) as unknown as { id: string; name: string }
    expect(seen.name).toBe("parametric-report")
    expect(seen.id).toMatch(/^k\d+$/)
    expect(kernelJobHistory().at(-1)!.id).toBe(seen.id)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(kernelJobStats().counters.workerLeaks).toBe(0)
  })

  test("a shutdown stops the job that runs and refuses the next, until the host reopens", async () => {
    clearKernelJobCache()
    const running = runKernelJob("parametric-report", { history: heavy })
    await new Promise((resolve) => setTimeout(resolve, 30))
    shutdownKernelJobs()
    await expect(running).rejects.toMatchObject({ reason: "cancelled" })
    await expect(runKernelJob("cam-plan", { ...base, id: "after" })).rejects.toMatchObject({ reason: "cancelled" })
    expect(kernelJobStats().closing).toBe(true)
    reopenKernelJobs()
    expect((await runKernelJob("cam-plan", { ...base, id: "after" })).status).toBe("ok")
    expect(kernelJobStats().running).toBe(0)
  })
})

describe("the kernel jobs as Effect", () => {
  const base = {
    schemaVersion: 1 as const, id: "fx", name: "Plate", material: "6061", part: { kind: "elements" as const, elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5 }] },
    machine: cam.kernel.findMachine("vmc-standard")!, quality: { resolution: 0.4 }
  }

  test("a failure is a typed KernelJobError in the error channel", async () => {
    const exit = await Effect.runPromise(Effect.exit(runKernelJobEffect("parametric-report", { history: plate, mode: "exit" } as never, { workerUrl: testWorker })))
    expect(exit._tag).toBe("Failure")
    const error = await Effect.runPromise(Effect.flip(runKernelJobEffect("parametric-report", { history: plate, mode: "exit" } as never, { workerUrl: testWorker })))
    expect(error._tag).toBe("KernelJobError")
    expect(error.reason).toBe("crashed")
  })

  test("interrupting the effect stops its worker before the interruption completes", async () => {
    clearKernelJobCache()
    const fiber = Effect.runFork(runKernelJobEffect("parametric-report", { history: heavy }))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(kernelJobStats().running).toBe(1)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(kernelJobStats().running).toBe(0)
    expect(kernelJobHistory().at(-1)).toMatchObject({ job: "parametric-report", outcome: "cancelled" })
  })

  test("interrupting the last caller of a shared run stops the run", async () => {
    clearKernelJobCache()
    const a = Effect.runFork(runKernelJobEffect("cam-manufacture", { ...base, id: "fx-shared" }))
    const b = Effect.runFork(runKernelJobEffect("cam-manufacture", { ...base, id: "fx-shared" }))
    expect(kernelJobStats().inFlight).toBe(1)
    await Effect.runPromise(Fiber.interrupt(a))
    expect(kernelJobStats().inFlight).toBe(1)
    await Effect.runPromise(Fiber.interrupt(b))
    expect(kernelJobStats().inFlight).toBe(0)
    expect(kernelJobStats().running).toBe(0)
    expect(kernelJobStats().cached).toBe(0)
  })

  test("releasing the lifecycle layer stops the running job; building it again takes jobs", async () => {
    clearKernelJobCache()
    const scope = await Effect.runPromise(Scope.make())
    await Effect.runPromise(Layer.buildWithScope(KernelJobsLive, scope))
    const running = runKernelJob("parametric-report", { history: heavy })
    await new Promise((resolve) => setTimeout(resolve, 30))
    await Effect.runPromise(Scope.close(scope, Exit.void))
    await expect(running).rejects.toMatchObject({ reason: "cancelled" })
    expect(kernelJobStats().closing).toBe(true)
    const again = await Effect.runPromise(Scope.make())
    await Effect.runPromise(Layer.buildWithScope(KernelJobsLive, again))
    expect((await runKernelJob("cam-plan", { ...base, id: "fx-after" })).status).toBe("ok")
    await Effect.runPromise(Scope.close(again, Exit.void))
    reopenKernelJobs()
  })
})
