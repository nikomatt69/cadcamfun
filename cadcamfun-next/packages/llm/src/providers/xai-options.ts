import type { ProviderOptions } from "../schema"
import { mergeProviderOptions } from "../schema"
import { openAIDefaultOptions, type OpenAIProviderOptionsInput } from "./openai-options"

/**
 * xAI grok models route through the OpenAI Responses + OpenAI-Compatible Chat
 * protocols, so they read from `providerOptions.openai`. We additionally accept
 * an `xai` namespace for forward compatibility (grok-specific knobs that xAI
 * may add — e.g. live-search modes, anti-spoof flags).
 */
export interface XAIOptionsInput {
  readonly [key: string]: unknown
  /** Future: any grok-specific request flags routed via providerOptions.xai. */
  readonly liveSearch?: Record<string, unknown>
}

export type XAIProviderOptionsInput = OpenAIProviderOptionsInput & {
  readonly xai?: XAIOptionsInput
}

export const grokDefaultOptions = (modelID: string): ProviderOptions | undefined => {
  const id = modelID.toLowerCase()
  if (id.includes("grok-3-mini") || id.includes("grok-4")) {
    return { openai: { reasoningEffort: "medium", reasoningSummary: "auto" } }
  }
  return undefined
}

export const xaiDefaultOptions = (modelID: string): ProviderOptions | undefined =>
  mergeProviderOptions(openAIDefaultOptions(modelID, { textVerbosity: false }), grokDefaultOptions(modelID))

export const withXAIOptions = <Options extends { readonly providerOptions?: XAIProviderOptionsInput }>(
  modelID: string,
  options: Options,
): Options & { readonly id: string; readonly providerOptions?: ProviderOptions } => {
  return {
    ...options,
    id: modelID,
    providerOptions: mergeProviderOptions(xaiDefaultOptions(modelID), options.providerOptions),
  }
}

export * as XAIProviderOptions from "./xai-options"
