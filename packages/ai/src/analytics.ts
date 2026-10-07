/**
 * AI usage analytics (legacy `.reference/src/lib/ai/aiAnalytics.ts` + `aiPerformanceMonitor.ts`,
 * ported to Effect and stripped of the renderer-only bits).
 *
 * The legacy kept everything in module-singleton state with `localStorage` round-trips; the
 * sidecar process is a single owner and we keep the ring buffer in memory. The shape of
 * the events is unchanged so anything that already inspects them keeps working.
 *
 * Tracking is opt-in: callers wrap their Effect with `timed(ai, "chat", model, () => …)` and
 * `recordError` is called explicitly for failures not surfaced through `timed`.
 */
import { Cause, Context, Effect, Layer, Ref } from "effect"

export type AnalyticsEventType = "request" | "response" | "error" | "feedback"

export interface AnalyticsEvent {
  readonly eventType: AnalyticsEventType
  readonly eventName: string
  readonly timestamp: number
  readonly duration?: number
  readonly model?: string
  readonly promptTokens?: number
  readonly completionTokens?: number
  readonly success?: boolean
  readonly errorType?: string
  readonly feedbackRating?: number
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface AnalyticsStats {
  readonly totalRequests: number
  readonly successRate: number
  readonly averageDurationMs: number
  readonly totalTokens: number
  readonly eventCount: number
  readonly modelUsage: Readonly<Record<string, number>>
}

/** Maximum number of events kept in the ring buffer (mirrors the legacy 1000). */
const RING_BUFFER_SIZE = 1000

export class AiAnalytics extends Context.Service<
  AiAnalytics,
  {
    /** Track any event (the legacy was a plain `trackEvent` method). */
    track(event: Omit<AnalyticsEvent, "timestamp">): Effect.Effect<void>
    /** Convenience: `requestStart`-then-`complete` pair, returning a `requestId`. */
    startRequest(name: string, model: string, metadata?: Readonly<Record<string, unknown>>): Effect.Effect<string>
    completeRequest(input: {
      readonly requestId: string
      readonly durationMs: number
      readonly success: boolean
      readonly promptTokens?: number
      readonly completionTokens?: number
    }): Effect.Effect<void>
    trackError(requestId: string, errorType: string, metadata?: Readonly<Record<string, unknown>>): Effect.Effect<void>
    trackFeedback(requestId: string, rating: number, comment?: string): Effect.Effect<void>
    /** Aggregate stats over every event still in the buffer. */
    stats: Effect.Effect<AnalyticsStats>
    /** Last `seconds` worth of events (legacy `getRecentEvents`). */
    recent(seconds: number): Effect.Effect<ReadonlyArray<AnalyticsEvent>>
    /** Drop the buffer; the layer does this on finalizer. */
    clear: Effect.Effect<void>
    /**
     * Wrap an Effect: starts a request, runs the effect, on success records duration+usage,
     * on failure records an error event tagged with `AiError._tag` and re-throws.
     * The metadata gets `requestId` added so callers can join the resulting events.
     */
    timed<A, E>(
      name: string,
      model: string,
      metadata: Readonly<Record<string, unknown>> | undefined,
      effect: Effect.Effect<A, E, never>
    ): Effect.Effect<A, E, never>
  }
>()("cadcamfun/AiAnalytics") {
  static readonly layer: Layer.Layer<AiAnalytics> = Layer.effect(
    AiAnalytics,
    Effect.gen(function* () {
      const state = yield* Ref.make<AnalyticsEvent[]>([])

      const push = (event: AnalyticsEvent): Effect.Effect<void> =>
        Ref.update(state, (events) => {
          const next = events.length >= RING_BUFFER_SIZE ? events.slice(-(RING_BUFFER_SIZE - 1)) : events.slice()
          next.push(event)
          return next
        }).pipe(Effect.asVoid)

      const pushIfEnabled = (event: AnalyticsEvent): Effect.Effect<void> => push(event)

      const track = (event: Omit<AnalyticsEvent, "timestamp">): Effect.Effect<void> =>
        pushIfEnabled({ ...event, timestamp: Date.now() })

      const startRequest = (
        name: string,
        model: string,
        metadata?: Readonly<Record<string, unknown>>
      ): Effect.Effect<string> =>
        Effect.gen(function* () {
          const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
          yield* track({
            eventType: "request",
            eventName: name,
            model,
            metadata: { ...(metadata ?? {}), requestId }
          })
          return requestId
        })

      const completeRequest = (input: {
        readonly requestId: string
        readonly durationMs: number
        readonly success: boolean
        readonly promptTokens?: number
        readonly completionTokens?: number
      }): Effect.Effect<void> =>
        track({
          eventType: "response",
          eventName: "request_complete",
          duration: input.durationMs,
          success: input.success,
          ...(input.promptTokens !== undefined ? { promptTokens: input.promptTokens } : {}),
          ...(input.completionTokens !== undefined ? { completionTokens: input.completionTokens } : {}),
          metadata: { requestId: input.requestId }
        })

      const trackError = (
        requestId: string,
        errorType: string,
        metadata?: Readonly<Record<string, unknown>>
      ): Effect.Effect<void> =>
        track({
          eventType: "error",
          eventName: "request_error",
          errorType,
          success: false,
          metadata: { ...(metadata ?? {}), requestId }
        })

      const trackFeedback = (requestId: string, rating: number, comment?: string): Effect.Effect<void> =>
        track({
          eventType: "feedback",
          eventName: "user_feedback",
          feedbackRating: rating,
          metadata: comment !== undefined ? { requestId, comment } : { requestId }
        })

      const stats = Effect.gen(function* () {
        const events = yield* Ref.get(state)
        const totalRequests = events.filter((e) => e.eventType === "request").length
        const responses = events.filter((e) => e.eventType === "response")
        const successful = responses.filter((e) => e.success === true).length
        const durations = responses.map((e) => e.duration ?? 0)
        const totalTokens = events.reduce(
          (sum, e) => sum + (e.promptTokens ?? 0) + (e.completionTokens ?? 0),
          0
        )
        const modelUsage: Record<string, number> = {}
        for (const e of events) {
          if (e.model !== undefined) modelUsage[e.model] = (modelUsage[e.model] ?? 0) + 1
        }
        return {
          totalRequests,
          successRate: totalRequests === 0 ? 0 : successful / totalRequests,
          averageDurationMs: durations.length === 0 ? 0 : durations.reduce((a, b) => a + b, 0) / durations.length,
          totalTokens,
          eventCount: events.length,
          modelUsage
        }
      })

      const recent = (seconds: number): Effect.Effect<ReadonlyArray<AnalyticsEvent>> =>
        Effect.gen(function* () {
          const cutoff = Date.now() - seconds * 1_000
          return (yield* Ref.get(state)).filter((event) => event.timestamp >= cutoff)
        })

      const clear = Ref.set(state, []).pipe(Effect.asVoid)

      const timed = <A, E>(
        name: string,
        model: string,
        metadata: Readonly<Record<string, unknown>> | undefined,
        effect: Effect.Effect<A, E, never>
      ): Effect.Effect<A, E, never> =>
        Effect.gen(function* () {
          const requestId = yield* startRequest(name, model, metadata)
          const start = Date.now()
          const outcome = yield* Effect.exit(effect)
          const duration = Date.now() - start
          if (outcome._tag === "Success") {
            yield* completeRequest({ requestId, durationMs: duration, success: true })
            return outcome.value
          }
          yield* completeRequest({ requestId, durationMs: duration, success: false })
          const tag = extractErrorTag(outcome.cause)
          yield* trackError(requestId, tag)
          return yield* Effect.failCause(outcome.cause)
        })

      return AiAnalytics.of({
        track,
        startRequest,
        completeRequest,
        trackError,
        trackFeedback,
        stats,
        recent,
        clear,
        timed
      })
    })
  )
}

/** Pull a stable string from a `Cause` for the analytics buffer. */
const extractErrorTag = <E>(cause: Cause.Cause<E>): string => {
  for (const reason of cause.reasons as ReadonlyArray<{ _tag: string; error?: unknown }>) {
    if (reason._tag === "Fail") {
      const e = reason.error as { _tag?: string } | undefined
      return e?._tag ?? "fail"
    }
  }
  const tags = (cause.reasons as ReadonlyArray<{ _tag: string }>).map((r) => r._tag)
  return tags.length > 0 ? tags.join(",") : "empty"
}