import { expect, test } from "bun:test"
import { Effect, Exit, Metric, Scope } from "effect"
import { z } from "zod"
import { makeNikCliRuntime } from "../src/nikcli/runtime.ts"
import { sharedDataDir } from "./helpers/host-env.ts"
import { startFakeOpenAi } from "./helpers/fake-openai.ts"

test("native host operations are measured without a UI event-stream subscriber", async () => {
  let turn = 0
  const provider = startFakeOpenAi(() => ++turn === 1
    ? { toolCalls: [{ name: "cad", args: { value: 7 } }] }
    : { text: "Finished." })
  const scope = Effect.runSync(Scope.make())
  try {
    let executed = false
    const runtime = await Effect.runPromise(makeNikCliRuntime({
      dataDir: sharedDataDir,
      providers: [{ id: "timing-fake", name: "Timing fixture", protocol: "openai-compatible", baseURL: provider.baseUrl, models: [{ id: "model", name: "Fixture", context: 100_000, output: 4096 }] }],
      systemPrompt: "Use cad once and report the saved value.",
      toolsFor: () => [{ id: "cad", description: "Echo a number.", parameters: z.object({ value: z.number() }), execute: async () => { executed = true; return '{"ok":true}' } }]
    }).pipe(Scope.provide(scope)))
    await Effect.runPromise(runtime.setProviderKey("timing-fake", "local-fixture-key"))
    const host = await Effect.runPromise(runtime.host("timing-without-ui"))
    const session = await host.client.session.create({ title: "No UI subscriber" })
    const result = await host.client["session-prompt"].prompt({
      sessionID: session.id, agent: "cadcam-build", model: { providerID: "timing-fake", modelID: "model" }, parts: [{ type: "text", text: "Echo seven" }]
    })
    expect(result.info?.error).toBeUndefined()
    expect(executed).toBe(true)
    const metrics = await Effect.runPromise(Metric.snapshot)
    for (const phase of ["permission", "execution"]) {
      const metric = metrics.find((entry) => entry.id === "cadcamfun_ai_host_operations_total" && entry.attributes?.["tool"] === "cad" && entry.attributes?.["mode"] === "approve" && entry.attributes?.["phase"] === phase && entry.attributes?.["outcome"] === "ok")
      expect(metric?.type === "Counter" && Number(metric.state.count)).toBeGreaterThanOrEqual(1)
    }
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
    provider.stop()
  }
}, 60_000)
