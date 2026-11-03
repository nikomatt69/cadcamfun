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

describe("/api/components (index, details, relationships)", () => {
  let other: Record<string, string>
  let a: string
  let b: string
  beforeAll(async () => {
    const password = "test-password-long"
    expect((await app.call("/api/auth/signup", { method: "POST", json: { email: "stranger@example.com", name: "Stranger", password, confirmPassword: password } })).status).toBe(201)
    other = { "x-session-token": (await app.call("/api/auth/signin-direct", { method: "POST", json: { email: "stranger@example.com", password } })).body.token }
    a = (await app.call("/api/components", { method: "POST", json: { projectId, name: "Gear 50%", description: "spur", isPublic: true } })).body.id
    b = (await app.call("/api/components", { method: "POST", json: { projectId, name: "Assembly", type: "assembly", data: { references: [a] } } })).body.id
  })

  test("POST needs a name and a project the user can use; the type defaults to custom", async () => {
    expect((await app.call("/api/components", { method: "POST", json: { name: "x" } })).body.message).toBe("Name and projectId are required")
    expect((await app.call("/api/components", { method: "POST", json: { name: "x", projectId: "nope" } })).status).toBe(404)
    expect((await app.call("/api/components", { method: "POST", json: { name: "x", projectId }, headers: other })).status).toBe(404)
    expect((await app.call(`/api/components/${a}`)).body.type).toBe("custom")
  })

  test("GET lists the visible components; search narrows them, escapes wildcards and never reaches other users' rows", async () => {
    const all = await app.call("/api/components")
    expect(all.body.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining([a, b]))
    expect((await app.call(`/api/components?projectId=${projectId}&type=assembly`)).body.map((c: { id: string }) => c.id)).toEqual([b])
    expect((await app.call("/api/components?search=spur")).body.map((c: { id: string }) => c.id)).toEqual([a])
    expect((await app.call("/api/components?search=50%25")).body.map((c: { id: string }) => c.id)).toEqual([a])
    expect((await app.call("/api/components?search=%25")).body.map((c: { id: string }) => c.id)).toEqual([a])
    // Legacy: `search` replaced the visibility filter and `public=true` added public rows of everyone.
    expect((await app.call("/api/components?search=Gear&public=true", { headers: other })).body).toEqual([])
  })

  test("details carries the project, the rights and a drawing count of this component only", async () => {
    const d = await app.call(`/api/components/${a}/details`)
    expect(d.status).toBe(200)
    expect(d.body).toMatchObject({ id: a, canEdit: true, canDelete: true, project: { id: projectId, organization: null }, usageStats: { usedInDrawings: 0 } })
    expect(Object.keys(d.body.project.owner).sort()).toEqual(["email", "id", "name"])
    await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Sheet", data: { placed: [a] } } })
    await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Unrelated", data: {} } })
    expect((await app.call(`/api/components/${a}/details`)).body.usageStats.usedInDrawings).toBe(1)
    expect((await app.call("/api/components/nope/details")).status).toBe(404)
    const stranger = await app.call(`/api/components/${a}/details`, { headers: other })
    expect(stranger.status).toBe(403)
    expect(stranger.body.message).toBe("You do not have permission to access this component")
  })

  test("relationships follow data.references both ways and stay inside what the user can see", async () => {
    const fromA = await app.call(`/api/components/${a}/relationships`)
    expect(fromA.body.data.relationships).toEqual([{ sourceId: b, targetId: a, type: "references" }])
    expect(fromA.body.data.relatedComponents.map((c: { id: string }) => c.id)).toEqual([b])
    expect((await app.call(`/api/components/${b}/relationships`)).body.data.relationships).toEqual([{ sourceId: b, targetId: a, type: "references" }])
    expect((await app.call(`/api/components/${a}/relationships`, { headers: other })).status).toBe(404)
  })
})

