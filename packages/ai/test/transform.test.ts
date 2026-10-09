import { describe, expect, test } from "bun:test"
import type { ModelMessage } from "ai"
import { prepareDirectCall } from "../src/direct-model.ts"
import { resolveModel, type ResolvedModel } from "../src/models.ts"
import * as T from "../src/transform.ts"

const model = (over: Partial<T.TransformModel> & Pick<T.TransformModel, "id" | "providerID"> & { npm?: string; apiId?: string }): T.TransformModel => ({
  api: { id: over.apiId ?? over.id, npm: over.npm ?? "@ai-sdk/openai-compatible" },
  capabilities: { reasoning: false, ...over.capabilities },
  limit: { output: 32_000 },
  ...over
})
const claude = model({ id: "claude-sonnet-5-5", providerID: "anthropic", npm: "@ai-sdk/anthropic", capabilities: { reasoning: true } })

describe("sanitizeSurrogates", () => {
  test("replaces lone surrogates and keeps clean strings", () => {
    expect(T.sanitizeSurrogates("a\uD800b")).toBe("a�b")
    expect(T.sanitizeSurrogates("ok 😀")).toBe("ok 😀")
  })
})

describe("message", () => {
  test("anthropic drops empty text, keeps signed reasoning and removes empty messages", () => {
    const msgs: ModelMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "" }, { type: "reasoning", text: "", providerOptions: { anthropic: { signature: "s" } } }] },
      { role: "assistant", content: [{ type: "text", text: "" }] },
      { role: "user", content: "" }
    ]
    const out = T.message(msgs, claude, { cache: false })
    expect(out).toHaveLength(2)
    expect((out[1]!.content as any[])[0].type).toBe("reasoning")
  })

  test("claude tool call ids are scrubbed on both sides of the call", () => {
    const msgs: ModelMessage[] = [
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "call.1:x", toolName: "t", input: {} }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "call.1:x", toolName: "t", output: { type: "text", value: "ok" } }] }
    ]
    const out = T.message(msgs, claude, { cache: false })
    expect((out[0]!.content as any[])[0].toolCallId).toBe("call_1_x")
    expect((out[1]!.content as any[])[0].toolCallId).toBe("call_1_x")
  })

  test("anthropic splits text that follows tool calls into text, then calls", () => {
    const msgs: ModelMessage[] = [
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "a", toolName: "t", input: {} }, { type: "text", text: "after" }] }
    ]
    const out = T.message(msgs, claude, { cache: false })
    expect(out.map((m) => (m.content as any[]).map((p) => p.type))).toEqual([["text"], ["tool-call"]])
  })

  test("mistral ids become 9 alphanumerics and a tool turn is never followed by a user turn", () => {
    const mistral = model({ id: "mistral-large", providerID: "mistral", npm: "@ai-sdk/mistral" })
    const msgs: ModelMessage[] = [
      { role: "tool", content: [{ type: "tool-result", toolCallId: "ab-cd", toolName: "t", output: { type: "text", value: "x" } }] },
      { role: "user", content: "next" }
    ]
    const out = T.message(msgs, mistral, { cache: false })
    expect(out.map((m) => m.role)).toEqual(["tool", "assistant", "user"])
    expect((out[0]!.content as any[])[0].toolCallId).toBe("abcd00000")
  })

  test("deepseek assistant turns always carry a reasoning part", () => {
    const ds = model({ id: "deepseek-chat", providerID: "deepseek" })
    const out = T.message([{ role: "assistant", content: "hello" }], ds, { cache: false })
    expect((out[0]!.content as any[]).map((p) => p.type)).toEqual(["text", "reasoning"])
  })

  test("interleaved models get reasoning as a message field, only when the turn reasoned", () => {
    const m = model({ id: "x", providerID: "x", capabilities: { reasoning: true, interleaved: { field: "reasoning_content" } } })
    const out = T.message(
      [
        { role: "assistant", content: [{ type: "reasoning", text: "think" }, { type: "text", text: "a" }] },
        { role: "assistant", content: [{ type: "text", text: "b" }] }
      ],
      m,
      { cache: false }
    )
    expect((out[0]!.providerOptions as any)?.openaiCompatible?.reasoning_content).toBe("think")
    expect(out[1]!.providerOptions).toBeUndefined()
  })

  test("unsupported media becomes an explicit error text", () => {
    const text = model({ id: "t", providerID: "x" })
    const out = T.message(
      [{ role: "user", content: [{ type: "file", data: "AAAA", mediaType: "application/pdf", filename: "a.pdf" }] }],
      text,
      { cache: false }
    )
    expect((out[0]!.content as any[])[0].text).toContain('Cannot read "a.pdf"')
  })

  test("providerOptions are remapped from the stored provider id to the SDK key", () => {
    const m = model({ id: "gpt-5", providerID: "myopenai", npm: "@ai-sdk/openai" })
    const out = T.message([{ role: "user", content: "x", providerOptions: { myopenai: { a: 1 } } }], m, { cache: false })
    expect(out[0]!.providerOptions).toEqual({ openai: { a: 1 } })
  })
})

