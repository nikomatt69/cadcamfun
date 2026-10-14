import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { makeApp } from "./helpers.ts"

/** RM-11: the catalogue's HTTP face, as a standalone nikcli with `@nikoemme_/cadcamfun-nikcli-plugin` uses it. No model, no embedded host. */
let app: Awaited<ReturnType<typeof makeApp>>
let projectId: string
beforeAll(async () => {
  app = await makeApp()
  projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Bridge" } })).body.id
})
afterAll(async () => { await app.dispose() })

const invoke = (tool: string, input: Record<string, unknown>, project: string | undefined = projectId) =>
  app.call("/api/ai/actions/invoke", { method: "POST", json: { projectId: project, tool, input } })

describe("GET /api/ai/actions", () => {
  test("lists the catalogue's tools with their actions and JSON Schemas, without delegation", async () => {
    const response = await app.call("/api/ai/actions")
    expect(response.status).toBe(200)
    const tools = response.body.tools as Array<{ id: string; kind: string; description: string; actions: Array<{ name: string; kind: string }>; parameters: Record<string, unknown> }>
    const ids = tools.map((tool) => tool.id)
    for (const id of ["cad", "cad_edit", "cam", "cam_edit", "library", "memory", "research", "vcs", "vcs_edit"]) expect(ids).toContain(id)
    expect(ids).not.toContain("agent")
    expect(tools.find((tool) => tool.id === "cad_edit")!.actions.map((action) => action.name)).toEqual(expect.arrayContaining(["add", "modify", "delete"]))
    expect(tools.find((tool) => tool.id === "cad_edit")!.actions.find((action) => action.name === "delete")!.kind).toBe("destructive")
    for (const tool of tools) expect(JSON.stringify(tool.parameters)).toContain("action")
  })

  test("needs the launch token like every other route", async () => {
    expect((await app.call("/api/ai/actions", { auth: false })).status).toBe(401)
    expect((await app.call("/api/ai/actions/invoke", { method: "POST", auth: false, json: { projectId, tool: "cad", input: { action: "describe" } } })).status).toBe(401)
  })
})

describe("POST /api/ai/actions/invoke", () => {
  test("a write lands in the stored drawing and a read sees it, exactly as through the in-app agent", async () => {
    const added = await invoke("cad_edit", { action: "add", elements: [{ type: "cube", width: 30, height: 20, depth: 5, name: "Plate" }] })
    expect(added.status).toBe(200)
    expect(added.body).toMatchObject({ tool: "cad_edit", action: "add", result: { ok: true } })
    const id = added.body.result.ids[0] as string
    const described = await invoke("cad", { action: "describe" })
    expect(JSON.stringify(described.body.result)).toContain(id)
    const drawings = await app.call(`/api/projects/${projectId}/drawings`)
    expect(JSON.stringify(drawings.body)).toContain(id)
  })

  test("a domain refusal is a result the client reads, not an HTTP failure", async () => {
    const refused = await invoke("cad_edit", { action: "add", elements: [{ type: "cube", width: -5, height: 20, depth: 5 }] })
    expect(refused.status).toBe(200)
    expect(refused.body.result.ok).toBe(false)
  })

  test("destructive actions, delegation, unknown tools and malformed calls are refused before anything runs", async () => {
    const drawingsBefore = JSON.stringify((await app.call(`/api/projects/${projectId}/drawings`)).body)
    const destructive = await invoke("cad_edit", { action: "delete", ids: ["any"], confirm: true })
    expect(destructive.status).toBe(400)
    expect(JSON.stringify(destructive.body)).toContain("person's approval")
    const delegated = await invoke("agent", { action: "start", description: "x", prompt: "y", agent: "researcher" })
    expect(delegated.status).toBe(400)
    expect(JSON.stringify(delegated.body)).toContain("inside the application")
    expect((await invoke("nope", { action: "x" })).status).toBe(400)
    expect((await invoke("cad", {})).status).toBe(400)
    expect(JSON.stringify((await app.call(`/api/projects/${projectId}/drawings`)).body)).toBe(drawingsBefore)
  })

  test("a project the account cannot see, or none at all, is refused", async () => {
    expect((await invoke("cad", { action: "describe" }, "no-such-project")).status).toBe(400)
    expect((await invoke("cad", { action: "describe" }, "")).status).toBe(400)
    expect((await invoke("cad", { action: "describe" }, "default")).status).toBe(400)
  })
})
