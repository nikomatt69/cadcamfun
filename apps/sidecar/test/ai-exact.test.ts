import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe, cad } from "@cadcamfun/core"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(90_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: recipe.history }
const cube = (id: string, x: number) => ({ id, type: "cube", name: id, x, y: 0, z: 300, width: 10, height: 10, depth: 10, layerId: "default" })

test("the assistant reads the exact kernel and the assembly of the open drawing", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Exact assistant" } })).body.id
  await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate, cube("a", 0), cube("b", 5)] } } })
  const token = (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: "exact-test", projectId: project, mode: "read" } })).body.token as string
  const invoke = (input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", {
    method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId: project, tool: "cad", input }
  })

  const exact = await invoke({ action: "exact", ids: ["plate"] })
  expect(exact.status).toBe(200)
  const result = exact.body.result
  expect(result.ok).toBe(true)
  expect(result.parts).toHaveLength(1)
  expect(result.parts[0]).toMatchObject({ id: "plate", valid: true, holesTotal: 4, machining: { prismatic: true, holes: 4 } })
  expect(result.totals.parts).toBe(1)

  const assembly = await invoke({ action: "assembly" })
  expect(assembly.status).toBe(200)
  expect(assembly.body.result.ok).toBe(true)
  expect(assembly.body.result.interference.clashesTotal).toBe(1)
  expect(assembly.body.result.interference.clashes[0].volume).toBeCloseTo(500, 2)
  expect(assembly.body.result.bomTotal).toBeGreaterThanOrEqual(3)

  // The manual setups of the plate: one +Z setup with its four counterbored holes, nothing unreachable.
  const setups = await invoke({ action: "setups", ids: ["plate"] })
  expect(setups.status).toBe(200)
  expect(setups.body.result.ok).toBe(true)
  const plan = setups.body.result.parts[0].plan
  expect(plan.setups.map((s: { orientation: string }) => s.orientation)).toEqual(["+Z"])
  expect(plan.setups[0]).toMatchObject({ holesTotal: 4, prismatic: { ok: true, holes: 4 } })
  expect(plan.uncoveredTotal).toBe(0)

  // The exact gap between two solids, and a shell on paper.
  const gap = await invoke({ action: "distance", firstId: "a", secondId: "b" })
  expect(gap.status).toBe(200)
  expect(gap.body.result.ok).toBe(true)
  expect(gap.body.result.overlap).toBe(true)
  const shell = await invoke({ action: "shell", id: "a", thickness: 2 })
  expect(shell.status).toBe(200)
  expect(shell.body.result).toMatchObject({ ok: true, id: "a", wall: 2, valid: true, shells: 2 })
  expect(shell.body.result.cavityVolume).toBeCloseTo(6 ** 3, 6)
  const refused = await invoke({ action: "shell", id: "missing", thickness: 2 })
  expect(refused.body.result).toMatchObject({ ok: false })
})

test("an unknown project is refused, nothing is provisioned", async () => {
  const handlers = await app.toolHandlers()
  expect(await handlers.cadExact!("missing-project", {})).toMatchObject({ ok: false })
  expect(await handlers.cadAssembly!("missing-project", {})).toMatchObject({ ok: false })
  expect(await handlers.cadShell!("missing-project", { id: "a", thickness: 2 })).toMatchObject({ ok: false })
  expect(await handlers.cadDistance!("missing-project", { firstId: "a", secondId: "b" })).toMatchObject({ ok: false })
})


