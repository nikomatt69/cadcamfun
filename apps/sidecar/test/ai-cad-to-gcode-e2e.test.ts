import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { Effect, Option } from "effect"
import { SUBAGENTS, makeToolRegistry, type SubagentId, type ToolHandlersShape, type ToolRegistryShape } from "@cadcamfun/ai"
import type { History } from "@cadcamfun/core"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let registry: ToolRegistryShape

beforeAll(async () => { app = await makeApp(); handlers = await app.toolHandlers(); registry = makeToolRegistry({ handlers }) })
afterAll(async () => { await app.dispose() })

interface Result {
  ok: boolean
  status?: string
  error?: string
  operationId?: string
  revision: string
  ids: string[]
  created: { ids: string[] }
  history: History
  bodyCount: number
  volumeMm3: number
  stats: { lines: number; cutLength: number; minZ: number; bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } }
  issues: Array<{ code: string; severity: string; message: string }>
  modelled: { holder: boolean; shank: boolean; fixtures: number; target: boolean }
  refinements: { used: number; remaining: number }
  preview: string
  keyway: { b: number; t1: number }
  thread: { tapDrill: number; pitch: number }
  operations: Array<{ ok: boolean; issues?: Array<{ code: string; severity: string }> }>
  mutated: boolean
}

/** Scripted specialist calls cross the actual registry, schemas, handlers, DB and geometry engine; no provider is needed. */
const step = async (projectId: string, role: SubagentId, tool: string, input: Record<string, unknown>): Promise<Result> => {
  expect(SUBAGENTS[role].tools, `${role} may not call ${tool}`).toContain(tool)
  const spec = Option.getOrThrow(await Effect.runPromise(registry.tool(projectId, tool)))
  return JSON.parse(await spec.execute(input, { sessionId: "cad-to-program", projectId, signal: new AbortController().signal })) as Result
}
const project = async (name: string): Promise<string> => (await app.call("/api/projects", { method: "POST", json: { name } })).body.id
const program = async (projectId: string, operationId: string): Promise<string> => {
  const result = await handlers.operationProgram!(projectId, operationId)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.gcode
}
const operation = async (projectId: string, type: string, params: Record<string, unknown>, revision: string): Promise<string> => {
  const created = await step(projectId, "machinist", "cam_edit", { action: "create", type, params, expectedRevision: revision })
  expect(created.ok).toBe(true)
  expect(created.operationId).toBeString()
  return created.operationId!
}
const plateStock = { width: 126, height: 86, depth: 14, x: 60, y: 40, topZ: 13, allowance: 1 }

