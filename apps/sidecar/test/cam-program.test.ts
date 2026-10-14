import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import { CamProgramDocument, combineCamOperations } from "@cadcamfun/api"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(120_000)

let app: Awaited<ReturnType<typeof makeApp>>
const request = { schemaVersion: 1, id: "persisted-cam", name: "Plate", material: "6061", elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5, layerId: "default" }] }
let project: string, drawing: string, document: CamProgramDocument
beforeAll(async () => {
  app = await makeApp()
  project = (await app.call("/api/projects", { method: "POST", json: { name: "CAM persistence" } })).body.id
  drawing = (await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: request.elements } } })).body.id
  const generated = await app.call("/api/toolpaths/manufacture", { method: "POST", json: request })
  document = Schema.decodeUnknownSync(CamProgramDocument)({ format: "cadcamfun-cam", version: 1, gcode: generated.body.value.nc, program: generated.body.value.program,
    settings: cam.generator.DEFAULT_SETTINGS, printer: cam.generator.DEFAULT_PRINTER_EXTRAS, stock: { width: 34, height: 24, depth: 6 }, drawing: { elements: request.elements }, kernelRequest: request, kernelArtifact: generated.body.value })
})
afterAll(async () => { await app.dispose() })
const create = (data: unknown = document, gcode: string = document.gcode) => app.call(`/api/drawings/${drawing}/toolpaths`, { method: "POST", json: { name: "Native CAM", data, gcode, type: "mill", operationType: "kernel" } })

test("composite resources preserve ordered operations through versions and discard them after NC edits", async () => {
  const operations = [
    { id: "rough", name: "Rough pocket", tool: "endmill Ø6", settings: { ...cam.generator.DEFAULT_SETTINGS, operationType: "pocket" as const }, gcode: "G21\nG0 X0 Y0 Z5\nG1 Z-1 F300\nG1 X10 F800", program: cam.makeProgram("forged", [], {}) },
    { id: "finish", name: "Finish contour", tool: "endmill Ø3", settings: { ...cam.generator.DEFAULT_SETTINGS, toolDiameter: 3 }, gcode: "G21\nG0 X10 Y0 Z5\nG1 Z-2 F200\nG1 Y10 F600", program: cam.makeProgram("forged", [], {}) }
  ]
  const combined = combineCamOperations(operations)
  const data = { ...document, ...combined, operations, kernelRequest: undefined, kernelArtifact: undefined }
  const saved = await create(data, combined.gcode)
  expect(saved.status).toBe(201)
  expect(saved.body.data.operations.map((operation: { id: string }) => operation.id)).toEqual(["rough", "finish"])
  expect(saved.body.data.operations[0].settings.operationType).toBe("pocket")
  expect(saved.body.data.operations[0].program).toEqual(cam.generator.analyseGcode(operations[0]!.gcode).program)
  expect(saved.body.data.program.toolpaths.length).toBeGreaterThanOrEqual(2)
  expect((await create({ ...data, operations: [...operations].reverse() }, combined.gcode)).status).toBe(400)
  const version = await app.call(`/api/toolpaths/${saved.body.id}/versions`, { method: "POST", json: { data: saved.body.data, gcode: saved.body.gcode, changeMessage: "Composite original" } })
  expect(version.status).toBe(201)
  const edited = await app.call(`/api/toolpaths/${saved.body.id}`, { method: "PUT", json: { gcode: `${combined.gcode}\n; edited` } })
  expect(edited.status).toBe(200)
  expect(edited.body.data.operations).toBeUndefined()
  const restored = await app.call(`/api/toolpaths/${saved.body.id}/versions/restore`, { method: "POST", json: { versionId: version.body.id } })
  expect(restored.status).toBe(200)
  expect(restored.body.data.operations).toHaveLength(2)
  const handlers = await app.toolHandlers()
  await handlers.stock!(project, { action: "set", stock: { ...document.stock, width: 36 } })
  expect((await app.call(`/api/toolpaths/${saved.body.id}`)).body.data.operations).toBeUndefined()
  await app.call(`/api/drawings/${drawing}`, { method: "PUT", json: { data: { elements: request.elements } } })
})

