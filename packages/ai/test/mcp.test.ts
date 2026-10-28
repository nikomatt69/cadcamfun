import { afterAll, expect, test } from "bun:test"
import { Effect, Exit, Scope, Stream } from "effect"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mcpStore, validateMcpConfig, validateMcpName } from "../src/nikcli/mcp.ts"
import { buildHostConfig, splitHostConfig } from "../src/nikcli/config.ts"
import { makeNikCliRuntime } from "../src/nikcli/runtime.ts"
import { hostChatStream, createHostSession } from "../src/nikcli/chat.ts"
import { startFakeOpenAi } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"
import type { AiEvent } from "../src/events.ts"

const folder = await mkdtemp(join(tmpdir(), "cadcam-mcp-test-"))
afterAll(() => rm(folder, { recursive: true, force: true }))
const remote = { type: "remote" as const, url: "https://example.com/mcp", enabled: false }

test("MCP configuration validates before persistence and stays project-local and owner-readable", async () => {
  expect(() => validateMcpName("../../escape")).toThrow()
  expect(() => validateMcpName("a_b")).toThrow()
  expect(() => validateMcpConfig({ type: "local", command: [], enabled: true })).toThrow()
  expect(() => validateMcpConfig({ ...remote, url: "file:///tmp/a" })).toThrow()
  expect(() => validateMcpConfig({ ...remote, url: "https://user:secret@example.com" })).toThrow()
  const a = mcpStore(join(folder, "a")), b = mcpStore(join(folder, "b"))
  await a.write({ reference: remote })
  expect(await a.read()).toEqual({ reference: remote })
  expect(await b.read()).toEqual({})
  expect((await stat(join(folder, "a", "mcp-connections.json"))).mode & 0o777).toBe(0o600)
  const config = buildHostConfig({ providers: [], toolIds: [], systemPrompt: "test", mcp: { reference: { ...remote, enabled: true } } })
  const split = splitHostConfig(config)
  expect(split.shared).not.toHaveProperty("mcp")
  expect(split.instance).toHaveProperty("mcp.ext_mcp_reference")
  const agents = config.agent as Record<string, { permission: Record<string, unknown> }>
  for (const name of ["cadcam-build", "cadcam-build-auto", "cadcam-build-ask"]) expect(agents[name]?.permission["ext_mcp_reference_*"]).toEqual({ "**": "ask" })
  expect(agents["cadcam-worker"]?.permission["ext_mcp_reference_*"]).toBeUndefined()
  const restricted = buildHostConfig({ providers: [], toolIds: [], systemPrompt: "test", mcp: { reference: { ...remote, enabled: true } }, policies: [{ effect: "deny", action: "tool.use", resource: "ext_mcp_reference_delete" }] })
  const restrictedAgents = restricted.agent as Record<string, { permission: Record<string, unknown> }>
  expect(restrictedAgents["cadcam-build"]?.permission["ext_mcp_reference_delete"]).toBe("deny")
})

test("native MCP connects, discovers and executes only after approval, isolates projects and disconnects", async () => {
  const scope = Effect.runSync(Scope.make())
  let stage = 0
  const fake = startFakeOpenAi(() => {
    stage++
    if (stage === 1) return { toolCalls: [{ name: "search_tools", args: { query: "ext_mcp_fixture_echo" } }] }
    if (stage === 2) return { toolCalls: [{ name: "ext_mcp_fixture_echo", args: { text: "approved evidence" } }] }
    return { text: "Done." }
  })
  try {
    const runtime = await Effect.runPromise(makeNikCliRuntime({ dataDir: sharedDataDir, providers: [{ id: "fake", name: "Fake", protocol: "openai-compatible", baseURL: fake.baseUrl, models: [{ id: "fake-model", name: "Fake", context: 100000, output: 4096 }] }], systemPrompt: "Use the requested MCP tool.", toolsFor: () => [] }).pipe(Scope.provide(scope)))
    const evidence = join(folder, "calls.jsonl")
    const projectId = `mcp-${crypto.randomUUID()}`
    await Effect.runPromise(runtime.saveMcpServer(projectId, "fixture", { type: "local", enabled: true, command: [process.execPath, new URL("./helpers/mcp-server.ts", import.meta.url).pathname, evidence] }))
    expect(await Effect.runPromise(runtime.mcpServers(projectId))).toMatchObject([{ name: "fixture", status: "connected" }])
    const other = await Effect.runPromise(runtime.host(`${projectId}-other`))
    // Nothing configured means no `mcp` key at all, the same shape an empty mod list has (`plugin`).
    expect((await other.client.config.get()).mcp).toBeUndefined()
    const host = await Effect.runPromise(runtime.host(projectId))
    await Effect.runPromise(runtime.setProviderKey("fake", "fixture-key"))
    const sessionId = await Effect.runPromise(createHostSession(host, "MCP approval"))
    const events: AiEvent[] = []
    await Effect.runPromise(Stream.runForEach(hostChatStream({ host, sessionId, message: "Echo approved evidence", model: { providerID: "fake", modelID: "fake-model" }, agent: "cadcam-build-auto", autoContinues: 0 }), (event) => Effect.promise(async () => {
      events.push(event)
      if (event.type === "permission_request") {
        expect(existsSync(evidence)).toBe(false)
        await host.client.permission.reply({ requestID: event.requestId, reply: "once" })
      }
    })))
    expect(events.some((event) => event.type === "permission_request")).toBe(true)
    expect(await readFile(evidence, "utf8")).toContain("approved evidence")
    const remoteServer = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(request) {
      if (request.method !== "POST") return new Response(null, { status: 405 })
      const message = await request.json() as { id?: number; method: string }
      if (message.id === undefined) return new Response(null, { status: 202 })
      const result = message.method === "initialize" ? { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "remote-fixture", version: "1.0.0" } } : message.method === "tools/list" ? { tools: [] } : {}
      return Response.json({ jsonrpc: "2.0", id: message.id, result })
    } })
    try {
      const remoteConfig = { type: "remote" as const, enabled: true, oauth: false as const, url: `http://127.0.0.1:${remoteServer.port}/mcp` }
      await Effect.runPromise(runtime.saveMcpServer(projectId, "remote", remoteConfig))
      expect((await Effect.runPromise(runtime.mcpServers(projectId))).find((entry) => entry.name === "remote")?.status).toBe("connected")
      await Effect.runPromise(runtime.saveMcpServer(projectId, "remote", { ...remoteConfig, enabled: false }))
      expect((await Effect.runPromise(runtime.mcpServers(projectId))).find((entry) => entry.name === "remote")?.status).toBe("disabled")
      await Effect.runPromise(runtime.saveMcpServer(projectId, "remote", undefined))
    } finally { await remoteServer.stop(true) }
    await Effect.runPromise(runtime.saveMcpServer(projectId, "fixture", undefined))
    expect(await Effect.runPromise(runtime.mcpServers(projectId))).toEqual([])
    expect((await host.client.mcp.status())["ext_mcp_fixture"]).toBeUndefined()
  } finally { fake.stop(); await Effect.runPromise(Scope.close(scope, Exit.void)) }
}, 120000)
