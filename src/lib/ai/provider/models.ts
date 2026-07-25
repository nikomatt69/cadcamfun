// src/lib/ai/provider/models.ts
/**
 * Static model registry — the project-local equivalent of nikcli's `ModelsDev`.
 *
 * Every model the app can talk to is declared here once, together with the
 * provider that serves it and its capabilities. Resolution of a bare model id
 * (e.g. "gpt-4o") to a provider is driven entirely by this table, so callers
 * never hard-code provider/SDK choices.
 */

import type { ModelID, ProviderID } from "./schema";

export interface ModelInfo {
  /** Provider-native model id passed verbatim to the AI SDK. */
  readonly id: ModelID;
  /** The provider that serves this model. */
  readonly providerID: ProviderID;
  /** Human-friendly label. */
  readonly name: string;
  /** Total context window in tokens. */
  readonly contextWindow: number;
  /** Default max output tokens. */
  readonly maxOutput: number;
  /** Whether the model supports extended thinking / reasoning. */
  readonly reasoning: boolean;
  /** Whether the model accepts image input. */
  readonly attachment: boolean;
  /** Rough cost tier for routing/heuristics. */
  readonly costTier: "low" | "medium" | "high";
}

export interface ProviderInfo {
  readonly id: ProviderID;
  readonly name: string;
  readonly env: readonly string[];
  readonly models: Record<ModelID, ModelInfo>;
}

const anthropicModels: Record<ModelID, ModelInfo> = {
  "claude-sonnet-4-20250514": {
    id: "claude-sonnet-4-20250514",
    providerID: "anthropic",
    name: "Claude Sonnet 4",
    contextWindow: 200_000,
    maxOutput: 8_000,
    reasoning: true,
    attachment: true,
    costTier: "high",
  },
  "claude-opus-4-20250514": {
    id: "claude-opus-4-20250514",
    providerID: "anthropic",
    name: "Claude Opus 4",
    contextWindow: 200_000,
    maxOutput: 6_000,
    reasoning: true,
    attachment: true,
    costTier: "high",
  },
  "claude-3-7-sonnet-20250219": {
    id: "claude-3-7-sonnet-20250219",
    providerID: "anthropic",
    name: "Claude 3.7 Sonnet",
    contextWindow: 200_000,
    maxOutput: 8_000,
    reasoning: true,
    attachment: true,
    costTier: "medium",
  },
  "claude-3-haiku-20240229": {
    id: "claude-3-haiku-20240229",
    providerID: "anthropic",
    name: "Claude 3 Haiku",
    contextWindow: 200_000,
    maxOutput: 2_000,
    reasoning: false,
    attachment: true,
    costTier: "low",
  },
};

const openaiModels: Record<ModelID, ModelInfo> = {
  "gpt-4o": {
    id: "gpt-4o",
    providerID: "openai",
    name: "GPT-4o",
    contextWindow: 128_000,
    maxOutput: 16_000,
    reasoning: false,
    attachment: true,
    costTier: "medium",
  },
  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    providerID: "openai",
    name: "GPT-4o mini",
    contextWindow: 128_000,
    maxOutput: 16_000,
    reasoning: false,
    attachment: true,
    costTier: "low",
  },
  "gpt-4.1": {
    id: "gpt-4.1",
    providerID: "openai",
    name: "GPT-4.1",
    contextWindow: 1_000_000,
    maxOutput: 32_000,
    reasoning: false,
    attachment: true,
    costTier: "high",
  },
  "gpt-4": {
    id: "gpt-4",
    providerID: "openai",
    name: "GPT-4",
    contextWindow: 8_192,
    maxOutput: 4_000,
    reasoning: false,
    attachment: false,
    costTier: "high",
  },
  "gpt-4-turbo-preview": {
    id: "gpt-4-turbo-preview",
    providerID: "openai",
    name: "GPT-4 Turbo",
    contextWindow: 128_000,
    maxOutput: 4_000,
    reasoning: false,
    attachment: false,
    costTier: "high",
  },
  "gpt-3.5-turbo": {
    id: "gpt-3.5-turbo",
    providerID: "openai",
    name: "GPT-3.5 Turbo",
    contextWindow: 16_385,
    maxOutput: 4_000,
    reasoning: false,
    attachment: false,
    costTier: "low",
  },
};

export const MODELS: Record<ProviderID, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    env: ["ANTHROPIC_API_KEY"],
    models: anthropicModels,
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    env: ["OPENAI_API_KEY"],
    models: openaiModels,
  },
};

/** Default model used when a request does not specify one. */
export const DEFAULT_MODEL_ID: ModelID = "claude-sonnet-4-20250514";

/** Flat lookup of every known model id to its info. */
export const MODEL_INDEX: Record<ModelID, ModelInfo> = Object.values(MODELS).reduce(
  (acc, provider) => Object.assign(acc, provider.models),
  {} as Record<ModelID, ModelInfo>
);

/** Resolve a model id to its info, or `undefined` if unknown. */
export function getModelInfo(modelID: ModelID): ModelInfo | undefined {
  return MODEL_INDEX[modelID];
}

/** Find the provider that serves a given model id. */
export function providerForModel(modelID: ModelID): ProviderID | undefined {
  return MODEL_INDEX[modelID]?.providerID;
}
