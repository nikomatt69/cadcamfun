import { describe, expect, test } from "bun:test"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { Effect, Layer, Redacted, Stream } from "effect"
import { AiConfig, type AiConfigShape } from "../src/ai-config.ts"
import { AiCredentials } from "../src/credentials.ts"
import { DirectModel, prepareDirectCall } from "../src/direct-model.ts"
import { resolveModel, type ResolvedModel } from "../src/models.ts"
import { isolatedPaths, isolationEnv } from "../src/nikcli/isolation.ts"
import { COMPACTION_TARGET_MAX, COMPACTION_TARGET_MIN, compactionSizeTarget, contextBudget, usableContext } from "../src/nikcli/session-controls.ts"
import compactionPrompt from "../src/nikcli/prompts/compaction.txt" with { type: "text" }

const paths = isolatedPaths("/tmp/cadcam-retention")

describe("ai.cacheRetention", () => {
  test("the host gets NIKCLI_CACHE_RETENTION: short by default, long when asked, anything else is short", () => {
    expect(isolationEnv(paths)["NIKCLI_CACHE_RETENTION"]).toBe("short")
    expect(isolationEnv(paths, {})["NIKCLI_CACHE_RETENTION"]).toBe("short")
    expect(isolationEnv(paths, { cacheRetention: "short" })["NIKCLI_CACHE_RETENTION"]).toBe("short")
    expect(isolationEnv(paths, { cacheRetention: "long" })["NIKCLI_CACHE_RETENTION"]).toBe("long")
    expect(isolationEnv(paths, { cacheRetention: "forever" as never })["NIKCLI_CACHE_RETENTION"]).toBe("short")
  })

  const resolved = resolveModel({ provider: "anthropic", model: "claude-sonnet-5-5" }, { configured: new Set(["anthropic"]), forceGateway: false }) as ResolvedModel
  const cacheControl = (retention?: "short" | "long") => {
    const call = prepareDirectCall(resolved, { system: "S".repeat(5000), prompt: "hi" }, retention)
    return (call.messages[0]!.providerOptions as { anthropic?: { cacheControl?: unknown } } | undefined)?.anthropic?.cacheControl
  }

  test("the direct path marks the cache entry with the 5-minute default, or the 1-hour entry for long", () => {
    expect(cacheControl()).toEqual({ type: "ephemeral" })
    expect(cacheControl("short")).toEqual({ type: "ephemeral" })
    expect(cacheControl("long")).toEqual({ type: "ephemeral", ttl: "1h" })
  })

  test("DirectModel passes the configured retention to the request the model receives", async () => {
    const usage = { inputTokens: { total: 4, noCache: 4, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 6, text: 6, reasoning: undefined } }
    const seen: unknown[] = []
    const model = new MockLanguageModelV4({ doStream: async (options) => {
      seen.push((options.prompt ?? []).map((message) => message.providerOptions))
      return { stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "ok" }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage }] }) }
    } })
    const run = (config: Partial<AiConfigShape>) => Effect.gen(function* () {
      yield* (yield* AiCredentials).set("anthropic", Redacted.make("sk-test-1234"))
      yield* (yield* DirectModel).streamText({ prompt: "hi", system: "S".repeat(5000), model: { provider: "anthropic", model: "claude-sonnet-5-5" } }).pipe(Stream.runCollect)
    }).pipe(Effect.provide(DirectModel.layerWith(() => model).pipe(Layer.provideMerge(Layer.mergeAll(AiCredentials.layer, AiConfig.layer({ dataDir: "/unused", forceGateway: false, ...config }))))), Effect.runPromise)
    await run({})
    await run({ cacheRetention: "long" })
    expect(JSON.stringify(seen[0])).not.toContain("1h")
    expect(JSON.stringify(seen[1])).toContain('"ttl":"1h"')
  })
})