describe("specialist CAD → DFM → checked plan → CAM → review", () => {
  test("plate holes, contour and bounded surface roughing reach the stored program and simulation", async () => {
    const id = await project("Plate")
    const recipe = await step(id, "modeler", "cad", { action: "parametric_recipe", recipe: "mounting_plate", params: { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true } })
    expect(recipe.ok).toBe(true)
    const fastener = await step(id, "modeler", "cad", { action: "parametric_fastener", size: "M5" })
    expect(fastener.thread).toMatchObject({ tapDrill: 4.2, pitch: 0.8 })
    const created = await step(id, "modeler", "cad_edit", { action: "parametric_create", history: recipe.history, name: "Plate" })
    expect(created.ok).toBe(true)
    const dfm = await step(id, "modeler", "cad", { action: "parametric_dfm", elementId: created.ids[0], process: "mill", toolDiameter: 6 })
    expect(dfm.issues.filter((i) => i.severity === "error")).toEqual([])
    expect((await step(id, "machinist", "cam_edit", { action: "stock_set", stock: plateStock })).ok).toBe(true)
    const proposals = [
      { type: "drill", params: { toolType: "drill", toolDiameter: 5.5, depth: 12, stepdown: 3 } },
      { type: "contour", params: { toolDiameter: 6, depth: 12, stepdown: 2 } },
      { type: "3d_surface", params: { toolDiameter: 6, depth: 13, stepdown: 2, surfaceStrategy: "roughing" } }
    ]
    const plan = await step(id, "planner", "cam", { action: "plan_check", operations: proposals })
    expect(plan).toMatchObject({ ok: true, status: "pass", mutated: false })
    expect(await handlers.listOperations(id)).toEqual([])
    for (const proposal of proposals) {
      const op = await operation(id, proposal.type, proposal.params, plan.revision)
      expect((await step(id, "reviewer", "cam", { action: "review", operationId: op })).status).toBe("unverified")
      const generated = await step(id, "machinist", "cam_edit", { action: "generate", operationId: op, maxLines: 1 })
      expect(generated.preview.split("\n")).toHaveLength(1)
      const gcode = await program(id, op)
      expect(gcode).not.toMatch(/Generic rectangular contour/)
      const analysis = await step(id, "reviewer", "cam", { action: "analyze", operationId: op, machineType: "mill" })
      expect(analysis.stats.lines).toBe(gcode.split(/\r?\n/).length)
      expect(analysis.issues.filter((i) => i.severity === "error")).toEqual([])
      if (proposal.type === "drill") {
        const holes = [...gcode.matchAll(/^G8[13] X(-?[\d.]+) Y(-?[\d.]+) Z(-?[\d.]+) R(-?[\d.]+)/gm)]
        expect(holes).toHaveLength(4)
        expect(holes.map((m) => [Number(m[1]), Number(m[2])]).sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!)).toEqual([[-49, -29], [-49, 29], [49, -29], [49, 29]])
        for (const h of holes) expect([Number(h[3]), Number(h[4])]).toEqual([1, 15])
      }
      if (proposal.type === "contour") {
        expect(gcode).toMatch(/X-63\.000/)
        expect(gcode).toMatch(/X63\.000/)
        expect(gcode).toMatch(/Y-43\.000/)
        expect(gcode).toMatch(/Y43\.000/)
      }
      if (proposal.type === "3d_surface") expect(analysis.stats.lines).toBeLessThan(20_000)
      const verified = await step(id, "verifier", "cam_verify", { action: "verify", operationId: op })
      expect(verified.issues.filter((i) => i.severity === "error")).toEqual([])
      const review = await step(id, "reviewer", "cam", { action: "review", operationId: op })
      expect(review).toMatchObject({ ok: true, status: "pass", revision: plan.revision, modelled: { holder: false, shank: false, fixtures: 0, target: false } })
    }
  }, 120_000)

  test("shaft turns its 130 mm profile and mills its keyway in a separate setup; turning simulation remains unsupported", async () => {
    const id = await project("Shaft")
    const key = await step(id, "modeler", "cad", { action: "parametric_fastener", shaftDiameter: 25 })
    expect(key.keyway).toMatchObject({ b: 8, t1: 4 })
    const created = await step(id, "modeler", "cad_edit", { action: "parametric_recipe_create", recipe: "stepped_shaft", params: { sections: [{ diameter: 30, length: 40 }, { diameter: 25, length: 60 }, { diameter: 20, length: 30 }], keywaySection: 1 }, name: "Shaft" })
    expect(created.ok).toBe(true)
    const dfm = await step(id, "modeler", "cad", { action: "parametric_dfm", elementId: created.created.ids[0], process: "turn" })
    expect(dfm.issues.filter((i) => i.severity === "error")).toEqual([])
    const params = { machineType: "lathe", toolDiameter: 0.8, depth: 5, stepdown: 1 }
    const plan = await step(id, "planner", "cam", { action: "plan_check", operations: [{ type: "turning", params }] })
    expect(plan.ok).toBe(true)
    const op = await operation(id, "turning", params, plan.revision)
    await step(id, "machinist", "cam_edit", { action: "generate", operationId: op })
    const gcode = await program(id, op)
    expect(gcode).toMatch(/; Tool: turning/)
    expect(gcode).toMatch(/; Stock: Ø50mm x 130mm/)
    const finish = gcode.slice(gcode.indexOf("; Finishing pass"))
    for (const diameter of [20, 25, 30]) expect(finish).toContain(`G1 X${diameter.toFixed(3)}`)
    expect(finish).toContain("Z-130.000")
    const analysis = await step(id, "reviewer", "cam", { action: "analyze", operationId: op, machineType: "lathe" })
    expect(analysis.issues.filter((i) => i.severity === "error")).toEqual([])
    const verified = await step(id, "verifier", "cam_verify", { action: "verify", operationId: op })
    expect(verified).toMatchObject({ ok: false, error: "Verification supports milling operations only" })
    expect((await step(id, "reviewer", "cam", { action: "review", operationId: op })).status).toBe("unverified")
    await step(id, "machinist", "cam_edit", { action: "stock_set", stock: { width: 140, height: 40, depth: 32, x: 65, y: 0, topZ: 15 } })
    const pocketParams = { toolDiameter: 6, depth: 20, stepdown: 1 }
    const pocketPlan = await step(id, "planner", "cam", { action: "plan_check", operations: [{ type: "pocket", params: pocketParams }] })
    expect(pocketPlan.ok).toBe(true)
    const pocket = await operation(id, "pocket", pocketParams, pocketPlan.revision)
    const generated = await step(id, "machinist", "cam_edit", { action: "generate", operationId: pocket })
    expect(generated.stats.minZ).toBeCloseTo(8.5, 2)
  }, 120_000)

  test("the slotted tube is stored and read back as one parametric body with six symmetric openings", async () => {
    const id = await project("Tube")
    const history: History = {
      parameters: { od: 60, bore: 50, len: 100, slotL: 30, slotW: 8 },
      features: [
        { id: "ring", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "o", kind: "circle", at: [0, 0], diameter: "od" }, { id: "i", kind: "circle", at: [0, 0], diameter: "bore" }] } },
        { id: "tube", type: "extrude", sketch: "ring", depth: "len", operation: "new" },
        { id: "slotSketch", type: "sketch", plane: "ZX", sketch: { entities: [], constraints: [], shapes: [{ id: "s", kind: "slot", at: ["len / 2", 0], length: "slotL", width: "slotW" }] } },
        { id: "slot", type: "extrude", sketch: "slotSketch", depth: "od + 10", direction: "symmetric", operation: "subtract" },
        { id: "slots", type: "pattern", feature: "slot", kind: "circular", count: 3, centre: [0, 0], span: 120 }
      ]
    }
    const validated = await step(id, "modeler", "cad", { action: "parametric_validate", history })
    expect(validated).toMatchObject({ ok: true, bodyCount: 1 })
    expect(validated.volumeMm3).toBeGreaterThan(75_000)
    expect(validated.volumeMm3).toBeLessThan(82_000)
    expect(validated.issues.filter((i) => i.severity === "error")).toEqual([])
    const created = await step(id, "modeler", "cad_edit", { action: "parametric_create", history, name: "Slotted tube" })
    expect(created.ok).toBe(true)
    const read = await step(id, "modeler", "cad", { action: "parametric_inspect", elementId: created.ids[0] })
    expect(read).toMatchObject({ ok: true, bodyCount: 1 })
    expect(read.history).toEqual(history)
    expect(read.volumeMm3).toBeCloseTo(validated.volumeMm3, 3)
  }, 120_000)

  test("code rejects invalid plans, stale proposals and a fourth refinement; a design change invalidates saved evidence", async () => {
    const id = await project("Review lifecycle")
    const created = await step(id, "modeler", "cad_edit", { action: "parametric_recipe_create", recipe: "mounting_plate", params: { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true } })
    const partId = created.created.ids[0]!
    const params = { toolType: "drill", toolDiameter: 5.5, depth: 12, stepdown: 3 }
    const missing = await step(id, "planner", "cam", { action: "plan_check", operations: [{ type: "drill", params }] })
    expect(missing).toMatchObject({ ok: false, status: "failed", mutated: false })
    expect(missing.operations[0]!.issues!.some((i) => i.code === "MISSING_STOCK")).toBe(true)
    await step(id, "machinist", "cam_edit", { action: "stock_set", stock: plateStock })
    for (const invalid of [{ type: "turning", params }, { type: "drill", params: { ...params, depth: -1 } }, { type: "pocket", params: { toolDiameter: 40, depth: 12 } }]) {
      expect((await step(id, "planner", "cam", { action: "plan_check", operations: [invalid] })).ok).toBe(false)
    }
    expect(await handlers.listOperations(id)).toEqual([])
    const plan = await step(id, "planner", "cam", { action: "plan_check", operations: [{ type: "drill", params }] })
    expect(plan.ok).toBe(true)
    const op = await operation(id, "drill", params, plan.revision)
    const fixtures = [{ id: "vise", bounds: { minX: -70, maxX: 70, minY: -50, maxY: 50, minZ: -10, maxZ: 20 } }]
    const verify = () => step(id, "verifier", "cam_verify", { action: "verify", operationId: op, fixtures })
    // The verifier generates the missing program first: verification only replays what is stored.
    await step(id, "verifier", "cam_verify", { action: "generate", operationId: op })
    expect((await verify()).status).toBe("failed")
    for (let round = 1; round <= 3; round++) {
      expect((await step(id, "machinist", "cam_edit", { action: "update", operationId: op, params: { feedrate: 800 - round * 100 }, expectedRevision: plan.revision })).ok).toBe(true)
      await step(id, "machinist", "cam_edit", { action: "generate", operationId: op })
      expect((await verify()).status).toBe("failed")
      expect((await step(id, "reviewer", "cam", { action: "review", operationId: op })).refinements).toEqual({ used: round, remaining: 3 - round })
    }
    const before = await program(id, op)
    expect(await step(id, "machinist", "cam_edit", { action: "update", operationId: op, params: { feedrate: 123 }, expectedRevision: plan.revision })).toMatchObject({ ok: false, status: "refinement_limit" })
    expect(await program(id, op)).toBe(before)
    const inspected = await step(id, "modeler", "cad", { action: "parametric_inspect", elementId: partId })
    expect((await step(id, "modeler", "cad_edit", { action: "parametric_update", elementId: partId, expectedRevision: inspected.revision, parameters: { width: 121 } })).ok).toBe(true)
    expect((await step(id, "reviewer", "cam", { action: "review", operationId: op })).status).toBe("stale")
    expect((await step(id, "planner", "cam", { action: "plan_check", operations: [{ type: "drill", params }], expectedRevision: plan.revision })).status).toBe("stale")
    expect((await step(id, "machinist", "cam_edit", { action: "create", type: "drill", params, expectedRevision: plan.revision })).status).toBe("stale")
    expect((await handlers.operationProgram!(id, op)).ok).toBe(false)
    const fresh = await step(id, "planner", "cam", { action: "plan_check", operations: [{ type: "drill", params }] })
    expect((await step(id, "machinist", "cam_edit", { action: "update", operationId: op, params: { feedrate: 500 }, expectedRevision: fresh.revision })).ok).toBe(true)
    expect((await step(id, "reviewer", "cam", { action: "review", operationId: op })).refinements).toEqual({ used: 0, remaining: 3 })
  }, 120_000)
})
