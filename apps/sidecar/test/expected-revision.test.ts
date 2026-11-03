import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

/** The resources whose PUT takes `baseUpdatedAt` (materials, tools, machine configurations; components and drawings have their own tests). */
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const machine = { name: "Mill", type: "mill", config: { maxSpindleSpeed: 12000, maxFeedRate: 5000, workVolume: { x: 300, y: 200, z: 150 } } }

describe("PUT with baseUpdatedAt", () => {
  test("materials: a current revision writes, a stale one answers 409 and changes nothing, no revision writes as before", async () => {
    const created = (await app.call("/api/materials", { method: "POST", json: { name: "Steel", properties: { density: 7.8 } } })).body
    const ok = await app.call(`/api/materials/${created.id}`, { method: "PUT", json: { name: "Steel 1045", baseUpdatedAt: created.updatedAt } })
    expect(ok.status).toBe(200)
    expect(ok.body.name).toBe("Steel 1045")
    const stale = await app.call(`/api/materials/${created.id}`, { method: "PUT", json: { name: "Theirs", baseUpdatedAt: created.updatedAt } })
    expect(stale.status).toBe(409)
    expect(stale.body.message).toBe("The material was saved elsewhere since it was read. Nothing was overwritten.")
    expect((await app.call(`/api/materials/${created.id}`)).body.name).toBe("Steel 1045")
    expect((await app.call(`/api/materials/${created.id}`, { method: "PUT", json: { name: "Forced" } })).status).toBe(200)
  })

  test("tools: the same contract", async () => {
    const created = (await app.call("/api/tools", { method: "POST", json: { name: "End mill", type: "endmill", diameter: 6, material: "Carbide" } })).body
    const ok = await app.call(`/api/tools/${created.id}`, { method: "PUT", json: { diameter: 8, baseUpdatedAt: created.updatedAt } })
    expect(ok.status).toBe(200)
    expect(ok.body.diameter).toBe(8)
    const stale = await app.call(`/api/tools/${created.id}`, { method: "PUT", json: { diameter: 3, baseUpdatedAt: created.updatedAt } })
    expect(stale.status).toBe(409)
    expect((await app.call(`/api/tools/${created.id}`)).body.diameter).toBe(8)
  })

  test("machine configurations: the envelope 409, and a replayed stale write still changes nothing", async () => {
    const created = (await app.call("/api/machine-configs", { method: "POST", json: machine })).body.data
    const read = created.updatedAt
    const ok = await app.call(`/api/machine-configs/${created.id}`, { method: "PUT", json: { name: "Mill 2", baseUpdatedAt: read } })
    expect(ok.status).toBe(200)
    expect(ok.body.data.name).toBe("Mill 2")
    for (const _ of [1, 2]) {
      const stale = await app.call(`/api/machine-configs/${created.id}`, { method: "PUT", json: { name: "Theirs", baseUpdatedAt: read } })
      expect(stale.status).toBe(409)
      expect(stale.body).toMatchObject({ success: false, message: "The machine configuration was saved elsewhere since it was read. Nothing was overwritten." })
    }
    expect((await app.call(`/api/machine-configs/${created.id}`)).body.data.name).toBe("Mill 2")
  })
})