describe("/api/components/:id/storage and /api/components/export-import", () => {
  let id: string
  beforeAll(async () => {
    id = (await app.call("/api/components", { method: "POST", json: { projectId, name: "Stored part", data: { type: "bracket", keep: 1 } } })).body.id
  })

  test("storage: save keeps the data and adds the path, read returns the object or a signed url, delete removes only the path", async () => {
    expect((await app.call(`/api/components/${id}/storage`)).body.message).toBe("This component does not have storage data")
    const saved = await app.call(`/api/components/${id}/storage`, { method: "POST", json: { elements: [1, 2, 3] } })
    expect(saved.body.message).toBe("Component saved to storage successfully")
    const storagePath = saved.body.data.storagePath
    expect(storagePath).toStartWith("components/")
    expect((await app.call(`/api/components/${id}`)).body.data).toEqual({ type: "bracket", keep: 1, storagePath })

    expect((await app.call(`/api/components/${id}/storage`)).body.data).toEqual({ elements: [1, 2, 3] })
    expect((await app.call(`/api/components/${id}/storage?signedUrl=true`)).body.data.signedUrl).toContain(storagePath)

    const del = await app.call(`/api/components/${id}/storage`, { method: "DELETE" })
    expect(del.body).toEqual({ success: true, message: "Component storage data deleted successfully", data: null })
    expect((await app.call(`/api/components/${id}`)).body.data).toEqual({ type: "bracket", keep: 1 })
    expect((await app.call(`/api/components/${id}/storage`, { method: "DELETE" })).status).toBe(404)
    expect((await app.call("/api/components/nope/storage")).status).toBe(404)
  })

  test("export: json carries type, data and the project name; unknown ids and formats are refused", async () => {
    const res = await app.call(`/api/components/export-import?ids=${id}`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-disposition")).toContain("components-export-")
    expect(res.body[0]).toMatchObject({ id, name: "Stored part", type: "bracket", data: { keep: 1 }, metadata: { projectName: "Fixture", version: "1.0" } })
    expect((await app.call("/api/components/export-import?ids=nope")).body.message).toBe("No accessible components found")
    expect((await app.call(`/api/components/export-import?ids=${id}&format=xml`)).body.message).toBe("Unsupported export format")
    const zip = await app.call(`/api/components/export-import?ids=${id}&format=zip`)
    expect(zip.headers.get("content-type")).toBe("application/zip")
    expect(zip.bytes.length).toBeGreaterThan(100)
  })

  test("import: needs a project the user can use and rows with name and data; create / update / skip follow the id inside that project", async () => {
    expect((await app.call("/api/components/export-import", { method: "POST", json: { data: [] } })).body.message).toBe("Project ID is required")
    expect((await app.call("/api/components/export-import", { method: "POST", json: { projectId: "nope", data: [] } })).status).toBe(404)
    expect((await app.call("/api/components/export-import", { method: "POST", json: { projectId } })).body.message).toBe("No import data provided")

    const rows = [{ id, name: "Renamed", data: { type: "plate" } }, { name: "Fresh", data: { type: "plate" } }, { name: "No data" }]
    const skip = await app.call("/api/components/export-import", { method: "POST", json: { projectId, importMode: "skip", data: rows } })
    expect(skip.body.data).toMatchObject({ skipped: [id], created: [expect.any(String)], errors: [{ id: "unknown", error: "Missing required fields (name, data)" }] })
    expect((await app.call(`/api/components/${id}`)).body.name).toBe("Stored part")

    const update = await app.call("/api/components/export-import", { method: "POST", json: { projectId, importMode: "update", data: rows[0] } })
    expect(update.body.data.updated).toEqual([id])
    expect((await app.call(`/api/components/${id}`)).body).toMatchObject({ name: "Renamed", data: { type: "plate" } })

    const bad = await app.call("/api/components/export-import", { method: "POST", json: { projectId, importMode: "merge", data: rows[0] } })
    expect(bad.body.data.errors[0].error).toBe("Unsupported import mode: merge")
  })
})
