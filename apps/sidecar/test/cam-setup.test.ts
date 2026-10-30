import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { CamSetupGenerated, CamSetupPlan, CamSetupValidation } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(60_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const tool = (id: string, diameter: number) => ({ id, name: `Endmill Ø${diameter}`, kind: "endmill", diameter, flutes: 2, maxRpm: 18000 })
const rect = { id: "a", type: "rectangle", x: 0, y: 0, z: 0, width: 40, height: 30, depth: 5 }
const hole = { id: "b", type: "circle", x: 0, y: 0, z: 0, radius: 4, depth: 5 }
const op = (id: string, t: ReturnType<typeof tool>, over: Record<string, unknown> = {}) => ({
  id, name: `Op ${id}`, elementIds: [id], tool: t, enabled: true, fromPreviousStock: false,
  params: { ...cam.generator.DEFAULT_SETTINGS, depth: 2, stepdown: 1, toolDiameter: t.diameter, operationType: "pocket" }, ...over
})
const setup = (operations: unknown[], over: Record<string, unknown> = {}) => ({
  id: "s", name: "Bracket", machineType: "mill", workOffset: "G54", post: { ...cam.program.DEFAULT_POST_CONFIG, postId: "fanuc" },
  grouping: "single", retractBeforeToolChange: false, operations, ...over
})
const post = (path: string, json: unknown, auth = true) => app.call(`/api/cam/setups/${path}`, { method: "POST", json, auth })
const two = [op("a", tool("t6", 6)), op("b", tool("t3", 3))]

test("the setup routes are authenticated and refuse a body that is not a setup", async () => {
  for (const path of ["plan", "validate", "generate"]) {
    expect((await post(path, { setup: setup(two), elements: {} }, false)).status).toBe(401)
    expect((await post(path, {})).status).toBe(400)
  }
})

test("plan is a dry run: one program, two pockets, one tool change, no geometry needed", async () => {
  const response = await post("plan", { setup: setup(two) })
  expect(response.status).toBe(200)
  const plan = Schema.decodeUnknownSync(CamSetupPlan)(response.body)
  expect(plan.programs).toHaveLength(1)
  expect(plan.programs[0]).toMatchObject({ programNumber: 1000, toolNumbers: [1, 2], operations: ["a", "b"] })
  expect(plan.toolChanges).toBe(1)
  expect(plan.toolTable.map((e) => e.pocket)).toEqual([1, 2])
  const perTool = Schema.decodeUnknownSync(CamSetupPlan)((await post("plan", { setup: setup(two, { grouping: "perTool" }) })).body)
  expect(perTool.programs).toHaveLength(2)
})

test("validate lists the problems row by row, it does not fail the request", async () => {
  const response = await post("validate", { setup: setup([op("a", tool("t6", 6), { elementIds: [] }), op("b", tool("t3", 3), { pocket: 2 }), op("c", tool("t8", 8), { pocket: 2 })]) })
  expect(response.status).toBe(200)
  const { issues } = Schema.decodeUnknownSync(CamSetupValidation)(response.body)
  expect(issues.some((i) => i.operationId === "a" && /no elements/.test(i.message))).toBe(true)
  expect(issues.some((i) => i.operationId === "c" && /Pocket T2 holds/.test(i.message))).toBe(true)
})

test("generate posts one program with a tool change; the same bytes come back twice", async () => {
  const body = { setup: setup(two), elements: { a: rect, b: hole } }
  const response = await post("generate", body)
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CamSetupGenerated)(response.body)
  expect(result.programs).toHaveLength(1)
  const nc = result.programs[0]!.gcode
  expect((nc.match(/M30/g) ?? []).length).toBe(1)
  expect(nc.search(/T2\s*M6/)).toBeGreaterThan(nc.search(/T1\s*M6/))
  expect(nc).toMatch(/O1000/)
  expect(result.totals).toMatchObject({ programs: 1, toolChanges: 1 })
  expect(Schema.decodeUnknownSync(CamSetupGenerated)((await post("generate", body)).body).programs[0]!.gcode).toBe(nc)
  const perTool = Schema.decodeUnknownSync(CamSetupGenerated)((await post("generate", { ...body, setup: setup(two, { grouping: "perTool" }) })).body)
  expect(perTool.programs.map((p) => p.programNumber)).toEqual([1000, 1001])
})

test("an operation that names an element the request does not carry is a 400 that says which", async () => {
  const response = await post("generate", { setup: setup(two), elements: { a: rect } })
  expect(response.status).toBe(400)
  expect(JSON.stringify(response.body)).toContain("Op b: b")
})