test("kernel actions preview without mutation and store checked copies only with a write token", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Kernel actions" } })).body.id
  const drawing = (await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Box", data: { elements: [cube("a", 0), cube("b", 30)] } } })).body.id
  const issue = async (mode: "read" | "write") => (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: mode, projectId: project, mode } })).body.token as string
  const read = await issue("read"), write = await issue("write")
  const invoke = (token: string, tool: string, input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", { method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId: project, tool, input } })
  const inspect = await invoke(read, "cad", { action: "exact", ids: ["a"] })
  const names = inspect.body.result.parts[0].faceNames as string[]
  const top = names.find((n) => n.endsWith("top"))!
  expect(top).toBeDefined()
  const shell = await invoke(read, "cad", { action: "shell", id: "a", thickness: 2, wallByFace: [{ face: top, thickness: 1 }] })
  expect(shell.body.result).toMatchObject({ ok: true, valid: true })
  expect(shell.body.result.cavityVolume).toBeCloseTo(6 * 6 * 7, 5)
  const offset = await invoke(read, "cad", { action: "offset", id: "a", distance: 2 })
  expect(offset.body.result).toMatchObject({ ok: true, valid: true })
  expect(offset.body.result.volume).toBeGreaterThan(1000)
  const denied = await invoke(read, "cad_edit", { action: "offset", id: "a", distance: 2 })
  expect(denied.status).toBe(400)
  expect(JSON.stringify(denied.body)).toContain("read-only")
  const created = await invoke(write, "cad_edit", { action: "shell", id: "a", thickness: 2, wallByFace: [{ face: top, thickness: 1 }] })
  expect(created.body.result).toMatchObject({ ok: true })
  const resultId = created.body.result.ids[0]
  const exact = await invoke(read, "cad", { action: "exact", ids: [resultId, "a"] })
  expect(exact.body.result.parts.map((p: { volume: number }) => p.volume).sort((a: number, b: number) => a - b)).toEqual([748, 1000])
  const motion = await invoke(read, "cad", { action: "motion", model: { ground: "a", joints: [{ id: "slide", parent: "a", child: "b", kind: "prismatic", origin: { x: 0, y: 0, z: 0 }, axis: { x: -1, y: 0, z: 0 } }], contacts: [{ a: "a", b: "b", clearance: 1 }] }, sweep: { joint: "slide", from: 0, to: 25, steps: 5 } })
  expect(motion.body.result).toMatchObject({ ok: true })
  expect(motion.body.result.frames).toHaveLength(6)
  expect(motion.body.result.firstContact).toBeDefined()
  const missing = await invoke(write, "cad_edit", { action: "offset", id: "ghost", distance: 2 })
  expect(missing.body.result).toMatchObject({ ok: false })
  const all = await invoke(read, "cad", { action: "exact" })
  expect(all.body.result.totals.parts).toBe(3)
})


test("the AI stores open NURBS surfaces separately from solids and exchanges IGES without losing topology", async () => {
  const projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Surface and exchange" } })).body.id
  const token = (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: "surfaces", projectId, mode: "write" } })).body.token as string
  const invoke = (tool: string, input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", { method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId, tool, input } })
  const patches = [{ data: { degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], points: [[[0, 0, 0], [0, 10, 0]], [[10, 0, 0], [10, 10, 0]]] } }]
  const preview = await invoke("cad", { action: "surface", operation: "patch", patches })
  expect(preview.body.result).toMatchObject({ ok: true, kind: "surface", valid: true, boundaryEdges: 4 })
  const open = await invoke("cad_edit", { action: "surface", operation: "patch", patches, name: "Open patch" })
  expect(open.body.result).toMatchObject({ ok: true })
  expect(open.body.result.elements[0].bodyKind).toBe("surface")
  const thick = await invoke("cad_edit", { action: "surface", operation: "thicken", patches, thickness: 2, name: "Thick patch" })
  expect(thick.body.result).toMatchObject({ ok: true })
  const id = thick.body.result.ids[0]
  const exact = await invoke("cad", { action: "exact" })
  expect(exact.body.result.totals.parts).toBe(1)
  expect(exact.body.result.skipped[0].reason).toContain("open surface")
  const exported = await invoke("cad", { action: "exchange", format: "iges", ids: [id] })
  expect(exported.body.result).toMatchObject({ ok: true, format: "iges", parts: 1 })
  const content = exported.body.result.content as string
  expect(cad.brep.readIgesBreps(content).parts).toHaveLength(1)
  const imported = await invoke("cad_edit", { action: "import", format: "iges", content })
  expect(imported.body.result).toMatchObject({ ok: true })
  const check = await invoke("cad", { action: "exact", ids: imported.body.result.ids })
  expect(check.body.result.parts[0].volume).toBeCloseTo(200, 5)
  const unsupported = await invoke("cad_edit", { action: "import", format: "parasolid", content: "transmit text" })
  expect(unsupported.body.result).toMatchObject({ ok: false })
  expect(unsupported.body.result.error).toContain("x_t is a text")
  const all = await invoke("cad", { action: "exact" })
  expect(all.body.result.totals.parts).toBe(2)
})
