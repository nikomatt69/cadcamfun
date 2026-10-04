import type { ProviderOptions } from "../schema"
import { mergeProviderOptions } from "../schema"
import { type OpenAIProviderOptionsInput } from "./openai-options"

/**
 * OpenAI-compatible profiles (groq, cerebras, deepinfra, deepseek, fireworks,
 * baseten, togetherai, moonshot, etc.) share an OpenAI-shaped body. Most
 * reasoning surfaces are passthrough — the model ID encodes whether the
 * upstream supports reasoning_effort.
 *
 * We pattern-match by upstream profile + model substring and emit OpenAI-shaped
 * defaults. Callers can always override via `providerOptions`.
 */
export type OpenAICompatibleProviderOptionsInput = OpenAIProviderOptionsInput & {
  readonly [key: string]: unknown
}

const DEEPSEEK_REASONING = ["deepseek-reasoner", "deepseek-r1", "deepseek-v3.1-thinking"]
const FIREWORKS_REASONING = ["deepseek-r1", "qwen3"]
const GROQ_REASONING = ["deepseek-r1-distill", "qwen3", "openai/gpt-oss"]
const CEREBRAS_REASONING = ["qwen-3", "gpt-oss"]

const matches = (id: string, patterns: ReadonlyArray<string>) => patterns.some((p) => id.includes(p))

export const openAICompatibleDefaultOptions = (
  modelID: string,
  options: { readonly profile?: string } = {},
): ProviderOptions | undefined => {
  const id = modelID.toLowerCase()
  const profile = options.profile?.toLowerCase()

  if (profile === "deepseek" && matches(id, DEEPSEEK_REASONING)) {
    return { openai: { reasoningEffort: "medium" } }
  }
  if (profile === "fireworks" && matches(id, FIREWORKS_REASONING)) {
    return { openai: { reasoningEffort: "medium" } }
  }
  if (profile === "groq" && matches(id, GROQ_REASONING)) {
    return { openai: { reasoningEffort: "medium" } }
  }
  if (profile === "cerebras" && matches(id, CEREBRAS_REASONING)) {
    return { openai: { reasoningEffort: "medium" } }
  }

  // Profile-less: try to infer from the model id alone.
  if (matches(id, [...DEEPSEEK_REASONING, ...FIREWORKS_REASONING, ...GROQ_REASONING, ...CEREBRAS_REASONING])) {
    return { openai: { reasoningEffort: "medium" } }
  }
  return undefined
}

export const withOpenAICompatibleOptions = <
  Options extends { readonly providerOptions?: OpenAICompatibleProviderOptionsInput },
>(
  modelID: string,
  options: Options,
  defaults: { readonly profile?: string } = {},
): Options & { readonly id: string; readonly providerOptions?: ProviderOptions } => {
  return {
    ...options,
    id: modelID,
    providerOptions: mergeProviderOptions(openAICompatibleDefaultOptions(modelID, defaults), options.providerOptions),
  }
}

export * as OpenAICompatibleProviderOptions from "./openai-compatible-options"
