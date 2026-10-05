import { describe, expect, test } from "bun:test"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { Effect, Exit, Layer, Redacted, Schema, Stream } from "effect"
import { AiConfig } from "../src/ai-config.ts"
import { AiCredentials } from "../src/credentials.ts"
import { DirectModel, type LanguageModelFactory } from "../src/direct-model.ts"
import { AiConfigError, AiProviderError } from "../src/errors.ts"
import { modelFor, resolveModel, type ProviderId, type ResolvedModel } from "../src/models.ts"

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined }
}

const textModel = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage,
      warnings: []
    })
  })

const layerFor = (factory: LanguageModelFactory, forceGateway = false) =>
  DirectModel.layerWith(factory).pipe(
    Layer.provideMerge(AiCredentials.layer),
    Layer.provide(AiConfig.layer({ dataDir: "/unused", forceGateway }))
  )

const run = <A, E>(effect: Effect.Effect<A, E, DirectModel | AiCredentials>, factory: LanguageModelFactory, forceGateway = false) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(layerFor(factory, forceGateway))))

const withKey = (provider: ProviderId, key = "sk-direct-sentinel-1234") =>
  Effect.gen(function* () {
    const credentials = yield* AiCredentials
    yield* credentials.set(provider, Redacted.make(key))
  })

describe("provider resolution matrix", () => {
  const set = (...ids: ProviderId[]) => new Set<ProviderId>(ids)
  const ok = (r: ResolvedModel | AiConfigError): ResolvedModel => {
    if (r instanceof AiConfigError) throw r
    return r
  }

  test("direct vendor when its key is present", () => {
    expect(ok(resolveModel(undefined, { configured: set("openai") }))).toEqual({
      provider: "openai",
      modelId: modelFor("openai", "balanced").id,
      viaGateway: false
    })
    expect(ok(resolveModel({ provider: "anthropic", tier: "fast" }, { configured: set("anthropic", "gateway") }))).toMatchObject({
      provider: "anthropic",
      modelId: modelFor("anthropic", "fast").id,
      viaGateway: false
    })
  })

  test("vendor order is anthropic, openai, minimax when no provider is requested", () => {
    expect(ok(resolveModel(undefined, { configured: set("minimax", "openai") })).provider).toBe("openai")
    expect(ok(resolveModel(undefined, { configured: set("minimax", "anthropic") })).provider).toBe("anthropic")
  })

  test("falls back to the gateway when the requested vendor has no key", () => {
    const r = ok(resolveModel({ provider: "anthropic", tier: "best" }, { configured: set("gateway") }))
    expect(r).toEqual({ provider: "gateway", modelId: `anthropic/${modelFor("anthropic", "best").id}`, viaGateway: true })
    expect(ok(resolveModel({ provider: "openai" }, { configured: set("gateway") })).modelId.startsWith("openai/")).toBe(true)
  })

  test("forceGateway routes everything through the gateway", () => {
    const r = ok(resolveModel({ provider: "anthropic" }, { configured: set("anthropic", "gateway"), forceGateway: true }))
    expect(r.provider).toBe("gateway")
    expect(ok(resolveModel(undefined, { configured: set("anthropic", "gateway"), forceGateway: true })).provider).toBe("gateway")
  })

  test("explicit model ids are kept (and namespaced for the gateway)", () => {
    expect(ok(resolveModel({ provider: "openai", model: "gpt-x" }, { configured: set("openai") })).modelId).toBe("gpt-x")
    expect(ok(resolveModel({ provider: "openai", model: "gpt-x" }, { configured: set("gateway") })).modelId).toBe("openai/gpt-x")
    expect(ok(resolveModel({ provider: "gateway", model: "google/gemini-x" }, { configured: set("gateway") })).modelId).toBe("google/gemini-x")
  })

  test("errors when nothing usable is configured", () => {
    expect(resolveModel(undefined, { configured: set() })).toBeInstanceOf(AiConfigError)
    expect(resolveModel({ provider: "anthropic" }, { configured: set("openai") })).toBeInstanceOf(AiConfigError)
    expect(resolveModel({ provider: "gateway" }, { configured: set("openai") })).toBeInstanceOf(AiConfigError)
  })
})

