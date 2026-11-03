import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

/** The resources whose PUT takes `baseUpdatedAt` (materials, tools, machine configurations, projects, organisations; components and drawings have their own tests). */
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

  test("projects: current writes, stale answers 409 and keeps the name and the organisation", async () => {
    const created = (await app.call("/api/projects", { method: "POST", json: { name: "Plant" } })).body
    const ok = await app.call(`/api/projects/${created.id}`, { method: "PUT", json: { name: "Plant 2", baseUpdatedAt: created.updatedAt } })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ name: "Plant 2", owner: { email: expect.any(String) } })
    const stale = await app.call(`/api/projects/${created.id}`, { method: "PUT", json: { name: "Theirs", baseUpdatedAt: created.updatedAt } })
    expect(stale.status).toBe(409)
    expect(stale.body.message).toBe("The project was saved elsewhere since it was read. Nothing was overwritten.")
    expect((await app.call(`/api/projects/${created.id}`)).body.name).toBe("Plant 2")
    expect((await app.call(`/api/projects/${created.id}`, { method: "PUT", json: { name: "Forced" } })).status).toBe(200)
  })

  test("organisations: the same contract", async () => {
    const created = (await app.call("/api/organizations", { method: "POST", json: { name: "Shop" } })).body
    const ok = await app.call(`/api/organizations/${created.id}`, { method: "PUT", json: { name: "Shop 2", baseUpdatedAt: created.updatedAt } })
    expect(ok.status).toBe(200)
    expect(ok.body.name).toBe("Shop 2")
    const stale = await app.call(`/api/organizations/${created.id}`, { method: "PUT", json: { name: "Theirs", baseUpdatedAt: created.updatedAt } })
    expect(stale.status).toBe(409)
    expect((await app.call(`/api/organizations/${created.id}`)).body.name).toBe("Shop 2")
    expect((await app.call(`/api/organizations/${created.id}`, { method: "PUT", json: { name: "Forced" } })).status).toBe(200)
  })
})

describe("library history (RM-05): a save keeps what it replaced", () => {
  test("materials: the version counts the saves and each save leaves the previous row, with who saved it", async () => {
    const created = (await app.call("/api/materials", { method: "POST", json: { name: "Alu", properties: { density: 2.7 } } })).body
    expect(created.version).toBe(1)
    expect((await app.call(`/api/materials/${created.id}/versions`)).body).toEqual([])

    const second = await app.call(`/api/materials/${created.id}`, { method: "PUT", json: { name: "Alu 6061", properties: { density: 2.71 } } })
    expect(second.body.version).toBe(2)
    const third = await app.call(`/api/materials/${created.id}`, { method: "PUT", json: { description: "T6", baseUpdatedAt: second.body.updatedAt } })
    expect(third.body.version).toBe(3)

    const history = (await app.call(`/api/materials/${created.id}/versions`)).body
    expect(history.map((h: { version: number }) => h.version)).toEqual([2, 1])
    expect(history[1].data).toMatchObject({ id: created.id, name: "Alu", version: 1, properties: { density: 2.7 } })
    expect(history[0].data).toMatchObject({ name: "Alu 6061", version: 2 })
    expect(history[0].changedBy).toBe((await app.call("/api/user/profile")).body.id)

    // A refused (stale) save keeps no snapshot and does not move the version.
    const stale = await app.call(`/api/materials/${created.id}`, { method: "PUT", json: { name: "Late", baseUpdatedAt: created.updatedAt } })
    expect(stale.status).toBe(409)
    expect((await app.call(`/api/materials/${created.id}/versions`)).body).toHaveLength(2)
    expect((await app.call(`/api/materials/${created.id}`)).body.version).toBe(3)
    expect((await app.call("/api/materials/nope/versions")).status).toBe(404)
  })

  test("tools and machine configurations keep their history too; the history is not readable by a stranger", async () => {
    const tool = (await app.call("/api/tools", { method: "POST", json: { name: "Drill", type: "drill", diameter: 5, material: "HSS" } })).body
    await app.call(`/api/tools/${tool.id}`, { method: "PUT", json: { diameter: 6 } })
    const toolHistory = (await app.call(`/api/tools/${tool.id}/versions`)).body
    expect(toolHistory).toHaveLength(1)
    expect(toolHistory[0].data).toMatchObject({ diameter: 5, version: 1 })

    const machineRow = (await app.call("/api/machine-configs", { method: "POST", json: machine })).body.data
    await app.call(`/api/machine-configs/${machineRow.id}`, { method: "PUT", json: { name: "Mill B" } })
    const machineHistory = (await app.call(`/api/machine-configs/${machineRow.id}/versions`)).body.data
    expect(machineHistory).toHaveLength(1)
    expect(machineHistory[0].data).toMatchObject({ name: "Mill", version: 1 })

    const password = "test-password-long"
    await app.call("/api/auth/signup", { method: "POST", json: { email: "lib-stranger@example.com", name: "Stranger", password, confirmPassword: password } })
    const headers = { "x-session-token": (await app.call("/api/auth/signin-direct", { method: "POST", json: { email: "lib-stranger@example.com", password } })).body.token }
    expect((await app.call(`/api/materials/${tool.id}/versions`, { headers })).status).toBe(404)
    expect((await app.call(`/api/tools/${tool.id}/versions`, { headers })).status).toBe(404)
    expect((await app.call(`/api/machine-configs/${machineRow.id}/versions`, { headers })).status).toBeGreaterThanOrEqual(403)
  })
})