test("the sidecar validates native save and binds current drawing evidence for AI review", async () => {
  const saved = await create({ ...document, sourceRevision: "client-forged-revision", note: "Preserved metadata" })
  expect(saved.status).toBe(201)
  expect(saved.body.gcode).toBe(document.gcode)
  expect(saved.body.data.program).toEqual(document.program)
  expect(saved.body.data.note).toBe("Preserved metadata")
  expect(saved.body.data.sourceRevision).toMatch(/^[a-f0-9]{64}$/)
  const handlers = await app.toolHandlers()
  const review = await handlers.reviewOperation!(project, saved.body.id)
  expect(review).toMatchObject({ status: document.kernelArtifact!.release === "verified-program" ? "pass" : document.kernelArtifact!.release, identity: { nc: document.kernelArtifact!.identity.nc } })
  expect(await handlers.operationProgram!(project, saved.body.id)).toMatchObject({ ok: true, gcode: document.gcode })
  await app.call(`/api/drawings/${drawing}`, { method: "PUT", json: { data: { elements: [{ ...request.elements[0], width: 31 }] } } })
  expect(await handlers.reviewOperation!(project, saved.body.id)).toMatchObject({ ok: false, status: "stale" })
  const historical = await create(document)
  expect(historical.status).toBe(201)
  expect(historical.body.data.sourceRevision).toBeUndefined()
  expect(await handlers.operationProgram!(project, historical.body.id)).toMatchObject({ ok: false })
  await app.call(`/api/drawings/${drawing}`, { method: "PUT", json: { data: { elements: request.elements } } })
})

test("invalid documents and altered NC, artifact or IR never become verified rows", async () => {
  const before = (await app.call(`/api/toolpaths?projectId=${project}`)).body.length
  expect((await create({ ...document, program: { ...document.program, units: "invalid" } })).status).toBe(400)
  expect((await create(document, `${document.gcode}\n; changed`)).status).toBe(400)
  expect((await create({ ...document, kernelArtifact: { ...document.kernelArtifact, release: "blocked" } })).status).toBe(400)
  expect((await create({ ...document, program: { ...document.program, toolpaths: [] } })).status).toBe(400)
  expect((await create({ kernelArtifact: document.kernelArtifact, sourceRevision: "forged" })).status).toBe(400)
  expect((await app.call(`/api/toolpaths?projectId=${project}`)).body).toHaveLength(before)
})

test("editing NC through the existing API clears obsolete native evidence and remains reopenable", async () => {
  const saved = await create()
  const code = `${document.gcode}\n; manually edited`
  const plain = { ...document, gcode: code, kernelArtifact: undefined, kernelRequest: undefined }
  const updated = await app.call(`/api/toolpaths/${saved.body.id}`, { method: "PUT", json: { gcode: code, data: plain } })
  expect(updated.status).toBe(200)
  expect(updated.body.data.kernelArtifact).toBeUndefined()
  expect(updated.body.data.kernelRequest).toBeUndefined()
  expect(updated.body.data.sourceRevision).toBeUndefined()
  expect(updated.body.data.program).toEqual(cam.generator.analyseGcode(code).program)
  const handlers = await app.toolHandlers()
  expect(await handlers.operationProgram!(project, saved.body.id)).toMatchObject({ ok: true, gcode: code })
  expect(await handlers.reviewOperation!(project, saved.body.id)).toMatchObject({ ok: false, status: "unverified" })
  const original = await create()
  const edited = await app.call(`/api/toolpaths/${original.body.id}`, { method: "PUT", json: { gcode: code } })
  expect(edited.status).toBe(200)
  const reopened = await app.call(`/api/toolpaths/${original.body.id}`)
  expect(reopened.body.gcode).toBe(code)
  expect(reopened.body.data.gcode).toBe(code)
  expect(reopened.body.data.kernelArtifact).toBeUndefined()
  expect(reopened.body.data.sourceRevision).toBeUndefined()
  expect(reopened.body.data.program).toEqual(cam.generator.analyseGcode(code).program)
  const projectProgram = await app.call("/api/toolpaths", { method: "POST", json: { name: "Project NC", projectId: project, gcode: code, data: plain } })
  expect(projectProgram.status).toBe(201)
  expect(await handlers.listOperations!(project)).toContainEqual(expect.objectContaining({ id: projectProgram.body.id, generated: true }))
  expect(await handlers.operationProgram!(project, projectProgram.body.id)).toMatchObject({ ok: true, gcode: code })
})

test("stock changes invalidate both the stored original and every portable NC/IR/evidence copy", async () => {
  const saved = await create()
  const handlers = await app.toolHandlers()
  const stock = { ...document.stock, width: 36 }
  expect(await handlers.stock!(project, { action: "set", stock })).toMatchObject({ ok: true })
  const invalidated = (await app.call(`/api/toolpaths/${saved.body.id}`)).body
  expect(invalidated.gcode).toBeNull()
  expect(invalidated.data.gcode).toBe("")
  expect(invalidated.data.program.toolpaths).toEqual([])
  expect(invalidated.data.stock.width).toBe(36)
  expect(invalidated.data.kernelArtifact).toBeUndefined()
  expect(invalidated.data.kernelRequest).toBeUndefined()
  expect(invalidated.data.sourceRevision).toBeUndefined()
  expect(() => Schema.decodeUnknownSync(CamProgramDocument)(invalidated.data)).not.toThrow()
})
