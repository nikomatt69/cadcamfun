import type { ProviderOptions } from "../schema"
import { mergeProviderOptions } from "../schema"
import { openAIDefaultOptions, type OpenAIProviderOptionsInput } from "./openai-options"

/**
 * GitHub Copilot multiplexes OpenAI, Anthropic, and Google models behind a
 * single OpenAI-Responses-compatible surface. The reasoning knobs Copilot
 * actually exposes vary by model family:
 *   - `gpt-5*`, `gpt-5.1-codex-max` → full OpenAI defaults
 *   - `claude-*` → reasoningEffort only (no summary / encrypted state)
 *   - `gemini*` → no reasoning surface
 */
export type CopilotProviderOptionsInput = OpenAIProviderOptionsInput

const claudeOnCopilotDefaults = (modelID: string): ProviderOptions | undefined => {
  const id = modelID.toLowerCase()
  if (!id.includes("claude-")) return undefined
  if (id.includes("claude-opus-4") || id.includes("claude-sonnet-4")) {
    return { openai: { reasoningEffort: "medium" } }
  }
  if (id.includes("claude-3-7-sonnet")) {
    return { openai: { reasoningEffort: "medium" } }
  }
  return undefined
}

export const copilotDefaultOptions = (modelID: string): ProviderOptions | undefined => {
  const id = modelID.toLowerCase()
  // Gemini through Copilot exposes no reasoning surface — return nothing.
  if (id.includes("gemini")) return undefined
  if (id.includes("claude-")) return claudeOnCopilotDefaults(id)
  return openAIDefaultOptions(id, { textVerbosity: false })
}

export const withCopilotOptions = <Options extends { readonly providerOptions?: CopilotProviderOptionsInput }>(
  modelID: string,
  options: Options,
): Options & { readonly id: string; readonly providerOptions?: ProviderOptions } => {
  return {
    ...options,
    id: modelID,
    providerOptions: mergeProviderOptions(copilotDefaultOptions(modelID), options.providerOptions),
  }
}

export * as CopilotProviderOptions from "./copilot-options"
