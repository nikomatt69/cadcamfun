import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { Effect } from "effect"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseManifest } from "@cadcamfun/plugin-sdk"
import { makeHost, spawnBunWorker, type PluginHostEnv, type PluginStorageBackend } from "../src/plugins/host.ts"

/**
 * RM-11 (spec 27 §4.2): a plugin contributes AI tools. The host loads the plugin as its own module in a sandboxed Bun worker and
 * calls the function the manifest names, with only the capabilities that were granted. A real worker, a real plugin folder.
 */
setDefaultTimeout(60000)

const folder = mkdtempSync(join(tmpdir(), "cadcamfun-plugin-tools-"))
afterAll(() => rmSync(folder, { recursive: true, force: true }))

const PLUGIN = `
let activations = 0
activations++
export const aiTools = {
  boltCircle: async ({ n, radius }) => {
    const holes = Array.from({ length: n }, (_, i) => ({ x: +(radius * Math.cos((2 * Math.PI * i) / n)).toFixed(4), y: +(radius * Math.sin((2 * Math.PI * i) / n)).toFixed(4) }))
    return { ok: true, holes, activations }
  },
  refuses: () => ({ ok: false, error: "radius must be positive" }),
  boom: () => { throw new Error("tool exploded") },
  slow: () => new Promise(() => {}),
  leaks: () => ({ process: typeof process, fetch: typeof fetch, bun: typeof Bun, require: typeof require })
}
export default { name: "tools" }
`

const storage: PluginStorageBackend = { read: () => undefined, write: () => {}, remove: () => {}, list: () => [], drop: () => {} }
const env = (toolTimeoutMs?: number): PluginHostEnv => ({
  world: { drawing: { read: () => ({ entities: [] }), patch: () => 1 }, toolpath: { list: () => [], program: () => undefined } },
  storage, spawn: spawnBunWorker, timeoutMs: 10_000, ...(toolTimeoutMs !== undefined ? { toolTimeoutMs } : {})
})

const tool = (id: string, entry: string, kind: "read" | "write" = "read") => ({ id, description: `Test tool ${id}, called by the assistant.`, kind, entry, parameters: { type: "object", properties: { n: { type: "integer" }, radius: { type: "number" } } } })
const manifest = (id: string, capabilities: string[], aiTools: unknown[]) => Effect.runPromise(parseManifest(JSON.stringify({
  id, name: `Plugin ${id}`, version: "1.0.0", apiVersion: "1", entry: "index.js", capabilities, contributes: { aiTools }, dev: true
})))

beforeAll(() => { writeFileSync(join(folder, "index.js"), PLUGIN) })

const start = async (id: string, capabilities: string[], aiTools: unknown[], toolTimeoutMs?: number) => {
  const host = makeHost(env(toolTimeoutMs))
  const m = await manifest(id, capabilities, aiTools)
  await Effect.runPromise(host.install({ manifest: m, directory: folder }))
  await Effect.runPromise(host.enable(id))
  return host
}

