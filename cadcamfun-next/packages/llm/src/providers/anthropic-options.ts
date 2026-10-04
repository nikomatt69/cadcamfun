import type { ProviderOptions, ReasoningEffort } from "../schema"
import { mergeProviderOptions } from "../schema"

/**
 * Anthropic-specific reasoning/thinking knobs the `anthropic-messages` protocol
 * reads from `providerOptions.anthropic`.
 *
 * The wire shape lowered to the API is `thinking: { type: "enabled", budget_tokens }`.
 * Adaptive thinking (claude-4.x) is represented here as
 * `{ type: "adaptive", effort, display? }` so the provider can route the value
 * down to whichever wire form Anthropic accepts for that model.
 */
export interface AnthropicThinkingEnabled {
  readonly type: "enabled"
  readonly budgetTokens: number
}

export interface AnthropicThinkingAdaptive {
  readonly type: "adaptive"
  readonly effort?: ReasoningEffort
  readonly display?: "summarized" | "raw"
}

export type AnthropicThinking = AnthropicThinkingEnabled | AnthropicThinkingAdaptive

export interface AnthropicOptionsInput {
  readonly [key: string]: unknown
  readonly thinking?: AnthropicThinking
  /** Convenience: opaque `cacheControl` defaults applied to user/system messages by the caller. */
  readonly cacheControl?: { readonly type: "ephemeral" | "persistent"; readonly ttlSeconds?: number }
}

export type AnthropicProviderOptionsInput = ProviderOptions & {
  readonly anthropic?: AnthropicOptionsInput
}

/** Named reasoning tiers usable by `withAnthropicOptions(... , { variant })`. */
export const AnthropicVariants = {
  low: 4_000,
  medium: 16_000,
  high: 24_000,
  max: 31_999,
} as const

export type AnthropicVariant = keyof typeof AnthropicVariants

const definedEntries = (input: Record<string, unknown>) =>
  Object.entries(input).filter((entry) => entry[1] !== undefined)

const anthropicProviderOptions = (options: AnthropicOptionsInput | undefined): ProviderOptions | undefined => {
  if (!options) return undefined
  const anthropic = Object.fromEntries(
    definedEntries({
      thinking: options.thinking,
      cacheControl: options.cacheControl,
    }),
  )
  if (Object.keys(anthropic).length === 0) return undefined
  return { anthropic }
}

const ADAPTIVE_FAMILIES = ["claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6"]
const BUDGET_FAMILIES_4X = ["claude-opus-4-5", "claude-sonnet-4-5", "claude-sonnet-4-0"]
const LEGACY_THINKING_FAMILIES = ["claude-3-7-sonnet"]

const matches = (id: string, patterns: ReadonlyArray<string>) => patterns.some((p) => id.includes(p))

/**
 * Per-model defaults for Anthropic claude models. Returns `undefined` when the
 * model has no reasoning surface (older claude-3 family, haiku, etc.).
 */
export const anthropicDefaultOptions = (
  modelID: string,
  options: { readonly variant?: AnthropicVariant } = {},
): ProviderOptions | undefined => {
  const id = modelID.toLowerCase()
  const variant = options.variant ?? "medium"

  // Adaptive thinking (claude-4.6 / 4.7 families on Anthropic-direct).
  if (matches(id, ADAPTIVE_FAMILIES)) {
    const display = id.includes("opus-4-7") ? ("summarized" as const) : undefined
    return anthropicProviderOptions({
      thinking: { type: "adaptive", effort: variant, ...(display ? { display } : {}) },
    })
  }

  if (matches(id, BUDGET_FAMILIES_4X) || matches(id, LEGACY_THINKING_FAMILIES)) {
    return anthropicProviderOptions({
      thinking: { type: "enabled", budgetTokens: AnthropicVariants[variant] },
    })
  }

  return undefined
}

export const withAnthropicOptions = <Options extends { readonly providerOptions?: AnthropicProviderOptionsInput }>(
  modelID: string,
  options: Options,
  defaults: { readonly variant?: AnthropicVariant } = {},
): Options & { readonly id: string; readonly providerOptions?: ProviderOptions } => {
  return {
    ...options,
    id: modelID,
    providerOptions: mergeProviderOptions(anthropicDefaultOptions(modelID, defaults), options.providerOptions),
  }
}

export * as AnthropicProviderOptions from "./anthropic-options"
