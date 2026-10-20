import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { plateTemplate, segmentsFor } from "@cadcamfun/core"
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
    const out = await run("cad_edit", { action: "add_entities", entities: [{ type: "circle", center: { x: 0, y: 0 }, radius: 15 }] }) as { ok: boolean; ids: string[]; elements: Array<{ type: string; radius: number }>; projectId: string }
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
    const added = await run("cad_edit", { action: "add", elements: [{ type: "cylinder", x: 0, y: 0, radius: 4, height: 20 }] }) as { ids: string[] }
    const changed = await run("cad_edit", { action: "modify", changes: [{ id: added.ids[0], changes: { radius: 6, center: { x: 9, y: 9 } } }] }) as { ok: boolean; elements: Array<{ radius: number; x: number }> }
    expect(changed.elements[0]).toMatchObject({ radius: 6, x: 9 })
    expect(await run("cad_edit", { action: "modify", changes: [{ id: "nope", changes: { radius: 1 } }] })).toMatchObject({ ok: false })
    const removed = await run("cad_edit", { action: "delete", ids: added.ids, confirm: true }) as { deleted: number }
    expect(removed.deleted).toBe(1)
  })

  test("cad_modify_entities moves and turns a solid, changes a parametric dimension, and refuses a change that breaks the part", async () => {
    const template = plateTemplate()
    const plate = { type: "parametric", name: "Plate", history: template }
    const added = await run("cad_edit", { action: "add", elements: [{ type: "cube", width: 10, height: 10, depth: 10 }, plate] }) as { ok: boolean; ids: string[]; problems?: string[]; skipped?: Array<{ error: string }> }
    expect(added.ok).toBe(true)
    const [cubeId, plateId] = added.ids as [string, string]
    // Placement and rotation reach the stored element (they used to be dropped by the change schema).
    const moved = await run("cad_edit", { action: "modify", changes: [{ id: cubeId, changes: { x: 40, z: 5, rotation: { x: 90, y: 0, z: 0 } } }] }) as { ok: boolean; elements: Array<Record<string, unknown>> }
    expect(moved.elements[0]).toMatchObject({ x: 40, z: 5, rotation: { x: 90, y: 0, z: 0 } })
    // One named dimension changes, the features stay.
    const wider = await run("cad_edit", { action: "modify", changes: [{ id: plateId, changes: { parameters: { width: 90 } } }] }) as { ok: boolean; elements: Array<{ history: { parameters: Record<string, number>; features: unknown[] } }> }
    expect(wider).toMatchObject({ ok: true })
    expect(wider.elements[0]!.history.parameters).toEqual({ ...template.parameters, width: 90 })
    expect(wider.elements[0]!.history.features).toHaveLength(template.features.length)
    // A history that builds nothing, a rotation that is not {x,y,z} and a negative size change nothing at all.
    for (const bad of [{ history: { parameters: {}, features: [] } }, { rotation: "ninety" }]) {
      const refused = await run("cad_edit", { action: "modify", changes: [{ id: bad.history ? plateId : cubeId, changes: bad }] }) as { ok: boolean; error: string }
      expect(refused.ok).toBe(false)
      expect(refused.error).toContain("Nothing changed")
    }
  })

  test("cad_add_elements builds 3D: a revolved bottle, a car from solids, booleans by index", async () => {
    const bottle = await run("cad_edit", { action: "add", elements: [{ type: "revolution", name: "Bottle", profile: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 150 }, { x: 10, y: 200 }, { x: 10, y: 260 }], axis: "y" }] }) as { ok: boolean; elements: Array<{ type: string; profile: unknown[]; segments: number }> }
    expect(bottle.ok).toBe(true)
    expect(bottle.elements[0]).toMatchObject({ type: "revolution", segments: 32 })
    expect(bottle.elements[0]!.profile).toHaveLength(5)

    const car = await run("cad_edit", { action: "add", elements: [
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

  test("cad_add_elements judges each element: the valid ones are added, the others are named, a boolean follows its operands", async () => {
    const count = async () => ((await app.call(`/api/projects/${projectId}/drawings`)).body[0].data.elements as unknown[]).length
    const before = await count()
    const out = await run("cad_edit", { action: "add", elements: [{ type: "sphere", radius: 5, name: "Ball" }, { type: "revolution" }, { type: "cube", width: -3 }, { type: "cube", width: 4, height: 4, depth: 4, name: "Block" }] }) as { ok: boolean; ids: string[]; skipped: Array<{ index: number; error: string }>; note: string }
    expect(out.ok).toBe(true)
    expect(out.ids).toHaveLength(2)
    expect(out.skipped.map((s) => s.index)).toEqual([1, 2])
    expect(out.note).toContain("2 of 4")
    expect(await count()).toBe(before + 2)
    // A boolean over a skipped element is skipped too; operand indexes still point at the right elements after the gap.
    const boolean = await run("cad_edit", { action: "add", elements: [{ type: "cube", width: 10, height: 10, depth: 10 }, { type: "cube", width: -1 }, { type: "cylinder", radius: 2, height: 30 }, { type: "boolean-subtract", operands: [0, 2] }, { type: "boolean-union", operands: [0, 1] }] }) as { ok: boolean; elements: Array<{ id: string; type: string; operands?: string[] }>; skipped: Array<{ index: number }> }
    expect(boolean.skipped.map((s) => s.index).sort()).toEqual([1, 4])
    const sub = boolean.elements.find((e) => e.type === "boolean-subtract")!
    expect(sub.operands).toEqual([boolean.elements[0]!.id, boolean.elements[1]!.id])
    // Every element invalid: nothing added, every reason listed.
    const none = await run("cad_edit", { action: "add", elements: [{ type: "revolution" }, { type: "cube", width: -3 }] }) as { ok: boolean; problems: string[] }
    expect(none.ok).toBe(false)
    expect(none.problems).toHaveLength(2)
    const bad = await handlers.addElements(projectId, [{ type: "boolean-union", operands: [0, 7] }]) as { ok: boolean }
    expect(bad.ok).toBe(false)
  })

  test("nothing in the drawing is missing the coordinates the generator needs", async () => {
    const stored = (await app.call(`/api/projects/${projectId}/drawings`)).body[0].data.elements as Array<Record<string, unknown>>
    const solids = stored.filter((e) => ["cube", "sphere", "cylinder", "cone", "torus", "circle"].includes(String(e["type"])))
    expect(solids.length).toBeGreaterThan(0)
    for (const e of solids) for (const k of ["x", "y", "z"]) expect(typeof e[k], `${e["type"]}.${k}`).toBe("number")
  })

  test("cad_check_design reads the model and the design space, and finds what is illogical", async () => {
    const fresh = await makeApp()
    try {
      const h = await fresh.toolHandlers()
      const project = (await fresh.call("/api/projects", { method: "POST", json: { name: "Design" } })).body.id as string
      await h.addElements(project, [
        { type: "cube", name: "Body", width: 100, height: 40, depth: 20, x: 0, y: 0, z: 10 },
        { type: "cylinder", name: "Wheel", radius: 12, height: 8, x: 0, y: 24, z: 10 },
        { type: "cube", name: "Lost", width: 10, height: 10, depth: 10, x: 900, y: 900, z: 900 },
        { type: "cube", name: "Turned", width: 10, height: 10, depth: 10, x: 0, y: 0, z: 30, rotation: { x: 1.5708, y: 0, z: 0 } }
      ])
      const out = await h.checkDesign(project) as { ok: boolean; issues: Array<{ code: string }>; designSpace: { handedness: string; angles: { rotation: string } }; stats: { elements: number } }
      expect(out.designSpace.handedness).toBe("right-handed")
      expect(out.designSpace.angles.rotation).toContain("DEGREES")
      expect(out.stats.elements).toBe(4)
      const codes = out.issues.map((i) => i.code)
      expect(codes).toContain("FLOATING")
      expect(codes).toContain("ROTATION_IN_RADIANS")
      expect(out.ok).toBe(true)
      const bad = await h.addElements(project, [{ type: "cube", rotation: "ninety" }]) as { ok: boolean; problems: string[] }
      expect(bad.ok).toBe(false)
      expect(bad.problems[0]).toContain("rotation must be {x, y, z} in degrees")
    } finally { await fresh.dispose() }
  })

  test("cad_import_drawing turns a DXF into a 3D plate with a hole, stored with real operand ids", async () => {
    const fresh = await makeApp()
    try {
      const h = await fresh.toolHandlers()
      const project = (await fresh.call("/api/projects", { method: "POST", json: { name: "Import" } })).body.id as string
      const line = (a: number, b: number, c: number, d: number) => `0\nLINE\n8\n0\n10\n${a}\n20\n${b}\n11\n${c}\n21\n${d}\n`
      const dxf = `0\nSECTION\n2\nENTITIES\n${line(0, 0, 80, 0)}${line(80, 0, 80, 40)}${line(80, 40, 0, 40)}${line(0, 40, 0, 0)}0\nCIRCLE\n8\n0\n10\n40\n20\n20\n40\n6\n0\nENDSEC\n0\nEOF\n`
      const tool = buildTools(h, project).find((t) => t.id === "cad_edit")!
      const out = JSON.parse(String(await tool.execute({ action: "import", format: "dxf", content: dxf, depth: 8, name: "Plate" }, ctx))) as { ok: boolean; stats: { solids: number; holes: number }; elements: Array<Record<string, unknown>> }
      expect(out.ok).toBe(true)
      expect(out.stats).toMatchObject({ solids: 1, holes: 1 })
      const sub = out.elements.find((e) => e["type"] === "boolean-subtract")!
      const ids = out.elements.map((e) => e["id"])
      for (const operand of sub["operands"] as unknown[]) expect(ids).toContain(operand)
      const stored = (await fresh.call(`/api/projects/${project}/drawings`)).body[0].data.elements as unknown[]
      expect(stored).toHaveLength(3)
      const none = JSON.parse(String(await tool.execute({ format: "dxf", content: `0\nSECTION\n2\nENTITIES\n${line(0, 0, 10, 0)}0\nENDSEC\n0\nEOF\n`, depth: 8 }, ctx))) as { ok: boolean }
      expect(none.ok).toBe(false)
    } finally { await fresh.dispose() }
  })

  test("a lathe operation needs no drawing, and a probing operation needs none either", async () => {
    const fresh = await makeApp()
    try {
      const h = await fresh.toolHandlers()
      const project = (await fresh.call("/api/projects", { method: "POST", json: { name: "Machines" } })).body.id as string
      const lathe = await h.createOperation(project, { type: "turning", params: { machineType: "lathe", toolType: "turning", stockDiameter: 40, stockLength: 80, depth: 2, stepdown: 1 } }) as { ok: boolean; operationId: string }
      expect(lathe.ok).toBe(true)
      const gcode = await h.generateGcode(project, lathe.operationId)
      if (!("gcode" in gcode)) throw new Error("Expected a generated lathe program")
      expect(gcode.gcode).toContain("G18")
      expect(gcode.gcode).toContain("G1 Z-80.000")
      const probing = await h.createOperation(project, { type: "probing", params: { toolType: "probe", probeCycle: "corner", workOffset: "G55" } }) as { ok: boolean; operationId: string }
      expect(probing.ok).toBe(true)
      const program = await h.generateGcode(project, probing.operationId)
      if (!("gcode" in program)) throw new Error("Expected a generated probing program")
      expect(program.gcode).toContain("G10 L20 P2 X-2.000")
      expect(program.gcode).not.toMatch(/\bM3\b/)
      // A mill contour still needs something to cut.
      expect(await h.createOperation(project, { type: "contour", params: {} })).toMatchObject({ ok: false })
    } finally { await fresh.dispose() }
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
    const list = await run("cam", { action: "operations", })
    expect(list).toEqual([expect.objectContaining({ id: operationId, operationType: "contour", depth: 3, tool: expect.objectContaining({ diameter: 6 }) })])
  })

  test("updating settings clears the stale G-code and keeps the rest", async () => {
    await run("cam_edit", { action: "generate", operationId })
    expect((await run("cam", { action: "operations", }))[0].generated).toBe(true)
    const updated = await run("cam_edit", { action: "update", operationId, params: { depth: 4 } })
    expect(updated).toMatchObject({ ok: true, settings: { depth: 4, toolDiameter: 6 } })
    expect((await run("cam", { action: "operations", }))[0].generated).toBe(false)
    expect(await run("cam_edit", { action: "update", operationId: "nope", params: {} })).toMatchObject({ ok: false })
  })

  test("suggestions come from the drawing", async () => {
    const out = await run("cam", { action: "suggest", params: { toolDiameter: 6 } })
    expect(out.statistics).toBeDefined()
    expect(Array.isArray(out.warnings)).toBe(true)
  })
})

describe("cam_verify_toolpath", () => {
  test("verifies the stored operation against its stock and reports what is modelled", async () => {
    await run("cam_edit", { action: "update", operationId, params: { depth: 3 } })
    // The update dropped the program; verification replays a stored program only, it never makes one.
    expect(await run("cam_edit", { action: "verify", operationId })).toMatchObject({ ok: false, error: expect.stringContaining("generate") })
    const generated = await run("cam_edit", { action: "generate", operationId })
    const out = await run("cam_edit", { action: "verify", operationId })
    expect(out.programHash).toBe(generated.programHash)
    expect(out.coverage).toMatchObject({ resolutionMm: expect.any(Number), issuesOmitted: expect.any(Number) })
    expect(out.stats.removedVolume).toBeGreaterThan(0)
    expect(out.modelled).toEqual({ holder: false, shank: false, fixtures: 0, target: false })
    expect(out.note).toContain("not a machine certification")
    expect(out.preview).toBeUndefined()
  })

  test("a short cutter with a holder is checked against the depth", async () => {
    await run("cam_edit", { action: "update", operationId, params: { depth: 8 } })
    await run("cam_edit", { action: "generate", operationId })
    const out = await run("cam_edit", { action: "verify", 
      operationId,
      tool: { cuttingLength: 3, stickout: 4, holderDiameter: 30, holderLength: 40 },
      stock: { minX: -30, maxX: 30, minY: -25, maxY: 25, minZ: -10, maxZ: 0 }
    })
    expect(out.ok).toBe(false)
    expect(out.issues.map((i: { code: string }) => i.code)).toEqual(expect.arrayContaining(["HolderCollision"]))
    expect(out.modelled.holder).toBe(true)
  })

  test("fixtures and a target part are validated and used", async () => {
    await run("cam_edit", { action: "update", operationId, params: { depth: 3 } })
    await run("cam_edit", { action: "generate", operationId })
    const out = await run("cam_edit", { action: "verify", 
      operationId,
      stock: { minX: -30, maxX: 30, minY: -25, maxY: 25, minZ: -10, maxZ: 0 },
      fixtures: [{ id: "vise", bounds: { minX: -9, maxX: 9, minY: -9, maxY: 9, minZ: -10, maxZ: 5 } }],
      targetSolids: [{ _tag: "Box", origin: { x: -15, y: -10, z: -10 }, size: { x: 30, y: 20, z: 10 } }]
    })
    expect(out.modelled).toMatchObject({ fixtures: 1, target: true })
    expect(out.stats.gougeVolume).toBeDefined()
    // A malformed solid is rejected by the schema before the handler runs.
    expect(await run("cam_edit", { action: "verify", operationId, targetSolids: [{ _tag: "Nope" }] })).toMatchObject({ ok: false, error: expect.any(String) })
  })

  test("verifying never changes the stored program, and the report is bound to it", async () => {
    await run("cam_edit", { action: "update", operationId, params: { depth: 3 } })
    const generated = await run("cam_edit", { action: "generate", operationId })
    const before = await handlers.operationProgram!("default", operationId)
    const out = await run("cam_edit", { action: "verify", operationId })
    const after = await handlers.operationProgram!("default", operationId)
    expect(before.ok && after.ok && after.gcode === before.gcode).toBe(true)
    expect(out).toMatchObject({ operationId, programHash: generated.programHash })
    expect(await run("cam", { action: "review", operationId })).toMatchObject({ status: out.ok ? "pass" : "failed" })
    // The stored NC text is untouched, but its manufacturing input (the drawing) moved on: the report no longer applies.
    const extra = await run("cad_edit", { action: "add", elements: [{ type: "cube", width: 4, height: 4, depth: 4, x: 80 }] })
    expect((await handlers.operationProgram!("default", operationId)).ok).toBe(false)
    expect(await run("cam", { action: "review", operationId })).toMatchObject({ status: "stale" })
    await run("cad_edit", { action: "delete", ids: extra.ids, confirm: true })
  })

  test("unknown operations and non-mill operations are explained, not thrown", async () => {
    expect(await run("cam_edit", { action: "verify", operationId: "nope" })).toMatchObject({ ok: false, error: "Operation not found in the active drawing" })
  })
})

describe("library and chain tools (spec 22 §3)", () => {
  test("a component is saved from elements, listed, inserted and deleted", async () => {
    const fresh = await makeApp()
    try {
      const h = await fresh.toolHandlers()
      const project = (await fresh.call("/api/projects", { method: "POST", json: { name: "Components" } })).body.id as string
      const added = await h.addElements(project, [
        { type: "cube", name: "A", width: 10, height: 10, depth: 10, x: 0, y: 0, z: 5 },
        { type: "cylinder", name: "B", radius: 3, height: 10, x: 20, y: 0, z: 5 }
      ]) as { ids: string[] }
      const saved = await h.saveComponent(project, added.ids, "Bracket pair", { description: "Two blocks on a 20 mm pitch", type: "mechanical", isPublic: true }) as { ok: boolean; componentId: string; children: number }
      expect(saved.ok).toBe(true)
      expect(saved.children).toBe(2)
      // The library metadata travels with the save: a generated component is not a name and geometry with empty fields.
      const savedDetail = (await fresh.call(`/api/components/${saved.componentId}`)).body
      expect(savedDetail).toMatchObject({ name: "Bracket pair", description: "Two blocks on a 20 mm pitch", type: "mechanical", isPublic: true })
      const canvas = await h.addElements(project, [{ type: "component", name: "Canvas fixture", elements: [{ type: "cube", width: 8, height: 8, depth: 8 }] }]) as { ids: string[] }
      const list = await h.listComponents(project) as Array<{ id: string; name: string; children: number }>
      expect(list).toContainEqual(expect.objectContaining({ id: canvas.ids[0], name: "Canvas fixture", children: 1 }))
      expect(list.some((component) => component.id === saved.componentId)).toBe(false)
      const reusable = await h.lookupComponent("Bracket pair") as Array<{ id: string; name: string }>
      expect(reusable).toContainEqual(expect.objectContaining({ id: saved.componentId, name: "Bracket pair" }))
      const inserted = await h.insertComponent(project, saved.componentId, { move: { x: 5, y: 5, z: 0 } }) as { ok: boolean; ids: string[] }
      expect(inserted.ok).toBe(true)
      expect(inserted.ids.length).toBeGreaterThan(0)
      expect((await h.deleteComponent(saved.componentId)) as { ok: boolean }).toMatchObject({ ok: true })
      expect(await h.deleteComponent("nope")).toMatchObject({ ok: false })
      expect(await h.insertComponent(project, "nope")).toMatchObject({ ok: false })
    } finally { await fresh.dispose() }
  })

  test("the component library searches accessible projects and reuses a saved component in another project", async () => {
    const fresh = await makeApp()
    try {
      const h = await fresh.toolHandlers()
      const source = (await fresh.call("/api/projects", { method: "POST", json: { name: "Source library" } })).body.id as string
      const target = (await fresh.call("/api/projects", { method: "POST", json: { name: "Target assembly" } })).body.id as string
      await fresh.call(`/api/projects/${target}/drawings`, { method: "POST", json: { name: "Assembly", data: { elements: [] } } })
      const added = await h.addElements(source, [{ type: "cube", name: "Reusable jaw", width: 30, height: 12, depth: 8, z: 4 }]) as { ids: string[] }
      const saved = await h.saveComponent(source, added.ids, "Reusable vise jaw") as { ok: boolean; componentId: string }
      expect(saved.ok).toBe(true)

      const canvas = await h.listComponents(target) as Array<{ id: string }>
      expect(canvas.some((component) => component.id === saved.componentId)).toBe(false)
      const library = await h.lookupComponent("Reusable vise jaw") as Array<{ id: string; projectId: string; projectName: string }>
      expect(library).toContainEqual(expect.objectContaining({ id: saved.componentId, projectId: source, projectName: "Source library" }))

      const inserted = await h.insertComponent(target, saved.componentId, { move: { x: 40, y: 5, z: 0 } }) as { ok: boolean; component: { id: string }; ids: string[] }
      expect(inserted).toMatchObject({ ok: true, component: { id: saved.componentId } })
      expect(inserted.ids).toHaveLength(1)
      const drawing = (await fresh.call(`/api/projects/${target}/drawings`)).body[0]
      expect(drawing.data.elements).toEqual(expect.arrayContaining([expect.objectContaining({ id: inserted.ids[0] })]))
    } finally { await fresh.dispose() }
  })

  test("lib_upsert_* writes materials, tools and machine configs, and defaults stick", async () => {
    const fresh = await makeApp()
    try {
      const h = await fresh.toolHandlers()
      const project = (await fresh.call("/api/projects", { method: "POST", json: { name: "Library" } })).body.id as string
      const mat = await h.upsertMaterial({ name: "Al 6061", properties: { density: 2.7 }, isPublic: false }) as { ok: boolean; id: string; created: boolean }
      expect(mat).toMatchObject({ ok: true, created: true })
      expect((await h.upsertMaterial({ id: mat.id, name: "Al 6061 T6", properties: { density: 2.7 } })) as { created: boolean }).toMatchObject({ created: false })
      const tool = await h.upsertTool({ name: "6mm endmill", type: "endmill", diameter: 6, material: "carbide", numberOfFlutes: 3, cuttingLength: 18, totalLength: 60, shankDiameter: 6, cornerRadius: 0.5, tipAngle: 90, threadPitch: 1.25, holderDiameter: 25, holderLength: 40, stickout: 30 }) as { ok: boolean; id: string; created: boolean }
      expect(tool.created).toBe(true)
      expect(await h.upsertTool({ name: "bad", type: "endmill", diameter: 6, material: "carbide", cuttingLength: 40, totalLength: 30 })).toMatchObject({ ok: false, error: expect.stringContaining("cuttingLength") })
      expect(await h.lookupTool("bad")).toEqual([])
      const machine = await h.upsertMachineConfig({ name: "Mill", kind: "mill", postProcessor: "linuxcnc", kinematics: { x: { min: -300, max: 300 } } }) as { ok: boolean; id: string; created: boolean }
      expect(machine.created).toBe(true)
      expect(await h.lookupMaterial("Al 6061 T6")).toContainEqual(expect.objectContaining({ id: mat.id, name: "Al 6061 T6" }))
      expect(await h.lookupTool("6mm endmill")).toContainEqual(expect.objectContaining({ id: tool.id, diameter: 6, cuttingLength: 18, cornerRadius: 0.5, tipAngle: 90, threadPitch: 1.25, holderDiameter: 25, holderLength: 40, stickout: 30 }))
      expect(await h.lookupMachineConfig("Mill")).toContainEqual(expect.objectContaining({ id: machine.id, name: "Mill", type: "mill" }))
      const defaults = await h.setProjectDefault({ projectId: project, materialId: mat.id, toolId: tool.id, machineConfigId: machine.id })
      expect(defaults).toMatchObject({ ok: true, projectId: project })
    } finally { await fresh.dispose() }
  })

  test("library items and cost rows are created, replaced and refused like the other library rows", async () => {
    const fresh = await makeApp()
    try {
      const h = await fresh.toolHandlers()
      const item = await h.upsertLibraryItem({ name: "Vise setup", category: "setup", type: "fixture", data: { jawWidth: 150 }, tags: ["vise"] }) as { ok: boolean; id: string; created: boolean }
      expect(item).toMatchObject({ ok: true, created: true })
      expect(await h.upsertLibraryItem({ id: item.id, name: "Vise setup 150", category: "setup", type: "fixture", data: { jawWidth: 150 } })).toMatchObject({ ok: true, id: item.id, created: false })
      expect(await h.upsertLibraryItem({ id: "nope", name: "x", category: "c", type: "t", data: {} })).toMatchObject({ ok: false })
      const mat = await h.upsertMaterial({ name: "Al 6061", properties: { density: 2.7 } }) as { id: string }
      const tool = await h.upsertTool({ name: "6mm endmill", type: "endmill", diameter: 6, material: "carbide" }) as { id: string }
      expect(await h.setCost({ kind: "material" })).toMatchObject({ ok: false })
      const materialCost = await h.setCost({ kind: "material", materialId: mat.id, costPerUnit: 4.2, wasteFactor: 0.1 }) as { ok: boolean; id: string; created: boolean }
      expect(materialCost).toMatchObject({ ok: true, created: true })
      expect(await h.setCost({ kind: "material", id: materialCost.id, costPerUnit: 5 })).toMatchObject({ ok: true, id: materialCost.id, created: false })
      expect(await h.setCost({ kind: "tool_wear", toolId: tool.id, wearRatePerMeter: 0.02, replacementCost: 18 })).toMatchObject({ ok: true, created: true })
      expect(await h.setCost({ kind: "operation", name: "Milling", machineHourlyRate: 60, operatorHourlyRate: 35 })).toMatchObject({ ok: true, created: true })
      expect(await h.setCost({ kind: "operation", name: "Milling" })).toMatchObject({ ok: false })
      expect(await h.deleteLibrary({ kind: "library_item", id: item.id })).toMatchObject({ ok: true })
      expect(await h.deleteLibrary({ kind: "library_item", id: item.id })).toMatchObject({ ok: false })
    } finally { await fresh.dispose() }
  })

  test("cam_chain_status reports the previous operation and cam_operations_suggest_chain recommends the next", async () => {
    await run("cam_edit", { action: "update", operationId, params: { depth: 4, stepdown: 1 } })
    const status = await handlers.chainStatus({ projectId, operationId }) as { ok: boolean; operationId: string; generated: boolean; warnings: string[] }
    expect(status.ok).toBe(true)
    expect(status.operationId).toBe(operationId)
    expect(Array.isArray(status.warnings)).toBe(true)
    const next = await handlers.suggestChain({ projectId, fromOperationId: operationId }) as { ok: boolean; recommendation: { operationType: string; reason: string } }
    expect(next.ok).toBe(true)
    expect(next.recommendation.operationType).toBe("pocket")
    expect(next.recommendation.reason).toContain("depth")
    expect(await handlers.chainStatus({ projectId, operationId: "nope" })).toMatchObject({ ok: false })
  })
})
