import { expect, test } from "bun:test"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Effect, Exit, Scope, Stream } from "effect"
import { createHostSession, hostChatStream } from "../src/nikcli/chat.ts"
import { makeNikCliRuntime } from "../src/nikcli/runtime.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

test("a provider SSE connection that stops sending chunks fails without freezing or replaying partial text", async () => {
  let requests = 0
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: async (request) => {
    await request.text()
    requests++
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ id: "partial", object: "chat.completion.chunk", model: "inactivity-model", choices: [{ index: 0, delta: { role: "assistant", content: "Partial answer" }, finish_reason: null }] })}\n\n`))
    } }), { headers: { "content-type": "text/event-stream" } })
  } })
  const scope = Effect.runSync(Scope.make())
  let file: string | undefined, original: string | undefined
  try {
    const runtime = await Effect.runPromise(makeNikCliRuntime({ dataDir: sharedDataDir, providers: [{
      id: "inactivity", name: "Inactivity", protocol: "openai-compatible", baseURL: `http://127.0.0.1:${server.port}/v1`,
      models: [{ id: "inactivity-model", name: "Inactivity", context: 100_000, output: 4096 }]
    }], systemPrompt: "Answer directly.", toolsFor: () => [] }).pipe(Scope.provide(scope)))
    await Effect.runPromise(runtime.setProviderKey("inactivity", "test-key"))
    const host = await Effect.runPromise(runtime.host("provider-inactivity"))
    file = join(runtime.paths.config, "nikcli.json")
    original = await readFile(file, "utf8")
    const config = JSON.parse(original)
    // Exercise the same pinned-host transport as production with a short inactivity window.
    config.provider.inactivity.options.headerTimeout = 1000
    config.provider.inactivity.options.chunkTimeout = 1000
    await writeFile(file, JSON.stringify(config))
    await host.client["config-management"].reload()
    const sessionId = await Effect.runPromise(createHostSession(host, "Inactivity"))
    const started = performance.now()
    const events = await Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId, message: "Hi", model: { providerID: "inactivity", modelID: "inactivity-model" }, continues: 0, autoContinues: 0 })))
    expect(events.some((event) => event.type === "delta" && event.text.includes("Partial answer"))).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: "error" })
    expect(events.filter((event) => event.type === "done")).toHaveLength(0)
    expect(requests).toBe(1)
    expect(performance.now() - started).toBeLessThan(15_000)
  } finally {
    if (file !== undefined && original !== undefined) await writeFile(file, original)
    await Effect.runPromise(Scope.close(scope, Exit.void))
    server.stop(true)
  }
}, 90_000)
