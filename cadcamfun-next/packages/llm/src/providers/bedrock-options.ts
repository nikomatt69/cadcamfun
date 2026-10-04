import type { ProviderOptions, ReasoningEffort } from "../schema"
import { mergeProviderOptions } from "../schema"

/**
 * Bedrock Converse reasoning knobs. Bedrock-hosted Anthropic models accept
 * `reasoningConfig` under `additionalModelRequestFields`; Amazon Nova models
 * accept the same key with `maxReasoningEffort`. These are surfaced via the
 * `bedrock` namespace on `providerOptions`.
 */
export interface BedrockReasoningEnabled {
  readonly type: "enabled"
  readonly budgetTokens?: number
  readonly maxReasoningEffort?: ReasoningEffort
}

export interface BedrockReasoningAdaptive {
  readonly type: "adaptive"
  readonly maxReasoningEffort?: ReasoningEffort
  readonly display?: "summarized" | "raw"
}

export type BedrockReasoningConfig = BedrockReasoningEnabled | BedrockReasoningAdaptive

export interface BedrockOptionsInput {
  readonly [key: string]: unknown
  readonly reasoningConfig?: BedrockReasoningConfig
  /** Raw passthrough into `additionalModelRequestFields` for advanced callers. */
  readonly additionalModelRequestFields?: Record<string, unknown>
}

export type BedrockProviderOptionsInput = ProviderOptions & {
  readonly bedrock?: BedrockOptionsInput
}

export const BedrockVariants = ["low", "medium", "high", "max"] as const
export type BedrockVariant = (typeof BedrockVariants)[number]

const definedEntries = (input: Record<string, unknown>) =>
  Object.entries(input).filter((entry) => entry[1] !== undefined)

const bedrockProviderOptions = (options: BedrockOptionsInput | undefined): ProviderOptions | undefined => {
  if (!options) return undefined
  const bedrock = Object.fromEntries(
    definedEntries({
      reasoningConfig: options.reasoningConfig,
      additionalModelRequestFields: options.additionalModelRequestFields,
    }),
  )
  if (Object.keys(bedrock).length === 0) return undefined
  return { bedrock }
}

const ADAPTIVE_BEDROCK = ["claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6"]
const ENABLED_BEDROCK_ANTHROPIC = ["claude-opus-4-5", "claude-sonnet-4-5", "claude-3-7-sonnet"]
const NOVA_REASONING = ["amazon.nova-premier", "amazon.nova-pro"]

const VARIANT_BUDGET: Record<BedrockVariant, number> = {
  low: 4_000,
  medium: 16_000,
  high: 24_000,
  max: 31_999,
}

const matches = (id: string, patterns: ReadonlyArray<string>) => patterns.some((p) => id.includes(p))

export const bedrockDefaultOptions = (
  modelID: string,
  options: { readonly variant?: BedrockVariant } = {},
): ProviderOptions | undefined => {
  const id = modelID.toLowerCase()
  const variant = options.variant ?? "medium"

  if (matches(id, ADAPTIVE_BEDROCK)) {
    const display = id.includes("opus-4-7") ? ("summarized" as const) : undefined
    return bedrockProviderOptions({
      reasoningConfig: {
        type: "adaptive",
        maxReasoningEffort: variant,
        ...(display ? { display } : {}),
      },
    })
  }

  if (matches(id, ENABLED_BEDROCK_ANTHROPIC)) {
    return bedrockProviderOptions({
      reasoningConfig: { type: "enabled", budgetTokens: VARIANT_BUDGET[variant] },
    })
  }

  if (matches(id, NOVA_REASONING)) {
    return bedrockProviderOptions({
      reasoningConfig: { type: "enabled", maxReasoningEffort: variant },
    })
  }

  return undefined
}

export const withBedrockOptions = <Options extends { readonly providerOptions?: BedrockProviderOptionsInput }>(
  modelID: string,
  options: Options,
  defaults: { readonly variant?: BedrockVariant } = {},
): Options & { readonly id: string; readonly providerOptions?: ProviderOptions } => {
  return {
    ...options,
    id: modelID,
    providerOptions: mergeProviderOptions(bedrockDefaultOptions(modelID, defaults), options.providerOptions),
  }
}

export * as BedrockProviderOptions from "./bedrock-options"
