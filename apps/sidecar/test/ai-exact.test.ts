import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe, cad, model } from "@cadcamfun/core"
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


test("a recognised hole is previewed read-only and stored as a checked copy, with the analytic volume", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Hole edit" } })).body.id
  await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate] } } })
  const issue = async (mode: "read" | "write") => (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: mode, projectId: project, mode } })).body.token as string
  const read = await issue("read"), write = await issue("write")
  const invoke = (token: string, tool: string, input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", { method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId: project, tool, input } })
  // The mounting plate has four Ø5.5 holes counterbored to Ø10 x 5.7; the drill grows to Ø7 over its 6.3 mm below the counterbore.
  const preview = await invoke(read, "cad", { action: "hole", id: "plate", hole: 0, diameter: 7 })
  expect(preview.status).toBe(200)
  expect(preview.body.result).toMatchObject({ ok: true, valid: true, hole: 0, holes: 4, before: { form: "counterbore" } })
  const disc = (d: number, h: number) => Math.PI * (d / 2) ** 2 * h
  expect(preview.body.result.volumeChange).toBeCloseTo(-(disc(7, 6.3) - disc(5.5, 6.3)), 3)
  const frustum = (r1: number, r2: number, h: number) => (Math.PI * h * (r1 * r1 + r1 * r2 + r2 * r2)) / 3
  const drafted = await invoke(read, "cad", { action: "hole", id: "plate", hole: 0, diameter: 7, taper: 3 })
  expect(drafted.body.result).toMatchObject({ ok: true, valid: true, edit: { kind: "resize", diameter: 7, taper: 3 } })
  expect(drafted.body.result.volumeChange).toBeCloseTo(disc(5.5, 6.3) - frustum(3.5, 3.5 - 6.3 * Math.tan((3 * Math.PI) / 180), 6.3), 3)
  expect((await invoke(read, "cad", { action: "hole", id: "plate", hole: 0, fill: true, taper: 3 })).body.result).toMatchObject({ ok: false, error: expect.stringContaining("needs a diameter") })
  expect((await invoke(read, "cad", { action: "hole", id: "plate", hole: 0 })).body.result).toMatchObject({ ok: false, error: expect.stringContaining("exactly one") })
  expect((await invoke(read, "cad", { action: "hole", id: "plate", hole: 9, fill: true })).body.result).toMatchObject({ ok: false, error: expect.stringContaining("4 recognised holes") })
  expect((await invoke(read, "cad_edit", { action: "hole", id: "plate", hole: 0, diameter: 7 })).status).toBe(400)
  const stored = await invoke(write, "cad_edit", { action: "hole", id: "plate", hole: 0, fill: true })
  expect(stored.body.result).toMatchObject({ ok: true })
  const exact = await invoke(read, "cad", { action: "exact", ids: [stored.body.result.ids[0], "plate"] })
  const parts = exact.body.result.parts as Array<{ id: string; volume: number; holesTotal: number }>
  const copy = parts.find((p) => p.id === stored.body.result.ids[0])!, source = parts.find((p) => p.id === "plate")!
  expect(copy.holesTotal).toBe(3)
  expect(source.holesTotal).toBe(4)
  expect(copy.volume - source.volume).toBeCloseTo(disc(5.5, 6.3) + disc(10, 5.7), 3)
  // The change is in the project's audit trail, with what was edited and by how much.
  const history = await app.call("/api/analytics/user-history?itemType=project&limit=100")
  const rows = (history.body.logs as Array<{ itemId: string; action: string; details: Record<string, unknown> }>).filter((row) => row.itemId === project)
  const logged = rows.find((row) => row.action === "ai.cad.hole_edit")
  expect(logged?.details).toMatchObject({ via: "assistant", source: "plate", hole: 0, fill: true, elementId: stored.body.result.ids[0] })
  expect(Number(logged?.details["volumeChange"])).toBeCloseTo(disc(5.5, 6.3) + disc(10, 5.7), 3)
})

