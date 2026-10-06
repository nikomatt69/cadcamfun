/** TEMPORARY diagnostic 3: does a client-generated session id cause UnexpectedStatus? */
import { Effect, Scope, Stream } from "effect"
import { hostChatStream, createHostSession } from "./src/nikcli/chat.ts"
import { defaultProviderSpecs, type HostProviderSpec } from "./src/nikcli/config.ts"
import { makeNikCliRuntime } from "./src/nikcli/runtime.ts"
import type { AiEvent } from "./src/events.ts"

const dataDir = "/private/var/folders/88/_z3t10zd153grmvwlsl2jvs00000gn/T/opencode/probe-nikcli-3"
const server = Bun.serve({ port: 0, fetch: () => Response.json({ choices: [{ message: { role: "assistant", content: "hi" } }] }, { status: 200 }) })
const fake: HostProviderSpec = {
  id: "fake", name: "Fake", protocol: "openai-compatible",
  baseURL: `http://localhost:${server.port}/v1`,
  models: [{ id: "fake-model", name: "Fake", context: 100_000, output: 4096 }]
}

const scope = Effect.runSync(Scope.make())
const runtime = await Effect.runPromise(
  makeNikCliRuntime({ dataDir, providers: [...defaultProviderSpecs(), fake], systemPrompt: "CAD assistant.", toolsFor: () => [] })
    .pipe(Scope.provide(scope))
)
await Effect.runPromise(runtime.setProviderKey("fake", "sk-fake"))
const host = await Effect.runPromise(runtime.host("probe-project"))

const collect = (sessionId: string) =>
  Effect.runPromise(Stream.runCollect(hostChatStream({ host, sessionId, message: "hi", model: { providerID: "fake", modelID: "fake-model" } })))
    .then((c) => [...c] as AiEvent[], (e) => [{ type: "error" as const, sessionId, code: "provider" as const, message: `STREAM FAILED: ${e?.message ?? e}` }])

const real = await Effect.runPromise(createHostSession(host, "real"))
const cases: Array<[string, string]> = [
  ["client generated id (s-uuid)", `s-${crypto.randomUUID()}`],
  ["plain uuid", crypto.randomUUID()],
  ["real session id", real]
]
for (const [label, sessionId] of cases) {
  console.log(`\n### ${label} -> ${sessionId}`)
  const events = await collect(sessionId)
  for (const e of events) console.log("  ", JSON.stringify(e))
}
server.stop(true)
await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))
