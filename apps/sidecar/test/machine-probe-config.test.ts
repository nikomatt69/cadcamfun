/** Work offsets and probe configuration of a machine over HTTP (spec 73 §3.1/§3.2): round trip, setup scope, 403/404/409, history. */
import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { MachineProbeConfigDocument, WorkOffsetTableDocument } from "@cadcamfun/api"
import { Schema } from "effect"
import { makeApp } from "./helpers.ts"

setDefaultTimeout(60_000)
let app: Awaited<ReturnType<typeof makeApp>>
let machineId = ""
beforeAll(async () => {
  app = await makeApp()
  const created = await app.call("/api/machine-configs", { method: "POST", json: {
    name: "VMC 850", type: "mill", config: { workVolume: { x: 850, y: 500, z: 500 }, maxSpindleSpeed: 10000, maxFeedRate: 12000, controller: "fanuc" }
  } })
  machineId = created.body.data.id
  // The create body has no probing section; the generic update merges one into the config.
  await app.call(`/api/machine-configs/${machineId}`, { method: "PUT", json: { name: "VMC 850", config: { probing: { stylusRadius: 1, feed: 100 } } } })
})
afterAll(async () => { await app.dispose() })

const stranger = async () => {
  const password = "test-password-long"
  await app.call("/api/auth/signup", { method: "POST", json: { email: "probe-stranger@example.com", name: "Stranger", password, confirmPassword: password } })
  return { "x-session-token": (await app.call("/api/auth/signin-direct", { method: "POST", json: { email: "probe-stranger@example.com", password } })).body.token as string }
}

test("work offsets: empty, put with base, setup scope, the machine keeps its other config, a version per save", async () => {
  const path = `/api/machine-configs/${machineId}/work-offsets`
  expect((await app.call(path, { auth: false })).status).toBe(401)
  const empty = Schema.decodeUnknownSync(WorkOffsetTableDocument)((await app.call(path)).body)
  expect(empty).toMatchObject({ machineConfigId: machineId, setupId: null, entries: {}, isOwner: true })
  const put = await app.call(path, { method: "PUT", json: { entries: { G54: { x: -312.5, y: -201.25, z: -412.004 }, "G54.1 P3": { x: 1, y: 2, z: 3, c: 0.01 } }, baseUpdatedAt: empty.updatedAt } })
  expect(put.status).toBe(200)
  const saved = Schema.decodeUnknownSync(WorkOffsetTableDocument)(put.body)
  expect(saved.entries.G54).toEqual({ x: -312.5, y: -201.25, z: -412.004 })
  expect(saved.updatedAt).not.toBe(empty.updatedAt)
  const setup = await app.call(`${path}?setupId=op-10`, { method: "PUT", json: { entries: { G55: { x: 5, y: 6, z: 7 } } } })
  expect(setup.body).toMatchObject({ setupId: "op-10", entries: { G55: { x: 5, y: 6, z: 7 } } })
  expect((await app.call(path)).body.entries).toHaveProperty("G54")
  expect((await app.call(path)).body.entries).not.toHaveProperty("G55")
  expect((await app.call(`${path}?setupId=op-10`)).body.entries).toEqual({ G55: { x: 5, y: 6, z: 7 } })
  // The generic machine route still reads the machine, with the table inside its config.
  const machine = await app.call(`/api/machine-configs/${machineId}`)
  expect(machine.body.data.config).toMatchObject({ maxSpindleSpeed: 10000, controller: "fanuc", workOffsetTable: { entries: { G54: { x: -312.5 } }, bySetup: { "op-10": { G55: { x: 5 } } } } })
  const versions = await app.call(`/api/machine-configs/${machineId}/versions`)
  expect(versions.body.data.length).toBeGreaterThanOrEqual(2)
})

test("work offsets: a stale base is 409 and writes nothing; bad rows are 400", async () => {
  const path = `/api/machine-configs/${machineId}/work-offsets`
  const before = (await app.call(path)).body
  const stale = await app.call(path, { method: "PUT", json: { entries: {}, baseUpdatedAt: "2000-01-01T00:00:00.000Z" } })
  expect(stale.status).toBe(409)
  expect((await app.call(path)).body).toEqual(before)
  expect((await app.call(path, { method: "PUT", json: { entries: { G54: { x: 1, y: 2 } } } })).status).toBe(400)
  expect((await app.call(path, { method: "PUT", json: { entries: { G54: { x: 1, y: 2, z: "3" } } } })).status).toBe(400)
  expect((await app.call(path, { method: "PUT", json: { entries: { "$bad key": { x: 1, y: 2, z: 3 } } } })).status).toBe(400)
})

test("probe configuration: read, slices replace, null removes, 409 on a stale base, 400 on an empty body", async () => {
  const path = `/api/machine-configs/${machineId}/probe`
  const first = Schema.decodeUnknownSync(MachineProbeConfigDocument)((await app.call(path)).body)
  expect(first).toMatchObject({ probing: { stylusRadius: 1, feed: 100 }, toolSetter: null, rotaryCalibration: null, isOwner: true })
  const put = await app.call(path, { method: "PUT", json: { toolSetter: { kind: "contact", triggerZ: -420.5 }, baseUpdatedAt: first.updatedAt } })
  expect(put.status).toBe(200)
  expect(put.body).toMatchObject({ probing: { stylusRadius: 1 }, toolSetter: { kind: "contact", triggerZ: -420.5 } })
  expect((await app.call(path, { method: "PUT", json: { probing: { stylusRadius: 2 }, baseUpdatedAt: first.updatedAt } })).status).toBe(409)
  expect((await app.call(path, { method: "PUT", json: {} })).status).toBe(400)
  const removed = await app.call(path, { method: "PUT", json: { toolSetter: null } })
  expect(removed.body.toolSetter).toBeNull()
  // The work-offset table written by the other route is untouched by a probe-config write.
  expect((await app.call(`/api/machine-configs/${machineId}/work-offsets`)).body.entries).toHaveProperty("G54")
})

test("access: unknown machine is 404, a stranger's read and write are 403", async () => {
  expect((await app.call("/api/machine-configs/nope/work-offsets")).status).toBe(404)
  expect((await app.call("/api/machine-configs/nope/probe", { method: "PUT", json: { probing: {} } })).status).toBe(404)
  const headers = await stranger()
  expect((await app.call(`/api/machine-configs/${machineId}/work-offsets`, { headers })).status).toBe(403)
  expect((await app.call(`/api/machine-configs/${machineId}/work-offsets`, { method: "PUT", headers, json: { entries: {} } })).status).toBe(403)
  expect((await app.call(`/api/machine-configs/${machineId}/probe`, { method: "PUT", headers, json: { probing: {} } })).status).toBe(403)
})
