import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const steel = { name: "Steel 1018", description: "mild steel", properties: { density: 7.87, hardness: 126 } }

describe("/api/materials (legacy parity)", () => {
  test("requires auth", async () => {
    expect((await app.call("/api/materials", { auth: false })).status).toBe(401)
  })

  test("POST validates name and properties with the legacy message", async () => {
    const r = await app.call("/api/materials", { method: "POST", json: { name: "x" } })
    expect(r.status).toBe(400)
    expect(r.body.message).toBe("Name and properties are required")
  })

  test("POST -> 201 bare row; JSON properties round-trip; defaults applied", async () => {
    const r = await app.call("/api/materials", { method: "POST", json: steel })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ ...steel, isPublic: false, organizationId: null })
    expect(r.body.ownerId).toBeTruthy()
  })

  test("POST with a foreign organization -> 403", async () => {
    const r = await app.call("/api/materials", { method: "POST", json: { ...steel, organizationId: "org-x" } })
    expect(r.status).toBe(403)
    expect(r.body.message).toBe("You are not a member of the specified organization")
  })

  test("GET list is name-ordered and search narrows within visible items", async () => {
    await app.call("/api/materials", { method: "POST", json: { name: "Aluminium 6061", properties: { density: 2.7 } } })
    const all = await app.call("/api/materials")
    expect(all.status).toBe(200)
    expect(all.body.map((m: { name: string }) => m.name)).toEqual([...all.body.map((m: { name: string }) => m.name)].sort())
    const found = await app.call("/api/materials?search=alu")
    expect(found.body.map((m: { name: string }) => m.name)).toEqual(["Aluminium 6061"])
  })

  test("GET/PUT/DELETE by id", async () => {
    const missing = await app.call("/api/materials/nope")
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Material not found or access denied")

    const { body: m } = await app.call("/api/materials", { method: "POST", json: steel })
    const got = await app.call(`/api/materials/${m.id}`)
    expect(got.status).toBe(200)
    expect(got.body.owner).toMatchObject({ id: m.ownerId })
    expect(got.body.organization).toBeNull()

    const upd = await app.call(`/api/materials/${m.id}`, { method: "PUT", json: { description: "updated", isPublic: true } })
    expect(upd.status).toBe(200)
    expect(upd.body).toMatchObject({ name: steel.name, description: "updated", isPublic: true })

    const del = await app.call(`/api/materials/${m.id}`, { method: "DELETE" })
    expect(del.body).toEqual({ message: "Material deleted successfully" })
    expect((await app.call(`/api/materials/${m.id}`)).status).toBe(404)
  })
})
