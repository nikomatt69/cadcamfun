import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let projectId: string
beforeAll(async () => {
  app = await makeApp()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Fixture" } })).body.id
})
afterAll(async () => { await app.dispose() })

const entities = { entities: [{ _tag: "Line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }] }

describe("/api/projects/:id/drawings", () => {
  test("auth, unknown project -> 404, validation, 201 create, list newest first", async () => {
    expect((await app.call(`/api/projects/${projectId}/drawings`, { auth: false })).status).toBe(401)
    const missing = await app.call("/api/projects/nope/drawings")
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Project not found or access denied")

    const noName = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: {} })
    expect(noName.status).toBe(400)
    expect(noName.body.message).toBe("Drawing name is required")

    const a = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "A", data: entities } })
    expect(a.status).toBe(201)
    expect(a.body).toMatchObject({ name: "A", description: null, thumbnail: null, projectId, data: entities })
    const b = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "B" } })
    expect(b.body.data).toEqual({}) // legacy default `data || {}`
    await Bun.sleep(5)
    await app.call(`/api/drawings/${a.body.id}`, { method: "PUT", json: { description: "touched" } })
    const list = await app.call(`/api/projects/${projectId}/drawings`)
    expect(list.body.map((d: { name: string }) => d.name)).toEqual(["A", "B"]) // updatedAt desc
    expect((await app.call(`/api/projects/${projectId}`)).body._count.drawings).toBe(2)
  })
})

describe("/api/drawings/:id", () => {
  test("GET embeds the project; unknown id -> 404 'Drawing not found'", async () => {
    const missing = await app.call("/api/drawings/nope")
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Drawing not found")
    const { body: d } = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "C", data: entities } })
    const got = await app.call(`/api/drawings/${d.id}`)
    expect(got.status).toBe(200)
    expect(got.body.project).toMatchObject({ id: projectId, name: "Fixture", organization: null })
    expect(got.body.project.ownerId).toBeTruthy()
  })

  test("PUT updates only provided fields (legacy truthiness rules); DELETE removes", async () => {
    const { body: d } = await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "D", description: "keep", data: entities } })
    const upd = await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { name: "", data: { entities: [] }, thumbnail: "data:image/png;base64,xx" } })
    expect(upd.status).toBe(200)
    expect(upd.body).toMatchObject({ name: "D", description: "keep", data: { entities: [] }, thumbnail: "data:image/png;base64,xx" }) // empty name ignored
    const clear = await app.call(`/api/drawings/${d.id}`, { method: "PUT", json: { description: null } })
    expect(clear.body.description).toBeNull() // `description !== undefined` allows clearing

    const del = await app.call(`/api/drawings/${d.id}`, { method: "DELETE" })
    expect(del.body).toEqual({ message: "Drawing deleted successfully" })
    expect((await app.call(`/api/drawings/${d.id}`)).status).toBe(404)
  })
})
