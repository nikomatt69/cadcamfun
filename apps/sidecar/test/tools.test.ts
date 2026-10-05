import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const endmill = { name: "6mm endmill", type: "endmill", diameter: 6, material: "Carbide", numberOfFlutes: 3, maxRPM: 24000, notes: "roughing" }

describe("/api/tools (legacy parity)", () => {
  test("auth + validation message", async () => {
    expect((await app.call("/api/tools", { auth: false })).status).toBe(401)
    const r = await app.call("/api/tools", { method: "POST", json: { name: "x", type: "endmill" } })
    expect(r.status).toBe(400)
    expect(r.body.message).toBe("Name, type, diameter, and material are required")
  })

  test("POST -> 201 with defaults; foreign organization -> 403", async () => {
    const r = await app.call("/api/tools", { method: "POST", json: endmill })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ ...endmill, coolantType: null, cuttingLength: null, isPublic: false, organizationId: null })
    const f = await app.call("/api/tools", { method: "POST", json: { ...endmill, organizationId: "org-x" } })
    expect(f.status).toBe(403)
    expect(f.body.message).toBe("You are not a member of the specified organization")
  })

  test("list filters: type, material, diameter, search; ordered by name", async () => {
    await app.call("/api/tools", { method: "POST", json: { name: "3mm drill", type: "drillbit", diameter: 3, material: "HSS" } })
    expect((await app.call("/api/tools?type=drillbit")).body.map((t: { name: string }) => t.name)).toEqual(["3mm drill"])
    expect((await app.call("/api/tools?material=Carbide")).body.map((t: { name: string }) => t.name)).toEqual(["6mm endmill"])
    expect((await app.call("/api/tools?diameter=3")).body).toHaveLength(1)
    expect((await app.call("/api/tools?diameter=abc")).body.length).toBeGreaterThanOrEqual(2) // NaN is ignored like legacy
    expect((await app.call("/api/tools?search=rough")).body.map((t: { name: string }) => t.name)).toEqual(["6mm endmill"])
    const names = (await app.call("/api/tools")).body.map((t: { name: string }) => t.name)
    expect(names).toEqual([...names].sort())
  })

  test("GET/PUT/DELETE by id", async () => {
    const missing = await app.call("/api/tools/nope")
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Tool not found or access denied")
    const { body: t } = await app.call("/api/tools", { method: "POST", json: endmill })
    const got = await app.call(`/api/tools/${t.id}`)
    expect(got.body.owner).toMatchObject({ id: t.ownerId })
    const upd = await app.call(`/api/tools/${t.id}`, { method: "PUT", json: { maxRPM: null, notes: "finishing", diameter: 0 } })
    expect(upd.body).toMatchObject({ maxRPM: null, notes: "finishing", diameter: 6 }) // diameter 0 is falsy -> unchanged, as in legacy
    const del = await app.call(`/api/tools/${t.id}`, { method: "DELETE" })
    expect(del.body).toEqual({ message: "Tool deleted successfully" })
    expect((await app.call(`/api/tools/${t.id}`)).status).toBe(404)
  })
})
