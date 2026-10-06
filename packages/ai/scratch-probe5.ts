/** TEMPORARY diagnostic 5: list every provider/model the embedded host knows. */
import { Effect, Scope } from "effect"
import { defaultProviderSpecs } from "./src/nikcli/config.ts"
import { makeNikCliRuntime } from "./src/nikcli/runtime.ts"

type Provider = {
  id: string; name: string; source?: string
  models: Record<string, { id: string; name?: string; limit?: { context?: number; output?: number }; status?: string; cost?: { input: number; output: number } }>
}

const dataDir = "/private/var/folders/88/_z3t10zd153grmvwlsl2jvs00000gn/T/opencode/probe-nikcli-5"
const scope = Effect.runSync(Scope.make())
const runtime = await Effect.runPromise(
  makeNikCliRuntime({ dataDir, providers: defaultProviderSpecs(), systemPrompt: "CAD assistant.", toolsFor: () => [] })
    .pipe(Scope.provide(scope))
)
const host = await Effect.runPromise(runtime.host("probe-project"))
const client = host.client as unknown as { provider: { list: () => Promise<{ all: Provider[] }> } }
const { all } = await client.provider.list()
console.log(`providers: ${all.length}`)
for (const p of all) {
  const ids = Object.keys(p.models)
  console.log(`- ${p.id} (${p.name}) [${p.source}] models=${ids.length}: ${ids.slice(0, 6).join(", ")}${ids.length > 6 ? ", …" : ""}`)
}
const total = all.reduce((n, p) => n + Object.keys(p.models).length, 0)
console.log(`total models: ${total}`)
await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))
