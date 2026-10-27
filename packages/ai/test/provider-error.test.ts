import { describe, expect, test } from "bun:test"
import { formatOverflowMessage, isContextOverflowError, parseApiFailure, parseStreamError } from "../src/provider-error.ts"
import { RETRY_MAX_DELAY_NO_HEADERS, delay, providerRetry, retryable } from "../src/retry.ts"
import type { ApiFailure } from "../src/provider-error.ts"
import { Clock, Effect, Fiber } from "effect"
import { recordingClock } from "./helpers/recording-clock.ts"
import { isTransientFailure } from "../src/nikcli/chat.ts"

describe("provider failures are classified like nikcli does", () => {
  test("every provider's context-overflow wording is an overflow, not an outage", () => {
    for (const message of [
      "prompt is too long: 250000 tokens > 200000 maximum",
      "This model's maximum context length is 128000 tokens",
      "Your input exceeds the context window of this model",
      "context_length_exceeded",
      "Input length exceeds the model context length"
    ]) {
      expect(parseApiFailure({ message, statusCode: 400 }).type).toBe("context_overflow")
      expect(isContextOverflowError(message)).toBe(true)
      expect(isTransientFailure(message)).toBe(false)
    }
    expect(parseApiFailure({ message: "400 status code (no body)" }).type).toBe("context_overflow")
  })

  test("413 and request-too-large are a payload problem", () => {
    expect(parseApiFailure({ message: "nope", statusCode: 413 }).type).toBe("payload_too_large")
    expect(parseApiFailure({ message: "x", responseBody: '{"error":{"type":"request_too_large"}}' }).type).toBe("payload_too_large")
  })

  test("everything else is an api error, retryable by status unless the provider says so", () => {
    expect(parseApiFailure({ message: "slow down", statusCode: 429 })).toMatchObject({ type: "api_error", isRetryable: true })
    expect(parseApiFailure({ message: "bad key", statusCode: 401 })).toMatchObject({ type: "api_error", isRetryable: false })
    expect(parseApiFailure({ message: "x", statusCode: 400, isRetryable: true })).toMatchObject({ isRetryable: true })
  })

  test("stream error bodies", () => {
    expect(parseStreamError('{"type":"error","error":{"code":"context_length_exceeded","message":"too big"}}')).toEqual({ type: "context_overflow", message: "too big" })
    expect(parseStreamError('{"type":"error","error":{"code":"rate_limit_exceeded"}}')).toBeUndefined()
    expect(parseStreamError('{"type":"error","error":{"message":"payload too large"}}')?.type).toBe("payload_too_large")
    expect(parseStreamError("prompt is too long")?.type).toBe("context_overflow")
    expect(parseStreamError("all fine")).toBeUndefined()
  })

  test("errors are recognised by name, message or data", () => {
    expect(isContextOverflowError(Object.assign(new Error("x"), { name: "ContextOverflowError" }))).toBe(true)
    expect(isContextOverflowError({ data: { type: "context_overflow" } })).toBe(true)
    expect(isContextOverflowError(new Error("socket hang up"))).toBe(false)
  })

  test("the overflow message names provider, model and the way out", () => {
    const text = formatOverflowMessage("anthropic", "claude-sonnet-5-5")
    expect(text).toContain("Provider: anthropic")
    expect(text).toContain("Model: claude-sonnet-5-5")
    expect(text).toContain("larger context window")
  })
})

describe("retry", () => {
  test("waiting follows the provider's retry-after, in ms, seconds or a date", () => {
    expect(delay(1, { responseHeaders: { "retry-after-ms": "750" } })).toBe(750)
    expect(delay(1, { responseHeaders: { "retry-after": "3" } })).toBe(3000)
    const inTenSeconds = new Date(Date.now() + 10_000).toUTCString()
    const waited = delay(1, { responseHeaders: { "retry-after": inTenSeconds } })
    expect(waited).toBeGreaterThan(8000)
    expect(waited).toBeLessThanOrEqual(10_000)
  })

  test("without headers it doubles from 2 s with 10% jitter and never passes 30 s", () => {
    for (const [attempt, base] of [[1, 2000], [2, 4000], [3, 8000]] as const) {
      const waited = delay(attempt)
      expect(waited).toBeGreaterThanOrEqual(base)
      expect(waited).toBeLessThanOrEqual(base * 1.1)
    }
    expect(delay(20)).toBe(RETRY_MAX_DELAY_NO_HEADERS)
  })

  test("transient failures get a readable message, the rest are not retried", () => {
    expect(retryable({ message: "x", statusCode: 503, responseBody: '{"error":{"type":"overloaded_error"}}' })).toBe("Provider is overloaded")
    expect(retryable({ message: "x", statusCode: 429, responseBody: '{"type":"error","error":{"type":"too_many_requests"}}' })).toBe("Too Many Requests")
    expect(retryable({ message: "boom", statusCode: 500, isRetryable: false })).toBe("boom")
    expect(retryable({ message: "invalid api key", statusCode: 401 })).toBeUndefined()
    expect(retryable({ message: "prompt is too long", statusCode: 400, isRetryable: true })).toBeUndefined()
  })

  test("the retry schedule asks again while the failure is transient, with nikcli's pauses, up to the attempt limit", async () => {
    const failures: ReadonlyArray<ApiFailure> = [
      { message: "busy", statusCode: 503 },
      { message: "slow down", statusCode: 429, isRetryable: true, responseHeaders: { "retry-after": "7" } },
      { message: "busy", statusCode: 503 }
    ]
    let calls = 0
    const waits: number[] = []
    const call = Effect.suspend(() => {
      const failure = failures[calls++]
      return failure === undefined ? Effect.succeed("ok") : Effect.fail(failure)
    })
    const answer = await Effect.runPromise(call.pipe(Effect.retry(providerRetry<ApiFailure>(5, (f) => f)), Effect.provideService(Clock.Clock, recordingClock(waits))))
    expect(answer).toBe("ok")
    expect(calls).toBe(4)
    expect(waits).toHaveLength(3)
    expect(waits[0]!).toBeGreaterThanOrEqual(2_000)
    expect(waits[1]).toBe(7_000)
    expect(waits[2]!).toBeGreaterThanOrEqual(8_000)

    // Not transient: no second call. Out of attempts: the last failure is the answer.
    calls = 0
    const denied = await Effect.runPromise(Effect.flip(Effect.suspend(() => { calls++; return Effect.fail<ApiFailure>({ message: "invalid api key", statusCode: 401 }) })
      .pipe(Effect.retry(providerRetry<ApiFailure>(5, (f) => f)), Effect.provideService(Clock.Clock, recordingClock()))))
    expect(denied.statusCode).toBe(401)
    expect(calls).toBe(1)
    calls = 0
    await Effect.runPromise(Effect.flip(Effect.suspend(() => { calls++; return Effect.fail<ApiFailure>({ message: "busy", statusCode: 503 }) })
      .pipe(Effect.retry(providerRetry<ApiFailure>(3, (f) => f)), Effect.provideService(Clock.Clock, recordingClock()))))
    expect(calls).toBe(3)
  })

  test("interrupting a retry ends its pause at once", async () => {
    const fiber = Effect.runFork(Effect.fail<ApiFailure>({ message: "busy", statusCode: 503 }).pipe(Effect.retry(providerRetry<ApiFailure>(5, (f) => f))))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const started = performance.now()
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(performance.now() - started).toBeLessThan(500)
  })
})
