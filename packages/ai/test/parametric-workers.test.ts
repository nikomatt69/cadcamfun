import { expect, setDefaultTimeout, test } from "bun:test"
import { plateTemplate } from "@cadcamfun/core"
import { analyzeParametric } from "../src/parametric-analysis.ts"
import { clearKernelJobCache, kernelJobStats, runKernelJob, runKernelJobInline } from "../src/kernel-job.ts"
import { normalizeElementBatch } from "../src/element-normalization.ts"
import { groupIntoComponents } from "../src/component-grouping.ts"

// Real worker startup and exact geometry can exceed Bun's five-second unit-test budget on a loaded desktop.
setDefaultTimeout(30_000)

test("cached parametric evidence remains independent for each caller", async () => {
  clearKernelJobCache()
  const history = plateTemplate()
  const first = await analyzeParametric(history)
  const body = first.solids[0]
  if (!body) throw new Error("Expected a solid fixture")
  body.closedSolid = false
  const starts = kernelJobStats().counters.started
  const second = await analyzeParametric(history)
  expect(second.solids[0]?.closedSolid).toBe(true)
  expect(kernelJobStats().counters.started).toBe(starts)
})

test("parametric timeline and edit jobs preserve inline geometry checks", async () => {
  const history = plateTemplate()
  const timeline = { history, input: { action: "timeline" as const, elementId: "plate", expectedRevision: "fixture", suppress: ["hole1"] } }
  expect(await runKernelJob("parametric-timeline", timeline)).toEqual(runKernelJobInline("parametric-timeline", timeline))
  const edit = { history, edits: [{ op: "set_parameter" as const, name: "width", value: 80 }] }
  expect(await runKernelJob("parametric-edit", edit)).toEqual(runKernelJobInline("parametric-edit", edit))
})

test("primitive normalization stays cheap while nested parametric validation uses a worker", async () => {
  const starts = kernelJobStats().counters.started
  const primitive = await normalizeElementBatch([{ type: "cube", width: 10, height: 10, depth: 10 }])
  expect(primitive[0]?.ok).toBe(true)
  expect(kernelJobStats().counters.started).toBe(starts)
  const elements = [{ type: "component", elements: [{ type: "parametric", history: plateTemplate() }] }]
  expect(await normalizeElementBatch(elements)).toEqual(runKernelJobInline("cad-normalize", { elements }))
  expect(kernelJobStats().counters.started).toBe(starts + 1)
})

test("grouping normalized parametric elements preserves assembly placement in a worker", async () => {
  const entries = [{ index: 0, element: { type: "parametric", component: "Assembly", x: 10, y: 20, z: 30, history: plateTemplate() } }]
  const result = await runKernelJob("cad-group", { entries })
  expect(result).toEqual(groupIntoComponents(entries))
  expect(result[0]?.element).toMatchObject({ type: "component", x: 10, y: 20, z: 30, elements: [{ type: "parametric", x: 0, y: 0, z: 0 }] })
})
