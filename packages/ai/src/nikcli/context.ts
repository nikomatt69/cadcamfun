/// <reference path="./sdk-next.d.ts" />
import { Effect } from "effect"
import { AiConfigError, AiProviderError } from "../errors.ts"
import { describeHostFailure } from "./chat.ts"
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
