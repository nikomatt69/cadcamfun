import { afterAll, beforeAll, expect, test } from "bun:test"
import { buildTools, type ToolHandlersShape } from "@cadcamfun/ai"
import { plateTemplate } from "@cadcamfun/core"
import { makeApp } from "./helpers.ts"
let app: Awaited<ReturnType<typeof makeApp>>, handlers: ToolHandlersShape, project: string
const run = async (id: string, input: unknown) => JSON.parse(await buildTools(handlers, project).find((t) => t.id === id)!.execute(input, { sessionId: "s", projectId: "untrusted", signal: new AbortController().signal }))
beforeAll(async () => {
  app = await makeApp()
  handlers = await app.toolHandlers()
  project = (await app.call("/api/projects", { method: "POST", json: { name: "Evidence" } })).body.id
  await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Evidence drawing", data: { elements: [] } } })
})

test("read-only inspection does not create a missing drawing", async () => {
  const empty = (await app.call("/api/projects", { method: "POST", json: { name: "Empty" } })).body.id
  const spec = buildTools(handlers, empty).find((tool) => tool.id === "cad")!
  const result = JSON.parse(await spec.execute({ action: "describe" }, { sessionId: "s", projectId: empty, signal: new AbortController().signal }))
  expect(result.ok).toBe(false)
  expect(result.error).toContain("no drawing")
  const drawings = await app.call(`/api/projects/${empty}/drawings`)
  expect(drawings.body).toEqual([])
})
afterAll(async () => { await app.dispose() })
test("an explicit inaccessible project never redirects a mutation to the active project", async () => {
  const before = await handlers.describeDrawing(project)
  const denied = JSON.parse(await buildTools(handlers, "inaccessible-project").find((tool) => tool.id === "cad_edit")!.execute({ action: "add", elements: [{ type: "cube", width: 2, height: 2, depth: 2 }] }, { sessionId: "s", projectId: project, signal: new AbortController().signal }))
  expect(denied.ok).toBe(false)
  const after = await handlers.describeDrawing(project)
  expect((after as { elements: unknown }).elements).toEqual((before as { elements: unknown }).elements)
})
test("mesh import persists explicit scale and original source evidence", async () => {
  const imported = await run("cad_edit", { action: "import", format: "mesh", scale: 1000, content: JSON.stringify({ format: "cadcamfun-mesh", elements: [{ type: "mesh", vertices: [{ x: 0, y: 0, z: 0 }, { x: 0.01, y: 0, z: 0 }, { x: 0, y: 0.02, z: 0 }], faces: [[0, 1, 2]], sourceMetadata: { format: "brep", units: "source units" } }] }) })
  expect(imported.ok).toBe(true)
  const detail = await run("cad", { action: "inspect_elements", ids: imported.ids })
  expect(detail.elements[0].bounds.max).toEqual({ x: 10, y: 20, z: 0 })
  const metadata = await run("cad", { action: "inspect_property", elementId: imported.ids[0], path: ["sourceMetadata"] })
  expect(metadata).toMatchObject({ ok: true })
  expect(JSON.stringify(metadata)).toContain("sourceToMmScale")
  await run("cad_edit", { action: "delete", ids: imported.ids, confirm: true })
})
test("explicit stock drives real removal simulation and invalidates generated programs on change", async () => {
  await run("cad_edit", { action: "add", elements: [{ type: "cube", width: 30, height: 20, depth: 3, z: -1.5 }] })
  const stock = { width: 50, height: 40, depth: 10, x: 2, y: 3, topZ: 0, allowance: 1, radius: 0, material: "Aluminium" }
  expect((await run("cam_edit", { action: "stock_set", stock })).volumeMm3).toBe(20_000)
  const operation = await run("cam_edit", { action: "create", type: "contour", params: { toolDiameter: 6, depth: 3, stepdown: 1 } })
  await run("cam_edit", { action: "generate", operationId: operation.operationId })
  const report = await run("cam_edit", { action: "verify", operationId: operation.operationId, resolution: 1 })
  expect(report.stockSource).toBe("configured drawing stock")
  expect(report.stats.stockVolume).toBeCloseTo(20_000, 4)
  expect(report.stats.removedVolume).toBeGreaterThan(0)
  expect(report.stats.removedVolume + report.stats.remainingVolume).toBeCloseTo(report.stats.stockVolume, 4)
  const changed = await run("cam_edit", { action: "stock_set", stock: { ...stock, width: 60 } })
  expect(changed.invalidatedOperations).toContain(operation.operationId)
  expect((await run("cam", { action: "operations", }))[0].generated).toBe(false)
  // The stock has two faces: the CAM one (drawing stock) and the CAD one (the `workpiece` element in the scene).
  const elements = (await run("cad", { action: "inspect_elements" })).elements as Array<{ properties: Record<string, unknown> }>
  expect(elements).toHaveLength(2)
  const workpiece = elements.map((e) => e.properties).find((p) => p["type"] === "workpiece")
  expect(workpiece).toMatchObject({ type: "workpiece", width: 60, height: 40, depth: 10, x: 2, y: 3, z: -5 })
  const inspected = await run("cam", { action: "stock" })
  expect(inspected.stock).toMatchObject({ width: 60, height: 40, depth: 10 })
  expect(inspected.workpiece).toMatchObject({ width: 60, height: 40, depth: 10, x: 2, y: 3, z: -5 })
  expect(inspected.workpieceMatchesStock).toBe(true)
})
test("component inspection exposes actual parameter dependencies and exact property pages", async () => {
  const created = await run("cad_edit", { action: "add", elements: [
    { type: "parametric", history: plateTemplate(), x: 10 },
    { type: "parametric", history: plateTemplate(), x: 100 }
  ] })
  const result = await run("cad", { action: "relations", firstId: created.ids[0], secondId: created.ids[1] })
  expect(result.ok).toBe(true)
  expect(result.originDistanceMm).toBe(90)
  expect(result.first.parametric[0].resolved.width).toBe(60)
  expect(result.explicitReferences).toEqual([])
  const property = await run("cad", { action: "inspect_property", elementId: created.ids[0], path: ["history"], maxChars: 50 })
  expect(property.content).toHaveLength(50)
  expect(property.nextOffset).toBe(50)
  expect((await run("cad", { action: "inspect_property", elementId: created.ids[0], path: ["__proto__"] })).ok).toBe(false)
})

 test("candidate comparisons calculate real variants without writing operations or geometry", async () => {
  const before = await run("cam", { action: "operations", })
  const result = await run("cam", { action: "compare_setups", candidates: [
    { name: "contour 4mm", params: { toolDiameter: 4, depth: 2, stepdown: 1 } },
    { name: "invalid", params: { depth: -1 } }
  ] })
  expect(result.ok).toBe(true)
  expect(result.mutated).toBe(false)
  expect(result.candidates[0].verification.stats.removedVolume).toBeGreaterThan(0)
  expect(result.candidates[1].ok).toBe(false)
  expect(await run("cam", { action: "operations", })).toEqual(before)
})

