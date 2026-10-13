import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect, Layer, Scope } from "effect"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildTools, pluginToolId, type ToolHandlersShape } from "@cadcamfun/ai"
import { AppConfigService } from "../src/config.ts"
import { AiPlugins, AiPluginsLive, readEnabledPlugins } from "../src/services/ai-plugins.ts"
import { makeApp } from "./helpers.ts"

/** RM-11 §4.2 in the running application: the plugins the operator switched on offer tools to the assistant and, read-only, to the bridge. */
setDefaultTimeout(90000)

const dataDir = mkdtempSync(join(tmpdir(), "cadcamfun-ai-plugins-"))
const root = join(dataDir, "plugins")

const CODE = `
export const aiTools = {
  boltCircle: async ({ n, radius }) => ({ ok: true, holes: Array.from({ length: n }, (_, i) => ({ x: +(radius * Math.cos((2 * Math.PI * i) / n)).toFixed(3), y: +(radius * Math.sin((2 * Math.PI * i) / n)).toFixed(3) })) }),
  rename: async ({ name }) => ({ ok: true, renamed: name }),
  fails: async () => { throw new Error("the plugin broke") }
}
`
const plugin = (id: string, capabilities: string[], aiTools: unknown[], overrides: Record<string, unknown> = {}) => {
  const directory = join(root, id)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, "index.js"), CODE)
  writeFileSync(join(directory, "plugin.json"), JSON.stringify({ id, name: `Plugin ${id}`, version: "1.0.0", apiVersion: "1", entry: "index.js", capabilities, contributes: { aiTools }, dev: true, ...overrides }))
}
const tool = (id: string, entry: string, kind: "read" | "write", parameters: Record<string, unknown>) => ({ id, entry, kind, description: `Plugin tool ${id}, offered to the assistant.`, parameters })
const boltParameters = { type: "object", properties: { n: { type: "integer", minimum: 1, maximum: 64 }, radius: { type: "number", exclusiveMinimum: 0 } }, required: ["n", "radius"] }

beforeAll(() => {
  mkdirSync(root, { recursive: true })
  plugin("com.example.gear", ["ai:tool"], [
    tool("bolt_circle", "boltCircle", "read", boltParameters),
    tool("rename", "rename", "write", { type: "object", properties: { name: { type: "string" } }, required: ["name"] }),
    tool("fails", "fails", "read", { type: "object", properties: {} })
  ])
  // Listed but asks for surfaces this host does not wire; listed but its folder is wrong; not listed at all.
  plugin("com.example.greedy", ["ai:tool", "drawing:write"], [tool("x_tool", "boltCircle", "read", boltParameters)])
  plugin("com.example.mismatch", ["ai:tool"], [tool("y_tool", "boltCircle", "read", boltParameters)], { id: "com.example.other" })
  plugin("com.example.unlisted", ["ai:tool"], [tool("z_tool", "boltCircle", "read", boltParameters)])
  writeFileSync(join(root, "enabled.json"), JSON.stringify(["com.example.gear", "com.example.greedy", "com.example.mismatch", "com.example.missing", 42, "../escape"]))
})
afterAll(() => rmSync(dataDir, { recursive: true, force: true }))

describe("what the operator switched on", () => {
  test("enabled.json is a list of safe plugin ids; anything else is ignored", () => {
    expect(readEnabledPlugins(join(root, "enabled.json"))).toEqual(["com.example.gear", "com.example.greedy", "com.example.mismatch", "com.example.missing"])
    expect(readEnabledPlugins(join(root, "nope.json"))).toEqual([])
    writeFileSync(join(root, "bad.json"), "{ not json")
    expect(readEnabledPlugins(join(root, "bad.json"))).toEqual([])
    writeFileSync(join(root, "object.json"), JSON.stringify({ a: 1 }))
    expect(readEnabledPlugins(join(root, "object.json"))).toEqual([])
  })
})

