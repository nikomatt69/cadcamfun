import { describe, expect, test } from "bun:test"
import { Effect, Layer, Metric, Stream, Tracer } from "effect"
import { AiProviderError } from "../src/errors.ts"
import type { AiEvent } from "../src/events.ts"
import { countTurn, observeEvent, observedTurn } from "../src/observability.ts"

/**
 * Metrics live in the registry of the runtime that runs the effect, so every measurement
 * here happens inside one program: read, act, read again.
 */
const measure = <A>(program: Effect.Effect<A, never, never>): Promise<A> => Effect.runPromise(program)

const counterOf = (id: string, attributes: Record<string, string>) =>
  Metric.snapshot.pipe(
    Effect.map((all) => {
      const entry = all.find((candidate) =>
        candidate.id === id &&
        Object.entries(attributes).every(([key, value]) => candidate.attributes?.[key] === value)
      )
      return entry?.type === "Counter" ? Number(entry.state.count) : 0
    })
  )

const histogramCountOf = (id: string) =>
  Metric.snapshot.pipe(
    Effect.map((all) => {
      const entry = all.find((candidate) => candidate.id === id)
      return entry?.type === "Histogram" ? entry.state.count : 0
    })
  )

describe("the AI metric catalogue", () => {
  test("a started turn is counted by provider", async () => {
    const delta = await measure(Effect.gen(function*() {
      const before = yield* counterOf("cadcamfun_ai_turns_total", { provider: "test-provider" })
      yield* countTurn("test-provider")
      return (yield* counterOf("cadcamfun_ai_turns_total", { provider: "test-provider" })) - before
    }))
    expect(delta).toBe(1)
  })

  test("the done event counts its tokens once, by kind", async () => {
    const deltas = await measure(Effect.gen(function*() {
      const inputBefore = yield* counterOf("cadcamfun_ai_tokens_total", { kind: "input" })
      const outputBefore = yield* counterOf("cadcamfun_ai_tokens_total", { kind: "output" })
      yield* observeEvent({ type: "done", sessionId: "s", text: "", usage: { inputTokens: 120, outputTokens: 30 } })
      return [
        (yield* counterOf("cadcamfun_ai_tokens_total", { kind: "input" })) - inputBefore,
        (yield* counterOf("cadcamfun_ai_tokens_total", { kind: "output" })) - outputBefore
      ]
    }))
    expect(deltas).toEqual([120, 30])
  })

  test("a step event does not double-count the tokens the done event reports", async () => {
    const delta = await measure(Effect.gen(function*() {
      const before = yield* counterOf("cadcamfun_ai_tokens_total", { kind: "input" })
      yield* observeEvent({ type: "step", sessionId: "s", phase: "finish", index: 1, usage: { inputTokens: 999, outputTokens: 1 } })
      return (yield* counterOf("cadcamfun_ai_tokens_total", { kind: "input" })) - before
    }))
    expect(delta).toBe(0)
  })

  test("a tool result is counted by tool and outcome, a failure by its code", async () => {
    const deltas = await measure(Effect.gen(function*() {
      const okBefore = yield* counterOf("cadcamfun_ai_tool_calls_total", { tool: "test_tool", outcome: "ok" })
      const failBefore = yield* counterOf("cadcamfun_ai_failures_total", { code: "provider" })
      yield* observeEvent({ type: "tool_result", sessionId: "s", callId: "c1", tool: "test_tool", ok: true, output: "" })
      yield* observeEvent({ type: "error", sessionId: "s", code: "provider", message: "down" })
      return [
        (yield* counterOf("cadcamfun_ai_tool_calls_total", { tool: "test_tool", outcome: "ok" })) - okBefore,
        (yield* counterOf("cadcamfun_ai_failures_total", { code: "provider" })) - failBefore
      ]
    }))
    expect(deltas).toEqual([1, 1])
  })
})

describe("observedTurn", () => {
  test("events pass through untouched, the duration is recorded and the turn becomes a span", async () => {
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      }
    })
    const events: Array<AiEvent> = [
      { type: "tool_result", sessionId: "s1", callId: "c1", tool: "test_tool", ok: false, output: "" },
      { type: "done", sessionId: "s1", text: "answer", usage: { inputTokens: 10, outputTokens: 5 } }
    ]
    const result = await Effect.runPromise(Effect.gen(function*() {
      const errorsBefore = yield* counterOf("cadcamfun_ai_tool_calls_total", { tool: "test_tool", outcome: "error" })
      const durationBefore = yield* histogramCountOf("cadcamfun_ai_turn_duration_ms")
      const collected = yield* Stream.runCollect(observedTurn(Stream.fromIterable(events), Date.now(), { provider: "test-provider", model: "test-model", session: "s1" }))
      return {
        collected: [...collected],
        errorDelta: (yield* counterOf("cadcamfun_ai_tool_calls_total", { tool: "test_tool", outcome: "error" })) - errorsBefore,
        durationDelta: (yield* histogramCountOf("cadcamfun_ai_turn_duration_ms")) - durationBefore
      }
    }).pipe(Effect.provide(Layer.succeed(Tracer.Tracer, tracer))))

    expect(result.collected).toEqual(events)
    expect(result.errorDelta).toBe(1)
    expect(result.durationDelta).toBe(1)
    const turn = spans.find((span) => span.name === "ai.turn")
    expect(turn).toBeDefined()
    expect(turn?.attributes.get("ai.provider")).toBe("test-provider")
    expect(turn?.attributes.get("ai.model")).toBe("test-model")
    expect(turn?.attributes.get("ai.session")).toBe("s1")
  })

  test("the duration is recorded even when the stream fails", async () => {
    const result = await Effect.runPromise(Effect.gen(function*() {
      const durationBefore = yield* histogramCountOf("cadcamfun_ai_turn_duration_ms")
      const exit = yield* Effect.exit(Stream.runCollect(observedTurn(
        Stream.fail(new AiProviderError({ message: "down" })),
        Date.now(),
        { provider: "test-provider", model: "test-model", session: "s2" }
      )))
      return { failed: exit._tag === "Failure", durationDelta: (yield* histogramCountOf("cadcamfun_ai_turn_duration_ms")) - durationBefore }
    }))
    expect(result.failed).toBe(true)
    expect(result.durationDelta).toBe(1)
  })
})
