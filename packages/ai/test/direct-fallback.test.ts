import { describe, expect, test } from "bun:test"
import { APICallError, simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { Clock, Effect, Layer, Redacted, Stream } from "effect"
import { recordingClock } from "./helpers/recording-clock.ts"
import { AiConfig } from "../src/ai-config.ts"
import { AiCredentials } from "../src/credentials.ts"
import { DirectModel, type DirectStreamPart, type LanguageModelFactory } from "../src/direct-model.ts"
import type { ModelSelector } from "../src/models.ts"

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined }
}
const stream = (...texts: string[]) =>
  new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "1" },
          ...texts.map((delta) => ({ type: "text-delta" as const, id: "1", delta })),
          { type: "text-end", id: "1" },
          { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage }
        ]
      })
    })
  })
const down = () =>
  new MockLanguageModelV4({
    doStream: async () => {
      throw new APICallError({ message: "overloaded", url: "https://api.test", requestBodyValues: {}, statusCode: 503 })
    }
  })
/** Streams "one", then fails mid-answer (chunks are pulled one at a time: `controller.error` would discard queued ones). */
const dropsMidway = () =>
  new MockLanguageModelV4({
    doStream: async () => {
      const chunks = [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "1" }, { type: "text-delta", id: "1", delta: "one" }]
      let next = 0
      return {
        stream: new ReadableStream({
          pull(controller) {
            if (next < chunks.length) controller.enqueue(chunks[next++] as never)
            else controller.error(new APICallError({ message: "connection reset", url: "https://api.test", requestBodyValues: {}, statusCode: 503 }))
          }
        })
      }
    }
  })

const run = async (models: Record<string, MockLanguageModelV4>, selector?: ModelSelector) => {
  const used: string[] = []
  const factory: LanguageModelFactory = (resolved) => {
    used.push(resolved.provider)
    return models[resolved.provider]!
  }
  const layer = DirectModel.layerWith(factory).pipe(
    Layer.provideMerge(AiCredentials.layer),
    Layer.provide(AiConfig.layer({ dataDir: "/unused", forceGateway: false }))
  )
  const program = Effect.gen(function* () {
    const credentials = yield* AiCredentials
    for (const provider of Object.keys(models)) yield* credentials.set(provider, Redacted.make(`sk-${provider}-sentinel-1234`))
    return yield* (yield* DirectModel).streamText({ prompt: "hi", ...(selector ? { model: selector } : {}) }).pipe(Stream.runCollect, Effect.exit)
  })
  const exit = await Effect.runPromise(program.pipe(Effect.provide(layer), Effect.provideService(Clock.Clock, recordingClock())))
  return { exit, used }
}

const deltas = (exit: { _tag: string; value?: ReadonlyArray<DirectStreamPart> }): string[] =>
  exit._tag === "Success" ? [...(exit.value ?? [])].flatMap((p) => (p.type === "delta" ? [p.text] : [])) : []

describe("a stream that fails before it says anything is run on another route (nikcli's withStreamFallback)", () => {
  test("the first configured provider is down: the next one answers", async () => {
    const { exit, used } = await run({ anthropic: down(), openai: stream("fallback ", "answer") })
    expect(deltas(exit as never)).toEqual(["fallback ", "answer"])
    expect(used).toEqual(["anthropic", "openai"])
  })

  test("a provider the caller pinned is not swapped behind their back", async () => {
    const { exit, used } = await run({ anthropic: down(), openai: stream("x") }, { provider: "anthropic" })
    expect(exit._tag).toBe("Failure")
    expect(used).toEqual(["anthropic"])
  })

  test("output that was already sent is never replayed on another route", async () => {
    const { exit, used } = await run({ anthropic: dropsMidway(), openai: stream("again") })
    expect(exit._tag).toBe("Failure")
    expect(used).toEqual(["anthropic"])
  })

  test("with nowhere to fall back to, the original error is reported", async () => {
    const { exit } = await run({ anthropic: down() })
    expect(exit._tag).toBe("Failure")
    expect(JSON.stringify(exit)).toContain("overloaded")
  })
})
