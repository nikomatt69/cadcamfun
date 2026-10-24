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
const request = { schemaVersion: 1, id: "post-job", name: "Plate", material: "6061", machine: "vmc-standard", elements: [plate] }
const definition = { ...cam.BUILTIN_DEFINITIONS.fanuc, name: "Shop", toolChange: ["T{tool} M6", "G43 H{tool}", "(TOOL {tool} IN)"] }
const post = (json: unknown) => app.call("/api/toolpaths/manufacture", { method: "POST", json })

test("a stored post definition writes the kernel's NC, and a bad one is refused with the place of the mistake", async () => {
  const plain = Schema.decodeUnknownSync(CamKernelResult)((await post(request)).body)
  const custom = Schema.decodeUnknownSync(CamKernelResult)((await post({ ...request, postDefinition: definition })).body)
  if (plain.status !== "ok" || custom.status !== "ok") throw new Error("expected two artifacts")
  expect(plain.value.nc).not.toContain("IN)")
  expect(custom.value.nc).toMatch(/G43 H(\d+)\n\(TOOL \1 IN\)/)
  expect(custom.value.release).toBe(plain.value.release)
  expect(custom.value.claims.map((c) => [c.id, c.status])).toEqual(plain.value.claims.map((c) => [c.id, c.status]))
  expect(custom.value.identity.nc).toBe(cam.kernel.sha256(custom.value.nc))
  const bad = await post({ ...request, postDefinition: { ...definition, toolChange: ["T{toool} M6"] } })
  const failed = Schema.decodeUnknownSync(CamKernelResult)(bad.body)
  expect(failed.status).toBe("failed")
  if (failed.status === "failed") expect(failed.issues.map((i) => i.message).join("\n")).toContain("toolChange[0]")
})

test("a saved program keeps its post: the stored request reproduces the stored NC, and a request without it is refused", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Posts" } })).body.id
  const drawing = (await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate] } } })).body.id
  const withPost = { ...request, postDefinition: definition }
  const generated = await post(withPost)
  const document = Schema.decodeUnknownSync(CamProgramDocument)({
    format: "cadcamfun-cam", version: 1, gcode: generated.body.value.nc, program: generated.body.value.program,
    settings: cam.generator.DEFAULT_SETTINGS, printer: cam.generator.DEFAULT_PRINTER_EXTRAS, stock: { width: 130, height: 90, depth: 14 },
    drawing: { elements: request.elements }, kernelRequest: withPost, kernelArtifact: generated.body.value
  })
  const saved = await app.call(`/api/drawings/${drawing}/toolpaths`, { method: "POST", json: { name: "Native CAM", data: document, gcode: document.gcode, type: "mill", operationType: "kernel" } })
  expect(saved.status).toBe(201)
  expect(saved.body.data.kernelRequest.postDefinition.name).toBe("Shop")
  const forged = await app.call(`/api/drawings/${drawing}/toolpaths`, { method: "POST", json: { name: "Forged", data: { ...document, kernelRequest: request }, gcode: document.gcode, type: "mill", operationType: "kernel" } })
  expect(forged.status).toBe(400)
})

test("the assistant names a post by a library id or by the machine configuration; the stored request keeps the definition itself", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Assistant posts" } })).body.id
  await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: [plate] } } })
  const handlers = await app.toolHandlers()
  const item = await app.call("/api/library", { method: "POST", json: { name: "Shop post", category: "post", type: "definition", data: definition } })
  expect(item.status).toBe(201)
  const note = await app.call("/api/library", { method: "POST", json: { name: "Not a post", category: "note", type: "text", data: { text: "x" } } })

  // By the id of the library item.
  const byId = await handlers.manufactureOperation!(project, { material: "6061", postDefinitionId: item.body.id } as never) as { ok: boolean; operationId: string }
  expect(byId.ok).toBe(true)
  const stored = await app.call(`/api/toolpaths/${byId.operationId}`)
  expect(stored.body.gcode).toMatch(/G43 H(\d+)\n\(TOOL \1 IN\)/)
  expect(stored.body.data.kernelRequest.postDefinition.name).toBe("Shop")
  expect(stored.body.data.kernelRequest.postDefinitionId).toBeUndefined()

  // By the machine configuration that names it.
  const machineConfig = { id: "m1", name: "Shop VMC", type: "mill", config: { axes: 3, controller: "Fanuc", workVolume: { x: 600, y: 400, z: 400 }, maxSpindleSpeed: 12000, maxFeedRate: 12000, postDefinitionId: item.body.id } }
  const byMachine = await handlers.manufacture!(project, { material: "6061", machineConfig, planOnly: false } as never) as { ok: boolean; ncPreview?: string }
  expect(byMachine.ok).toBe(true)
  expect(byMachine.ncPreview).toMatch(/\(TOOL \d+ IN\)/)

  // Something that is not a post definition is refused with the reason, nothing is stored.
  const wrong = await handlers.manufactureOperation!(project, { material: "6061", postDefinitionId: note.body.id } as never) as { ok: boolean; error: string }
  expect(wrong.ok).toBe(false)
  expect(wrong.error).toContain("not a post definition")
})
