import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { HttpClientRequest } from "effect/http"
import { LLM } from "../../src"
import * as GoogleVertex from "../../src/providers/google-vertex"
import { LLMClient } from "../../src/route"
import { it } from "../lib/effect"
import { dynamicResponse } from "../lib/http"
import { sseEvents } from "../lib/sse"

const geminiReply = sseEvents({
  candidates: [{ content: { role: "model", parts: [{ text: "ok" }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
})

const anthropicReply = sseEvents(
  { type: "message_start", message: { id: "m", usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
  { type: "message_stop" },
)

const headers = { "content-type": "text/event-stream" }

describe("Google Vertex routes", () => {
  it.effect("sends Gemini to the regional publisher endpoint with a bearer token", () =>
    LLMClient.generate(
      LLM.request({
        model: GoogleVertex.gemini("gemini-2.5-pro", { project: "proj", location: "us-east5", apiKey: "token-1" }),
        prompt: "hi",
      }),
    ).pipe(
      Effect.map((response) => expect(response.text).toBe("ok")),
      Effect.provide(
        dynamicResponse((input) =>
          Effect.gen(function* () {
            const web = yield* HttpClientRequest.toWeb(input.request).pipe(Effect.orDie)
            expect(web.url).toBe(
              "https://us-east5-aiplatform.googleapis.com/v1/projects/proj/locations/us-east5/publishers/google/models/gemini-2.5-pro:streamGenerateContent?alt=sse",
            )
            expect(web.headers.get("authorization")).toBe("Bearer token-1")
            expect(web.headers.get("x-goog-api-key")).toBeNull()
            return input.respond(geminiReply, { headers })
          }),
        ),
      ),
    ),
  )

  it.effect("uses the global host for the global location", () =>
    LLMClient.generate(
      LLM.request({
        model: GoogleVertex.gemini("gemini-2.5-flash", { project: "proj", location: "global", apiKey: "t" }),
        prompt: "hi",
      }),
    ).pipe(
      Effect.provide(
        dynamicResponse((input) =>
          Effect.gen(function* () {
            const web = yield* HttpClientRequest.toWeb(input.request).pipe(Effect.orDie)
            expect(web.url.startsWith("https://aiplatform.googleapis.com/v1/projects/proj/locations/global/")).toBe(
              true,
            )
            return input.respond(geminiReply, { headers })
          }),
        ),
      ),
    ),
  )

  it.effect("sends Claude to streamRawPredict without a model field and with the Vertex version", () =>
    LLMClient.generate(
      LLM.request({
        model: GoogleVertex.claude("claude-sonnet-4-5@20250929", {
          project: "proj",
          location: "us-east5",
          apiKey: "t",
        }),
        prompt: "hi",
        generation: { maxTokens: 50 },
      }),
    ).pipe(
      Effect.map((response) => expect(response.text).toBe("ok")),
      Effect.provide(
        dynamicResponse((input) =>
          Effect.gen(function* () {
            const web = yield* HttpClientRequest.toWeb(input.request).pipe(Effect.orDie)
            expect(web.url).toBe(
              "https://us-east5-aiplatform.googleapis.com/v1/projects/proj/locations/us-east5/publishers/anthropic/models/claude-sonnet-4-5@20250929:streamRawPredict",
            )
            expect(web.headers.get("authorization")).toBe("Bearer t")
            const body = JSON.parse(input.text)
            expect(body.model).toBeUndefined()
            expect(body.anthropic_version).toBe("vertex-2023-10-16")
            expect(body.stream).toBe(true)
            expect(body.messages[0].content[0].text).toBe("hi")
            return input.respond(anthropicReply, { headers })
          }),
        ),
      ),
    ),
  )
})
