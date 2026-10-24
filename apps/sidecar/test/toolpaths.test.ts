import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
let projectId: string
let drawingId: string
beforeAll(async () => {
  app = await makeApp()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Fixture" } })).body.id
  drawingId = (await app.call(`/api/projects/${projectId}/drawings`, { method: "POST", json: { name: "Sketch" } })).body.id
})
afterAll(async () => { await app.dispose() })

describe("/api/toolpaths/post-check (spec 54 C1)", () => {
  const generic = {
    schemaVersion: 1, name: "Shop", base: "generic", canned: true, rigidTap: {}, arcModes: ["ijk", "radius"], dwell: "seconds", uppercaseComments: false, rotary: true, tcp: false,
    begin: [], setup: ["G90", "G17", "G94", "G49"], toolChange: ["T{tool} M6", "G43 H{tool}"], end: "M30", finish: []
  }
  const check = (definition: unknown, sample?: boolean) => app.call("/api/toolpaths/post-check", { method: "POST", json: { definition, ...(sample === undefined ? {} : { sample }) } })

  test("a valid definition writes the standard sample program with its own words", async () => {
    expect((await app.call("/api/toolpaths/post-check", { method: "POST", auth: false, json: { definition: generic } })).status).toBe(401)
    const ok = await check(generic)
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ valid: true, issues: [] })
    const lines = (ok.body.sample as string).split("\n")
    expect(lines).toContain("G43 H1")
    expect(lines).toContain("G43 H2")
    expect(lines.filter((l) => l.startsWith("G83"))).toHaveLength(1)
    expect(lines.at(-1) === "" ? lines.at(-2) : lines.at(-1)).toBe("M30")
    expect((await check(generic, false)).body).toEqual({ valid: true, issues: [] })
  })

  test("a mistake is answered with its place, not a failure", async () => {
    const bad = await check({ ...generic, toolChange: ["T{toool} M6"] })
    expect(bad.status).toBe(200)
    expect(bad.body.valid).toBe(false)
    expect(bad.body.sample).toBeUndefined()
    expect((bad.body.issues as Array<{ path: string }>).map((i) => i.path)).toEqual(["toolChange[0]"])
    const control = await check({ ...generic, end: "M30\u0007" })
    expect(control.body.valid).toBe(false)
    expect((control.body.issues as Array<{ path: string }>).map((i) => i.path)).toEqual(["end"])
    expect((await check("not a definition")).body.valid).toBe(false)
  })

  test("a definition without canned cycles writes the hole as plain moves", async () => {
    const flat = await check({ ...generic, canned: false, rotary: false })
    expect(flat.body.valid).toBe(true)
    expect(flat.body.sample as string).not.toContain("G83")
  })
})

