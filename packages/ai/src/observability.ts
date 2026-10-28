import { Effect, Metric, Stream } from "effect"
import type { AiEvent } from "./events.ts"
import type { AiError } from "./errors.ts"

/**
 * The AI metric catalogue.
 *
 * Effect metrics live in a process-wide registry, so a metric defined here is exported by
 * whichever runtime owns the turn: the sidecar's OTLP exporter and its Prometheus endpoint read
 * the same registry, so the two views can never disagree.
 *
 * Attributes stay low-cardinality on purpose — a provider, a tool name, an error code. A session
 * id, a prompt or a URL would multiply the series without telling an operator anything they
 * cannot read in the logs, which carry the identifiers.
 */

/** AI turns started, by provider. */
export const aiTurns = Metric.counter("cadcamfun_ai_turns_total", {
  description: "AI turns started, by provider"
})

/** How long an AI turn took, in milliseconds. */
export const aiTurnDuration = Metric.histogram("cadcamfun_ai_turn_duration_ms", {
  description: "Duration of an AI turn, in milliseconds",
  boundaries: [250, 1000, 5000, 15000, 30000, 60000, 300000]
})

/** Tokens sent to and received from the model, by kind (`input`, `output`). */
export const aiTokens = Metric.counter("cadcamfun_ai_tokens_total", {
  description: "Tokens exchanged with the model, by kind"
})

/** Tool calls executed by the agent, by tool and outcome. */
export const aiToolCalls = Metric.counter("cadcamfun_ai_tool_calls_total", {
  description: "Tool calls executed by the agent, by tool and outcome"
})

/** AI turns that ended in a failure, by error code. */
export const aiFailures = Metric.counter("cadcamfun_ai_failures_total", {
  description: "AI turns that ended in a failure, by error code"
})

const count = (metric: Metric.Counter<number>, attributes: Readonly<Record<string, string>>): Effect.Effect<void> =>
  Metric.update(Metric.withAttributes(metric, attributes), 1)

/** Counts a started AI turn. */
export const countTurn = (provider: string): Effect.Effect<void> => count(aiTurns, { provider })

/** Records the tokens a turn exchanged with the model. */
export const countTokens = (usage: { readonly inputTokens: number; readonly outputTokens: number } | undefined): Effect.Effect<void> =>
  usage === undefined
    ? Effect.void
    : Effect.all([
      Metric.update(Metric.withAttributes(aiTokens, { kind: "input" }), usage.inputTokens),
      Metric.update(Metric.withAttributes(aiTokens, { kind: "output" }), usage.outputTokens)
    ], { discard: true })

/** Counts a tool call and how it ended. */
export const countToolCall = (tool: string, ok: boolean): Effect.Effect<void> =>
  count(aiToolCalls, { tool, outcome: ok ? "ok" : "error" })

/** Counts a turn that ended in a failure. */
export const countFailure = (code: string): Effect.Effect<void> => count(aiFailures, { code })

/** Records how long a turn took. */
export const observeTurnDuration = (millis: number): Effect.Effect<void> => Metric.update(aiTurnDuration, millis)

/**
 * Records what one event of a turn implies.
 *
 * The turn's tokens are read from the `done` event, which carries the turn's own total: the
 * per-step usage of the `step` events is a part of that total, so counting both would double it.
 * A tool call is counted when its result arrives, because only the result knows how it ended.
 */
export const observeEvent = (event: AiEvent): Effect.Effect<void> => {
  switch (event.type) {
    case "done":
      return countTokens(event.usage)
    case "tool_result":
      return countToolCall(event.tool, event.ok)
    case "error":
      return countFailure(event.code)
    default:
      return Effect.void
  }
}

/**
 * Observes one AI turn.
 *
 * The turn becomes a span that carries its provider, model and session, so a trace shows which
 * model answered and how long it took; the metrics follow the events the turn emits and its
 * duration is recorded when the stream ends, whether it ended with an answer or with a failure.
 */
export const observedTurn = (
  stream: Stream.Stream<AiEvent, AiError>,
  startedAt: number,
  attributes: { readonly provider: string; readonly model: string; readonly session: string }
): Stream.Stream<AiEvent, AiError> =>
  stream.pipe(
    Stream.withSpan("ai.turn", {
      attributes: {
        "ai.provider": attributes.provider,
        "ai.model": attributes.model,
        "ai.session": attributes.session
      }
    }),
    Stream.tap(observeEvent),
    Stream.onExit(() => observeTurnDuration(Date.now() - startedAt))
  )
