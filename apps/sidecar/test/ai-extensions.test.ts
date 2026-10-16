import { afterAll, beforeAll, expect, test } from "bun:test"
import { Context, Effect, Option } from "effect"
import { ToolRegistry } from "@cadcamfun/ai"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { makeApp } from "./helpers.ts"

let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() }, 60000)
afterAll(async () => { await app.dispose() })
const manifest = JSON.stringify({ id: "com.example.area", name: "Circle area", version: "1.0.0", apiVersion: "1", entry: "index.js", capabilities: ["ai:tool"], contributes: { aiTools: [{ id: "area", description: "Compute circle area", kind: "write", entry: "area", parameters: { type: "object", properties: { radius: { type: "number" } }, required: ["radius"] } }] } })

test("extension management requires authentication and MCP refuses absent/inaccessible projects", async () => {
  expect((await app.call("/api/ai/extensions/plugins", { auth: false })).status).toBe(401)
  expect((await app.call("/api/ai/extensions/mcp?projectId=missing")).status).toBe(400)
  const project = await app.call("/api/projects", { method: "POST", json: { name: "MCP project" } })
  const out = await app.call(`/api/ai/extensions/mcp?projectId=${project.body.id}`)
  expect(out.status).toBe(400)
  expect(out.body.message).toContain("nikcli")
})

test("install is inert; explicit enable publishes tools live, and disable removes tools and persisted consent", async () => {
  const install = await app.call("/api/ai/extensions/plugins", { method: "POST", json: { manifest, source: "export const aiTools = { area: ({ radius }) => ({ area: Math.PI * radius * radius }) }" } })
  expect(install.status).toBe(200)
  expect(install.body.plugins).toMatchObject([{ id: "com.example.area", enabled: false, tools: 1 }])
  const registry = Context.get(await app.services(), ToolRegistry)
  expect(registry.snapshot("project").some((tool) => tool.id.startsWith("plugin_"))).toBe(false)
  const enabled = await app.call("/api/ai/extensions/plugins/com.example.area", { method: "PUT", json: { enabled: true } })
  expect(enabled.status).toBe(200)
  expect(enabled.body.plugins[0].enabled).toBe(true)
  const tool = registry.snapshot("project").find((tool) => tool.id.startsWith("plugin_"))
  expect(tool).toBeDefined()
  expect(tool?.approval).toBe(true)
  const selected = await Effect.runPromise(registry.tool("project", tool?.id ?? "missing"))
  expect(Option.isSome(selected)).toBe(true)
  if (Option.isSome(selected)) {
    const answer = await selected.value.execute({ radius: 2 }, { sessionId: "fixture", projectId: "project", signal: new AbortController().signal })
    expect(JSON.parse(answer).area).toBeCloseTo(Math.PI * 4)
  }
  expect(JSON.parse(await readFile(join(app.dataDir, "plugins/enabled.json"), "utf8"))).toEqual(["com.example.area"])
  const disabled = await app.call("/api/ai/extensions/plugins/com.example.area", { method: "PUT", json: { enabled: false } })
  expect(disabled.status).toBe(200)
  expect(disabled.body.plugins[0].enabled).toBe(false)
  expect(registry.snapshot("project").some((tool) => tool.id.startsWith("plugin_"))).toBe(false)
  expect(JSON.parse(await readFile(join(app.dataDir, "plugins/enabled.json"), "utf8"))).toEqual([])
  const duplicate = await app.call("/api/ai/extensions/plugins", { method: "POST", json: { manifest, source: "export const aiTools = {}" } })
  expect(duplicate.status).toBe(400)
  const removed = await app.call("/api/ai/extensions/plugins/com.example.area", { method: "DELETE" })
  expect(removed.status).toBe(200)
  expect(removed.body.plugins).toEqual([])
}, 60000)

test("plugin uploads reject unsupported capabilities, path escapes without publishing tools", async () => {
  const base = JSON.parse(manifest)
  for (const candidate of [{ ...base, id: "../../escape" }, { ...base, id: "com.example.bad", entry: "../escape.js" }, { ...base, id: "com.example.bad", capabilities: ["drawing:write"] }]) {
    const response = await app.call("/api/ai/extensions/plugins", { method: "POST", json: { manifest: JSON.stringify(candidate), source: "export const aiTools = {}" } })
    expect(response.status).toBe(400)
  }
})