describe("DirectModel on AI SDK v7", () => {
  test("generateText returns text and usage through the resolved vendor", async () => {
    const seen: ResolvedModel[] = []
    const factory: LanguageModelFactory = (resolved) => {
      seen.push(resolved)
      return textModel("hello world")
    }
    const exit = await run(
      Effect.gen(function* () {
        yield* withKey("anthropic")
        return yield* (yield* DirectModel).generateText({ prompt: "hi", model: { tier: "fast" } })
      }),
      factory
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toMatchObject({ text: "hello world", provider: "anthropic", usage: { inputTokens: 10, outputTokens: 20 } })
    }
    expect(seen[0]?.modelId).toBe(modelFor("anthropic", "fast").id)
  })

  test("forceGateway builds the gateway model even when a vendor key exists", async () => {
    const seen: ResolvedModel[] = []
    const factory: LanguageModelFactory = (resolved) => {
      seen.push(resolved)
      return textModel("x")
    }
    await run(
      Effect.gen(function* () {
        yield* withKey("anthropic")
        yield* withKey("gateway", "vck_gateway_key_1234")
        return yield* (yield* DirectModel).generateText({ prompt: "hi" })
      }),
      factory,
      true
    )
    expect(seen[0]?.provider).toBe("gateway")
  })

  test("generateObject: structured output against MockLanguageModelV4", async () => {
    const Result = Schema.Struct({ title: Schema.String, count: Schema.Int })
    const exit = await run(
      Effect.gen(function* () {
        yield* withKey("openai")
        return yield* (yield* DirectModel).generateObject({ prompt: "make one", schema: Result })
      }),
      () => textModel(JSON.stringify({ title: "Bracket", count: 3 }))
    )
    expect(Exit.isSuccess(exit) && exit.value).toEqual({ title: "Bracket", count: 3 })
  })

  test("generateObject: output that fails the Effect Schema becomes AiProviderError", async () => {
    const Result = Schema.Struct({ title: Schema.String, count: Schema.Int })
    const exit = await run(
      Effect.gen(function* () {
        yield* withKey("openai")
        return yield* (yield* DirectModel).generateObject({ prompt: "x", schema: Result })
      }),
      () => textModel(JSON.stringify({ title: "Bracket", count: 3.5 }))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(JSON.stringify(exit.cause)).toContain("AiProviderError")
  })

  test("streamText yields deltas then a finish part", async () => {
    const factory: LanguageModelFactory = () =>
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start", id: "t1" },
              { type: "text-delta", id: "t1", delta: "Hel" },
              { type: "text-delta", id: "t1", delta: "lo" },
              { type: "text-end", id: "t1" },
              { type: "finish", finishReason: { unified: "stop", raw: undefined }, logprobs: undefined, usage }
            ]
          })
        })
      })
    const exit = await run(
      Effect.gen(function* () {
        yield* withKey("anthropic")
        const parts = yield* Stream.runCollect((yield* DirectModel).streamText({ prompt: "hi" }))
        return [...parts]
      }),
      factory
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) {
      expect(exit.value.filter((p) => p.type === "delta").map((p) => (p.type === "delta" ? p.text : ""))).toEqual(["Hel", "lo"])
      expect(exit.value.at(-1)).toEqual({ type: "finish", usage: { inputTokens: 10, outputTokens: 20 } })
    }
  })

  test("without any credential the call fails with AiConfigError", async () => {
    const exit = await run(
      Effect.gen(function* () {
        return yield* (yield* DirectModel).generateText({ prompt: "hi" })
      }),
      () => textModel("never")
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(JSON.stringify(exit.cause)).toContain("AiConfigError")
  })

  test("provider errors are mapped and never leak the key", async () => {
    const key = "sk-direct-sentinel-leak-9876"
    const exit = await run(
      Effect.gen(function* () {
        yield* withKey("openai", key)
        return yield* (yield* DirectModel).generateText({ prompt: "hi" })
      }),
      () =>
        new MockLanguageModelV4({
          doGenerate: async () => {
            throw new Error(`401 Incorrect API key provided: ${key}`)
          }
        })
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const text = JSON.stringify(exit.cause)
      expect(text).toContain("AiProviderError")
      expect(text).not.toContain(key)
      expect(text).toContain("[redacted]")
    }
    expect(AiProviderError).toBeDefined()
  })
})
