/**
 * How full the model's context window is, the way nikcli's session header shows it
 * (`session-context-metrics.ts`): the tokens of the latest model call against the
 * model's window. The latest call is what the next one will resend, so it is the
 * live occupancy; the cumulative totals in `AiStats` are not.
 */
import type { AiUsage, ChatModel, ModelInfo, ProviderInfo } from "./types.ts"

/** A model's window and the most it writes in one call, as the catalogue lists them. */
export interface ModelWindow {
  readonly context: number
  readonly output?: number
}

/** `ProviderTransform.OUTPUT_TOKEN_MAX`: the cap nikcli puts on one call's output. */
export const OUTPUT_TOKEN_MAX = 32_000

/**
 * Tokens the conversation may hold before the host summarises it (nikcli's `session/overflow.ts` `usable`):
 * the window minus what the next answer may take.
 */
export const usableWindow = (window: ModelWindow): number =>
  Math.max(0, window.context - (Math.min(window.output ?? OUTPUT_TOKEN_MAX, OUTPUT_TOKEN_MAX) || OUTPUT_TOKEN_MAX))

export interface ContextMetrics {
  readonly tokens: number
  /** The model's window; `undefined` when the catalogue does not list the model. */
  readonly limit: number | undefined
  /** Where the host starts summarising; `undefined` without a window. */
  readonly compactAt: number | undefined
  /** Whole percent of the window, capped at 100; `undefined` without a limit. */
  readonly percent: number | undefined
  readonly level: "ok" | "warn" | "full"
}

/** Context tokens of a model call: everything it read plus what it wrote (which the next call resends). */
export const contextTokensOf = (usage: AiUsage | undefined): number => (usage === undefined ? 0 : usage.inputTokens + usage.outputTokens)

/** The window of the selected model, from the host catalogue first and the fallback tiers second. */
export const contextWindowFor = (
  model: ChatModel | undefined,
  providers: ReadonlyArray<ProviderInfo>,
  models: ReadonlyArray<ModelInfo>
): ModelWindow | undefined => {
  if (model === undefined) return undefined
  const listed = providers.find((p) => p.id === model.provider)?.models.find((m) => m.id === model.model)
  const context = listed?.contextWindow ?? models.find((m) => m.provider === model.provider && m.id === model.model)?.contextWindow
  if (context === undefined || context <= 0) return undefined
  return { context, ...(listed !== undefined && listed.maxOutput > 0 ? { output: listed.maxOutput } : {}) }
}

export const WARN_PERCENT = 70
export const FULL_PERCENT = 90

export const contextMetrics = (tokens: number, window: ModelWindow | undefined): ContextMetrics => {
  if (window === undefined) return { tokens, limit: undefined, compactAt: undefined, percent: undefined, level: "ok" }
  const percent = Math.min(100, Math.round((tokens / window.context) * 100))
  const compactAt = usableWindow(window)
  // "full" is where the host summarises, not where the window ends: that is what the user is about to see happen.
  const level = tokens >= compactAt || percent >= FULL_PERCENT ? "full" : percent >= WARN_PERCENT ? "warn" : "ok"
  return { tokens, limit: window.context, compactAt, percent, level }
}

export const formatTokenCount = (tokens: number): string =>
  tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1)}M` : tokens >= 1_000 ? `${(tokens / 1_000).toFixed(tokens >= 100_000 ? 0 : 1)}k` : String(tokens)
