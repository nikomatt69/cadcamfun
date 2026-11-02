import { Effect, Metric, Stream } from "effect"
import type { AiEvent } from "./events.ts"
import type { AiError } from "./errors.ts"
import type { HostOperationTiming } from "./nikcli/request-timing.ts"

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

const latencyBoundaries = [100, 500, 1000, 2500, 5000, 15000, 30000, 60000, 120000]
export const aiFirstActivity = Metric.histogram("cadcamfun_ai_first_activity_ms", {
  description: "Turn start to first model content or tool activity; includes host setup",
  boundaries: latencyBoundaries
})
export const aiInterActionGap = Metric.histogram("cadcamfun_ai_inter_action_gap_ms", {
  description: "Last primary tool result to next model content or tool activity; not provider-only latency",
  boundaries: latencyBoundaries
})
export const aiToolDuration = Metric.histogram("cadcamfun_ai_tool_duration_ms", {
  description: "Observed tool call to result, including permission waits and execution",
  boundaries: latencyBoundaries
})
export const aiLoopTransitions = Metric.counter("cadcamfun_ai_loop_transitions_total", {
  description: "AI loop continuations and recoveries, by phase"
})

export const aiHostOperations = Metric.counter("cadcamfun_ai_host_operations_total", {
  description: "Host-owned permission and execution phases, including detached runs"
})
export const aiHostOperationDuration = Metric.histogram("cadcamfun_ai_host_operation_duration_ms", {
  description: "Host-owned permission wait or tool execution; permission includes classifier and human waits",
  boundaries: latencyBoundaries
})

export const observeHostOperation = (timing: HostOperationTiming): Effect.Effect<void> => {
  const labels = { tool: timing.tool, mode: timing.mode, phase: timing.phase, outcome: timing.outcome }
  return Effect.all([
    Metric.update(Metric.withAttributes(aiHostOperations, labels), 1),
    Metric.update(Metric.withAttributes(aiHostOperationDuration, labels), timing.durationMs)
  ], { discard: true })
}

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
  Stream.suspend(() => {
    let firstActivity = false
    let lastPrimaryResult: number | undefined
    const pending = new Map<string, number>()
    return stream.pipe(
      Stream.withSpan("ai.turn", {
        attributes: {
          "ai.provider": attributes.provider,
          "ai.model": attributes.model,
          "ai.session": attributes.session
        }
      }),
      Stream.tap(observeEvent),
      Stream.tap((event) => Effect.gen(function* () {
        const now = Date.now()
        const primary = !("agent" in event && event.agent !== undefined)
        const active = primary && (event.type === "tool_call" || event.type === "tool_progress" ||
          ((event.type === "delta" || event.type === "reasoning") && event.text.length > 0))
        const labels = { provider: attributes.provider, model: attributes.model }
        if (active && !firstActivity) {
          firstActivity = true
          yield* Metric.update(Metric.withAttributes(aiFirstActivity, labels), Math.max(0, now - startedAt))
        }
        if (active && lastPrimaryResult !== undefined && pending.size === 0) {
          yield* Metric.update(Metric.withAttributes(aiInterActionGap, labels), Math.max(0, now - lastPrimaryResult))
          lastPrimaryResult = undefined
        }
        if (primary && event.type === "tool_call") pending.set(event.callId, now)
        if (primary && event.type === "tool_result") {
          const began = pending.get(event.callId)
          if (began !== undefined) {
            pending.delete(event.callId)
            yield* Metric.update(Metric.withAttributes(aiToolDuration, { ...labels, tool: event.tool, outcome: event.ok ? "ok" : "error" }), Math.max(0, now - began))
            if (pending.size === 0) lastPrimaryResult = now
          }
        }
        if (event.type === "turn" && (event.phase === "continuing" || event.phase === "recovering")) {
          yield* Metric.update(Metric.withAttributes(aiLoopTransitions, { ...labels, phase: event.phase }), 1)
        }
      })),
      Stream.onExit(() => observeTurnDuration(Date.now() - startedAt))
    )
  })
