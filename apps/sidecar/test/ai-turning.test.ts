import { afterAll, beforeAll, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { CamProgramDocument, CamTurningPlan } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })
const input = { profile: [{ diameter: 40, z: 0 }, { diameter: 40, z: -20 }, { diameter: 25, z: -20 }, { diameter: 25, z: -50 }], stock: { diameter: 44, length: 60 } }

test("turning crosses the published AI bridge as preview, stores lathe NC only with write authority and detects stale evidence", async () => {
  const projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Turning" } })).body.id
  const drawingId = (await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Shaft", data: { elements: [] } } })).body.id
  const token = async (mode: "read" | "write") => (await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: "turn-test", projectId, mode } })).body.token as string
  const invoke = (key: string, tool: string, action: string, params: Record<string, unknown>) => app.call("/api/ai/actions/invoke", {
    method: "POST", auth: false, headers: { authorization: `Bearer ${key}` }, json: { projectId, tool, input: { action, ...params } }
  })
  const read = await token("read"), write = await token("write")
  const preview = await invoke(read, "cam", "turn", input)
  expect(preview.status).toBe(200)
  const plan = Schema.decodeUnknownSync(CamTurningPlan)(preview.body.result)
  expect(plan.release).toBe("preview")
  expect(plan.partVolume + plan.unmachinedVolume + plan.removedVolume).toBeCloseTo(plan.stockVolume, 6)
  expect((await app.call(`/api/toolpaths?projectId=${projectId}`)).body).toEqual([])
  expect((await invoke(read, "cam_edit", "turn", input)).status).toBe(400)
  const invalid = await invoke(write, "cam_edit", "turn", { ...input, stock: { diameter: 20, length: 60 } })
  expect(invalid.body.result.ok).toBe(false)
  const stale = await invoke(write, "cam_edit", "turn", { ...input, expectedRevision: "old" })
  expect(stale.body.result).toMatchObject({ ok: false, status: "stale" })
  expect((await app.call(`/api/toolpaths?projectId=${projectId}`)).body).toEqual([])
  const saved = await invoke(write, "cam_edit", "turn", input)
  expect(saved.status).toBe(200)
  expect(saved.body.result).toMatchObject({ ok: true, release: "preview", drawingId, projectId })
  const operationId = saved.body.result.operationId
  const stored = await app.call(`/api/toolpaths/${operationId}`)
  const document = Schema.decodeUnknownSync(CamProgramDocument)(stored.body.data)
  expect(stored.body.type).toBe("lathe")
  expect(document.settings.machineType).toBe("lathe")
  expect(document.settings.stockDiameter).toBe(44)
  expect(document.settings.stockLength).toBe(60)
  expect(document.gcode).toBe(plan.nc)
  expect(stored.body.gcode).toBe(plan.nc)
  expect(saved.body.result.identity.nc).toBe(cam.kernel.sha256(plan.nc))
  expect((await invoke(read, "cam", "review", { operationId })).body.result).toMatchObject({ ok: false, status: "preview" })
  const machine = await invoke(read, "cam", "machine", { operationId, machineType: "lathe" })
  expect(machine.body.result.run.setup.stock).toMatchObject({ diameter: 44, length: 60 })
  expect(machine.body.result.run.unsupported).toEqual([])
  await app.call(`/api/drawings/${drawingId}`, { method: "PUT", json: { data: { elements: [{ id: "changed", type: "cube", width: 5, height: 5, depth: 5 }] } } })
  expect((await invoke(read, "cam", "review", { operationId })).body.result).toMatchObject({ ok: false, status: "stale" })
  expect((await invoke(read, "cam", "machine", { operationId, machineType: "lathe" })).body.result.ok).toBe(false)
})
