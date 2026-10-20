import { Effect } from "effect"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { makeNikCliRuntime } from "../../src/nikcli/runtime.ts"
import { defaultProviderSpecs } from "../../src/nikcli/config.ts"
import { modelsCacheFile } from "../../src/nikcli/models-cache.ts"

const dataDir = mkdtempSync(join(tmpdir(), "cadcam-catalogue-regression-"))
const originalFetch = globalThis.fetch
let model = "first-model"
let failing = false
let downloads = 0
const catalogue = () => Object.fromEntries(Array.from({ length: 25 }, (_, i) => {
  const id = `catalogue-provider-${i}`
  return [id, { id, name: id, env: [], npm: "@ai-sdk/openai-compatible", api: "https://example.test/v1", models: {
    [model]: { id: model, name: model, tool_call: true, attachment: false, limit: { context: 200000, output: 32000 },
      modalities: { input: ["text"], output: ["text"] }, cost: { input: 0, output: 0 } },
  } }]
}))
globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  if (String(input) === "https://models.dev/api.json") {
    downloads++
    return failing ? new Response("Offline", { status: 503 }) : Response.json(catalogue())
  }
  return originalFetch(input, init)
}, { preconnect: originalFetch.preconnect })
const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message) }
try {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* makeNikCliRuntime({ dataDir, providers: defaultProviderSpecs(), systemPrompt: "test", toolsFor: () => [], catalogue: { network: true } })
    // Create a host before opening the provider browser, as agents/status/OAuth do in the application.
    const host = yield* runtime.host("cold-cache")
    assert(downloads === 0, "A fresh installation should not require a catalogue download")
    const list = yield* Effect.promise(() => host.client.provider.list())
    assert(list.all.length >= 200 && list.all.some((provider) => provider.id === "openrouter"), "Cold cache only showed fallback providers")
    yield* runtime.refreshCatalogue()
    const session = yield* Effect.promise(() => host.client.session.create({ title: "Survives a model refresh" }))
    model = "refreshed-model"
    yield* runtime.refreshCatalogue()
    const refreshed = yield* Effect.promise(() => host.client.provider.list())
    assert(Boolean(refreshed.all.find((provider) => provider.id === "catalogue-provider-0")?.models?.[model]), "Refresh did not reload the existing host")
    const kept = readFileSync(modelsCacheFile(runtime.paths), "utf8")
    failing = true
    const failure = yield* Effect.result(runtime.refreshCatalogue())
    assert(failure._tag === "Failure", "A failed download was reported as successful")
    assert(readFileSync(modelsCacheFile(runtime.paths), "utf8") === kept, "A failed refresh replaced the previous catalogue")
    const sessions = yield* Effect.promise(() => host.client.session.list())
    assert(sessions.some((entry) => entry.id === session.id), "Refreshing models disposed a conversation")
    process.stdout.write(JSON.stringify({ coldProviders: list.all.length, refreshedProviders: refreshed.all.length, downloads, sessionPreserved: true }) + "\n")
  })))
} finally { globalThis.fetch = originalFetch; rmSync(dataDir, { recursive: true, force: true }) }
