import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let projectId: string
beforeAll(async () => {
  app = await makeApp()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Fixture" } })).body.id
})
afterAll(async () => { await app.dispose() })

const bracket = {
  id: "c1", name: "Bracket", type: "custom",
  elements: [{ id: "e1", name: "base", type: "cube", x: null, y: 2, z: null, layerId: "l0", color: "#fff", depth: 1, width: 2, height: 3 }]
}

describe("/api/projects/:id/components", () => {
  test("auth, 404, validation, 201, list newest first, project _count", async () => {
    expect((await app.call(`/api/projects/${projectId}/components`, { auth: false })).status).toBe(401)
    expect((await app.call("/api/projects/nope/components")).body.message).toBe("Project not found or access denied")
    const noName = await app.call(`/api/projects/${projectId}/components`, { method: "POST", json: {} })
    expect(noName.status).toBe(400)
    expect(noName.body.message).toBe("Component name is required")

    const a = await app.call(`/api/projects/${projectId}/components`, { method: "POST", json: { name: "A", description: "d", data: bracket } })
    expect(a.status).toBe(201)
    expect(a.body).toMatchObject({ name: "A", description: "d", isPublic: false, type: null, thumbnail: null, projectId, data: bracket })
    expect((await app.call(`/api/projects/${projectId}/components`, { method: "POST", json: { name: "B" } })).body.data).toEqual({})
    const list = await app.call(`/api/projects/${projectId}/components`)
    expect(list.body).toHaveLength(2)
    expect((await app.call(`/api/projects/${projectId}`)).body._count.components).toBe(2)
  })
})

describe("/api/components/:id", () => {
  let id: string
  beforeAll(async () => {
    id = (await app.call(`/api/projects/${projectId}/components`, { method: "POST", json: { name: "Plate", data: bracket } })).body.id
  })

  test("GET embeds the slim project; unknown -> 404", async () => {
    const got = await app.call(`/api/components/${id}`)
    expect(got.status).toBe(200)
    expect(got.body.project).toMatchObject({ id: projectId, name: "Fixture" })
    expect(Object.keys(got.body.project).sort()).toEqual(["id", "name", "ownerId"])
    const missing = await app.call("/api/components/nope")
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Component not found or access denied")
  })

  test("PUT: empty body -> 400; invalid data -> 400 with zod paths; valid data is normalised", async () => {
    const empty = await app.call(`/api/components/${id}`, { method: "PUT", json: {} })
    expect(empty.status).toBe(400)
    expect(empty.body.message).toBe("No fields provided for update")

    const bad = await app.call(`/api/components/${id}`, { method: "PUT", json: { data: { name: 5 } } })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toStartWith("Invalid component data: ")
    expect(bad.body.message).toContain("name:")
    expect(bad.body.message).toContain("type:")

    const ok = await app.call(`/api/components/${id}`, { method: "PUT", json: { name: "Plate 2", isPublic: true, type: "bracket", description: null, data: { name: "P", type: "custom" } } })
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ name: "Plate 2", isPublic: true, type: "bracket", description: null, message: "Component updated successfully" })
    expect(ok.body.data).toMatchObject({ id: "", name: "P", type: "custom", version: "1.0", elements: [], geometry: { type: "custom", elements: [] }, properties: {} })
    expect(ok.body.data.metadata.createdAt).toBeTruthy()
  })

  test("DELETE", async () => {
    const del = await app.call(`/api/components/${id}`, { method: "DELETE" })
    expect(del.body).toEqual({ message: "Component deleted successfully" })
    expect((await app.call(`/api/components/${id}`)).status).toBe(404)
  })
})
