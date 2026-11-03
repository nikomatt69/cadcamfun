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

describe("/api/components/:id/versions", () => {
  let id: string
  beforeAll(async () => {
    id = (await app.call(`/api/projects/${projectId}/components`, { method: "POST", json: { name: "Versioned", data: bracket } })).body.id
  })

  test("create validates and normalises, list is newest first with the author, get uses the envelope", async () => {
    expect((await app.call(`/api/components/${id}/versions`, { method: "POST", json: {} })).body.message).toBe("Component data is required")
    const bad = await app.call(`/api/components/${id}/versions`, { method: "POST", json: { data: { name: 5 } } })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toStartWith("Invalid component data: ")

    const first = await app.call(`/api/components/${id}/versions`, { method: "POST", json: { data: { name: "v1", type: "custom" }, changeMessage: "first" } })
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ componentId: id, changeMessage: "first", message: "Version created successfully" })
    expect(first.body.data).toMatchObject({ name: "v1", version: "1.0", elements: [] })
    await Bun.sleep(5)
    await app.call(`/api/components/${id}/versions`, { method: "POST", json: { data: { name: "v2", type: "custom" } } })

    const list = await app.call(`/api/components/${id}/versions`)
    expect(list.body).toHaveLength(2)
    expect(list.body[0].data.name).toBe("v2")
    expect(list.body[0].changeMessage).toBe("")
    expect(Object.keys(list.body[0].user).sort()).toEqual(["email", "name"])

    const one = await app.call(`/api/components/${id}/versions/${first.body.id}`)
    expect(one.body).toMatchObject({ success: true, message: "Success", data: { id: first.body.id, changeMessage: "first" } })
    expect((await app.call(`/api/components/${id}/versions/nope`)).status).toBe(404)
    expect((await app.call("/api/components/nope/versions")).body.message).toBe("Component not found or access denied")
  })

  test("restore saves the current data first, then takes the version's data; a version of another component is refused", async () => {
    const original = (await app.call(`/api/components/${id}`)).body.data
    const saved = await app.call(`/api/components/${id}/versions`, { method: "POST", json: { data: { name: "keep", type: "custom" } } })
    const other = (await app.call(`/api/projects/${projectId}/components`, { method: "POST", json: { name: "Other" } })).body.id
    const foreign = (await app.call(`/api/components/${other}/versions`, { method: "POST", json: { data: { name: "x", type: "custom" } } })).body.id

    expect((await app.call(`/api/components/${id}/versions/restore`, { method: "POST", json: {} })).body.message).toBe("Component ID and Version ID are required")
    expect((await app.call(`/api/components/${id}/versions/restore`, { method: "POST", json: { versionId: foreign } })).body.message).toBe("Version not found")
    // A body `id` naming another component changes nothing: the path decides, and the version must belong to it.
    expect((await app.call(`/api/components/${other}/versions/restore`, { method: "POST", json: { id, versionId: saved.body.id } })).body.message).toBe("Version not found")

    const before = (await app.call(`/api/components/${id}/versions`)).body.length
    const restored = await app.call(`/api/components/${id}/versions/restore`, { method: "POST", json: { id, versionId: saved.body.id } })
    expect(restored.status).toBe(200)
    expect(restored.body).toMatchObject({ message: "Version restored successfully" })
    expect(restored.body.data.name).toBe("keep")
    const after = (await app.call(`/api/components/${id}/versions`)).body
    expect(after).toHaveLength(before + 1)
    expect(after[0]).toMatchObject({ changeMessage: "Auto-saved before version restore", data: original })
  })
})

describe("/api/components/:id/comments", () => {
  let id: string
  beforeAll(async () => {
    id = (await app.call(`/api/projects/${projectId}/components`, { method: "POST", json: { name: "Discussed" } })).body.id
  })

  test("add rejects blank content; list is newest first with the author; edit and delete by the author", async () => {
    expect((await app.call(`/api/components/${id}/comments`, { method: "POST", json: { content: "   " } })).body.message).toBe("Comment content is required")
    const a = await app.call(`/api/components/${id}/comments`, { method: "POST", json: { content: "first" } })
    expect(a.body).toMatchObject({ success: true, message: "Comment added successfully", data: { content: "first", componentId: id } })
    expect(Object.keys(a.body.data.user).sort()).toEqual(["email", "id", "image", "name"])
    await Bun.sleep(5)
    const b = await app.call(`/api/components/${id}/comments`, { method: "POST", json: { content: "second" } })

    const list = await app.call(`/api/components/${id}/comments`)
    expect(list.body.data.map((c: { content: string }) => c.content)).toEqual(["second", "first"])

    const commentId = a.body.data.id
    expect((await app.call(`/api/components/${id}/comments/${commentId}`, { method: "PUT", json: { content: "" } })).status).toBe(400)
    const edited = await app.call(`/api/components/${id}/comments/${commentId}`, { method: "PUT", json: { content: "edited" } })
    expect(edited.body).toMatchObject({ message: "Comment updated successfully", data: { id: commentId, content: "edited" } })
    expect((await app.call(`/api/components/${other(id)}/comments/${commentId}`, { method: "PUT", json: { content: "x" } })).status).toBe(404)

    const del = await app.call(`/api/components/${id}/comments/${b.body.data.id}`, { method: "DELETE" })
    expect(del.body).toEqual({ success: true, message: "Comment deleted successfully", data: null })
    expect((await app.call(`/api/components/${id}/comments`)).body.data).toHaveLength(1)
    expect((await app.call(`/api/components/${id}/comments/${b.body.data.id}`, { method: "DELETE" })).status).toBe(404)
  })
})

/** An id that is not the component's, to prove the comment lookup is scoped to the component in the path. */
const other = (id: string) => `${id}-other`
