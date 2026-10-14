import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe } from "@cadcamfun/core"
import { CadAssemblyReport, CadExactAnalysis, CadExactStep } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(90_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: recipe.history }
const cube = (id: string, x: number) => ({ id, type: "cube", name: id, x, y: 0, z: 0, width: 10, height: 10, depth: 10, layerId: "default" })
const post = (path: string, json: unknown, auth = true) => app.call(`/api/cad/exact/${path}`, { method: "POST", json, auth })

test("the exact kernel routes are authenticated and need a source", async () => {
  for (const path of ["analyze", "step", "assembly"]) {
    expect((await post(path, { elements: [plate] }, false)).status).toBe(401)
    expect((await post(path, {})).status).toBe(400)
    expect((await post(path, { elements: [] })).status).toBe(400)
  }
  expect((await post("analyze", { drawingId: "missing" })).status).toBe(404)
})

test("analyze gives the exact mass properties, the recognised holes and how the CAM will machine the part", async () => {
  const response = await post("analyze", { elements: [plate] })
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CadExactAnalysis)(response.body)
  expect(result.parts).toHaveLength(1)
  const part = result.parts[0]!
  expect(part.valid).toBe(true)
  expect(part.holes).toHaveLength(4)
  expect(part.holes.every((h) => h.form === "counterbore" && h.bottom === "through")).toBe(true)
  expect(part.bounds.max.z).toBeCloseTo(12, 9)
  expect(part.machining).toMatchObject({ prismatic: true, holes: 4, pockets: 0, outlines: 1 })
  const holeVolume = 4 * (Math.PI * 2.75 ** 2 * (12 - 5.7) + Math.PI * 5 ** 2 * 5.7)
  expect(part.volume).toBeCloseTo(120 * 80 * 12 - holeVolume, 1)
  expect(result.totals.parts).toBe(1)
})

test("a stored drawing is read by id under the drawing access rule, and the scene never travels", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Exact kernel" } })).body.id
  const drawing = (await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate, cube("c", 200)] } } })).body.id
  const response = await post("analyze", { drawingId: drawing, ids: ["plate"] })
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CadExactAnalysis)(response.body)
  expect(result.parts.map((p) => p.id)).toEqual(["plate"])
  const all = Schema.decodeUnknownSync(CadExactAnalysis)((await post("analyze", { drawingId: drawing })).body)
  expect(all.parts.map((p) => p.id)).toEqual(["plate", "c"])
})

test("step writes the selection as one exact STEP file", async () => {
  const response = await post("step", { elements: [plate, cube("c", 200)], ids: ["plate"] })
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CadExactStep)(response.body)
  expect(result.step).toMatch(/^ISO-10303-21;/)
  expect(result.parts).toEqual([expect.objectContaining({ id: "plate", exact: true, valid: true })])
  const none = Schema.decodeUnknownSync(CadExactStep)((await post("step", { elements: [{ id: "t", type: "text", text: "x", x: 0, y: 0 }] })).body)
  expect(none.step).toBeUndefined()
})

test("assembly reports the clash of two overlapping parts with the exact overlap volume", async () => {
  const response = await post("assembly", { elements: [cube("a", 0), cube("b", 5)] })
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CadAssemblyReport)(response.body)
  expect(result.parts).toBe(2)
  expect(result.interference.clashes).toHaveLength(1)
  expect(result.interference.clashes[0]!.volume).toBeCloseTo(500, 2)
  expect(result.bom.map((row) => row.name).sort()).toEqual(["a", "b"])
})
