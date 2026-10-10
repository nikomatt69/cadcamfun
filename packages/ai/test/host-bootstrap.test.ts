import { expect, test } from "bun:test"
import { Effect } from "effect"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { isolatedPaths } from "../src/nikcli/isolation.ts"
import { modelsCacheFile } from "../src/nikcli/models-cache.ts"
import { defaultProviderSpecs } from "../src/nikcli/config.ts"
import { makeNikCliRuntime } from "../src/nikcli/runtime.ts"
import { sharedDataDir } from "./helpers/host-env.ts"

test("bootstrap registers a saved MiniMax coding-plan key without a model call", async () => {
  const file = modelsCacheFile(isolatedPaths(sharedDataDir))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ "minimax-coding-plan": {
    id: "minimax-coding-plan", name: "MiniMax Coding Plan", env: ["MINIMAX_API_KEY"], npm: "@ai-sdk/openai-compatible", api: "https://api.minimax.io/v1",
    models: { "MiniMax-M3": { id: "MiniMax-M3", name: "MiniMax M3", tool_call: true, attachment: false, limit: { context: 200000, output: 32000 }, modalities: { input: ["text"], output: ["text"] }, cost: { input: 0, output: 0 } } }
  } }))
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const runtime = yield* makeNikCliRuntime({ dataDir: sharedDataDir, providers: defaultProviderSpecs(), systemPrompt: "test", toolsFor: () => [] })
    yield* runtime.setProviderKey("minimax-coding-plan", "test-bootstrap-key")
    const host = yield* runtime.host("bootstrap-minimax")
    const providers = yield* Effect.promise(() => host.client.provider.list())
    expect(providers.connected).toContain("minimax-coding-plan")
    expect(providers.all.find((provider) => provider.id === "minimax-coding-plan")?.models).toHaveProperty("MiniMax-M3")
    const peers = yield* Effect.all([runtime.host("peer-a"), runtime.host("peer-b")], { concurrency: "unbounded" })
    expect(peers.map((peer) => peer.projectId)).toEqual(["peer-a", "peer-b"])
    const session = yield* Effect.promise(() => host.client.session.create({ title: "bootstrap regression" }))
    expect(session.id.length).toBeGreaterThan(0)
    yield* Effect.promise(() => host.client.session.remove({ sessionID: session.id }))
  })))
}, 90000)
