import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let handlers: ToolHandlersShape
let projectId: string
let operationId: string
const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }

beforeAll(async () => {
  app = await makeApp()
  handlers = await app.toolHandlers()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Bracket" } })).body.id
  await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Plate" } })
  await handlers.addEntities(projectId, [{ type: "rectangle", origin: { x: -15, y: -10 }, width: 30, height: 20 }])
  const created = await handlers.createOperation(projectId, { type: "contour", params: { toolDiameter: 6, depth: 3, stepdown: 1 } }) as { operationId: string }
  operationId = created.operationId
})
afterAll(async () => { await app.dispose() })

const tools = () => buildTools(handlers, projectId)
const run = async (id: string, input: unknown) => JSON.parse(await tools().find((t) => t.id === id)!.execute(input, ctx))

describe("cam_list_operations / cam_update_operation / cam_suggest_parameters", () => {
  test("lists the operation with its tool and depth", async () => {
    const list = await run("cam_list_operations", {})
    expect(list).toEqual([expect.objectContaining({ id: operationId, operationType: "contour", depth: 3, tool: expect.objectContaining({ diameter: 6 }) })])
  })

  test("updating settings clears the stale G-code and keeps the rest", async () => {
    await run("cam_generate_gcode", { operationId })
    expect((await run("cam_list_operations", {}))[0].generated).toBe(true)
    const updated = await run("cam_update_operation", { operationId, params: { depth: 4 } })
    expect(updated).toMatchObject({ ok: true, settings: { depth: 4, toolDiameter: 6 } })
    expect((await run("cam_list_operations", {}))[0].generated).toBe(false)
    expect(await run("cam_update_operation", { operationId: "nope", params: {} })).toMatchObject({ ok: false })
  })

  test("suggestions come from the drawing", async () => {
    const out = await run("cam_suggest_parameters", { params: { toolDiameter: 6 } })
    expect(out.statistics).toBeDefined()
    expect(Array.isArray(out.warnings)).toBe(true)
  })
})

describe("cam_verify_toolpath", () => {
  test("verifies the stored operation against its stock and reports what is modelled", async () => {
    await run("cam_update_operation", { operationId, params: { depth: 3 } })
    const out = await run("cam_verify_toolpath", { operationId })
    expect(out.stats.removedVolume).toBeGreaterThan(0)
    expect(out.modelled).toEqual({ holder: false, shank: false, fixtures: 0, target: false })
    expect(out.note).toContain("not a machine certification")
    expect(out.preview).toBeUndefined()
  })

  test("a short cutter with a holder is checked against the depth", async () => {
    await run("cam_update_operation", { operationId, params: { depth: 8 } })
    const out = await run("cam_verify_toolpath", {
      operationId,
      tool: { cuttingLength: 3, stickout: 4, holderDiameter: 30, holderLength: 40 },
      stock: { minX: -30, maxX: 30, minY: -25, maxY: 25, minZ: -10, maxZ: 0 }
    })
    expect(out.ok).toBe(false)
    expect(out.issues.map((i: { code: string }) => i.code)).toEqual(expect.arrayContaining(["HolderCollision"]))
    expect(out.modelled.holder).toBe(true)
  })

  test("fixtures and a target part are validated and used", async () => {
    await run("cam_update_operation", { operationId, params: { depth: 3 } })
    const out = await run("cam_verify_toolpath", {
      operationId,
      stock: { minX: -30, maxX: 30, minY: -25, maxY: 25, minZ: -10, maxZ: 0 },
      fixtures: [{ id: "vise", bounds: { minX: -9, maxX: 9, minY: -9, maxY: 9, minZ: -10, maxZ: 5 } }],
      targetSolids: [{ _tag: "Box", origin: { x: -15, y: -10, z: -10 }, size: { x: 30, y: 20, z: 10 } }]
    })
    expect(out.modelled).toMatchObject({ fixtures: 1, target: true })
    expect(out.stats.gougeVolume).toBeDefined()
    // A malformed solid is rejected by the schema before the handler runs.
    await expect(run("cam_verify_toolpath", { operationId, targetSolids: [{ _tag: "Nope" }] })).rejects.toThrow()
  })

  test("unknown operations and non-mill operations are explained, not thrown", async () => {
    expect(await run("cam_verify_toolpath", { operationId: "nope" })).toMatchObject({ ok: false, error: "Operation not found in the active drawing" })
  })
})