describe("/api/toolpaths", () => {
  test("auth, validation, project access", async () => {
    expect((await app.call("/api/toolpaths", { auth: false })).status).toBe(401)
    const bad = await app.call("/api/toolpaths", { method: "POST", json: { name: "x" } })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toBe("Name and projectId are required")
    const nf = await app.call("/api/toolpaths", { method: "POST", json: { name: "x", projectId: "nope" } })
    expect(nf.status).toBe(404)
    expect(nf.body.message).toBe("Project not found or access denied")
  })

  test("POST applies legacy defaults; GET list filters and orders newest first", async () => {
    const a = await app.call("/api/toolpaths", { method: "POST", json: { name: "Contour A", projectId, data: { pts: [1] }, gcode: "G0 X0" } })
    expect(a.status).toBe(201)
    expect(a.body).toMatchObject({ type: "mill", operationType: "contour", isPublic: false, gcode: "G0 X0", projectId, drawingId: null })
    const b = await app.call("/api/toolpaths", { method: "POST", json: { name: "Pocket B", projectId, type: "lathe", operationType: "pocket" } })
    expect(b.body).toMatchObject({ gcode: "", data: {} })
    expect((await app.call("/api/toolpaths")).body).toHaveLength(2)
    expect((await app.call("/api/toolpaths?type=lathe")).body.map((t: { name: string }) => t.name)).toEqual(["Pocket B"])
    expect((await app.call("/api/toolpaths?operationType=contour")).body).toHaveLength(1)
    expect((await app.call("/api/toolpaths?search=pocket")).body).toHaveLength(1)
    expect((await app.call(`/api/toolpaths?projectId=${projectId}`)).body).toHaveLength(2)
    expect((await app.call("/api/toolpaths?projectId=other")).body).toHaveLength(0)
  })

  test("GET/PUT/DELETE by id", async () => {
    const missing = await app.call("/api/toolpaths/nope")
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Toolpath not found or access denied")
    const { body: t } = await app.call("/api/toolpaths", { method: "POST", json: { name: "T", projectId } })
    const got = await app.call(`/api/toolpaths/${t.id}`)
    expect(got.body.project).toMatchObject({ id: projectId, name: "Fixture" })

    expect((await app.call(`/api/toolpaths/${t.id}`, { method: "PUT", json: {} })).body.message).toBe("No fields provided for update")
    const upd = await app.call(`/api/toolpaths/${t.id}`, { method: "PUT", json: { gcode: "G1 X1", isPublic: true, description: null } })
    expect(upd.body).toMatchObject({ gcode: "G1 X1", isPublic: true, description: null, message: "Toolpath updated successfully" })
    expect((await app.call(`/api/toolpaths/${t.id}`, { method: "DELETE" })).body).toEqual({ message: "Toolpath deleted successfully" })
    expect((await app.call(`/api/toolpaths/${t.id}`)).status).toBe(404)
  })
})

describe("/api/drawings/:id/toolpaths", () => {
  test("validation, 201 without defaults, list embeds Material/MachineConfig/Tool", async () => {
    expect((await app.call("/api/drawings/nope/toolpaths")).body.message).toBe("Drawing not found or access denied")
    expect((await app.call(`/api/drawings/${drawingId}/toolpaths`, { method: "POST", json: {} })).body.message).toBe("Toolpath name is required")
    expect((await app.call(`/api/drawings/${drawingId}/toolpaths`, { method: "POST", json: { name: "n" } })).body.message).toBe("Toolpath data is required")

    const tool = (await app.call("/api/tools", { method: "POST", json: { name: "EM6", type: "endmill", diameter: 6, material: "Carbide" } })).body
    const created = await app.call(`/api/drawings/${drawingId}/toolpaths`, { method: "POST", json: { name: "Rough", data: { a: 1 }, toolId: tool.id } })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ drawingId, projectId, toolId: tool.id, gcode: null, type: null })

    const list = await app.call(`/api/drawings/${drawingId}/toolpaths`)
    expect(list.body[0].Tool).toEqual({ id: tool.id, name: "EM6", type: "endmill", diameter: 6 })
    expect(list.body[0].Material).toBeNull()
    expect(list.body[0].MachineConfig).toBeNull()
  })
})

describe("/api/projects/:id/toolpaths (query-string project id, envelope)", () => {
  test("without ?projectId the legacy handler answers 400", async () => {
    const r = await app.call(`/api/projects/${projectId}/toolpaths`)
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject({ success: false, message: "Project ID is required" })
  })
  test("with ?projectId: create + list in the envelope format", async () => {
    const bad = await app.call(`/api/projects/${projectId}/toolpaths?projectId=${projectId}`, { method: "POST", json: {} })
    expect(bad.body.message).toBe("Name is required")
    const created = await app.call(`/api/projects/${projectId}/toolpaths?projectId=${projectId}`, { method: "POST", json: { name: "Env", gcode: "G0" } })
    expect(created.body).toMatchObject({ success: true, message: "Toolpath created successfully" })
    expect(created.body.data).toMatchObject({ name: "Env", projectId })
    const list = await app.call(`/api/projects/${projectId}/toolpaths?projectId=${projectId}`)
    expect(list.body.success).toBe(true)
    expect(list.body.data.find((t: { name: string }) => t.name === "Env").project).toEqual({ name: "Fixture", organization: null })
    expect((await app.call(`/api/projects/x/toolpaths?projectId=nope`)).body.message).toBe("Project not found or access denied")
  })
})
