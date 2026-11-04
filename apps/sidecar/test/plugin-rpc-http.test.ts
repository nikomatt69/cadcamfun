import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { makeApp } from "./helpers.ts"

/** P1-11 (spec 72): the plugin host's tool RPC over HTTP. A real plugin folder, a real sandboxed worker, the same host the assistant uses. */
setDefaultTimeout(60_000)
let app: Awaited<ReturnType<typeof makeApp>>
beforeAll(async () => { app = await makeApp() })
afterAll(async () => { await app.dispose() })

const id = "com.example.rpc"
const manifest = JSON.stringify({
  id, name: "RPC test", version: "1.0.0", apiVersion: "1", entry: "index.js", capabilities: ["ai:tool"],
  contributes: {
    aiTools: [
      { id: "area", description: "Area of a circle", kind: "read", entry: "area", parameters: { type: "object", properties: { radius: { type: "number" } }, required: ["radius"] } },
      { id: "stamp", description: "Changes something", kind: "write", entry: "stamp", parameters: { type: "object", properties: {} } },
      { id: "refuses", description: "Answers with an error value", kind: "read", entry: "refuses", parameters: { type: "object", properties: {} } },
      { id: "boom", description: "Throws an error when run", kind: "read", entry: "boom", parameters: { type: "object", properties: {} } }
    ]
  }
})
const source = `export const aiTools = {
  area: ({ radius }) => ({ ok: true, area: Math.PI * radius * radius }),
  stamp: () => ({ ok: true, stamped: true }),
  refuses: () => ({ ok: false, error: "no" }),
  boom: () => { throw new Error("tool exploded") }
}`
const invoke = (toolId: string, json: unknown, plugin = id) => app.call(`/api/ai/extensions/plugins/${plugin}/tools/${toolId}`, { method: "POST", json })

test("the tool RPC is authenticated, refuses unknown and not-running tools, and lists nothing before a plugin is enabled", async () => {
  expect((await app.call("/api/ai/extensions/plugins/tools", { auth: false })).status).toBe(401)
  expect((await app.call(`/api/ai/extensions/plugins/${id}/tools/area`, { method: "POST", json: { args: { radius: 1 } }, auth: false })).status).toBe(401)
  expect((await app.call("/api/ai/extensions/plugins/tools")).body.tools).toEqual([])
  expect((await invoke("area", { args: { radius: 1 } })).status).toBe(404)
})

test("an enabled plugin's tools are listed and run over HTTP with validated arguments", async () => {
  const installed = await app.call("/api/ai/extensions/plugins", { method: "POST", json: { manifest, source } })
  expect(installed.body).toMatchObject({ plugins: expect.anything() })
  // Installed but not enabled: still not callable.
  expect((await invoke("area", { args: { radius: 1 } })).status).toBe(404)
  expect((await app.call(`/api/ai/extensions/plugins/${id}`, { method: "PUT", json: { enabled: true } })).status).toBe(200)

  const listed = await app.call("/api/ai/extensions/plugins/tools")
  expect(listed.status).toBe(200)
  expect(listed.body.tools.map((tool: { id: string }) => tool.id)).toEqual(["area", "stamp", "refuses", "boom"])
  expect(listed.body.tools[0]).toMatchObject({ pluginId: id, kind: "read" })

  const ok = await invoke("area", { args: { radius: 2 } })
  expect(ok.status).toBe(200)
  expect(ok.body.result.area).toBeCloseTo(Math.PI * 4)

  // Arguments that do not fit the tool's schema never reach the plugin.
  const bad = await invoke("area", { args: { radius: "wide" } })
  expect(bad.status).toBe(400)
  expect(bad.body.message).toContain("Invalid arguments")
  expect((await invoke("area", {})).status).toBe(400)
})

test("a write tool needs confirm, a tool's own { ok: false } is a result, and a throwing tool is a server error that leaves the plugin running", async () => {
  expect((await invoke("stamp", {})).status).toBe(400)
  const stamped = await invoke("stamp", { confirm: true })
  expect(stamped.status).toBe(200)
  expect(stamped.body.result).toEqual({ ok: true, stamped: true })
  const refused = await invoke("refuses", {})
  expect(refused.status).toBe(200)
  expect(refused.body.result).toEqual({ ok: false, error: "no" })
  const boom = await invoke("boom", {})
  expect(boom.status).toBe(500)
  expect((await invoke("area", { args: { radius: 1 } })).status).toBe(200)
})

test("after the plugin is disabled its tools are gone from the listing and the RPC", async () => {
  expect((await app.call(`/api/ai/extensions/plugins/${id}`, { method: "PUT", json: { enabled: false } })).status).toBe(200)
  expect((await app.call("/api/ai/extensions/plugins/tools")).body.tools).toEqual([])
  expect((await invoke("area", { args: { radius: 1 } })).status).toBe(404)
  expect((await app.call(`/api/ai/extensions/plugins/${id}`, { method: "DELETE" })).status).toBe(200)
})