describe("cache breakpoints", () => {
  const long = "x".repeat(40_000)
  const convo = (): ModelMessage[] => [
    { role: "system", content: "short header" },
    { role: "system", content: long },
    { role: "user", content: "1" },
    { role: "assistant", content: "2" },
    { role: "user", content: "3" }
  ]

  test("plan marks the last system part and the last two messages within the budget", () => {
    const msgs = convo()
    const planned = T.planCacheBreakpoints(msgs)
    expect(planned).toEqual([msgs[1]!, msgs[3]!, msgs[4]!])
    expect(planned.length).toBeLessThanOrEqual(T.MESSAGE_BREAKPOINT_BUDGET)
  })

  test("anthropic uses message-level cacheControl, never more than the budget", () => {
    const out = T.message(convo(), claude)
    const marked = out.filter((m) => m.providerOptions?.anthropic?.cacheControl)
    expect(marked).toHaveLength(3)
    expect((marked[0]!.providerOptions as any).anthropic.cacheControl).toEqual({ type: "ephemeral" })
  })

  test("long retention adds the 1h ttl; the gateway is never marked", () => {
    const long1h = T.message(convo(), claude, { retention: "long" })
    expect((long1h.find((m) => m.providerOptions?.anthropic)!.providerOptions as any).anthropic.cacheControl.ttl).toBe("1h")
    const gw = model({ id: "anthropic/claude-sonnet-5-5", providerID: "gateway", npm: "@ai-sdk/gateway" })
    expect(T.message(convo(), gw).some((m) => m.providerOptions && JSON.stringify(m.providerOptions).includes("cache"))).toBe(false)
  })

  test("the minimum cacheable prefix is per model", () => {
    expect(T.minCacheableChars("claude-opus-4-6")).toBe(4096 * 4)
    expect(T.minCacheableChars("claude-opus-5-5")).toBe(512 * 4)
    expect(T.minCacheableChars("whatever")).toBe(1024 * 4)
  })
})

describe("sampling", () => {
  test("per-family defaults", () => {
    expect(T.temperature(model({ id: "qwen3", providerID: "q" }))).toBe(0.55)
    expect(T.temperature(claude)).toBeUndefined()
    expect(T.topK(model({ id: "gemini-3-pro", providerID: "google" }))).toBe(64)
    expect(T.topP(model({ id: "MiniMax-M2", providerID: "minimax" }))).toBe(0.95)
    expect(T.topK(model({ id: "MiniMax-M2.5", providerID: "minimax" }))).toBe(40)
  })
  test("maxOutputTokens is capped", () => {
    expect(T.maxOutputTokens(claude)).toBe(32_000)
    expect(T.maxOutputTokens({ ...claude, limit: { output: 8_000 } })).toBe(8_000)
  })
})

describe("variants", () => {
  test("non-reasoning models have none", () => {
    expect(T.variants(model({ id: "gpt-4o", providerID: "openai", npm: "@ai-sdk/openai" }))).toEqual({})
  })
  test("anthropic: adaptive efforts from opus 4.7, token budgets before", () => {
    const opus = model({ id: "claude-opus-4-7", providerID: "anthropic", npm: "@ai-sdk/anthropic", capabilities: { reasoning: true } })
    expect(Object.keys(T.variants(opus))).toEqual(["low", "medium", "high", "xhigh", "max"])
    expect(T.variants(opus).max).toEqual({ thinking: { type: "adaptive", display: "summarized" }, effort: "max" })
    const old = model({ id: "claude-sonnet-4-5", providerID: "anthropic", npm: "@ai-sdk/anthropic", capabilities: { reasoning: true } })
    expect(T.variants(old).high!.thinking).toEqual({ type: "enabled", budgetTokens: 15_999 })
  })
  test("openai: tiers follow the family", () => {
    const o = (id: string, releaseDate = "2026-01-01") => T.variants(model({ id, providerID: "openai", npm: "@ai-sdk/openai", capabilities: { reasoning: true }, releaseDate }))
    expect(Object.keys(o("gpt-5.2"))).toEqual(["none", "low", "medium", "high", "xhigh"])
    expect(Object.keys(o("gpt-5-pro"))).toEqual(["high"])
    expect(Object.keys(o("gpt-6-astra"))).toEqual(["low", "medium", "high", "xhigh", "max"])
    expect(Object.keys(o("gpt-5-chat-latest"))).toEqual([])
    expect(o("gpt-5.2").high).toEqual({ reasoningEffort: "high", reasoningSummary: "detailed", include: ["reasoning.encrypted_content"] })
  })
  test("grok: only the models with an effort control", () => {
    const g = (id: string) => T.variants(model({ id, providerID: "xai", npm: "@ai-sdk/xai", capabilities: { reasoning: true } }))
    expect(Object.keys(g("grok-4"))).toEqual([])
    expect(Object.keys(g("grok-3-mini"))).toEqual(["low", "high"])
  })
  test("gemini 2.5 uses budgets, 3 uses levels", () => {
    const g = (id: string) => T.variants(model({ id, providerID: "google", npm: "@ai-sdk/google", capabilities: { reasoning: true } }))
    expect(g("gemini-2.5-pro").max!.thinkingConfig.thinkingBudget).toBe(32_768)
    expect(Object.keys(g("gemini-3-flash"))).toEqual(["minimal", "low", "medium", "high"])
  })
})