test("inspection uses actual rotated and scaled mesh bounds", async () => {
  const created = await run("cad_edit", { action: "add", elements: [{ type: "cube", width: 10, height: 20, depth: 30, x: 50, rotation: { x: 0, y: 0, z: 90 }, scale: { x: 2, y: 1, z: 1 } }] })
  const inspected = await run("cad", { action: "inspect_elements", ids: created.ids })
  const bounds = inspected.elements[0].bounds
  expect(bounds.max.x - bounds.min.x).toBeCloseTo(20, 5)
  expect(bounds.max.y - bounds.min.y).toBeCloseTo(20, 5)
  expect((bounds.max.x + bounds.min.x) / 2).toBeCloseTo(50, 5)
})

test("origins answer where everything sits: the CAD zero, each origin's meaning and relative children", async () => {
  const created = await run("cad_edit", { action: "add", elements: [
    { type: "cube", width: 10, height: 10, depth: 10, x: 100, y: 20 },
    { type: "cylinder", radius: 5, height: 20, x: 100, y: 60, rotation: { x: 0, y: 0, z: 45 } }
  ] })
  const grouped = await run("cad_edit", { action: "group", ids: created.ids, name: "Fixture" })
  const component = grouped.ids[0]
  const result = await run("cad", { action: "inspect_origins", ids: [component] })
  expect(result.ok).toBe(true)
  expect(result.units).toBe("mm")
  expect(result.zero).toEqual({ x: 0, y: 0, z: 0 })
  const fixture = result.elements[0]
  expect(fixture.id).toBe(component)
  expect(fixture.origin).toEqual({ x: 100, y: 20, z: 0 })
  expect(fixture.convention).toContain("component")
  expect(fixture.distanceFromZeroMm).toBeCloseTo(Math.hypot(100, 20), 2)
  expect(fixture.children).toHaveLength(2)
  // Children are stored relative to the component; a leaf's own gizmo does not remove its world placement.
  expect(fixture.children[0]).toMatchObject({ type: "cube", origin: { x: 0, y: 0, z: 0 }, absolute: { x: 100, y: 20, z: 0 } })
  expect(fixture.children[1]).toMatchObject({ type: "cylinder", origin: { x: 0, y: 40, z: 0 }, absolute: { x: 100, y: 60, z: 0 } })
  expect(fixture.children[1].gizmo.rotation.z).toBe(45)
  expect(fixture.children[1].distanceFromZeroMm).toBeCloseTo(Math.hypot(100, 60), 2)
  // A turned component moves its children by a transform this reading does not apply: it refuses to guess their world positions.
  await run("cad_edit", { action: "transform", ids: [component], rotateDegrees: 90, rotateAxis: "z" })
  const turned = await run("cad", { action: "inspect_origins", ids: [component] })
  expect(turned.elements[0].gizmo.rotation.z).toBe(90)
  expect(turned.elements[0].children.map((child: { absolute: unknown }) => child.absolute)).toEqual([null, null])
})