test("a boss is previewed read-only and stored as a checked copy with the analytic volume", async () => {
  const bossed = {
    id: "bossed", type: "parametric", name: "Bossed", x: 0, y: 0, z: 0, layerId: "default",
    history: { parameters: {}, features: [
      { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 40, height: 30 }] } },
      { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" },
      { id: "c", type: "sketch", plane: "XY", offset: 10, sketch: { entities: [], constraints: [], shapes: [{ id: "k", kind: "circle", at: [20, 15], diameter: 10 }] } },
      { id: "boss", type: "extrude", sketch: "c", depth: 12, operation: "union" }
    ] }
  }
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Boss edit" } })).body.id
  await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Bossed", data: { elements: [bossed] } } })
  const issue = async (mode: "read" | "write") => (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: mode, projectId: project, mode } })).body.token as string
  const read = await issue("read"), write = await issue("write")
  const invoke = (token: string, tool: string, input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", { method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId: project, tool, input } })
  const exact = await invoke(read, "cad", { action: "exact", ids: ["bossed"] })
  expect(exact.body.result.parts[0]).toMatchObject({ bossesTotal: 1, bosses: [{ free: "far" }] })
  const disc = (d: number, h: number) => Math.PI * (d / 2) ** 2 * h
  const preview = await invoke(read, "cad", { action: "hole", id: "bossed", boss: 0, diameter: 6 })
  expect(preview.body.result).toMatchObject({ ok: true, valid: true, boss: 0, bosses: 1 })
  expect(preview.body.result.volumeChange).toBeCloseTo(-(disc(10, 12) - disc(6, 12)), 3)
  expect((await invoke(read, "cad", { action: "hole", id: "bossed", boss: 0 })).body.result).toMatchObject({ ok: false, error: expect.stringContaining("takes a diameter") })
  expect((await invoke(read, "cad", { action: "hole", id: "bossed", boss: 0, hole: 0, diameter: 6 })).body.result).toMatchObject({ ok: false, error: expect.stringContaining("exactly one of hole") })
  const stored = await invoke(write, "cad_edit", { action: "hole", id: "bossed", boss: 0, diameter: 6 })
  expect(stored.body.result).toMatchObject({ ok: true })
  const both = await invoke(read, "cad", { action: "exact", ids: [stored.body.result.ids[0], "bossed"] })
  const parts = both.body.result.parts as Array<{ id: string; volume: number }>
  const copy = parts.find((p) => p.id === stored.body.result.ids[0])!, source = parts.find((p) => p.id === "bossed")!
  expect(source.volume - copy.volume).toBeCloseTo(disc(10, 12) - disc(6, 12), 3)
  const history = await app.call("/api/analytics/user-history?itemType=project&limit=100")
  const rows = (history.body.logs as Array<{ itemId: string; action: string; details: Record<string, unknown> }>).filter((row) => row.itemId === project)
  expect(rows.find((row) => row.action === "ai.cad.boss_edit")?.details).toMatchObject({ via: "assistant", source: "bossed", boss: 0, diameter: 6 })
  // A preview leaves no row: only the stored copy is a change.
  expect(rows.filter((row) => row.action.startsWith("ai.cad."))).toHaveLength(1)
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

test("a fillet's radius is edited from the assistant: previewed read-only, stored as a checked copy, logged", async () => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 60, 40), { depth: 10 })
  m.fillet({ radius: 3, edges: { parallel: "z" } })
  const rounded = { id: "rounded", type: "parametric", name: "Rounded", x: 0, y: 0, z: 0, layerId: "default", history: JSON.parse(JSON.stringify(m.build())) }
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Fillet edit" } })).body.id
  await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Rounded", data: { elements: [rounded] } } })
  const issue = async (mode: "read" | "write") => (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: mode, projectId: project, mode } })).body.token as string
  const read = await issue("read"), write = await issue("write")
  const invoke = (token: string, tool: string, input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", { method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId: project, tool, input } })
  const exact = await invoke(read, "cad", { action: "exact", ids: ["rounded"] })
  expect(exact.body.result.parts[0]).toMatchObject({ filletsTotal: 4, fillets: [{ kind: "cylinder", radius: 3, convex: true, length: 10 }, {}, {}, {}] })
  const gain = (1 - Math.PI / 4) * (9 - 4) * 10
  const preview = await invoke(read, "cad", { action: "hole", id: "rounded", fillet: 0, radius: 2 })
  expect(preview.body.result).toMatchObject({ ok: true, valid: true, fillet: 0, fillets: 4 })
  expect(preview.body.result.volumeChange).toBeCloseTo(gain, 3)
  expect((await invoke(read, "cad", { action: "hole", id: "rounded", fillet: 0 })).body.result).toMatchObject({ ok: false, error: expect.stringContaining("radius only") })
  expect((await invoke(read, "cad", { action: "hole", id: "rounded", fillet: 0, boss: 0, radius: 2 })).body.result).toMatchObject({ ok: false, error: expect.stringContaining("exactly one") })
  const stored = await invoke(write, "cad_edit", { action: "hole", id: "rounded", fillet: 0, radius: 2 })
  expect(stored.body.result).toMatchObject({ ok: true })
  const both = await invoke(read, "cad", { action: "exact", ids: [stored.body.result.ids[0], "rounded"] })
  const parts = both.body.result.parts as Array<{ id: string; volume: number }>
  expect(parts.find((p) => p.id === stored.body.result.ids[0])!.volume - parts.find((p) => p.id === "rounded")!.volume).toBeCloseTo(gain, 3)
  const history = await app.call("/api/analytics/user-history?itemType=project&limit=100")
  const rows = (history.body.logs as Array<{ itemId: string; action: string; details: Record<string, unknown> }>).filter((row) => row.itemId === project)
  expect(rows.find((row) => row.action === "ai.cad.fillet_edit")?.details).toMatchObject({ via: "assistant", source: "rounded", fillet: 0, radius: 2 })
})

