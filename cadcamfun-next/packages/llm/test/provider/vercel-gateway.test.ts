import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { HttpClientRequest } from "effect/http"
import { LLM } from "../../src"
import * as VercelGateway from "../../src/providers/vercel-gateway"
import { LLMClient } from "../../src/route"
import { it } from "../lib/effect"
import { dynamicResponse } from "../lib/http"
import { deltaChunk, finishChunk } from "../lib/openai-chunks"
import { sseEvents } from "../lib/sse"

const model = VercelGateway.model("anthropic/claude-sonnet-5", { apiKey: "gw-key" })

describe("Vercel AI Gateway route", () => {
  it.effect("targets the gateway's chat completions endpoint with a bearer key", () =>
    LLMClient.generate(LLM.request({ model, prompt: "hi" })).pipe(
      Effect.provide(
        dynamicResponse((input) =>
          Effect.gen(function* () {
            const web = yield* HttpClientRequest.toWeb(input.request).pipe(Effect.orDie)
            expect(web.url).toBe("https://ai-gateway.vercel.sh/v1/chat/completions")
            expect(web.headers.get("authorization")).toBe("Bearer gw-key")
            return input.respond(sseEvents(deltaChunk({ role: "assistant", content: "ok" }), finishChunk("stop")), {
              headers: { "content-type": "text/event-stream" },
            })
          }),
        ),
      ),
    ),
  )

  it.effect("sends routing and upstream options as a top-level providerOptions object", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare<VercelGateway.VercelGatewayBody>(
        LLM.request({
          model,
          prompt: "hi",
          providerOptions: {
            gateway: { order: ["vertex", "anthropic"], sort: "tps" },
            anthropic: { thinking: { type: "enabled", budgetTokens: 2000 } },
          },
        }),
      )
      expect(prepared.body.providerOptions).toEqual({
        gateway: { order: ["vertex", "anthropic"], sort: "tps" },
        anthropic: { thinking: { type: "enabled", budgetTokens: 2000 } },
      })
    }),
  )

  it.effect("omits providerOptions when there are none", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare<VercelGateway.VercelGatewayBody>(LLM.request({ model, prompt: "hi" }))
      expect("providerOptions" in prepared.body).toBe(false)
    }),
  )

  it.effect("places cache_control on at most four messages", () =>
    Effect.gen(function* () {
      const prepared = yield* LLMClient.prepare<VercelGateway.VercelGatewayBody>(
        LLM.request({
          model,
          system: "be brief",
          messages: [LLM.user("a"), LLM.assistant("b"), LLM.user("c"), LLM.assistant("d"), LLM.user("e")],
        }),
      )
      const marked = JSON.stringify(prepared.body.messages).split("cache_control").length - 1
      expect(marked).toBeGreaterThan(0)
      expect(marked).toBeLessThanOrEqual(4)
    }),
  )
})