describe("plugin AI tools in a real worker", () => {
  test("a granted plugin lists its tools and the worker runs the exported function with the assistant's arguments", async () => {
    const host = await start("com.example.tools", ["ai:tool"], [tool("bolt_circle", "boltCircle"), tool("refuses", "refuses")])
    try {
      const listed = host.aiTools()
      expect(listed.map((entry) => entry.id)).toEqual(["bolt_circle", "refuses"])
      expect(listed[0]).toMatchObject({ pluginId: "com.example.tools", pluginName: "Plugin com.example.tools", kind: "read", entry: "boltCircle" })
      const result = await Effect.runPromise(host.callTool("com.example.tools", "bolt_circle", { n: 4, radius: 10 })) as { ok: boolean; holes: Array<{ x: number; y: number }>; activations: number }
      expect(result.ok).toBe(true)
      expect(result.holes).toHaveLength(4)
      expect(result.holes[0]).toEqual({ x: 10, y: 0 })
      expect(result.holes[1]!.x).toBeCloseTo(0, 3)
      expect(result.holes[1]!.y).toBeCloseTo(10, 3)
      // The plugin's top-level code ran exactly once, however many calls there are.
      expect(result.activations).toBe(1)
      expect(((await Effect.runPromise(host.callTool("com.example.tools", "bolt_circle", { n: 1, radius: 1 }))) as { activations: number }).activations).toBe(1)
    } finally { await Effect.runPromise(host.dispose) }
  })

  test("a tool that answers { ok: false, error } returns it as a result, and a tool that throws is a failure of the call", async () => {
    const host = await start("com.example.errors", ["ai:tool"], [tool("refuses", "refuses"), tool("boom", "boom")])
    try {
      expect(await Effect.runPromise(host.callTool("com.example.errors", "refuses", {}))).toEqual({ ok: false, error: "radius must be positive" })
      const thrown = await Effect.runPromise(Effect.flip(host.callTool("com.example.errors", "boom", {})))
      expect(JSON.stringify(thrown)).toContain("tool exploded")
      // The plugin is still running after a tool threw.
      expect(await Effect.runPromise(host.callTool("com.example.errors", "refuses", {}))).toMatchObject({ ok: false })
    } finally { await Effect.runPromise(host.dispose) }
  })

  test("without the ai:tool grant the tools are not listed and not callable, even though the manifest declares them", async () => {
    const host = await start("com.example.ungranted", ["storage"], [tool("bolt_circle", "boltCircle")])
    try {
      expect(host.aiTools()).toEqual([])
      const failure = await Effect.runPromise(Effect.flip(host.callTool("com.example.ungranted", "bolt_circle", { n: 2, radius: 1 })))
      expect(JSON.stringify(failure)).toContain("contributes no AI tool")
    } finally { await Effect.runPromise(host.dispose) }
  })

  test("a tool the manifest does not declare, or an export that does not exist, is refused", async () => {
    const host = await start("com.example.names", ["ai:tool"], [tool("ghost", "doesNotExist")])
    try {
      expect(JSON.stringify(await Effect.runPromise(Effect.flip(host.callTool("com.example.names", "other", {}))))).toContain("contributes no AI tool")
      expect(JSON.stringify(await Effect.runPromise(Effect.flip(host.callTool("com.example.names", "ghost", {}))))).toContain("exports no aiTools.doesNotExist")
      expect(JSON.stringify(await Effect.runPromise(Effect.flip(host.callTool("nobody", "ghost", {}))))).toContain("not installed")
    } finally { await Effect.runPromise(host.dispose) }
  })

  test("what the worker takes away from a tool: no process, no fetch (and, honestly, not Bun or require: it is not an OS sandbox)", async () => {
    const host = await start("com.example.sandbox", ["ai:tool"], [tool("leaks", "leaks")])
    try {
      const seen = await Effect.runPromise(host.callTool("com.example.sandbox", "leaks", {})) as Record<string, string>
      expect(seen["process"]).toBe("undefined")
      expect(seen["fetch"]).toBe("undefined")
      // Bun's globals are non-configurable in a worker and `require` is the module's own, so they stay reachable: a plugin's code is
      // trusted as far as the user who switched it on (spec 27 §4.2, `services/ai-plugins.ts`). If a later hardening closes these,
      // this assertion is the one to flip, deliberately.
      expect(seen["bun"]).toBe("object")
      expect(seen["require"]).toBe("function")
    } finally { await Effect.runPromise(host.dispose) }
  })

  test("a tool that never answers is stopped at its deadline, and the plugin is marked faulted like any unresponsive one", async () => {
    const host = await start("com.example.slow", ["ai:tool"], [tool("slow", "slow")], 600)
    try {
      const failure = await Effect.runPromise(Effect.flip(host.callTool("com.example.slow", "slow", {})))
      expect(JSON.stringify(failure)).toContain("600")
      expect(host.aiTools()).toEqual([])
    } finally { await Effect.runPromise(host.dispose) }
  })
})
