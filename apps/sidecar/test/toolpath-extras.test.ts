import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let projectId: string
let toolpathId: string
beforeAll(async () => {
  app = await makeApp()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Extras" } })).body.id
  toolpathId = (await app.call("/api/toolpaths", { method: "POST", json: { name: "Base", projectId, gcode: "G0 X0", data: { depth: 5 } } })).body.id
})
afterAll(async () => { await app.dispose() })

describe("/api/toolpaths/library", () => {
  test("requires projectId and filters the predefined catalogue", async () => {
    expect((await app.call("/api/toolpaths/library")).status).toBe(400)
    const all = await app.call(`/api/toolpaths/library?projectId=${projectId}`)
    expect(all.status).toBe(200)
    expect(all.body.length).toBeGreaterThan(0)
    expect(all.body[0]).toMatchObject({ projectId })
    const mills = await app.call(`/api/toolpaths/library?projectId=${projectId}&type=mill`)
    expect(mills.body.every((t: { type: string }) => t.type === "mill")).toBe(true)
    const search = await app.call(`/api/toolpaths/library?projectId=${projectId}&search=drill`)
    expect(search.body.length).toBeGreaterThan(0)
    expect(search.body.every((t: { name: string; description: string; tags: string[] }) =>
      [t.name, t.description, ...t.tags].some((s) => s.toLowerCase().includes("drill")))).toBe(true)
  })
})

describe("/api/toolpaths/:id/versions", () => {
  test("validation and access", async () => {
    expect((await app.call("/api/toolpaths/nope/versions")).status).toBe(404)
    const empty = await app.call(`/api/toolpaths/${toolpathId}/versions`, { method: "POST", json: {} })
    expect(empty.status).toBe(400)
    expect(empty.body.message).toBe("Either data or gcode must be provided")
  })

  test("create records a version; list is newest first with the author; restore snapshots and applies", async () => {
    const first = await app.call(`/api/toolpaths/${toolpathId}/versions`, { method: "POST", json: { gcode: "G1 X1", changeMessage: "first" } })
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ gcode: "G1 X1", changeMessage: "first", message: "Version created successfully" })

    const list = await app.call(`/api/toolpaths/${toolpathId}/versions`)
    expect(list.body[0].changeMessage).toBe("first")
    expect(list.body[0].user).toMatchObject({ name: expect.anything() })

    const restored = await app.call(`/api/toolpaths/${toolpathId}/versions/restore`, { method: "POST", json: { versionId: first.body.id } })
    expect(restored.status).toBe(200)
    expect(restored.body).toMatchObject({ gcode: "G1 X1", message: "Version restored successfully" })

    // The restore snapshots the state it replaced, so there is now a backup version too.
    const after = await app.call(`/api/toolpaths/${toolpathId}/versions`)
    expect(after.body.map((v: { changeMessage: string }) => v.changeMessage)).toContain("Auto-saved before version restore")
  })

  test("restore rejects an unknown version", async () => {
    const res = await app.call(`/api/toolpaths/${toolpathId}/versions/restore`, { method: "POST", json: { versionId: "nope" } })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Version not found")
  })
})

describe("/api/toolpaths/:id/comments", () => {
  let commentId: string

  test("create, list, edit and delete a comment", async () => {
    const empty = await app.call(`/api/toolpaths/${toolpathId}/comments`, { method: "POST", json: { content: "   " } })
    expect(empty.status).toBe(400)
    expect(empty.body.message).toBe("Comment content is required")

    const created = await app.call(`/api/toolpaths/${toolpathId}/comments`, { method: "POST", json: { content: "Looks good" } })
    expect(created.status).toBe(201)
    commentId = created.body.id
    expect(created.body).toMatchObject({ content: "Looks good", toolpathId })

    const list = await app.call(`/api/toolpaths/${toolpathId}/comments`)
    expect(list.body.map((c: { id: string }) => c.id)).toContain(commentId)

    const edited = await app.call(`/api/toolpaths/${toolpathId}/comments/${commentId}`, { method: "PUT", json: { content: "Looks better" } })
    expect(edited.status).toBe(200)
    expect(edited.body.content).toBe("Looks better")

    const removed = await app.call(`/api/toolpaths/${toolpathId}/comments/${commentId}`, { method: "DELETE" })
    expect(removed.status).toBe(200)
    expect(removed.body.message).toBe("Comment deleted successfully")
    expect((await app.call(`/api/toolpaths/${toolpathId}/comments/${commentId}`, { method: "DELETE" })).status).toBe(404)
  })
})

