/** TEMPORARY diagnostic: what error does the embedded host surface for a real provider? */
import { Effect, Scope, Stream } from "effect"
import { hostChatStream, createHostSession } from "./src/nikcli/chat.ts"
import { defaultProviderSpecs } from "./src/nikcli/config.ts"
import { makeNikCliRuntime } from "./src/nikcli/runtime.ts"
import type { AiEvent } from "./src/events.ts"

const dataDir = process.argv[2] ?? "/private/var/folders/88/_z3t10zd153grmvwlsl2jvs00000gn/T/opencode/probe-nikcli"
const provider = (process.argv[3] ?? "minimax") as "minimax" | "anthropic" | "openai" | "gateway"
const modelID = process.argv[4] ?? "MiniMax-M2"
const key = process.argv[5]

const scope = Effect.runSync(Scope.make())
const logs: string[] = []
const runtime = await Effect.runPromise(
  makeNikCliRuntime({
    dataDir,
    providers: defaultProviderSpecs(),
    systemPrompt: "You are a CAD assistant.",
    toolsFor: () => [],
    hostLogs: (level, line) => logs.push(`${level} ${line}`)
  }).pipe(Scope.provide(scope))
)

if (key) await Effect.runPromise(runtime.setProviderKey(provider, key))

const host = await Effect.runPromise(runtime.host("probe-project"))
const sessionId = await Effect.runPromise(createHostSession(host, "probe"))
const events: AiEvent[] = []
const t0 = Date.now()
await Effect.runPromise(
  Stream.runCollect(
    hostChatStream({ host, sessionId, message: "Say hi in 3 words.", model: { providerID: provider, modelID } })
  )
).then(
  (chunk) => events.push(...[...chunk]),
  (err) => console.log("STREAM FAILED:", err?.message ?? err)
)
console.log("--- events ---")
for (const e of events) console.log(JSON.stringify(e))
console.log(`--- ${Date.now() - t0}ms ---`)
console.log("--- host logs (errors/warns) ---")
for (const l of logs.filter((l) => l.startsWith("error") || l.startsWith("warn")).slice(-25)) console.log(l.slice(0, 600))
await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))
