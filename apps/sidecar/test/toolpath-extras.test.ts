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
