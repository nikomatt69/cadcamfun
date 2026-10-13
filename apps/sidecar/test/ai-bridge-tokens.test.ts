import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { z } from "zod"
import { createCadcamTools, type ToolFactory } from "@cadcamfun/nikcli-plugin"
import { makeApp } from "./helpers.ts"

/** RM-11 scoping: a bridge token is for one project, read-only or read-write, opens only the bridge routes, and can be revoked. */
let app: Awaited<ReturnType<typeof makeApp>>
let projectA: string
let projectB: string
beforeAll(async () => {
  app = await makeApp()
  projectA = (await app.call("/api/projects", { method: "POST", json: { name: "Alpha" } })).body.id
  projectB = (await app.call("/api/projects", { method: "POST", json: { name: "Beta" } })).body.id
})
afterAll(async () => { await app.dispose() })

const issue = async (projectId: string, mode: "read" | "write", name = "nikcli") => {
  const response = await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name, projectId, mode } })
  expect(response.status).toBe(200)
  return response.body as { info: { id: string; mode: string; projectId: string; expiresAt: string }; token: string }
}
const as = (token: string, path: string, init: RequestInit & { json?: unknown } = {}) => app.call(path, { ...init, auth: false, headers: { authorization: `Bearer ${token}` } })
const invoke = (token: string, projectId: string, tool: string, input: Record<string, unknown>) => as(token, "/api/ai/actions/invoke", { method: "POST", json: { projectId, tool, input } })

describe("issuing, listing and revoking", () => {
  test("a token is issued with the application's own token, shown once, and listed without its secret", async () => {
    const issued = await issue(projectA, "write", "my laptop")
    expect(issued.token.split(".")).toHaveLength(3)
    expect(issued.info).toMatchObject({ projectId: projectA, mode: "write", name: "my laptop" })
    expect(Date.parse(issued.info.expiresAt)).toBeGreaterThan(Date.now())
    const listed = await app.call("/api/ai/bridge/tokens")
    expect(listed.body.map((entry: { id: string }) => entry.id)).toContain(issued.info.id)
    expect(JSON.stringify(listed.body)).not.toContain(issued.token)
  })

  test("a project the account cannot see gets no token, and a bridge token cannot mint or list tokens", async () => {
    expect((await app.call("/api/ai/bridge/tokens", { method: "POST", json: { projectId: "no-such-project", mode: "write" } })).status).toBe(400)
    expect((await app.call("/api/ai/bridge/tokens", { method: "POST", json: { projectId: "default", mode: "write" } })).status).toBe(400)
    const { token } = await issue(projectA, "write")
    expect((await as(token, "/api/ai/bridge/tokens", { method: "POST", json: { projectId: projectA, mode: "write" } })).status).toBe(401)
    expect((await as(token, "/api/ai/bridge/tokens")).status).toBe(401)
  })

  test("revoking ends the token at once, and the list forgets it", async () => {
    const { token, info } = await issue(projectA, "write")
    expect((await as(token, "/api/ai/actions")).status).toBe(200)
    expect((await app.call(`/api/ai/bridge/tokens/${info.id}`, { method: "DELETE" })).status).toBe(200)
    expect((await as(token, "/api/ai/actions")).status).toBe(401)
    expect((await app.call("/api/ai/bridge/tokens")).body.map((entry: { id: string }) => entry.id)).not.toContain(info.id)
    expect((await app.call(`/api/ai/bridge/tokens/${info.id}`, { method: "DELETE" })).status).toBe(400)
  })
})

describe("what a token opens", () => {
  test("only the two bridge routes: every other route answers 401, as does a forged or foreign token", async () => {
    const { token } = await issue(projectA, "write")
    for (const path of ["/api/projects", "/api/ai/status", `/api/projects/${projectA}/drawings`, "/api/ai/providers"]) expect((await as(token, path)).status, path).toBe(401)
    expect((await as(`${token.slice(0, -3)}abc`, "/api/ai/actions")).status).toBe(401)
    expect((await as("not-a-token", "/api/ai/actions")).status).toBe(401)
    // The application's own session token (another kind of signed token) is not a bridge token.
    expect((await as("a.b.c", "/api/ai/actions")).status).toBe(401)
  })

  test("one project: the token's own works, another is refused before anything runs", async () => {
    const { token } = await issue(projectA, "write")
    const added = await invoke(token, projectA, "cad_edit", { action: "add", elements: [{ type: "cube", width: 5, height: 5, depth: 5, name: "InAlpha" }] })
    expect(added.status).toBe(200)
    expect(added.body.result.ok).toBe(true)
    const other = await invoke(token, projectB, "cad_edit", { action: "add", elements: [{ type: "cube", width: 5, height: 5, depth: 5, name: "InBeta" }] })
    expect(other.status).toBe(400)
    expect(JSON.stringify(other.body)).toContain("another project")
    expect(JSON.stringify((await app.call(`/api/projects/${projectB}/drawings`)).body)).not.toContain("InBeta")
  })

  test("read-only: the listing holds only read actions and a change is refused with what to do", async () => {
    const { token } = await issue(projectA, "read")
    const tools = (await as(token, "/api/ai/actions")).body.tools as Array<{ id: string; actions: Array<{ kind: string }> }>
    expect(tools.map((tool) => tool.id)).toContain("cad")
    expect(tools.map((tool) => tool.id)).not.toContain("cad_edit")
    for (const tool of tools) for (const action of tool.actions) expect(action.kind).toBe("read")
    expect((await invoke(token, projectA, "cad", { action: "describe" })).status).toBe(200)
    const change = await invoke(token, projectA, "cad_edit", { action: "add", elements: [{ type: "cube", width: 1, height: 1, depth: 1 }] })
    expect(change.status).toBe(400)
    expect(JSON.stringify(change.body)).toContain("read-only")
  })

  test("a write token still never reaches a destructive action", async () => {
    const { token } = await issue(projectA, "write")
    const refused = await invoke(token, projectA, "cad_edit", { action: "delete", ids: ["x"], confirm: true })
    expect(refused.status).toBe(400)
    expect(JSON.stringify(refused.body)).toContain("person's approval")
  })
})

describe("the standalone plugin with a scoped token", () => {
  test("a read token gives nikcli only the read tools, and a call outside the scope comes back as a result", async () => {
    const { token } = await issue(projectA, "read")
    const tool = Object.assign((input: unknown) => input, { schema: z }) as unknown as ToolFactory
    const tools = await createCadcamTools({ url: "http://sidecar.test", token, projectId: projectA, tool, fetch: (input, init) => app.transport(input, init) }) as Record<string, { execute: (args: Record<string, unknown>, context: object) => Promise<string> }>
    expect(Object.keys(tools)).toContain("cad")
    expect(Object.keys(tools)).not.toContain("cad_edit")
    expect(JSON.parse(await tools["cad"]!.execute({ action: "describe" }, {}))).toBeDefined()
    expect(JSON.parse(await tools["cad"]!.execute({ action: "describe", projectId: projectB }, {}))["error"]).toContain("another project")
  })
})