test("a free-form face moves along a direction from the route and the assistant: the volume grows by the projected area x the distance", async () => {
  const patch = {
    degreeU: 2, degreeV: 2, knotsU: [0, 0, 0, 1, 1, 1], knotsV: [0, 0, 0, 1, 1, 1],
    points: [0, 5, 10].map((x) => [0, 5, 10].map((y) => [x, y, x === 5 && y === 5 ? 3 : x === 5 || y === 5 ? 1 : 0]))
  }
  const solid = cad.brep.thickenSurfacePatch(cad.brep.surfacePatch(patch), 2, { x: 0, y: 0, z: 1 })
  const free = { id: "free", type: "brep", name: "Free-form", x: 0, y: 0, z: 0, layerId: "default", brep: JSON.parse(JSON.stringify(solid)) }
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Free-form edit" } })).body.id
  await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Free", data: { elements: [free] } } })
  const issue = async (mode: "read" | "write") => (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: mode, projectId: project, mode } })).body.token as string
  const read = await issue("read"), write = await issue("write")
  const invoke = (token: string, tool: string, input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", { method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId: project, tool, input } })
  const exact = await invoke(read, "cad", { action: "exact", ids: ["free"] })
  expect(exact.body.result.parts[0]).toMatchObject({ nurbsFacesTotal: 2 })
  const faces = exact.body.result.parts[0].nurbsFaces as Array<{ normal: { z: number } }>
  const up = faces.findIndex((f) => f.normal.z > 0)
  expect(up).toBeGreaterThanOrEqual(0)
  const preview = await invoke(read, "cad", { action: "hole", id: "free", nurbs: up, distance: 1.5, direction: { x: 0, y: 0, z: 1 } })
  expect(preview.body.result).toMatchObject({ ok: true, valid: true, nurbs: up, nurbsFaces: 2 })
  expect(preview.body.result.volumeChange).toBeCloseTo(150, 3)
  expect((await invoke(read, "cad", { action: "hole", id: "free", nurbs: up })).body.result).toMatchObject({ ok: false, error: expect.stringContaining("distance") })
  expect((await invoke(read, "cad", { action: "hole", id: "free", nurbs: up, distance: 1, radius: 2 })).body.result).toMatchObject({ ok: false })
  expect((await invoke(read, "cad", { action: "hole", id: "free", nurbs: up, distance: 1, direction: { x: 1, y: 0, z: 0 } })).body.result).toMatchObject({ ok: false, error: expect.stringContaining("folds") })
  const stored = await invoke(write, "cad_edit", { action: "hole", id: "free", nurbs: up, distance: -1, direction: { x: 0, y: 0, z: 1 } })
  expect(stored.body.result).toMatchObject({ ok: true })
  const both = await invoke(read, "cad", { action: "exact", ids: [stored.body.result.ids[0], "free"] })
  const parts = both.body.result.parts as Array<{ id: string; volume: number }>
  expect(parts.find((p) => p.id === stored.body.result.ids[0])!.volume).toBeCloseTo(100, 3)
  // The same through the route.
  const route = await app.call("/api/cad/exact/hole", { method: "POST", json: { elements: [free], id: "free", nurbs: up, distance: 2 } })
  expect(route.status).toBe(200)
  expect(route.body).toMatchObject({ ok: true, valid: true })
  expect((await app.call("/api/cad/exact/hole", { method: "POST", json: { elements: [free], id: "free", nurbs: up } })).status).toBe(400)
  expect((await app.call("/api/cad/exact/hole", { method: "POST", json: { elements: [free], id: "free", hole: 0, distance: 2 } })).status).toBe(400)
  const rows = ((await app.call("/api/analytics/user-history?itemType=project&limit=100")).body.logs as Array<{ itemId: string; action: string; details: Record<string, unknown> }>).filter((row) => row.itemId === project)
  expect(rows.find((row) => row.action === "ai.cad.nurbs_edit")?.details).toMatchObject({ via: "assistant", source: "free", nurbs: up, distance: -1 })
})

