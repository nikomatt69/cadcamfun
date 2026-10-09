import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { plateTemplate } from "@cadcamfun/core"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"
let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
let elementId: string
const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
const run = async (input: unknown) => JSON.parse(await buildTools(handlers, projectId).find((t) => t.id === "cad_parametric")!.execute(input, ctx))
beforeAll(async () => {
  app = await makeApp(); handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Parametric test" } })).body.id
  const created = await run({ action: "create", name: "Plate", history: plateTemplate() })
  expect(created.ok).toBe(true); elementId = created.ids[0]
})
afterAll(async () => { await app.dispose() })
describe("project parametric tools", () => {
  test("cases report failures without mutating the drawing", async () => {
    const before = await run({ action: "inspect", elementId })
    const report = await run({ action: "test", elementId, cases: [
      { name: "wide", parameters: { width: 90 }, expectedBodies: 1, minVolumeMm3: 27000 },
      { name: "invalid depth", parameters: { thick: -1 } },
      { name: "unknown", parameters: { nonexistent: 2 } }
    ] })
    expect(report.ok).toBe(false); expect(report.mutated).toBe(false)
    expect(report.cases.map((c: { passed: boolean }) => c.passed)).toEqual([true, false, false])
    expect((await run({ action: "inspect", elementId })).revision).toBe(before.revision)
  })
  test("updates preserve ids, reject stale revisions and reject invalid variants", async () => {
    const before = await run({ action: "inspect", elementId })
    const changed = await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { width: 80 } })
    expect(changed.ok).toBe(true); expect(changed.ids).toEqual([elementId]); expect(changed.report.bounds.max.x).toBeCloseTo(80, 2)
    expect((await run({ action: "update", elementId, expectedRevision: before.revision, parameters: { width: 90 } })).ok).toBe(false)
    expect((await run({ action: "update", elementId, expectedRevision: changed.revision, parameters: { thick: -1 } })).ok).toBe(false)
    expect((await run({ action: "inspect", elementId })).revision).toBe(changed.revision)
  })
})
