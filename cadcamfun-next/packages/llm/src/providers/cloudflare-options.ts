import type { ProviderOptions } from "../schema"
import { mergeProviderOptions } from "../schema"
import { anthropicDefaultOptions, type AnthropicProviderOptionsInput } from "./anthropic-options"
import { googleDefaultOptions, type GoogleProviderOptionsInput } from "./google-options"
import { openAIDefaultOptions, type OpenAIProviderOptionsInput } from "./openai-options"

/**
 * Cloudflare AI Gateway uses the `/v1/compat` OpenAI-shaped body, but the
 * upstream-vendor-namespaced model IDs (e.g. `openai/gpt-5-mini`,
 * `anthropic/claude-sonnet-4-5`, `google/gemini-2.5-pro`) carry meaningful
 * reasoning semantics that we forward via the relevant provider namespace.
 */
export type CloudflareProviderOptionsInput = ProviderOptions &
  OpenAIProviderOptionsInput &
  AnthropicProviderOptionsInput &
  GoogleProviderOptionsInput

const stripVendor = (modelID: string) => {
  const i = modelID.indexOf("/")
  return i >= 0 ? modelID.slice(i + 1) : modelID
}

export const cloudflareDefaultOptions = (modelID: string): ProviderOptions | undefined => {
  const id = modelID.toLowerCase()
  const bare = stripVendor(id)

  if (id.startsWith("openai/") || bare.startsWith("gpt-") || bare.startsWith("o1") || bare.startsWith("o3")) {
    return openAIDefaultOptions(bare, { textVerbosity: false })
  }
  if (id.startsWith("anthropic/") || bare.startsWith("claude-")) {
    return anthropicDefaultOptions(bare)
  }
  if (id.startsWith("google/") || bare.startsWith("gemini-")) {
    return googleDefaultOptions(bare)
  }
  return undefined
}

export const withCloudflareOptions = <Options extends { readonly providerOptions?: CloudflareProviderOptionsInput }>(
  modelID: string,
  options: Options,
): Options & { readonly id: string; readonly providerOptions?: ProviderOptions } => {
  return {
    ...options,
    id: modelID,
    providerOptions: mergeProviderOptions(cloudflareDefaultOptions(modelID), options.providerOptions),
  }
}

export * as CloudflareProviderOptions from "./cloudflare-options"
