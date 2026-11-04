/**
 * The kernel run over HTTP, beyond the NC: process physics (spec 61) and the tolerance gate (spec 69 B4) reach `manufacture`, the
 * artifact contract carries their evidence, and a dropped request cancels its worker job (the client's abort interrupts the handler
 * fiber, which terminates the worker; the job history says `cancelled` and no worker is left running).
 */
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { clearKernelJobCache, kernelJobHistory, kernelJobStats } from "@cadcamfun/ai"
import { CamKernelResult, CamKernelPlanResult } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(180_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const input = { schemaVersion: 1, id: "process-job", name: "Plate", material: "6061", machine: "vmc-standard", elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5, x: 0, y: 0, z: 0 }] }
const manufacture = (json: unknown, init: RequestInit = {}) => app.call("/api/toolpaths/manufacture", { method: "POST", json, ...init })
const artifactOf = (body: unknown) => {
  const result = Schema.decodeUnknownSync(CamKernelResult)(body)
  if (result.status !== "ok") throw new Error(result.issues.map((i) => i.message).join("; "))
  return result.value
}

test("a run without process has no process evidence; with it, the artifact carries the uncalibrated report", async () => {
  const plain = artifactOf((await manufacture(input)).body)
  expect(plain.process).toBeUndefined()
  const response = await manufacture({ ...input, process: { feedOptimisation: "chip", dynamics: { preset: "economy" } } })
  expect(response.status).toBe(200)
  const artifact = artifactOf(response.body)
  const report = artifact.process
  if (report === undefined) throw new Error("no process report")
  expect(report.calibrated).toBe(false)
  expect(report.feedOptimisation.mode).toBe("chip")
  expect(report.feedOptimisation.operations.length).toBeGreaterThan(0)
  expect(report.cycleTime.seconds).toBeGreaterThan(0)
  expect(report.cycleTime.withToolChangesSeconds).toBeGreaterThanOrEqual(report.cycleTime.seconds)
  expect(report.toolLife.map((t) => t.toolId).sort()).toEqual([...new Set(artifact.tools.map((t) => t.id))].sort())
  expect(report.stability.every((s) => s.result.status === "indicative")).toBe(true)
  // The economy machine is slower than the standard one on the same program.
  const standard = artifactOf((await manufacture({ ...input, process: { feedOptimisation: "off" } })).body).process!
  expect(report.cycleTime.seconds).not.toBe(standard.cycleTime.seconds)
})

test("a malformed process request is a 400 before the kernel runs", async () => {
  expect((await manufacture({ ...input, process: { feedOptimisation: "fast" } })).status).toBe(400)
  expect((await manufacture({ ...input, process: { lifeLimit: 3 } })).status).toBe(400)
})

test("the tolerance gate is a claim of the artifact: an impossible tolerance fails it and the program is not released as verified", async () => {
  const artifact = artifactOf((await manufacture({ ...input, tolerance: 0.0001, enforceTolerance: true })).body)
  const claim = artifact.claims.find((c) => c.id === "tolerance")
  expect(claim?.status).toBe("failed")
  expect(artifact.release).not.toBe("verified-program")
  expect(artifactOf((await manufacture(input)).body).claims.some((c) => c.id === "tolerance")).toBe(false)
})

test("the plan of a request takes the same adapter (process does not change what is planned)", async () => {
  const a = Schema.decodeUnknownSync(CamKernelPlanResult)((await app.call("/api/toolpaths/plan", { method: "POST", json: input })).body)
  const b = Schema.decodeUnknownSync(CamKernelPlanResult)((await app.call("/api/toolpaths/plan", { method: "POST", json: { ...input, process: { feedOptimisation: "power" } } })).body)
  expect(a.status).toBe("ok")
  expect(b).toEqual(a)
})

test("a client that drops the request cancels its kernel job and leaves no worker running", async () => {
  clearKernelJobCache()
  // Large enough to run for seconds: the abort lands while the worker works.
  const big = { ...input, id: "abort-job", elements: [{ id: "block", type: "cube", width: 220, height: 160, depth: 60, x: 0, y: 0, z: 0 }], resolution: 0.25 }
  const before = new Set(kernelJobHistory().map((j) => j.id))
  const started = kernelJobStats().counters.started
  const controller = new AbortController()
  const pending = manufacture(big, { signal: controller.signal }).then((r) => r.status, () => "aborted")
  const deadline = Date.now() + 60_000
  while (kernelJobStats().counters.started === started && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5))
  expect(kernelJobStats().counters.started).toBeGreaterThan(started)
  controller.abort()
  await pending
  const settle = Date.now() + 10_000
  while (kernelJobStats().running > 0 && Date.now() < settle) await new Promise((resolve) => setTimeout(resolve, 10))
  expect(kernelJobStats().running).toBe(0)
  const ran = kernelJobHistory().filter((j) => !before.has(j.id) && j.job === "cam-manufacture")
  expect(ran.map((j) => j.outcome)).toContain("cancelled")
  expect(ran.some((j) => j.outcome === "completed")).toBe(false)
})
