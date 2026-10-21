import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "@cadcamfun/core"
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
