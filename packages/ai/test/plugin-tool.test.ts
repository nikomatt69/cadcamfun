import { describe, expect, test } from "bun:test"
import { buildHostConfig } from "../src/nikcli/config.ts"
import { PRIMARIES, PRIMARY_IDS } from "../src/nikcli/primaries.ts"
import { HostToolRegistry } from "../src/nikcli/tool-registry.ts"
import { definePluginTool, MAX_PLUGIN_SCHEMA_CHARS, pluginParameters, pluginToolId, type PluginToolListing } from "../src/tools/plugin-tool.ts"
import { buildTools, TOOL_IDS } from "../src/tools/registry.ts"
import type { ToolHandlersShape } from "../src/tools/handlers.ts"

const listing = (overrides: Partial<PluginToolListing> = {}): PluginToolListing => ({
  pluginId: "com.example.Gear-Tools", pluginName: "Gear Tools", id: "bolt_circle", kind: "read",
  description: "Lay out N holes on a bolt circle and return their centres in millimetres.",
  parameters: { type: "object", properties: { n: { type: "integer", minimum: 1, maximum: 64 }, radius: { type: "number", exclusiveMinimum: 0 } }, required: ["n", "radius"] },
  ...overrides
})
const stub = {} as ToolHandlersShape
const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }

describe("a plugin's tool as a host tool", () => {
  test("the id is plugin_<plugin>_<tool>, a valid host id, unique per plugin", () => {
    expect(pluginToolId("com.example.Gear-Tools", "bolt_circle")).toBe("plugin_com_example_gear_tools_bolt_circle")
    expect(pluginToolId("a".repeat(200), "x")).toMatch(/^plugin_a+_x$/)
    expect(pluginToolId("a".repeat(200), "x").length).toBeLessThanOrEqual(80)
    for (const id of [pluginToolId("com.example.Gear-Tools", "bolt_circle"), pluginToolId("x", "y"), pluginToolId("a".repeat(200), "a_long_tool_name")]) expect(id).toMatch(/^[a-z][a-z0-9_]{0,79}$/)
    expect(pluginToolId("com.a", "t")).not.toBe(pluginToolId("com.b", "t"))
  })

  test("the plugin's JSON Schema becomes the schema the host validates the call against", () => {
    const parameters = pluginParameters(listing().parameters)
    expect(parameters.safeParse({ n: 4, radius: 10 }).success).toBe(true)
    expect(parameters.safeParse({ n: 0, radius: 10 }).success).toBe(false)
    expect(parameters.safeParse({ n: 4 }).success).toBe(false)
    expect(parameters.safeParse({ n: 4, radius: -1 }).success).toBe(false)
  })

  test("a schema zod cannot represent, a non-object schema and an oversized one degrade to any object (the plugin validates)", () => {
    for (const bad of [{ type: "string" }, { type: "object", properties: { x: { $ref: "#/nowhere" } } }, { type: "object", description: "x".repeat(MAX_PLUGIN_SCHEMA_CHARS) }, {}]) {
      const schema = pluginParameters(bad as never)
      expect(schema.safeParse({ anything: 1 }).success).toBe(true)
      expect(schema.safeParse("text").success).toBe(false)
    }
  })

  test("it registers through buildTools' extension hook, validates before the plugin runs, and carries the plugin's name", async () => {
    const calls: unknown[] = []
    const extension = definePluginTool(listing(), async (args) => { calls.push(args); return { ok: true, holes: 4 } })
    const specs = buildTools(stub, "p", [extension])
    const spec = specs.find((candidate) => candidate.id === extension.id)!
    expect(specs.length).toBe(TOOL_IDS.length + 1)
    expect(spec.description).toContain("[Plugin: Gear Tools]")
    expect(JSON.parse(await spec.execute({ n: 4, radius: 10 }, ctx))).toEqual({ ok: true, holes: 4 })
    expect(calls).toEqual([{ n: 4, radius: 10 }])
    const refused = JSON.parse(await spec.execute({ n: 0, radius: 10 }, ctx))
    expect(refused.ok).toBe(false)
    expect(calls).toHaveLength(1)
  })

  test("a plugin cannot take a built-in tool's id, and two tools of one plugin do not collide", () => {
    expect(() => buildTools(stub, "p", [definePluginTool(listing(), async () => ({})), definePluginTool(listing(), async () => ({}))])).toThrow("Duplicate tool id")
    const a = definePluginTool(listing({ id: "one" }), async () => ({}))
    const b = definePluginTool(listing({ id: "two" }), async () => ({}))
    expect(buildTools(stub, "p", [a, b]).length).toBe(TOOL_IDS.length + 2)
  })
})

describe("who asks before a plugin tool runs", () => {
  const read = definePluginTool(listing({ id: "read_it" }), async () => ({}))
  const write = definePluginTool(listing({ id: "change_it", kind: "write" }), async () => ({}))

  test("a write tool is flagged for approval and says so to the model; a read tool is not", () => {
    expect(read.approval).toBeUndefined()
    expect(write.approval).toBe(true)
    expect(write.description).toContain("the person is asked")
    const registry = new HostToolRegistry(() => buildTools(stub, "p", [read, write]))
    expect(registry.approvalIds("p")).toEqual([write.id])
  })

  test("the host config asks for the write tool in every permission mode and allows the read tool", () => {
    const registry = new HostToolRegistry(() => buildTools(stub, "p", [read, write]))
    const config = buildHostConfig({ providers: [], toolIds: registry.ids("p"), askToolIds: registry.approvalIds("p"), systemPrompt: "x" }) as { agent: Record<string, { permission: Record<string, string> }> }
    for (const name of ["cadcam", "cadcam-ask", "cadcam-auto", "cadcam-cad", "cadcam-cam", "cadcam-cad-auto", "cadcam-cam-ask"]) {
      expect(config.agent[name]!.permission[write.id], name).toBe("ask")
      expect(config.agent[name]!.permission[read.id], name).toMatch(/^(allow|ask)$/)
    }
    expect(config.agent["cadcam"]!.permission[read.id]).toBe("allow")
    // A subagent's allow-list names catalogue tools only: a plugin's tool never reaches one. The primaries (general, cad, cam) hold it.
    const primaries: ReadonlyArray<string> = PRIMARY_IDS.map((id) => PRIMARIES[id].host)
    for (const name of Object.keys(config.agent)) if (name.startsWith("cadcam-") && !name.endsWith("-ask") && !name.endsWith("-auto") && name !== "cadcam-memory" && !primaries.includes(name)) {
      expect(config.agent[name]!.permission?.[write.id], name).toBeUndefined()
      expect(config.agent[name]!.permission?.[read.id], name).toBeUndefined()
    }
  })

  test("the AI policy takes a plugin's tool away like any other (tool.use)", () => {
    const registry = new HostToolRegistry(() => buildTools(stub, "p", [read]))
    const config = buildHostConfig({ providers: [], toolIds: registry.ids("p"), systemPrompt: "x", policies: [{ effect: "deny", action: "tool.use", resource: "plugin_*" }] }) as { agent: Record<string, { permission: Record<string, string> }> }
    expect(config.agent["cadcam"]!.permission[read.id]).toBeUndefined()
  })
})
