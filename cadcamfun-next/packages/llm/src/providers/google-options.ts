import type { ProviderOptions } from "../schema"
import { mergeProviderOptions } from "../schema"

/**
 * Google Gemini reasoning knobs consumed by `gemini.ts` protocol from
 * `providerOptions.gemini`.
 *
 * Wire shape: nested under `generationConfig.thinkingConfig`.
 */
export interface GeminiThinkingConfig {
  readonly thinkingBudget?: number
  readonly includeThoughts?: boolean
  readonly thinkingLevel?: "minimal" | "low" | "medium" | "high" | (string & {})
}

export interface GeminiSafetySetting {
  readonly category: string
  readonly threshold: string
}

export interface GoogleOptionsInput {
  readonly [key: string]: unknown
  readonly thinkingConfig?: GeminiThinkingConfig
  readonly cachedContent?: string
  readonly safetySettings?: ReadonlyArray<GeminiSafetySetting>
  readonly serviceTier?: "standard" | "flex" | "priority" | (string & {})
  /** Reasoning effort that maps to a model-appropriate thinkingBudget value. */
  readonly variant?: GoogleVariant
}

export type GoogleProviderOptionsInput = ProviderOptions & {
  readonly gemini?: GoogleOptionsInput
  /** Some callers double-key under `google`; we accept both. */
  readonly google?: GoogleOptionsInput
}

export const GoogleVariants = ["low", "medium", "high", "max"] as const
export type GoogleVariant = (typeof GoogleVariants)[number]

const definedEntries = (input: Record<string, unknown>) =>
  Object.entries(input).filter((entry) => entry[1] !== undefined)

const googleProviderOptions = (options: GoogleOptionsInput | undefined): ProviderOptions | undefined => {
  if (!options) return undefined
  const thinkingConfig = options.thinkingConfig
    ? Object.fromEntries(
        definedEntries({
          thinkingBudget: options.thinkingConfig.thinkingBudget,
          includeThoughts: options.thinkingConfig.includeThoughts,
          thinkingLevel: options.thinkingConfig.thinkingLevel,
        }),
      )
    : undefined
  const gemini = Object.fromEntries(
    definedEntries({
      cachedContent: options.cachedContent,
      safetySettings: options.safetySettings,
      serviceTier: options.serviceTier,
      thinkingConfig: thinkingConfig && Object.keys(thinkingConfig).length > 0 ? thinkingConfig : undefined,
    }),
  )
  return Object.keys(gemini).length === 0 ? undefined : { gemini }
}

/** Pro accepts up to 32768, Flash up to 24576. Source: Google Gemini API docs (2025). */
const geminiBudgetFor = (id: string, variant: GoogleVariant): number => {
  const isPro = id.includes("gemini-2.5-pro") || id.includes("gemini-3-pro")
  const cap = isPro ? 32_768 : 24_576
  const map: Record<GoogleVariant, number> = {
    low: 4_000,
    medium: 8_000,
    high: 16_000,
    max: cap,
  }
  return Math.min(map[variant], cap)
}

/** Per-model defaults: turn on thought summaries for thinking-capable Gemini variants. */
export const googleDefaultOptions = (
  modelID: string,
  options: { readonly variant?: GoogleVariant; readonly enableThoughts?: boolean } = {},
): ProviderOptions | undefined => {
  const id = modelID.toLowerCase()
  const variant = options.variant ?? "medium"
  const includeThoughts = options.enableThoughts ?? true

  if (id.includes("gemini-3-pro") || id.includes("gemini-3-flash")) {
    return googleProviderOptions({
      thinkingConfig: { includeThoughts, thinkingBudget: geminiBudgetFor(id, variant) },
    })
  }
  if (id.includes("gemini-2.5-pro") || id.includes("gemini-2.5-flash")) {
    return googleProviderOptions({
      thinkingConfig: { includeThoughts, thinkingBudget: geminiBudgetFor(id, variant) },
    })
  }
  if (id.includes("gemini-2.0-flash-thinking")) {
    return googleProviderOptions({ thinkingConfig: { includeThoughts } })
  }
  return undefined
}

export const withGoogleOptions = <Options extends { readonly providerOptions?: GoogleProviderOptionsInput }>(
  modelID: string,
  options: Options,
  defaults: { readonly variant?: GoogleVariant; readonly enableThoughts?: boolean } = {},
): Options & { readonly id: string; readonly providerOptions?: ProviderOptions } => {
  return {
    ...options,
    id: modelID,
    providerOptions: mergeProviderOptions(googleDefaultOptions(modelID, defaults), options.providerOptions),
  }
}

export * as GoogleProviderOptions from "./google-options"
