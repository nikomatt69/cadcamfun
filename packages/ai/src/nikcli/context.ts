/// <reference path="./sdk-next.d.ts" />
import { Effect } from "effect"
import { AiConfigError, AiProviderError } from "../errors.ts"
import { describeHostFailure } from "./chat.ts"
import { deliveredObservationDigest } from "../context-assembly.ts"
import type { ProjectHost } from "./runtime.ts"

export interface HostContextPolicy {
  readonly source: "host-config"
  readonly auto: boolean
  readonly prune: boolean
  /** Absent means the host computes its model-dependent default. */
  readonly reserved?: number
}

/** Read effective configuration without making a model call or inventing usage. */
export const readHostContextPolicy = (host: ProjectHost): Effect.Effect<HostContextPolicy, AiConfigError> =>
  Effect.tryPromise({
    try: async () => {
      const config = await host.client.config.get()
      const raw = config["compaction"]
      const settings = raw !== null && typeof raw === "object" ? raw as Record<string, unknown> : {}
      const reserved = settings["reserved"]
      return {
        source: "host-config" as const,
        auto: settings["auto"] !== false,
        prune: settings["prune"] !== false,
        ...(typeof reserved === "number" ? { reserved } : {})
      }
    },
    catch: (cause) => new AiConfigError({ message: `Failed to read context policy: ${describeHostFailure(cause)}` })
  })

/** Explicit compaction remains available even when automatic compaction is off. */
export const compactHostSession = (
  host: ProjectHost,
  sessionId: string,
  model: { readonly providerID: string; readonly modelID: string }
): Effect.Effect<void, AiProviderError> =>
  Effect.tryPromise({
    try: async (signal) => {
      const before = await host.client.session.messages({ sessionID: sessionId }, { signal })
      const previousIds = new Set(before.map((message) => message.info.id))
      await host.client.session.summarize({ sessionID: sessionId, ...model, auto: false }, { signal })
      // The endpoint returns true even if the summarizer stored a model error.
      const messages = await host.client.session.messages({ sessionID: sessionId }, { signal })
      const summary = messages.findLast((message) => message.info.summary === true && !previousIds.has(message.info.id))
      if (!summary) throw new Error("The host did not produce a compaction summary.")
      if (summary.info.error) throw new Error(summary.info.error.data?.message ?? summary.info.error.name ?? "Compaction failed.")
    },
    catch: (cause) => new AiProviderError({ message: `Failed to compact the session: ${describeHostFailure(cause)}` })
  })

/** Where the tokens of the next request go, by category, in the order nikcli's `SessionContext` lists the sources. */
export interface ContextBreakdown {
  readonly estimatedTotal: number
  readonly categories: ReadonlyArray<{ readonly category: string; readonly tokens: number }>
}

/** Sums the enabled sources of the host's breakdown per category, largest first; a source that is off costs nothing. */
export const summariseBreakdown = (raw: {
  readonly estimatedTotal: number
  readonly sources: ReadonlyArray<{ readonly category: string; readonly tokens: number; readonly enabled: boolean }>
}): ContextBreakdown => {
  const totals = new Map<string, number>()
  for (const source of raw.sources) {
    if (!source.enabled || !(source.tokens > 0)) continue
    totals.set(source.category, (totals.get(source.category) ?? 0) + Math.round(source.tokens))
  }
  return {
    estimatedTotal: Number.isFinite(raw.estimatedTotal) ? Math.max(0, Math.round(raw.estimatedTotal)) : [...totals.values()].reduce((a, b) => a + b, 0),
    categories: [...totals.entries()].map(([category, tokens]) => ({ category, tokens })).sort((a, b) => b.tokens - a.tokens || a.category.localeCompare(b.category))
  }
}

/**
 * The host's own estimate of the context (system prompt, instructions, skills, tools, agents, messages). Decoration for the
 * gauge: a host that is busy or cannot answer yields undefined instead of failing the control call.
 */
export const readContextBreakdown = (host: ProjectHost, sessionId: string): Effect.Effect<ContextBreakdown | undefined> =>
  Effect.tryPromise({
    try: async (signal) => summariseBreakdown(await host.client.session.contextBreakdown({ sessionID: sessionId }, { signal })),
    catch: (cause) => cause
  }).pipe(Effect.orElseSucceed(() => undefined))

/** How many of the newest host messages are searched for the last delivered observation. Older than this is sent again, which costs one part. */
export const OBSERVATION_LOOKBACK = 200

/**
 * The digest of the observation the session last received, read from the host (the attribute of the newest observation part).
 * The host is the only record, so a restart of the sidecar or a turn from the phone cannot disagree with it. A host that cannot
 * answer yields undefined: the observation is then sent, never assumed to be there.
 */
export const readDeliveredObservation = (host: ProjectHost, sessionId: string): Effect.Effect<string | undefined> =>
  Effect.tryPromise({
    try: async (signal) => deliveredObservationDigest(await host.client.session.messages({ sessionID: sessionId, limit: OBSERVATION_LOOKBACK }, { signal })),
    catch: (cause) => cause
  }).pipe(Effect.orElseSucceed(() => undefined))