describe("/api/toolpaths/export-import", () => {
  // Its own toolpath: the version and comment tests above rewrite `exp`.
  let exp: string
  beforeAll(async () => {
    exp = (await app.call("/api/toolpaths", { method: "POST", json: { name: "Exported", projectId, gcode: "G0 X0", data: { depth: 5 } } })).body.id
  })

  test("export: json carries the G-code and the project name; the default is what the user created; zip has a folder per toolpath", async () => {
    const all = await app.call("/api/toolpaths/export-import")
    expect(all.status).toBe(200)
    expect(all.headers.get("content-disposition")).toContain("toolpaths-export-")
    expect(all.body.find((t: { id: string }) => t.id === exp)).toMatchObject({ id: exp, name: "Exported", type: "mill", operationType: "contour", gcode: "G0 X0", data: { depth: 5 }, metadata: { projectName: "Extras", version: "1.0" } })
    expect((await app.call(`/api/toolpaths/export-import?ids=${exp}`)).body).toHaveLength(1)
    expect((await app.call("/api/toolpaths/export-import?ids=nope")).body.message).toBe("No accessible toolpaths found")
    expect((await app.call(`/api/toolpaths/export-import?ids=${exp}&format=bucket`)).body.message).toBe("Unsupported export format")

    const zip = await app.call(`/api/toolpaths/export-import?ids=${exp}&format=zip`)
    expect(zip.headers.get("content-type")).toBe("application/zip")
    const JSZip = (await import("jszip")).default
    const entries = Object.keys((await JSZip.loadAsync(zip.bytes)).files).sort()
    expect(entries).toEqual(expect.arrayContaining(["Exported/Exported.gcode", "Exported/toolpath.json", "index.json"]))
  })

  test("export never reaches toolpaths of another user", async () => {
    const password = "test-password-long"
    await app.call("/api/auth/signup", { method: "POST", json: { email: "tp-stranger@example.com", name: "Stranger", password, confirmPassword: password } })
    const token = (await app.call("/api/auth/signin-direct", { method: "POST", json: { email: "tp-stranger@example.com", password } })).body.token
    const theirs = { "x-session-token": token }
    expect((await app.call("/api/toolpaths/export-import", { headers: theirs })).status).toBe(404)
    expect((await app.call(`/api/toolpaths/export-import?ids=${exp}`, { headers: theirs })).status).toBe(404)
    expect((await app.call("/api/toolpaths/export-import", { method: "POST", json: { projectId, gcode: "G0" }, headers: theirs })).status).toBe(404)
  })

  test("import: project required, G-code alone becomes one toolpath, create / update / skip follow the id inside the project", async () => {
    expect((await app.call("/api/toolpaths/export-import", { method: "POST", json: { data: [] } })).body.message).toBe("Project ID is required")
    expect((await app.call("/api/toolpaths/export-import", { method: "POST", json: { projectId: "nope", data: [] } })).status).toBe(404)
    expect((await app.call("/api/toolpaths/export-import", { method: "POST", json: { projectId } })).body.message).toBe("No import data or G-code provided")

    const bare = await app.call("/api/toolpaths/export-import", { method: "POST", json: { projectId, gcode: "G1 X5", name: "From NC", settings: { feed: 300 } } })
    expect(bare.body).toMatchObject({ success: true, message: "Toolpaths imported successfully", data: { errors: [] } })
    expect(bare.body.data.created).toHaveLength(1)
    const made = (await app.call(`/api/toolpaths/${bare.body.data.created[0]}`)).body
    expect(made).toMatchObject({ name: "From NC", gcode: "G1 X5", data: { feed: 300 }, type: "mill", operationType: "contour", isPublic: false })

    const rows = [{ id: exp, name: "Renamed", gcode: "G0 X9" }, { name: "Extra" }, { gcode: "no name" }]
    const skip = await app.call("/api/toolpaths/export-import", { method: "POST", json: { projectId, importMode: "skip", data: rows } })
    expect(skip.body.data).toMatchObject({ skipped: [exp], errors: [{ id: "unknown", error: "Missing required field: name" }] })
    expect(skip.body.data.created).toHaveLength(1)
    expect((await app.call(`/api/toolpaths/${exp}`)).body.name).toBe("Exported")

    const update = await app.call("/api/toolpaths/export-import", { method: "POST", json: { projectId, importMode: "update", data: rows[0] } })
    expect(update.body.data.updated).toEqual([exp])
    expect((await app.call(`/api/toolpaths/${exp}`)).body).toMatchObject({ name: "Renamed", gcode: "G0 X9", data: {} })
    expect((await app.call("/api/toolpaths/export-import", { method: "POST", json: { projectId, importMode: "merge", data: rows[0] } })).body.data.errors[0].error).toBe("Unsupported import mode: merge")
  })
})
