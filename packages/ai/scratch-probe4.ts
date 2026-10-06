/** TEMPORARY diagnostic 4: what does the host expose for providers/models? */
import { Effect, Scope } from "effect"
import { defaultProviderSpecs } from "./src/nikcli/config.ts"
import { makeNikCliRuntime } from "./src/nikcli/runtime.ts"

const dataDir = "/private/var/folders/88/_z3t10zd153grmvwlsl2jvs00000gn/T/opencode/probe-nikcli-4"
const scope = Effect.runSync(Scope.make())
const runtime = await Effect.runPromise(
  makeNikCliRuntime({ dataDir, providers: defaultProviderSpecs(), systemPrompt: "CAD assistant.", toolsFor: () => [] })
    .pipe(Scope.provide(scope))
)
const host = await Effect.runPromise(runtime.host("probe-project"))
const client = host.client as unknown as Record<string, Record<string, (...a: Array<unknown>) => Promise<unknown>>>

const show = async (label: string, fn: () => Promise<unknown>) => {
  try {
    const value = await fn()
    const json = JSON.stringify(value)
    console.log(`\n### ${label}\n${json.slice(0, 1500)}${json.length > 1500 ? ` …(+${json.length - 1500})` : ""}`)
  } catch (error) {
    console.log(`\n### ${label}\nFAILED: ${(error as Error)?.message ?? error}`)
  }
}

await show("provider.list()", () => client["provider"]["list"]())
await show("config.providers", () => client["config"]["providers"]())
await show("provider.auth", () => client["provider"]["auth"]())
console.log("\n### top-level keys")
console.log(Object.keys(client).sort().join(", "))
for (const group of ["model", "models", "config", "provider", "experimental"]) {
  if (client[group]) console.log(`### ${group}: ${Object.keys(client[group]).sort().join(", ")}`)
}
await Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never))