describe("AiPlugins as the assistant's host tools", () => {
  test("only a listed, well-formed plugin that asks for ai:tool alone is loaded, and its tools run in the worker", async () => {
    const scope = Effect.runSync(Scope.make())
    try {
      const config = Layer.succeed(AppConfigService, AppConfigService.of({ dataDir } as never))
      const context = await Effect.runPromise(Layer.buildWithMemoMap(AiPluginsLive.pipe(Layer.provide(config)), Layer.makeMemoMapUnsafe(), scope))
      const plugins = await Effect.runPromise(Effect.service(AiPlugins).pipe(Effect.provide(context)))
      expect(plugins.listing().map((entry) => `${entry.pluginId}:${entry.id}`)).toEqual(["com.example.gear:bolt_circle", "com.example.gear:rename", "com.example.gear:fails"])

      const ids = plugins.tools().map((definition) => definition.id)
      expect(ids).toContain(pluginToolId("com.example.gear", "bolt_circle"))
      expect(ids.some((id) => id.includes("greedy") || id.includes("mismatch") || id.includes("unlisted"))).toBe(false)

      const specs = buildTools({} as ToolHandlersShape, "p", plugins.tools())
      const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
      const bolt = specs.find((spec) => spec.id === pluginToolId("com.example.gear", "bolt_circle"))!
      expect(JSON.parse(await bolt.execute({ n: 4, radius: 10 }, ctx)).holes).toHaveLength(4)
      // Validated against the plugin's own schema before the worker is called.
      expect(JSON.parse(await bolt.execute({ n: 0, radius: 10 }, ctx)).ok).toBe(false)
      // A write tool is flagged for the host to ask about; the read tool is not.
      const write = specs.find((spec) => spec.id === pluginToolId("com.example.gear", "rename"))!
      expect(write.approval).toBe(true)
      expect(bolt.approval).toBeUndefined()
      // A tool that throws is a result the assistant can read, and the plugin keeps working.
      const failed = JSON.parse(await specs.find((spec) => spec.id === pluginToolId("com.example.gear", "fails"))!.execute({}, ctx))
      expect(failed).toMatchObject({ ok: false })
      expect(failed.error).toContain("the plugin broke")
      expect(JSON.parse(await bolt.execute({ n: 2, radius: 1 }, ctx)).holes).toHaveLength(2)
    } finally { await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)) }
  })
})

describe("the bridge with plugin tools", () => {
  let app: Awaited<ReturnType<typeof makeApp>>
  let projectId: string
  beforeAll(async () => {
    app = await makeApp({ dataDir })
    projectId = (await app.call("/api/projects", { method: "POST", json: { name: "Plugins" } })).body.id
  })
  afterAll(async () => { await app.dispose() })
  const invoke = (tool: string, input: Record<string, unknown>) => app.call("/api/ai/actions/invoke", { method: "POST", json: { projectId, tool, input } })
  const bolt = pluginToolId("com.example.gear", "bolt_circle")

  test("a read plugin tool is listed with its schema, a write one is not, and nothing the operator did not switch on appears", async () => {
    const tools = (await app.call("/api/ai/actions")).body.tools as Array<{ id: string; description: string; kind: string; parameters: Record<string, unknown> }>
    const listed = tools.find((entry) => entry.id === bolt)!
    expect(listed.kind).toBe("read")
    expect(listed.description).toContain("[Plugin: Plugin com.example.gear]")
    expect(JSON.stringify(listed.parameters)).toContain("radius")
    expect(tools.some((entry) => entry.id === pluginToolId("com.example.gear", "rename"))).toBe(false)
    expect(tools.some((entry) => /greedy|mismatch|unlisted/.test(entry.id))).toBe(false)
  })

  test("a call runs in the plugin's worker; bad arguments, a write tool and an unknown plugin tool are refused", async () => {
    const ok = await invoke(bolt, { n: 3, radius: 5 })
    expect(ok.status).toBe(200)
    expect(ok.body.result.holes).toHaveLength(3)
    expect((await invoke(bolt, { n: 0, radius: 5 })).body.result.ok).toBe(false)
    const write = await invoke(pluginToolId("com.example.gear", "rename"), { name: "x" })
    expect(write.status).toBe(400)
    expect(JSON.stringify(write.body)).toContain("person's approval")
    expect((await invoke("plugin_com_example_gear_nope", {})).status).toBe(400)
  })

  test("a read-only bridge token reaches a read plugin tool", async () => {
    const issued = await app.call("/api/ai/bridge/tokens", { method: "POST", json: { name: "ro", projectId, mode: "read" } })
    const response = await app.call("/api/ai/actions/invoke", { method: "POST", auth: false, headers: { authorization: `Bearer ${issued.body.token}` }, json: { projectId, tool: bolt, input: { n: 2, radius: 3 } } })
    expect(response.status).toBe(200)
    expect(response.body.result.holes).toHaveLength(2)
  })
})
