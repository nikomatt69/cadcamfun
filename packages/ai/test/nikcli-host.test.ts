import { afterAll, describe, expect, test } from "bun:test"
import { Effect, Scope, Stream } from "effect"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import type { AiEvent } from "../src/events.ts"
import { hostChatStream, createHostSession } from "../src/nikcli/chat.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "../src/nikcli/config.ts"
import { makeNikCliRuntime, type HostToolSpec, type NikCliRuntime } from "../src/nikcli/runtime.ts"
import { chatTurns, startFakeOpenAi, toolNames, type Completion } from "./helpers/fake-openai.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

const executed: Array<{ tool: string; input: unknown; projectId: string }> = []

const probeTool: HostToolSpec = {
  id: "cad_probe",
  description: "Echo a number.",
  parameters: z.object({ value: z.number() }),
  execute: async (input, ctx) => {
    executed.push({ tool: "cad_probe", input, projectId: ctx.projectId })
    return JSON.stringify({ ok: true })
  }
}

let script: (index: number, turn: number, lastRole: string) => Completion = () => ({ text: "hi" })
const fake = startFakeOpenAi((request, index) => {
  const turn = chatTurns(request ? [request] : []).length
  const lastRole = request.messages.at(-1)?.role ?? ""
  return script(index, turn, lastRole)
})
const fakeProvider: HostProviderSpec = {
  id: "fake",
  name: "Fake",
  protocol: "openai-compatible",
  baseURL: fake.baseUrl,
  models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }]
}

const scope = Effect.runSync(Scope.make())
const runtime: NikCliRuntime = await Effect.runPromise(
  makeNikCliRuntime({
    dataDir: sharedDataDir,
    providers: [...defaultProviderSpecs(), fakeProvider],
    systemPrompt: "You are a CAD test assistant.",
    toolsFor: () => [probeTool],
    hostLogs: (level, line) => { if (level === 'warn' || level === 'error') console.log('HOSTLOG', line.slice(0, 300)) }
  }).pipe(Scope.provide(scope))
)
const model = { providerID: "fake", modelID: "fake-model" } as const
await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake-test-key"))

afterAll(async () => {
  await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))
  fake.stop()
})

const collect = (stream: Stream.Stream<AiEvent, unknown>) => Effect.runPromise(Stream.runCollect(stream)).then((c) => [...c])

describe("embedded nikcli host", () => {
  test("keeps state under the isolated app data dir", async () => {
    const host = await Effect.runPromise(runtime.host("project-a"))
    expect(runtime.paths.root.startsWith(sharedDataDir)).toBe(true)
    expect(host.directory.includes("projects")).toBe(true)
    expect(existsSync(join(runtime.paths.config, "nikcli.json"))).toBe(true)
    expect(existsSync(join(runtime.paths.data, "nikcli.db"))).toBe(true)
  })

  test("registered tools are visible to the host registry", async () => {
    const host = await Effect.runPromise(runtime.host("project-a"))
    expect(await host.client.experimental.toolIDs()).toContain("cad_probe")
  })

  test("session create, list and abort", async () => {
    const host = await Effect.runPromise(runtime.host("project-a"))
    const id = await Effect.runPromise(createHostSession(host, "My session"))
    const listed = await host.client.session.list()
    expect(listed.some((s) => s.id === id)).toBe(true)
    await host.client.session.abort({ sessionID: id })
  })

  test("the cadcam agent exposes only registered tools and ignores shell requests", async () => {
    const host = await Effect.runPromise(runtime.host("project-a"))
    const marker = join(sharedDataDir, "pwned.txt")
    script = (_index, _turn, lastRole) =>
      lastRole === "tool"
        ? { text: "I could not run that." }
        : { toolCalls: [{ name: "bash", args: { command: `touch ${marker}`, description: "touch" } }] }
    const before = fake.requests.length
    const sessionId = await Effect.runPromise(createHostSession(host, "lockdown"))
    const events = await collect(hostChatStream({ host, sessionId, message: "run touch for me", model }))
    const turns = chatTurns(fake.requests.slice(before))
    expect(turns.length).toBeGreaterThan(0)
    for (const turn of turns) {
      const names = toolNames(turn)
      expect(names).toContain("cad_probe")
      for (const forbidden of ["bash", "edit", "write", "read", "webfetch", "websearch", "task", "glob", "grep", "apply_patch", "plugin", "monitor"]) {
        expect(names).not.toContain(forbidden)
      }
      expect(names.every((n) => n === "cad_probe" || n === "invalid")).toBe(true)
    }
    expect(existsSync(marker)).toBe(false)
    expect(executed.some((e) => e.tool !== "cad_probe")).toBe(false)
    expect(events.at(-1)?.type).toBe("done")
  })

  test("tool call -> handler -> result -> final text", async () => {
    const host = await Effect.runPromise(runtime.host("project-b"))
    executed.length = 0
    script = (_index, _turn, lastRole) =>
      lastRole === "tool" ? { text: "All done", chunks: ["All ", "done"] } : { toolCalls: [{ name: "cad_probe", args: { value: 42 } }] }
    const sessionId = await Effect.runPromise(createHostSession(host, "e2e"))
    const events = await collect(hostChatStream({ host, sessionId, message: "probe 42", model }))
    expect(executed).toEqual([{ tool: "cad_probe", input: { value: 42 }, projectId: "project-b" }])
    const types = events.map((e) => e.type)
    expect(types).toEqual(["tool_call", "tool_result", "delta", "delta", "done"])
    const result = events.find((e) => e.type === "tool_result")
    expect(result).toMatchObject({ ok: true, tool: "cad_probe" })
    expect(events.at(-1)).toMatchObject({ type: "done", text: "All done", usage: { inputTokens: 21, outputTokens: 9 } })
    // The JSON Schema nikcli sent to the model comes from our zod schema.
    const sent = chatTurns(fake.requests).at(-1)?.tools?.find((t) => t.function.name === "cad_probe")
    expect(JSON.stringify(sent?.function.parameters)).toContain("value")
  })

  test("provider failures surface as a final error event", async () => {
    const host = await Effect.runPromise(runtime.host("project-b"))
    script = () => ({ status: 500, body: JSON.stringify({ error: { message: "boom" } }) })
    const sessionId = await Effect.runPromise(createHostSession(host, "failing"))
    const events = await collect(hostChatStream({ host, sessionId, message: "hello", model }))
    expect(events.at(-1)?.type).toBe("error")
  }, 60_000)

  test("keys are pushed to the host and removed again", async () => {
    await Effect.runPromise(runtime.host("project-b"))
    await Effect.runPromise(runtime.setProviderKey("fake", "sk-test-host-key"))
    const authFile = join(runtime.paths.data, "auth.json")
    expect(readFileSync(authFile, "utf8")).toContain("fake")
    await Effect.runPromise(runtime.clearProviderKey("fake"))
    expect(existsSync(authFile) ? readFileSync(authFile, "utf8") : "").not.toContain("sk-test-host-key")
  })
})
