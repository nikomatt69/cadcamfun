import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { CamKernelResult } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(60_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })
const input = { schemaVersion: 1, id: "kernel-job", name: "Plate", material: "6061", machine: "vmc-standard", elements: [{ id: "plate", type: "cube", width: 30, height: 20, depth: 5, x: 0, y: 0, z: 0 }] }
const post = (json: unknown, auth = true) => app.call("/api/toolpaths/manufacture", { method: "POST", json, auth })

test("kernel generation is authenticated and validates the snapshot before execution", async () => {
  expect((await post(input, false)).status).toBe(401)
  expect((await post({ ...input, schemaVersion: 2 })).status).toBe(400)
  expect((await post({ ...input, elements: [] })).status).toBe(400)
  expect((await post({ ...input, tolerance: 0 })).status).toBe(400)
  expect((await post({ ...input, machine: "missing" })).status).toBe(400)
})

test("the sidecar returns the full kernel artifact for the actual NC without creating stored projects", async () => {
  const before = await app.call("/api/projects")
  const response = await post(input)
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CamKernelResult)(response.body)
  expect(result.status).toBe("ok")
  if (result.status !== "ok") throw new Error(result.issues.map((issue) => issue.message).join("; "))
  expect(result.value.program.toolpaths.length).toBeGreaterThan(0)
  expect(result.value.tools.length).toBeGreaterThan(0)
  expect(result.value.operations.length).toBeGreaterThan(0)
  expect(result.value.identity.nc).toBe(cam.kernel.sha256(result.value.nc))
  expect(result.value.claims.find((claim) => claim.id === "nc-replay")?.status).toBe("passed")
  expect(result.value.machine.post).toBe("fanuc")
  expect((await app.call("/api/projects")).body).toEqual(before.body)
})

test("unsupported material and undersized stock are failed outcomes, never silently enlarged", async () => {
  const material = await post({ ...input, material: "missing" })
  expect(material.status).toBe(200)
  expect(material.body).toMatchObject({ status: "failed", issues: expect.arrayContaining([expect.objectContaining({ tag: "UnknownMaterial" })]) })
  const stock = await post({ ...input, stock: { width: 40, height: 30, depth: 2 } })
  expect(stock.status).toBe(200)
  expect(stock.body).toMatchObject({ status: "failed", issues: expect.arrayContaining([expect.objectContaining({ tag: "InvalidInput", message: "The part does not fit inside the stock" })]) })
})

test("configured stock and Haas presets survive the wire contract", async () => {
  const response = await post({ ...input, machine: "haas-vf2", workOffset: "G55", stock: { width: 34, height: 24, depth: 6 } })
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CamKernelResult)(response.body)
  expect(result.status).toBe("ok")
  if (result.status === "ok") {
    expect(result.value.machine.post).toBe("haas")
    expect(result.value.stock.initialVolume).toBeCloseTo(34 * 24 * 6, 4)
    expect(result.value.stockBounds).toEqual({ min: { x: -17, y: -12, z: -2.5 }, max: { x: 17, y: 12, z: 3.5 } })
    expect(result.value.program.workOffset).toBe("G55")
    expect(result.value.nc).toContain("G55")
  }
})

test("assistant native manufacture stores the original artifact only through a write-scoped action", async () => {
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Assistant kernel" } })).body.id
  const drawing = (await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Plate", data: { elements: input.elements } } })).body.id
  const token = async (mode: "read" | "write") => (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: "kernel-test", projectId: project, mode } })).body.token as string
  const invoke = (key: string, action: string, options: Record<string, unknown> = {}) => app.call("/api/ai/actions/invoke", {
    method: "POST", auth: false, headers: { authorization: `Bearer ${key}` }, json: { projectId: project, tool: "cam_edit", input: { action, material: "6061", ...options } }
  })
  const read = await invoke(await token("read"), "manufacture")
  expect(read.status).toBe(400)
  expect((await app.call(`/api/toolpaths?projectId=${project}`)).body).toEqual([])
  const write = await token("write")
  const stale = await invoke(write, "manufacture", { expectedRevision: "old" })
  expect(stale.body.result).toMatchObject({ ok: false, status: "stale" })
  expect((await app.call(`/api/toolpaths?projectId=${project}`)).body).toEqual([])
  const done = await invoke(write, "manufacture")
  expect(done.status).toBe(200)
  expect(done.body.result.ok).toBe(true)
  const stored = await app.call(`/api/toolpaths/${done.body.result.operationId}`)
  expect(stored.body.drawingId).toBe(drawing)
  expect(stored.body.projectId).toBe(project)
  const artifact = Schema.decodeUnknownSync(CamKernelResult)({ status: "ok", value: stored.body.data.kernelArtifact })
  if (artifact.status !== "ok") throw new Error("Expected a stored artifact")
  expect(stored.body.gcode).toBe(artifact.value.nc)
  expect(cam.kernel.sha256(stored.body.gcode)).toBe(done.body.result.identity.nc)
  const handlers = await app.toolHandlers()
  const reviewed = await handlers.reviewOperation!(project, done.body.result.operationId) as { status: string; identity: { nc: string } }
  expect(reviewed.status).toBe(artifact.value.release === "verified-program" ? "pass" : artifact.value.release)
  expect(reviewed.identity.nc).toBe(done.body.result.identity.nc)
  expect(await handlers.operationProgram!(project, done.body.result.operationId)).toMatchObject({ ok: true, gcode: artifact.value.nc })
  await app.call(`/api/drawings/${drawing}`, { method: "PUT", json: { data: { elements: [{ ...input.elements[0], width: 32 }] } } })
  expect(await handlers.reviewOperation!(project, done.body.result.operationId)).toMatchObject({ ok: false, status: "stale" })
  expect(await handlers.operationProgram!(project, done.body.result.operationId)).toMatchObject({ ok: false })
})

test("manual side manufacturing survives HTTP, assistant persistence and later review", async () => {
  const response = await post({ ...input, setupOrientation: "+X", workOffset: "G55" })
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CamKernelResult)(response.body)
  if (result.status !== "ok") throw new Error(JSON.stringify(result.issues))
  expect(result.value.setupOrientation).toBe("+X")
  expect(result.value.release).toBe("preview")
  expect(result.value.program.workOffset).toBe("G55")
  expect(result.value.claims.find((c) => c.id === "setup-workholding")?.status).toBe("unresolved")
  const project = (await app.call("/api/projects", { method: "POST", json: { name: "Manual side" } })).body.id
  await app.call(`/api/projects/${project}/drawings`, { method: "POST", json: { name: "Part", data: { elements: input.elements } } })
  const handlers = await app.toolHandlers()
  const plan = await handlers.manufacture!(project, { material: "6061", setupOrientation: "+X", planOnly: true }) as { ok: boolean; notes: string[] }
  expect(plan.ok).toBe(true)
  expect(plan.notes.join(" ")).toContain("Manual +X setup")
  const saved = await handlers.manufactureOperation!(project, { material: "6061", setupOrientation: "+X", workOffset: "G56" }) as { ok: boolean; operationId: string; release: string }
  expect(saved.ok).toBe(true)
  expect(saved.release).toBe("preview")
  const stored = await app.call(`/api/toolpaths/${saved.operationId}`)
  expect(stored.body.name).toContain("+X")
  expect(stored.body.data.kernelRequest.setupOrientation).toBe("+X")
  expect(stored.body.data.kernelArtifact.program.workOffset).toBe("G56")
  expect(stored.body.data.kernelArtifact.setupOrientation).toBe("+X")
  expect(await handlers.reviewOperation!(project, saved.operationId)).toMatchObject({ status: "preview" })
})
