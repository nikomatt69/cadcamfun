import { afterAll, beforeAll, expect, test } from "bun:test"
import { Context, Effect, Option } from "effect"
import { isolatedPaths, saveMod, ToolRegistry } from "@cadcamfun/ai"
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

test("a plugin ships a mod and a mode: the upload carries its module, enabling declares both, disabling withdraws both", async () => {
  const uuid = crypto.randomUUID().slice(0, 8)
  const id = `com.example.extras-${uuid}`
  const extras = JSON.stringify({
    id, name: "Extras", version: "1.0.0", apiVersion: "1", entry: "index.js",
    capabilities: ["ai:mod", "ai:mode"],
    contributes: {
      mods: [{ id: "audit", title: "Audit log", description: "Notes every tool call the assistant makes.", entry: "mod.js" }],
      modes: [{ id: "feeds", title: "Feeds and speeds", description: "Cutting parameters, reasoned.", instructions: "You are focused on feeds and speeds. Quote the material and tool data behind every number, in metric." }]
    }
  })
  const source = "export const aiTools = {}"
  const modSource = "export const register = () => {}"
  // The bundle must carry exactly the declared mod modules: nothing declared, nothing extra.
  expect((await app.call("/api/ai/extensions/plugins", { method: "POST", json: { manifest: extras, source } })).status).toBe(400)
  expect((await app.call("/api/ai/extensions/plugins", { method: "POST", json: { manifest: extras, source, files: { "mod.js": modSource, "other.js": modSource } } })).status).toBe(400)
  const install = await app.call("/api/ai/extensions/plugins", { method: "POST", json: { manifest: extras, source, files: { "mod.js": modSource } } })
  expect(install.status).toBe(200)
  expect(install.body.plugins.find((plugin: { id: string }) => plugin.id === id)).toMatchObject({ enabled: false, mods: 1, modes: 1 })
  // A plugin that is installed but not enabled contributes neither mods nor modes.
  expect((await app.call("/api/ai/extensions/mods")).body.mods.filter((mod: { pluginId?: string }) => mod.pluginId === id)).toEqual([])
  expect((await app.call("/api/ai/modes")).body.modes.filter((mode: { pluginId: string }) => mode.pluginId === id)).toEqual([])

  const enabled = await app.call(`/api/ai/extensions/plugins/${id}`, { method: "PUT", json: { enabled: true } })
  expect(enabled.status).toBe(200)
  expect(enabled.body.plugins.find((plugin: { id: string }) => plugin.id === id).enabled).toBe(true)
  // The mode is namespaced and carries its labels; the instructions stay server-side.
  expect((await app.call("/api/ai/modes")).body.modes).toContainEqual({ id: `${id}:feeds`, title: "Feeds and speeds", description: "Cutting parameters, reasoned.", pluginId: id, pluginName: "Extras" })
  // The mod is listed as host-managed, and its module really is inside the plugin folder the host loads from.
  expect((await app.call("/api/ai/extensions/mods")).body.mods).toContainEqual({ id: `${id}.audit`, name: "Audit log", description: "Notes every tool call the assistant makes.", enabled: true, origin: "plugin", pluginId: id })
  expect(await readFile(join(app.dataDir, "plugins", id, "mod.js"), "utf8")).toBe(modSource)

  await app.call(`/api/ai/extensions/plugins/${id}`, { method: "PUT", json: { enabled: false } })
  expect((await app.call("/api/ai/modes")).body.modes.filter((mode: { pluginId: string }) => mode.pluginId === id)).toEqual([])
  expect((await app.call("/api/ai/extensions/mods")).body.mods.filter((mod: { pluginId?: string }) => mod.pluginId === id)).toEqual([])
  expect((await app.call(`/api/ai/extensions/plugins/${id}`, { method: "DELETE" })).status).toBe(200)
})

test("a contribution without its capability is refused at install and at listing", async () => {
  const base = JSON.parse(manifest)
  const response = await app.call("/api/ai/extensions/plugins", { method: "POST", json: { manifest: JSON.stringify({ ...base, id: "com.example.incoherent", contributes: { mods: [{ id: "audit", title: "Audit log", description: "Notes every tool call.", entry: "mod.js" }] } }), source: "export const aiTools = {}" } })
  expect(response.status).toBe(400)
  expect(response.body.message).toContain("ai:mod")
})

test("the mods panel lists the app-owned store, toggles it and removes it; plugin mods stay host-managed", async () => {
  const paths = isolatedPaths(app.dataDir)
  saveMod(paths, { id: "run-notes", name: "Run notes", description: "Adds the day to every answer.", source: "export const register = () => {}", origin: "user" })
  expect((await app.call("/api/ai/extensions/mods")).body.mods).toContainEqual({ id: "run-notes", name: "Run notes", description: "Adds the day to every answer.", enabled: false, origin: "user" })
  const on = await app.call("/api/ai/extensions/mods/run-notes", { method: "PUT", json: { enabled: true } })
  expect(on.status).toBe(200)
  expect(on.body.mods.find((mod: { id: string }) => mod.id === "run-notes").enabled).toBe(true)
  // An unknown id is refused with the store's own words; a plugin mod is absent from the store, so it lands here too.
  expect((await app.call("/api/ai/extensions/mods/ghost", { method: "PUT", json: { enabled: false } })).status).toBe(400)
  const removed = await app.call("/api/ai/extensions/mods/run-notes", { method: "DELETE" })
  expect(removed.status).toBe(200)
  expect(removed.body.mods.some((mod: { id: string }) => mod.id === "run-notes")).toBe(false)
  expect((await app.call("/api/ai/extensions/mods/run-notes", { method: "DELETE" })).status).toBe(400)
})