test("a free-form face is offset and drafted approximately, and the answer says how approximately", async () => {
  // A flat wall 10 x 10 in the plane y = 0, thickened 4 mm towards -y (a free-form face looking along +y).
  const wall = cad.brep.thickenSurfacePatch(cad.brep.surfacePatch({ degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], points: [[[0, 0, 0], [0, 0, 10]], [[10, 0, 0], [10, 0, 10]]] }), 4, { x: 0, y: -1, z: 0 })
  const free = { id: "wall", type: "brep", name: "Wall", x: 0, y: 0, z: 0, layerId: "default", brep: JSON.parse(JSON.stringify(wall)) }
  const analysis = await app.call("/api/cad/exact/analyze", { method: "POST", json: { elements: [free] } })
  const faces = analysis.body.parts[0].nurbsFaces as Array<{ normal: { y: number } }>
  const looking = faces.findIndex((f) => f.normal.y > 0.9)
  expect(looking).toBeGreaterThanOrEqual(0)
  // Offset along the normals by 1: the wall moves out by 1 (volume +10 x 10 x 1).
  const offset = await app.call("/api/cad/exact/hole", { method: "POST", json: { elements: [free], id: "wall", nurbs: looking, mode: "offset", distance: 1 } })
  expect(offset.status).toBe(200)
  expect(offset.body).toMatchObject({ ok: true, valid: true, mode: "offset" })
  expect(typeof offset.body.approximate.deviation).toBe("number")
  expect(offset.body.approximate.deviation).toBeLessThanOrEqual(0.01)
  expect(offset.body.volumeChange).toBeCloseTo(100, 0)
  // Draft 5 degrees about the foot: the wedge 1/2 tan(a) h^2 w comes off.
  const draft = await app.call("/api/cad/exact/hole", { method: "POST", json: { elements: [free], id: "wall", nurbs: looking, mode: "draft", angle: 5 } })
  expect(draft.body).toMatchObject({ ok: true, mode: "draft", angle: 5 })
  expect(draft.body.volumeChange).toBeCloseTo(-0.5 * Math.tan((5 * Math.PI) / 180) * 100 * 10, 0)
  // What does not belong is refused.
  for (const bad of [{ mode: "draft" }, { mode: "offset" }, { mode: "offset", distance: 1, direction: { x: 0, y: 1, z: 0 } }, { mode: "draft", angle: 5, distance: 1 }, { distance: 1, tolerance: 0.1 }]) {
    expect((await app.call("/api/cad/exact/hole", { method: "POST", json: { elements: [free], id: "wall", nurbs: looking, ...bad } })).status).toBe(400)
  }
})