describe("options / providerOptions", () => {
  test("openai gpt-5: stateless, cache key, medium effort", () => {
    const m = model({ id: "gpt-5", providerID: "openai", npm: "@ai-sdk/openai", capabilities: { reasoning: true } })
    const body = T.options({ model: m, sessionID: "s1" })
    expect(body).toMatchObject({ store: false, promptCacheKey: "s1", reasoningEffort: "medium", reasoningSummary: "detailed" })
    expect(T.providerOptions(m, body)).toEqual({ openai: body })
  })
  test("gateway splits provider body under the upstream slug", () => {
    const m = model({ id: "anthropic/claude-sonnet-5-5", providerID: "gateway", npm: "@ai-sdk/gateway" })
    expect(T.providerOptions(m, { gateway: { caching: "auto" }, thinking: { type: "adaptive" } })).toEqual({
      gateway: { caching: "auto" },
      anthropic: { thinking: { type: "adaptive" } }
    })
  })
  test("azure sends both keys", () => {
    const m = model({ id: "gpt-5", providerID: "azure", npm: "@ai-sdk/azure" })
    expect(Object.keys(T.providerOptions(m, { a: 1 }))).toEqual(["openai", "azure"])
  })
})

describe("tools / errors / schema", () => {
  test("multi-agent grok gets no client tools", () => {
    expect(T.tools<Record<string, unknown>>(model({ id: "grok-4.20-multi-agent", providerID: "xai" }), { a: 1 })).toEqual({})
    expect(T.tools(claude, { a: 1 })).toEqual({ a: 1 })
  })
  test("provider errors carry the hint", () => {
    expect(T.error("github-copilot", { message: "denied", statusCode: 403 })).toContain("reauthenticate")
    expect(T.error("anthropic", { message: "boom" })).toBe("boom")
  })
  test("gemini schemas: enums as strings, required pruned, arrays typed", () => {
    const gem = model({ id: "gemini-3-pro", providerID: "google", npm: "@ai-sdk/google" })
    const out = T.schema(gem, {
      type: "object",
      properties: { n: { type: "integer", enum: [1, 2] }, list: { type: "array" } },
      required: ["n", "ghost"]
    })
    expect(out as unknown).toEqual({
      type: "object",
      properties: { n: { type: "string", enum: ["1", "2"] }, list: { type: "array", items: { type: "string" } } },
      required: ["n"]
    })
  })
})

describe("prepareDirectCall", () => {
  const resolved = (provider: string, modelId: string): ResolvedModel => resolveModel({ provider, model: modelId }, { configured: new Set([provider]), forceGateway: false }) as ResolvedModel

  test("anthropic: system + user messages, system cached, no temperature", () => {
    const call = prepareDirectCall(resolved("anthropic", "claude-sonnet-5-5"), { system: "S".repeat(5000), prompt: "hi" })
    expect(call.messages.map((m) => m.role)).toEqual(["system", "user"])
    expect((call.messages[0]!.providerOptions as any)?.anthropic?.cacheControl).toBeDefined()
    expect(call.temperature).toBeUndefined()
    expect(call.providerOptions).toHaveProperty("anthropic")
  })
  test("minimax: sampling defaults reach the call", () => {
    const call = prepareDirectCall(resolved("minimax", "MiniMax-M2"), { prompt: "hi" })
    expect(call).toMatchObject({ temperature: 1.0, topP: 0.95, topK: 20, maxOutputTokens: 32_000 })
    expect(call.messages.map((m) => m.role)).toEqual(["user"])
  })
})
