/** TEMPORARY diagnostic 2: what message do we get when the provider rejects the request? */
import { Effect, Scope, Stream } from "effect"
import { hostChatStream, createHostSession } from "./src/nikcli/chat.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "./src/nikcli/config.ts"
import { makeNikCliRuntime } from "./src/nikcli/runtime.ts"
import type { AiEvent } from "./src/events.ts"

const status = Number(process.argv[2] ?? 401)
const dataDir = "/private/var/folders/88/_z3t10zd153grmvwlsl2jvs00000gn/T/opencode/probe-nikcli-2"

const server = Bun.serve({
  port: 0,
  fetch: () => Response.json({ error: { message: "Invalid API key provided", type: "invalid_request_error", code: "invalid_api_key" } }, { status })
})
const fake: HostProviderSpec = {
  id: "fake",
  name: "Fake",
  protocol: "openai-compatible",
  baseURL: `http://localhost:${server.port}/v1`,
  models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }]
}

const scope = Effect.runSync(Scope.make())
const logs: string[] = []
const runtime = await Effect.runPromise(
  makeNikCliRuntime({
    dataDir,
    providers: [...defaultProviderSpecs(), fake],
    systemPrompt: "You are a CAD assistant.",
    toolsFor: () => [],
    hostLogs: (level, line) => logs.push(`${level} ${line}`)
  }).pipe(Scope.provide(scope))
)
await Effect.runPromise(runtime.setProviderKey("fake", "sk-invalid"))
const host = await Effect.runPromise(runtime.host("probe-project"))
const sessionId = await Effect.runPromise(createHostSession(host, "probe"))
const events: AiEvent[] = []
await Effect.runPromise(
  Stream.runCollect(hostChatStream({ host, sessionId, message: "Say hi.", model: { providerID: "fake", modelID: "fake-model" } }))
).then((c) => events.push(...[...c]), (err) => console.log("STREAM FAILED:", err?.message ?? err))
console.log("--- events ---")
for (const e of events) console.log(JSON.stringify(e))
console.log("--- host logs ---")
for (const l of logs.filter((l) => l.startsWith("error") || l.startsWith("warn")).slice(-10)) console.log(l.slice(0, 400))
server.stop(true)
await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))
