import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { buildRecipe, cam } from "@cadcamfun/core"
import { CamKernelResult, CamProgramDocument } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(110_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
const plate = { id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: recipe.history }
const request = { schemaVersion: 1, id: "sub-job", name: "Plate", material: "6061", machine: "vmc-standard", elements: [plate] }
const post = (json: unknown) => app.call("/api/toolpaths/manufacture", { method: "POST", json })

test("the subprogram switch is part of the request contract and shortens the NC without weakening its evidence", async () => {
  expect((await post({ ...request, subprograms: "yes" })).status).toBe(400)
  const flat = Schema.decodeUnknownSync(CamKernelResult)((await post(request)).body)
  const sub = Schema.decodeUnknownSync(CamKernelResult)((await post({ ...request, subprograms: true })).body)
  if (flat.status !== "ok" || sub.status !== "ok") throw new Error("expected two artifacts")
  expect(flat.value.nc).not.toContain("M98")
  expect(sub.value.nc).toMatch(/^M98 P\d+$/m)
  expect(sub.value.nc.split("\n").length).toBeLessThan(flat.value.nc.split("\n").length / 2)
  expect(sub.value.release).toBe(flat.value.release)
  expect(sub.value.claims.map((c) => [c.id, c.status])).toEqual(flat.value.claims.map((c) => [c.id, c.status]))
  expect(sub.value.notes.some((n) => /subprogram/.test(n))).toBe(true)
  expect(sub.value.identity.nc).toBe(cam.kernel.sha256(sub.value.nc))
})

test("a saved program keeps its subprograms: the stored request reproduces the stored NC, and an edit drops the native evidence", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Subprograms" } })).body.id
  const drawing = (await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate] } } })).body.id
  const withSub = { ...request, subprograms: true }
  const generated = await post(withSub)
  const document = Schema.decodeUnknownSync(CamProgramDocument)({
    format: "cadcamfun-cam", version: 1, gcode: generated.body.value.nc, program: generated.body.value.program,
    settings: cam.generator.DEFAULT_SETTINGS, printer: cam.generator.DEFAULT_PRINTER_EXTRAS, stock: { width: 130, height: 90, depth: 14 },
    drawing: { elements: request.elements }, kernelRequest: withSub, kernelArtifact: generated.body.value
  })
  const saved = await app.call(`/api/drawings/${drawing}/toolpaths`, { method: "POST", json: { name: "Native CAM", data: document, gcode: document.gcode, type: "mill", operationType: "kernel" } })
  expect(saved.status).toBe(201)
  expect(saved.body.gcode).toContain("M98")
  expect(saved.body.data.kernelRequest.subprograms).toBe(true)
  expect(saved.body.data.kernelArtifact.nc).toBe(saved.body.gcode)
  // The same request without the switch no longer reproduces this NC: the sidecar refuses the pairing.
  const forged = await app.call(`/api/drawings/${drawing}/toolpaths`, { method: "POST", json: { name: "Forged", data: { ...document, kernelRequest: request }, gcode: document.gcode, type: "mill", operationType: "kernel" } })
  expect(forged.status).toBe(400)
  const edited = await app.call(`/api/toolpaths/${saved.body.id}`, { method: "PUT", json: { gcode: `${document.gcode}\n(edited)\n` } })
  expect(edited.status).toBe(200)
  expect(edited.body.data.kernelArtifact).toBeUndefined()
})

test("the assistant's manufacture reads the same switch and says so in its notes", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Assistant subprograms" } })).body.id
  await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate] } } })
  const token = (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: "sub-test", projectId: project, mode: "read" } })).body.token as string
  const invoke = (input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", {
    method: "POST", auth: false, headers: { authorization: `Bearer ${token}` }, json: { projectId: project, tool: "cam", input: { action: "manufacture", material: "6061", ...input } }
  })
  const response = await invoke({ subprograms: true })
  expect(response.status).toBe(200)
  expect(response.body.result.ok).toBe(true)
  expect(response.body.result.notes.some((n: string) => /subprogram/.test(n))).toBe(true)
  const plain = await invoke({})
  expect(plain.body.result.ok).toBe(true)
  expect(plain.body.result.notes.some((n: string) => /subprogram/.test(n))).toBe(false)
})
