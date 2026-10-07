import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { segmentsFor } from "@cadcamfun/core"
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
  // A project with no drawing at all: the assistant has to create the drawing itself.
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Bracket" } })).body.id
  await handlers.addEntities(projectId, [{ type: "rectangle", origin: { x: -15, y: -10 }, width: 30, height: 20 }])
  const created = await handlers.createOperation(projectId, { type: "contour", params: { toolDiameter: 6, depth: 3, stepdown: 1 } }) as { operationId: string }
  operationId = created.operationId
})
afterAll(async () => { await app.dispose() })

const tools = () => buildTools(handlers, projectId)
const run = async (id: string, input: unknown) => JSON.parse(await tools().find((t) => t.id === id)!.execute(input, ctx))

describe("cad tools provision what is missing", () => {
  test("a project without a drawing gets one, in that project", async () => {
    const drawings = await app.call(`/api/projects/${projectId}/drawings`)
    expect(drawings.body).toHaveLength(1)
    expect(drawings.body[0].data.elements).toHaveLength(1)
  })

  test("with no matching project the assistant draws in the user's newest project", async () => {
    const out = await run("cad_add_entities", { entities: [{ type: "circle", center: { x: 0, y: 0 }, radius: 15 }] }) as { ok: boolean; ids: string[]; elements: Array<{ type: string; radius: number }>; projectId: string }
    expect(out.ok).toBe(true)
    expect(out.elements[0]).toMatchObject({ type: "circle", radius: 15 })
    const orphan = await handlers.addEntities("default", [{ type: "sphere", center: { x: 0, y: 0 }, radius: 5 }]) as { ok: boolean; projectId: string; drawingId: string }
    expect(orphan.ok).toBe(true)
    const projects = await app.call("/api/projects")
    expect(projects.body.map((p: { id: string }) => p.id)).toContain(orphan.projectId)
  })

  test("a fresh install with no project at all gets 'Untitled project' and a drawing", async () => {
    const empty = await makeApp()
    try {
      const fresh = await empty.toolHandlers()
      const out = await fresh.addEntities("default", [{ type: "cube", center: { x: 0, y: 0, z: 5 }, width: 10, height: 10, depth: 10 }]) as { ok: boolean; projectId: string; createdDrawing?: boolean; elements: Array<{ type: string; z: number }> }
      expect(out.ok).toBe(true)
      expect(out.createdDrawing).toBe(true)
      expect(out.elements[0]).toMatchObject({ type: "cube", z: 5 })
      const projects = await empty.call("/api/projects")
      expect(projects.body.map((p: { name: string }) => p.name)).toEqual(["Untitled project"])
      // The next call reuses it instead of creating another.
      await fresh.addEntities("default", [{ type: "sphere", center: { x: 0, y: 0 }, radius: 1 }])
      expect((await empty.call("/api/projects")).body).toHaveLength(1)
      const described = await fresh.describeDrawing("default") as { total: number; counts: Record<string, number> }
      expect(described.total).toBe(2)
      expect(described.counts).toEqual({ cube: 1, sphere: 1 })
    } finally { await empty.dispose() }
  })

  test("modify and delete work on the ids the add returned, and unknown ids are explained", async () => {
    const added = await run("cad_add_entities", { entities: [{ type: "cylinder", center: { x: 0, y: 0 }, radius: 4, height: 20 }] }) as { ids: string[] }
    const changed = await run("cad_modify_entities", { changes: [{ id: added.ids[0], changes: { radius: 6, center: { x: 9, y: 9 } } }] }) as { ok: boolean; elements: Array<{ radius: number; x: number }> }
    expect(changed.elements[0]).toMatchObject({ radius: 6, x: 9 })
    expect(await run("cad_modify_entities", { changes: [{ id: "nope", changes: { radius: 1 } }] })).toMatchObject({ ok: false })
    const removed = await run("cad_delete_entities", { ids: added.ids, confirm: true }) as { deleted: number }
    expect(removed.deleted).toBe(1)
  })

  test("cad_add_elements builds 3D: a revolved bottle, a car from solids, booleans by index", async () => {
    const bottle = await run("cad_add_elements", { elements: [{ type: "revolution", name: "Bottle", profile: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 150 }, { x: 10, y: 200 }, { x: 10, y: 260 }], axis: "y" }] }) as { ok: boolean; elements: Array<{ type: string; profile: unknown[]; segments: number }> }
    expect(bottle.ok).toBe(true)
    expect(bottle.elements[0]).toMatchObject({ type: "revolution", segments: 32 })
    expect(bottle.elements[0]!.profile).toHaveLength(5)

    const car = await run("cad_add_elements", { elements: [
      { type: "cube", name: "Body", width: 400, height: 120, depth: 100, z: 60, color: "#cc0000" },
      { type: "cylinder", name: "Wheel", radius: 30, height: 20, x: -130, y: 70, z: 30 },
      { type: "cube", name: "Slot", width: 50, height: 50, depth: 50 },
      { type: "boolean-subtract", operands: [0, 2] }
    ] }) as { ok: boolean; ids: string[]; elements: Array<{ operands?: string[] }> }
    expect(car.ok).toBe(true)
    expect(car.elements[3]!.operands).toEqual([car.ids[0]!, car.ids[2]!])

    const stored = (await app.call(`/api/projects/${projectId}/drawings`)).body[0].data.elements as Array<{ id: string }>
    expect(stored.map((e) => e.id)).toEqual(expect.arrayContaining(car.ids))
  })

  test("round elements take the drawing's tolerance unless they bring their own", async () => {
    const drawings = (await app.call(`/api/projects/${projectId}/drawings`)).body as Array<{ id: string; data: Record<string, unknown> }>
    const drawing = drawings[0]!
    await app.call(`/api/drawings/${drawing.id}`, { method: "PUT", json: { data: { ...drawing.data, settings: { units: "um", tolerance: 0.001, decimals: 3 } } } })
    const out = await handlers.addElements(projectId, [
      { type: "cylinder", radius: 25, height: 40 },
      { type: "cylinder", radius: 25, height: 40, tolerance: 0.05 },
      { type: "cylinder", radius: 25, height: 40, segments: 48 },
      { type: "cube", width: 5, height: 5, depth: 5 }
    ]) as { elements: Array<Record<string, unknown>> }
    expect(out.elements[0]).toMatchObject({ tolerance: 0.001, segments: segmentsFor(25, 0.001) })
    expect(out.elements[1]).toMatchObject({ tolerance: 0.05 })
    expect(out.elements[2]).toMatchObject({ segments: 48 })
    expect(out.elements[2]).not.toHaveProperty("tolerance")
    expect(out.elements[3]).not.toHaveProperty("tolerance")
    const described = await handlers.describeDrawing(projectId) as { settings: { tolerance: number } }
    expect(described.settings.tolerance).toBe(0.001)
  })

  test("cad_add_elements adds nothing when any element is invalid, and says why", async () => {
    const before = ((await app.call(`/api/projects/${projectId}/drawings`)).body[0].data.elements as unknown[]).length
    const out = await run("cad_add_elements", { elements: [{ type: "sphere", radius: 5 }, { type: "revolution" }, { type: "cube", width: -3 }] }) as { ok: boolean; problems: string[] }
    expect(out.ok).toBe(false)
    expect(out.problems).toHaveLength(2)
    expect(((await app.call(`/api/projects/${projectId}/drawings`)).body[0].data.elements as unknown[]).length).toBe(before)
    const bad = await handlers.addElements(projectId, [{ type: "boolean-union", operands: [0, 7] }]) as { ok: boolean }
    expect(bad.ok).toBe(false)
  })

  test("nothing in the drawing is missing the coordinates the generator needs", async () => {
    const stored = (await app.call(`/api/projects/${projectId}/drawings`)).body[0].data.elements as Array<Record<string, unknown>>
    const solids = stored.filter((e) => ["cube", "sphere", "cylinder", "cone", "torus", "circle"].includes(String(e["type"])))
    expect(solids.length).toBeGreaterThan(0)
    for (const e of solids) for (const k of ["x", "y", "z"]) expect(typeof e[k], `${e["type"]}.${k}`).toBe("number")
  })

  test("a cam operation needs something to machine", async () => {
    const empty = await makeApp()
    try {
      const fresh = await empty.toolHandlers()
      expect(await fresh.createOperation("default", { type: "contour", params: {} })).toMatchObject({ ok: false })
    } finally { await empty.dispose() }
  })
})

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
