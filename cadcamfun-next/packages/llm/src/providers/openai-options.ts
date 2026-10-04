import type { ProviderOptions, ReasoningEffort, TextVerbosity } from "../schema"
import { mergeProviderOptions } from "../schema"

export interface OpenAIOptionsInput {
  readonly [key: string]: unknown
  readonly store?: boolean
  readonly promptCacheKey?: string
  readonly instructions?: string
  readonly reasoningEffort?: ReasoningEffort
  readonly reasoningSummary?: "auto" | "concise" | "detailed"
  readonly includeEncryptedReasoning?: boolean
  readonly textVerbosity?: TextVerbosity
}

export type OpenAIProviderOptionsInput = ProviderOptions & {
  readonly openai?: OpenAIOptionsInput
}

const definedEntries = (input: Record<string, unknown>) =>
  Object.entries(input).filter((entry) => entry[1] !== undefined)

const openAIProviderOptions = (options: OpenAIOptionsInput | undefined): ProviderOptions | undefined => {
  const openai = Object.fromEntries(
    definedEntries({
      store: options?.store,
      promptCacheKey: options?.promptCacheKey,
      instructions: options?.instructions,
      reasoningEffort: options?.reasoningEffort,
      reasoningSummary: options?.reasoningSummary,
      includeEncryptedReasoning: options?.includeEncryptedReasoning,
      textVerbosity: options?.textVerbosity,
    }),
  )
  if (Object.keys(openai).length === 0) return undefined
  return { openai }
}

// Matches the gpt-6 family ("gpt-6-astra", "openai/gpt-6-astra") without
// false-matching "gpt-60". GPT-6 Astra always reasons and rejects both `none`
// and `minimal`, so it takes the same medium-effort default as gpt-5.x.
// `text.verbosity` is undocumented for the family, so it is never sent.
const GPT6_FAMILY_RE = /(?:^|\/)gpt-6(?:[.-]|$)/

export const gpt5DefaultOptions = (
  modelID: string,
  options: { readonly textVerbosity?: boolean } = {},
): ProviderOptions | undefined => {
  const id = modelID.toLowerCase()
  if (GPT6_FAMILY_RE.test(id)) {
    return openAIProviderOptions({ reasoningEffort: "medium", reasoningSummary: "detailed" })
  }
  if (!id.includes("gpt-5") || id.includes("gpt-5-chat") || id.includes("gpt-5-pro")) return undefined
  return openAIProviderOptions({
    reasoningEffort: "medium",
    reasoningSummary: "detailed",
    textVerbosity:
      options.textVerbosity === true && id.includes("gpt-5.") && !id.includes("codex") && !id.includes("-chat")
        ? "low"
        : undefined,
  })
}

export const openAIDefaultOptions = (
  modelID: string,
  options: { readonly textVerbosity?: boolean } = {},
): ProviderOptions | undefined =>
  mergeProviderOptions(openAIProviderOptions({ store: false }), gpt5DefaultOptions(modelID, options))

export const withOpenAIOptions = <Options extends { readonly providerOptions?: OpenAIProviderOptionsInput }>(
  modelID: string,
  options: Options,
  defaults: { readonly textVerbosity?: boolean } = {},
): Options & { readonly id: string; readonly providerOptions?: ProviderOptions } => {
  return {
    ...options,
    id: modelID,
    providerOptions: mergeProviderOptions(openAIDefaultOptions(modelID, defaults), options.providerOptions),
  }
}

export * as OpenAIProviderOptions from "./openai-options"
