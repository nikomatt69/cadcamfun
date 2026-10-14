import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe, cam } from "@cadcamfun/core"
import { CamKernelResult, CamProgramDocument } from "@cadcamfun/api"
import { Schema } from "effect"
import { measureGcode } from "../src/services/costs.ts"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(110_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: recipe.history }
const request = { schemaVersion: 1, id: "cost-job", name: "Plate", material: "6061", machine: "vmc-standard", elements: [plate] }
const generate = async (extra: Record<string, unknown> = {}) => {
  const result = Schema.decodeUnknownSync(CamKernelResult)((await app.call("/api/toolpaths/manufacture", { method: "POST", json: { ...request, ...extra } })).body)
  if (result.status !== "ok") throw new Error("expected an artifact")
  return result.value
}

test("the cost measure follows subprogram calls: the same part measures the same with or without them", async () => {
  const flat = await generate(), sub = await generate({ subprograms: true })
  expect(sub.nc).toContain("M98")
  const a = measureGcode(flat.nc), b = measureGcode(sub.nc)
  expect(a.lengthMm).toBeGreaterThan(1000)
  // A scanner that ignores the calls would read the shared body once and under-measure the four counterbores.
  expect(b.lengthMm / a.lengthMm).toBeGreaterThan(0.999)
  expect(b.lengthMm / a.lengthMm).toBeLessThan(1.001)
})

test("a stored native program is priced on its replayed cycle time, its cut length and its raw stock", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Kernel cost" } })).body.id
  const drawing = (await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate] } } })).body.id
  const artifact = await generate({ subprograms: true })
  const document = Schema.decodeUnknownSync(CamProgramDocument)({
    format: "cadcamfun-cam", version: 1, gcode: artifact.nc, program: artifact.program,
    settings: cam.generator.DEFAULT_SETTINGS, printer: cam.generator.DEFAULT_PRINTER_EXTRAS, stock: { width: 130, height: 90, depth: 14 },
    drawing: { elements: request.elements }, kernelRequest: { ...request, subprograms: true }, kernelArtifact: artifact
  })
  const saved = await app.call(`/api/drawings/${drawing}/toolpaths`, { method: "POST", json: { name: "Native", data: document, gcode: document.gcode, type: "mill", operationType: "kernel" } })
  expect(saved.status).toBe(201)
  const r = await app.call("/api/production-costs/estimates/calculate", { method: "POST", json: { toolpathId: saved.body.id } })
  expect(r.status).toBe(200)
  const v = r.body.details.calculatedValues
  expect(v.machineTimeMinutes).toBeCloseTo(artifact.cycleTimeSeconds / 60, 9)
  expect(v.materialVolumeM3).toBeCloseTo(artifact.stock.initialVolume / 1e9, 12)
  expect(v.totalPathLengthMm).toBeCloseTo(artifact.operations.reduce((s, o) => s + o.cutLength, 0), 6)
  expect(r.body.machineTimeCost).toBeCloseTo((v.machineTimeMinutes / 60) * 50, 9)
  expect(r.body.totalCost).toBeGreaterThan(r.body.setupCost + (30 / 60) * 30)
})
