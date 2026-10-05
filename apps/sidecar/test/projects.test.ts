import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

describe("health + auth", () => {
  test("GET /api/health is public", async () => {
    const r = await app.call("/api/health", { auth: false })
    expect(r.status).toBe(200)
    expect(r.body.status).toBe("ok")
  })
  test("protected routes reject a missing or wrong token with 401", async () => {
    expect((await app.call("/api/projects", { auth: false })).status).toBe(401)
    const bad = await app.call("/api/projects", { auth: false, headers: { authorization: "Bearer nope" } })
    expect(bad.status).toBe(401)
  })
})

describe("/api/projects (legacy parity)", () => {
  test("POST without a name -> 400 with the legacy message", async () => {
    const r = await app.call("/api/projects", { method: "POST", json: {} })
    expect(r.status).toBe(400)
    expect(r.body.message).toBe("Project name is required")
  })

  test("POST -> 201 and the bare project row; GET list includes owner/organization/_count", async () => {
    const created = await app.call("/api/projects", { method: "POST", json: { name: "Bracket", description: "d", isPublic: true } })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ name: "Bracket", description: "d", isPublic: true, organizationId: null })

    const list = await app.call("/api/projects")
    expect(list.status).toBe(200)
    const p = list.body.find((x: { id: string }) => x.id === created.body.id)
    expect(p.owner).toMatchObject({ id: created.body.ownerId })
    expect(p.organization).toBeNull()
    expect(p._count).toEqual({ drawings: 0, components: 0 })
  })

  test("POST with an organization the user is not in -> 403", async () => {
    const r = await app.call("/api/projects", { method: "POST", json: { name: "x", organizationId: "org-1" } })
    expect(r.status).toBe(403)
    expect(r.body.message).toBe("User does not belong to the specified organization")
  })

  test("GET/PUT/DELETE by id: 404 for unknown, update + delete for the owner", async () => {
    const missing = await app.call("/api/projects/nope")
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Project not found or access denied")

    const { body: created } = await app.call("/api/projects", { method: "POST", json: { name: "Plate" } })
    const noName = await app.call(`/api/projects/${created.id}`, { method: "PUT", json: {} })
    expect(noName.status).toBe(400)

    const updated = await app.call(`/api/projects/${created.id}`, { method: "PUT", json: { name: "Plate v2", description: "new" } })
    expect(updated.status).toBe(200)
    expect(updated.body).toMatchObject({ name: "Plate v2", description: "new" })

    const del = await app.call(`/api/projects/${created.id}`, { method: "DELETE" })
    expect(del.status).toBe(200)
    expect(del.body).toEqual({ message: "Project deleted successfully" })
    expect((await app.call(`/api/projects/${created.id}`)).status).toBe(404)
  })
})
