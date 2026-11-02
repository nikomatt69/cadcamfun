import { expect, test } from "bun:test"
import { Effect, Metric } from "effect"
import { hostOperationTimer, type HostOperationTiming } from "../src/nikcli/request-timing.ts"
import { observeHostOperation } from "../src/observability.ts"

test("host timing separates approval wait from execution and records success after asynchronous settlement", async () => {
  const observations: HostOperationTiming[] = []
  let clock = 10
  const time = hostOperationTimer(async (event) => { observations.push(event) }, () => clock)
  const signal = new AbortController().signal
  const input = { tool: "cad_edit", agent: "cadcam-build-auto", signal }
  let grant!: () => void
  const permission = new Promise<void>((resolve) => { grant = resolve })
  const approval = time({ ...input, phase: "permission" }, () => permission)
  clock = 310
  expect(observations).toEqual([])
  grant()
  await approval
  clock = 320
  const value = await time({ ...input, phase: "execution" }, async () => { clock = 325; return "saved" })
  expect(value).toBe("saved")
  expect(observations).toEqual([
    { tool: "cad_edit", mode: "auto", phase: "permission", outcome: "ok", durationMs: 300 },
    { tool: "cad_edit", mode: "auto", phase: "execution", outcome: "ok", durationMs: 5 }
  ])
})

test("failed and cancelled host operations preserve their original failure even if the observer fails", async () => {
  const observations: HostOperationTiming[] = []
  const time = hostOperationTimer(async (event) => { observations.push(event); throw new Error("observer failed") }, () => 0)
  const controller = new AbortController()
  const original = new Error("permission rejected")
  const failed = await time({ tool: "cad_edit", agent: "cadcam-build-ask", phase: "permission", signal: controller.signal }, async () => { throw original }).catch((error: unknown) => error)
  expect(failed).toBe(original)
  expect(observations[0]).toMatchObject({ mode: "ask", phase: "permission", outcome: "error" })
  const cancelled = await time({ tool: "cad_edit", agent: "cadcam-build", phase: "execution", signal: controller.signal }, async () => { controller.abort(); throw original }).catch((error: unknown) => error)
  expect(cancelled).toBe(original)
  expect(observations[1]).toMatchObject({ mode: "approve", phase: "execution", outcome: "cancelled" })
  expect(await time({ tool: "cad", agent: "cadcam-build", phase: "execution", signal: new AbortController().signal }, async () => 42)).toBe(42)
})

test("host-operation metrics carry only bounded timing labels and record duration once", async () => {
  const result = await Effect.runPromise(Effect.gen(function* () {
    yield* observeHostOperation({ tool: "timing-probe", mode: "auto", phase: "permission", outcome: "ok", durationMs: 25 })
    const all = yield* Metric.snapshot
    return all.filter((entry) => entry.attributes?.["tool"] === "timing-probe")
  }))
  expect(result).toHaveLength(2)
  for (const metric of result) expect(metric.attributes).toEqual({ tool: "timing-probe", mode: "auto", phase: "permission", outcome: "ok" })
  const histogram = result.find((entry) => entry.type === "Histogram")
  expect(histogram?.type === "Histogram" && histogram.state.count).toBe(1)
  expect(histogram?.type === "Histogram" && histogram.state.sum).toBe(25)
})
