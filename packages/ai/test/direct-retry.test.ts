import { describe, expect, test } from "bun:test"
import { APICallError } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { Clock, Effect, Exit, Layer, Redacted } from "effect"
import { recordingClock } from "./helpers/recording-clock.ts"
import { AiConfig } from "../src/ai-config.ts"
import { AiCredentials } from "../src/credentials.ts"
import { DirectModel } from "../src/direct-model.ts"
import { AiProviderError } from "../src/errors.ts"

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined }
}
const apiError = (statusCode: number, message: string, extra: Partial<ConstructorParameters<typeof APICallError>[0]> = {}) =>
  new APICallError({ message, url: "https://api.test/v1", requestBodyValues: {}, statusCode, ...extra })

/** A model that fails with each of `failures` in turn, then answers. */
const flaky = (failures: ReadonlyArray<unknown>) => {
  let calls = 0
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      const failure = failures[calls]
      calls += 1
      if (failure !== undefined) throw failure
      return { content: [{ type: "text", text: "ok" }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }
    }
  })
  return { model, calls: () => calls }
}

const run = (model: MockLanguageModelV4, waits: number[] = []) => {
  const layer = DirectModel.layerWith(() => model).pipe(
    Layer.provideMerge(AiCredentials.layer),
    Layer.provide(AiConfig.layer({ dataDir: "/unused", forceGateway: false }))
  )
  const program = Effect.gen(function* () {
    yield* (yield* AiCredentials).set("anthropic", Redacted.make("sk-retry-sentinel-1234"))
    return yield* (yield* DirectModel).generateText({ prompt: "hi" })
  })
  return Effect.runPromiseExit(program.pipe(Effect.provide(layer), Effect.provideService(Clock.Clock, recordingClock(waits))))
}

describe("DirectModel retries the way nikcli does", () => {
  test("an overloaded provider is asked again after a growing pause, then answers", async () => {
    const { model, calls } = flaky([apiError(529, "Overloaded"), apiError(503, "unavailable")])
    const waits: number[] = []
    const exit = await run(model, waits)
    expect(Exit.isSuccess(exit) && exit.value.text).toBe("ok")
    expect(calls()).toBe(3)
    expect(waits).toHaveLength(2)
    expect(waits[1]!).toBeGreaterThan(waits[0]!)
  })

  test("retry-after from the provider sets the pause", async () => {
    const { model } = flaky([apiError(429, "slow down", { responseHeaders: { "retry-after": "7" } })])
    const waits: number[] = []
    await run(model, waits)
    expect(waits).toEqual([7000])
  })

  test("a bad key is not retried", async () => {
    const { model, calls } = flaky([apiError(401, "invalid x-api-key")])
    const exit = await run(model)
    expect(Exit.isFailure(exit)).toBe(true)
    expect(calls()).toBe(1)
  })

  test("it gives up after five attempts and reports a retryable provider error", async () => {
    const { model, calls } = flaky(Array.from({ length: 9 }, () => apiError(503, "still down")))
    const exit = await run(model)
    expect(calls()).toBe(5)
    const error = Exit.isFailure(exit) ? exit.cause.reasons.find((r) => r._tag === "Fail")?.error : undefined
    expect(error).toBeInstanceOf(AiProviderError)
    expect((error as AiProviderError).retryable).toBe(true)
  })

  test("a context overflow is not retried and says what to do", async () => {
    const { model, calls } = flaky([apiError(400, "prompt is too long: 300000 tokens > 200000 maximum")])
    const exit = await run(model)
    expect(calls()).toBe(1)
    const error = Exit.isFailure(exit) ? (exit.cause.reasons.find((r) => r._tag === "Fail")?.error as AiProviderError) : undefined
    expect(error?.retryable).toBe(false)
    expect(error?.message).toContain("exceeded the model's context limit")
    expect(error?.message).not.toContain("sk-retry-sentinel")
  })
})
