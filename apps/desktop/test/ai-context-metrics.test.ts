import { describe, expect, test } from "bun:test"
import { contextWindowFor, contextMetrics, contextTokensOf, formatTokenCount, usableWindow } from "../src/ai/context-metrics.ts"
import type { ModelInfo, ProviderInfo } from "../src/ai/types.ts"

const provider = (id: string, models: ReadonlyArray<{ id: string; contextWindow: number }>): ProviderInfo => ({
  id, name: id, source: "models.dev", auth: ["api"], configured: true,
  models: models.map((m) => ({ ...m, name: m.id, provider: id, maxOutput: 8000, tools: true, vision: false, cost: { input: 0, output: 0 } }))
})
const fallback = (id: string, model: string, contextWindow: number): ModelInfo => ({ id: model, provider: id, contextWindow, tools: true, vision: true, configured: true })

describe("context metrics", () => {
  test("tokens of a call are input plus output", () => {
    expect(contextTokensOf({ inputTokens: 1000, outputTokens: 250 })).toBe(1250)
    expect(contextTokensOf(undefined)).toBe(0)
  })

  test("the window comes from the host catalogue, then the fallback tiers", () => {
    const providers = [provider("anthropic", [{ id: "claude-sonnet-5-5", contextWindow: 1_000_000 }])]
    expect(contextWindowFor({ provider: "anthropic", model: "claude-sonnet-5-5" }, providers, [])).toEqual({ context: 1_000_000, output: 8000 })
    expect(contextWindowFor({ provider: "openai", model: "gpt-5" }, providers, [fallback("openai", "gpt-5", 400_000)])).toEqual({ context: 400_000 })
    expect(contextWindowFor({ provider: "openai", model: "ghost" }, providers, [])).toBeUndefined()
    expect(contextWindowFor(undefined, providers, [])).toBeUndefined()
  })

  test("percent is rounded and capped, and the level follows it", () => {
    const window = { context: 200_000 }
    expect(contextMetrics(50_000, window)).toMatchObject({ percent: 25, level: "ok" })
    expect(contextMetrics(150_000, window)).toMatchObject({ percent: 75, level: "warn" })
    expect(contextMetrics(190_000, window)).toMatchObject({ percent: 95, level: "full" })
    expect(contextMetrics(500_000, window)).toMatchObject({ percent: 100, level: "full" })
  })

  test("the host summarises at the usable window (window minus the output reserve), so that is where it turns full", () => {
    expect(usableWindow({ context: 200_000, output: 64_000 })).toBe(168_000)
    expect(usableWindow({ context: 200_000, output: 8_000 })).toBe(192_000)
    expect(usableWindow({ context: 200_000 })).toBe(168_000)
    expect(usableWindow({ context: 10_000 })).toBe(0)
    expect(usableWindow({ context: 200_000, input: 128_000, output: 64_000 })).toBe(108_000)
    expect(usableWindow({ context: 200_000, input: 128_000, output: 64_000, reserved: 10_000 })).toBe(118_000)
    // 170k of 200k is only 85%, but past the 168k a 32k answer leaves room for.
    expect(contextMetrics(170_000, { context: 200_000, output: 64_000 })).toMatchObject({ percent: 85, level: "full", compactAt: 168_000 })
    expect(contextMetrics(145_000, { context: 200_000, output: 64_000 }).level).toBe("warn")
  })

  test("without a window there is no percent and no alarm", () => {
    expect(contextMetrics(5000, undefined)).toEqual({ tokens: 5000, limit: undefined, compactAt: undefined, percent: undefined, level: "ok" })
  })

  test("token counts are compact", () => {
    expect([999, 1500, 128_000, 1_000_000].map(formatTokenCount)).toEqual(["999", "1.5k", "128k", "1.0M"])
  })
})
