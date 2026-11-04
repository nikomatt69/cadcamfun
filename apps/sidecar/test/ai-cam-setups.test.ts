import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { cam } from "@cadcamfun/core"
import { makeApp } from "./helpers.ts"

/** RM-02: the assistant plans, saves and lists multi-operation setups through the same documents as the `camSetup` HTTP group. */
setDefaultTimeout(60_000)
let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
const run = async (id: string, input: unknown) => JSON.parse(await buildTools(handlers, projectId).find((t) => t.id === id)!.execute(input, ctx))

beforeAll(async () => {
  app = await makeApp()
  handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Setups" } })).body.id
})
afterAll(async () => { await app.dispose() })

const tool = (id: string, diameter: number) => ({ id, name: `Endmill ${diameter}`, kind: "endmill", diameter, flutes: 2, maxRpm: 18000 })
const op = (id: string, t: ReturnType<typeof tool>) => ({
  id, name: `Op ${id}`, elementIds: [id], tool: t, enabled: true, fromPreviousStock: false,
  params: { ...cam.generator.DEFAULT_SETTINGS, depth: 2, stepdown: 1, toolDiameter: t.diameter, operationType: "pocket" }
})
const setup = (operations: unknown[], over: Record<string, unknown> = {}) => ({
  id: "s", name: "Bracket", machineType: "mill", workOffset: "G54", post: { ...cam.program.DEFAULT_POST_CONFIG, postId: "fanuc" },
  grouping: "single", retractBeforeToolChange: false, operations, ...over
})

test("cam setup_plan answers the plan and the issues without geometry and without storing", async () => {
  const good = await run("cam", { action: "setup_plan", setup: setup([op("a", tool("t6", 6)), op("b", tool("t3", 3))]) })
  expect(good).toMatchObject({ ok: true, mutated: false, valid: true, plan: { toolChanges: 1 }, issues: [] })
  expect(good.plan.programs).toHaveLength(1)
  const bad = await run("cam", { action: "setup_plan", setup: setup([{ ...op("a", tool("t6", 6)), elementIds: [] }]) })
  expect(bad).toMatchObject({ ok: true, valid: false })
  expect(bad.issues[0].message).toMatch(/no elements/)
  expect((await run("cam", { action: "setup_list" })).setups).toEqual([])
})

test("cam_edit setup_save stores a setup, setup_list reads it, and an update names the revision it read", async () => {
  const first = await run("cam_edit", { action: "setup_save", name: "Bracket", setup: setup([op("a", tool("t6", 6))]) })
  expect(first).toMatchObject({ ok: true, created: true, name: "Bracket", projectId })
  const listed = await run("cam", { action: "setup_list" })
  expect(listed.setups).toEqual([expect.objectContaining({ id: first.setupId, name: "Bracket", operations: 1, grouping: "single" })])
  // The same document the HTTP group serves.
  const http = await app.call(`/api/projects/${projectId}/cam-setups/${first.setupId}`)
  expect(http.status).toBe(200)
  expect(http.body.updatedAt).toBe(first.updatedAt)

  const updated = await run("cam_edit", { action: "setup_save", name: "Bracket v2", setupId: first.setupId, baseUpdatedAt: first.updatedAt, setup: setup([op("a", tool("t6", 6)), op("b", tool("t3", 3))]) })
  expect(updated).toMatchObject({ ok: true, created: false, name: "Bracket v2" })
  const stale = await run("cam_edit", { action: "setup_save", name: "Lost", setupId: first.setupId, baseUpdatedAt: first.updatedAt, setup: setup([op("a", tool("t6", 6))]) })
  expect(stale.ok).toBe(false)
  expect((await app.call(`/api/projects/${projectId}/cam-setups/${first.setupId}`)).body.name).toBe("Bracket v2")
  expect((await run("cam_edit", { action: "setup_save", name: "x", setupId: "missing", setup: setup([op("a", tool("t6", 6))]) })).ok).toBe(false)
})

test("a project the acting user cannot reach is refused", async () => {
  const tools = buildTools(handlers, "not-a-project")
  expect(JSON.parse(await tools.find((t) => t.id === "cam")!.execute({ action: "setup_list" }, ctx))).toMatchObject({ ok: false })
  expect(JSON.parse(await tools.find((t) => t.id === "cam_edit")!.execute({ action: "setup_save", name: "x", setup: setup([op("a", tool("t6", 6))]) }, ctx))).toMatchObject({ ok: false })
})
