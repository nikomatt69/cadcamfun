import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe, cam } from "@cadcamfun/core"
import { makeApp } from "./helpers.ts"
setDefaultTimeout(110_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })
test("probe", async () => {
  const recipe = buildRecipe("mounting_plate", { width: 60, depth: 40, thickness: 10, fastener: "M5", counterbore: true })
  const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: recipe.history }
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "P" } })).body.id as string
  await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Drawing 1", data: { elements: [plate] } } })
  const token = (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: "t", projectId: project, mode: "write" } })).body.token as string
  const invoke = (tool: string, input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", { method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId: project, tool, input } })
  const t = (id: string, d: number) => ({ id, name: `E${d}`, kind: "endmill", diameter: d, flutes: 2, maxRpm: 18000, holder: { diameter: 32, length: 40 } })
  const op = (id: string, name: string, d: number, type: string) => ({ id, name, elementIds: ["plate"], tool: t("t" + d, d), enabled: true, fromPreviousStock: false, params: { ...cam.generator.DEFAULT_SETTINGS, depth: 4, stepdown: 2, toolDiameter: d, operationType: type } })
  const fixture = { id: "s", name: "Vise of three", machineType: "mill", workOffset: "G54", post: { ...cam.program.DEFAULT_POST_CONFIG, postId: "fanuc" }, grouping: "single", retractBeforeToolChange: false,
    operations: [op("a", "Profile plate", 6, "profile"), op("b", "Profile plate fine", 3, "profile")],
    workpieces: [{ id: "w1", name: "Part 1", workOffset: "G54", placement: { x: 0, y: 0, z: 0 } }, { id: "w2", name: "Part 2", workOffset: "G55", placement: { x: 110, y: 0, z: 0 } }, { id: "w3", name: "Part 3", workOffset: "G56", placement: { x: 220, y: 0, z: 0 } }],
    stock: { x: 76, y: 56, z: 12, origin: { x: -8, y: -8, z: 0 }, material: "aluminum" },
    fixtures: [{ id: "fx-1", name: "Left jaw", min: { x: -60, y: -20, z: -20 }, max: { x: -12, y: 60, z: 0 } }, { id: "fx-2", name: "Right jaw", min: { x: 290, y: -20, z: -20 }, max: { x: 340, y: 60, z: 0 } }],
    envelope: { min: { x: -300, y: -200, z: -150 }, max: { x: 500, y: 200, z: 150 } } }
  expect((await invoke("cam_edit", { action: "stock_set", stock: { width: 76, height: 56, depth: 12, radius: 0, x: 30, y: 20, topZ: 0, allowance: 0, material: "aluminum" } })).body.result.ok).toBe(true)
  const saved = (await invoke("cam_edit", { action: "setup_save", name: "Vise", setup: fixture })).body.result
  console.log("SAVED", JSON.stringify(saved).slice(0, 200))
  const g = (await invoke("cam_edit", { action: "setup_generate", setupId: saved.setupId })).body.result
  console.log("GEN", JSON.stringify({ release: g.programs[0].release, regs: g.programs[0].evidence.registers.map((r: any) => [r.register, r.verdict, r.complete, r.findings.map((f: any) => f.message).join(";"), r.leftMm, r.gougeMm]), fixture: g.programs[0].evidence.fixture && { crossings: g.programs[0].evidence.fixture.crossings, parts: g.programs[0].evidence.fixture.parts?.map((q: any) => [q.register, q.removedMm3, q.remainingMm3]) }, notes: g.programs[0].evidence.notes }).slice(0, 3000))
  expect(true).toBe(true)
})
