import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { CacheHint, LLM } from "../../src"
import { LLMClient } from "../../src/route"
import * as OpenRouter from "../../src/providers/openrouter"
import { it } from "../lib/effect"

describe("OpenRouter", () => {
  it.effect("prepares OpenRouter models through the OpenAI-compatible Chat route", () =>
    Effect.gen(function* () {
      const model = OpenRouter.model("openai/gpt-4o-mini", { apiKey: "test-key" })

      expect(model).toMatchObject({
        id: "openai/gpt-4o-mini",
        provider: "openrouter",
        route: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: "test-key",
      })

      const prepared = yield* LLMClient.prepare(LLM.request({ model, prompt: "Say hello." }))

      expect(prepared.route).toBe("openrouter")
      expect(prepared.body).toMatchObject({
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: "Say hello." }],
        stream: true,
        usage: { include: true },
      })
    }),
  )

  it.effect("applies OpenRouter payload options from the model helper", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: OpenRouter.model("anthropic/claude-3.7-sonnet:thinking", {
            providerOptions: {
              openrouter: {
                usage: true,
                reasoning: { effort: "high" },
                promptCacheKey: "session_123",
                models: ["anthropic/claude-sonnet-4.6", "google/gemini-3.1-pro"],
                provider: { order: ["anthropic", "google"], require_parameters: true },
                plugins: [{ id: "response-healing" }],
                transforms: ["middle-out"],
                web_search_options: { engine: "native", max_results: 3 },
                debug: { echo_upstream_body: true },
                user: "user_123",
              },
            },
          }),
          prompt: "Think briefly.",
        }),
      )

      expect(prepared.body).toMatchObject({
        usage: { include: true },
        reasoning: { effort: "high" },
        prompt_cache_key: "session_123",
        models: ["anthropic/claude-sonnet-4.6", "google/gemini-3.1-pro"],
        provider: { order: ["anthropic", "google"], require_parameters: true },
        plugins: [{ id: "response-healing" }],
        transforms: ["middle-out"],
        web_search_options: { engine: "native", max_results: 3 },
        debug: { echo_upstream_body: true },
        user: "user_123",
      })
    }),
  )

  it.effect("lowers cache hints and caps OpenRouter cache controls", () =>
    Effect.gen(function* () {
      const cache = new CacheHint({ type: "ephemeral", ttlSeconds: 3_600 })
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: OpenRouter.model("anthropic/claude-sonnet-4.6", { apiKey: "test-key" }),
          cache: "none",
          system: [1, 2, 3, 4, 5].map((index) => ({ type: "text" as const, text: `System ${index}`, cache })),
          messages: [LLM.user({ type: "text", text: "Hello", cache })],
        }),
      )

      const body = prepared.body as { messages: Array<{ role?: string; content: unknown }> }
      const system = body.messages[0]?.content as Array<{ cache_control?: { type: string; ttl: string } }>
      expect(Array.isArray(system) ? system.filter((part) => part.cache_control).length : 0).toBe(4)
      expect(system[0]).toMatchObject({ cache_control: { type: "ephemeral", ttl: "1h" } })
      expect(body.messages[1]).toEqual({ role: "user", content: "Hello" })
    }),
  )

  it.effect("allows OpenRouter usage accounting to be disabled", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare(
        LLM.request({
          model: OpenRouter.model("openai/gpt-4o-mini", {
            providerOptions: { openrouter: { usage: false } },
          }),
          prompt: "Hello",
        }),
      )
      expect(prepared.body).toMatchObject({ usage: { include: false } })
    }),
  )
})
