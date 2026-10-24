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
    // The tolerance budget crosses the contract with its terms (the schema would drop a field it did not list).
    expect(result.value.tolerance?.terms.map((t: { id: string }) => t.id)).toContain("nc-rounding")
    expect(result.value.tolerance?.achieved).toBeGreaterThan(0)
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

test("HTTP preserves the selected multiaxis mode and refuses unknown modes", async () => {
  const operation = { id: "finish", strategy: "multiaxis", mode: "contour", tool: "ball-10", top: 9, stepover: 40, stepdown: 4 }
  const request = { ...input, machine: "trunnion-5ax", elements: [{ id: "dome", type: "sphere", x: 0, y: 0, z: 0, radius: 8 }], operations: [operation], resolution: 0.5 }
  expect((await post({ ...request, operations: [{ ...operation, mode: "unsupported" }] })).status).toBe(400)
  const response = await post(request)
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CamKernelResult)(response.body)
  if (result.status !== "ok") throw new Error(JSON.stringify(result.issues))
  expect(result.value.operations[0]).toMatchObject({ status: "ok", parameters: { mode: "contour" } })
  expect(result.value.nc).toMatch(/\bA-?\d/)
  expect(result.value.identity.nc).toBe(cam.kernel.sha256(result.value.nc))
  expect(result.value.claims.find((claim) => claim.id === "nc-replay")?.status).toBe("passed")
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

test("a printer preset slices the part over HTTP and the artifact keeps its print report and claims", async () => {
  const printed = { ...input, material: "PETG", machine: "printer-prusa-mk4", print: { infillDensity: 15, infillPattern: "gyroid", walls: 3, supports: "none", adhesion: "brim", brimWidth: 4 }, elements: [{ id: "block", type: "cube", width: 24, height: 16, depth: 6, x: 0, y: 0, z: 3 }] }
  const response = await post(printed)
  expect(response.status).toBe(200)
  const result = Schema.decodeUnknownSync(CamKernelResult)(response.body)
  expect(result.status).toBe("ok")
  if (result.status !== "ok") throw new Error(result.issues.map((issue) => issue.message).join("; "))
  const a = result.value
  expect(a.machine.id).toBe("printer-prusa-mk4")
  expect(a.operations[0]).toMatchObject({ strategy: "print", cut: "print" })
  expect(a.nc).toContain("M104 S235")
  expect(a.print).toMatchObject({ dialect: "marlin", layers: 30, settings: { infillPattern: "gyroid", adhesion: "brim" } })
  expect(a.print!.lengthByKind["brim"]).toBeGreaterThan(50)
  expect(a.claims.find((c) => c.id === "bed-fit")?.status).toBe("passed")
  expect(a.claims.find((c) => c.id === "nc-replay")?.status).toBe("passed")
  expect(a.release).toBe("verified-program")
  expect(a.identity.nc).toBe(cam.kernel.sha256(a.nc))
})

test("a printer request is validated: a hotter nozzle than the printer has is a failed outcome with the reason", async () => {
  expect((await post({ ...input, machine: "printer-desktop-220", print: { infillDensity: 120 } })).status).toBe(400)
  const hot = await post({ ...input, material: "PLA", machine: "printer-desktop-220", print: { nozzleTemperature: 400 } })
  expect(hot.status).toBe(200)
  expect(hot.body).toMatchObject({ status: "failed", issues: expect.arrayContaining([expect.objectContaining({ tag: "MachineLimit" })]) })
})