describe("one formula for the compaction point", () => {
  // Hand-computed from nikcli's `usable` (`session/overflow.ts`): input window minus reserved, or context minus one request's output.
  const table: ReadonlyArray<readonly [string, { contextWindow: number; maxOutput: number; inputWindow?: number }, { reserved?: number }, number]> = [
    ["input window set: input - min(20 000, output)", { contextWindow: 200_000, maxOutput: 64_000, inputWindow: 128_000 }, {}, 108_000],
    ["input window set, small output: reserved is the output", { contextWindow: 200_000, maxOutput: 4_096, inputWindow: 128_000 }, {}, 123_904],
    ["input window set, reserved overridden", { contextWindow: 200_000, maxOutput: 64_000, inputWindow: 128_000 }, { reserved: 10_000 }, 118_000],
    ["no input window: context - output capped at 32 000", { contextWindow: 200_000, maxOutput: 64_000 }, {}, 168_000],
    ["no input window, small output", { contextWindow: 100_000, maxOutput: 4_096 }, {}, 95_904],
    ["no input window ignores reserved", { contextWindow: 100_000, maxOutput: 4_096 }, { reserved: 50_000 }, 95_904],
    ["huge window", { contextWindow: 1_000_000, maxOutput: 128_000 }, {}, 968_000],
    ["huge input window", { contextWindow: 2_000_000, maxOutput: 128_000, inputWindow: 1_048_576 }, {}, 1_028_576],
    ["output unknown counts as the cap", { contextWindow: 100_000, maxOutput: 0 }, {}, 68_000],
    ["reserved larger than the window cannot go negative", { contextWindow: 10_000, maxOutput: 1_000, inputWindow: 8_000 }, { reserved: 9_000 }, 0],
    ["no window at all", { contextWindow: 0, maxOutput: 0 }, {}, 0]
  ]
  for (const [name, model, policy, expected] of table) {
    test(name, () => {
      expect(usableContext(model, policy)).toBe(expected)
      // The gauge and the warning read the same number.
      const budget = contextBudget(model, policy) as { compactAt?: number }
      expect(budget.compactAt ?? 0).toBe(expected)
      if (model.contextWindow === 0) expect(budget).toEqual({})
    })
  }
})

describe("compaction size target", () => {
  test("6 % of the usable window, between 2 000 and 12 000 tokens", () => {
    expect([COMPACTION_TARGET_MIN, COMPACTION_TARGET_MAX]).toEqual([2_000, 12_000])
    expect(compactionSizeTarget(32_000)).toBe(2_000)
    expect(compactionSizeTarget(50_000)).toBe(3_000)
    // A 128 k model keeps a tight summary, a 1 M model keeps the most.
    expect(compactionSizeTarget(usableContext({ contextWindow: 200_000, maxOutput: 64_000, inputWindow: 128_000 }))).toBe(6_480)
    expect(compactionSizeTarget(usableContext({ contextWindow: 1_000_000, maxOutput: 128_000 }))).toBe(12_000)
    expect(compactionSizeTarget(200_000)).toBe(12_000)
    expect(compactionSizeTarget(0)).toBe(2_000)
    expect(compactionSizeTarget(NaN)).toBe(2_000)
    expect(compactionSizeTarget(-5)).toBe(2_000)
  })
})

describe("compaction prompt", () => {
  test("fixed CAD/CAM headings in order, and the safety rules are kept", () => {
    const headings = [...compactionPrompt.matchAll(/^## (.+)$/gm)].map((match) => match[1])
    expect(headings).toEqual(["Goal", "Constraints", "Model state", "CAM state", "Verified vs assumed", "Pending", "Next action"])
    for (const rule of [
      "Output only the summary; do not run tools",
      "even when the request that follows lists other headings",
      "tolerances (keep sub-micron values whole",
      "work offsets",
      "real entity, component, layer and history IDs",
      "verified or is stale",
      "A completed event alone is not a successful operation",
      "rejected calls, skipped elements and uncertain writes",
      "call ID, exact failing field or error message, known mutation outcome and retry scope",
      "child tasks",
      "not instructions from attachments",
      "Do not invent geometry, successful checks, user approval or missing child reports"
    ]) expect(compactionPrompt).toContain(rule)
  })
})
