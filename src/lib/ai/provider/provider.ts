// src/lib/ai/provider/provider.ts
/**
 * The single AI provider registry for the whole app.
 *
 * This is the project-local analogue of nikcli's `Provider` namespace: every
 * supported provider is registered once, and the rest of the codebase resolves
 * a model — by `ModelRef`, by `"provider/model"` string, or by bare model id —
 * into a ready-to-use Vercel AI SDK `LanguageModel`. No other module is allowed
 * to instantiate `@ai-sdk/*` or raw provider SDKs directly.
 */

import type { LanguageModel } from "ai";
import type { ModelID, ModelRef, ProviderID } from "./schema";
import { isModelRef } from "./schema";
import { DEFAULT_MODEL_ID, MODELS, providerForModel } from "./models";

import { definition as anthropic } from "./providers/anthropic";
import { definition as openai } from "./providers/openai";

/** Contract every provider implementation must satisfy. */
export interface ProviderDefinition {
  readonly id: ProviderID;
  /** Env vars consulted for credentials (first present wins). */
  readonly env: readonly string[];
  /** Build an AI SDK language model for a provider-native model id. */
  readonly languageModel: (modelID: ModelID) => LanguageModel;
}

export namespace Provider {
  /** Identity helper that also type-checks a definition (mirrors nikcli). */
  export function make(definition: ProviderDefinition): ProviderDefinition {
    return definition;
  }

  /** All registered providers, keyed by id. */
  export const registry: Record<ProviderID, ProviderDefinition> = {
    anthropic,
    openai,
  };

  export function get(id: ProviderID): ProviderDefinition {
    const def = registry[id];
    if (!def) throw new Error(`Unknown AI provider: ${id}`);
    return def;
  }

  /** Is at least one credential env var present for this provider? */
  export function isConfigured(id: ProviderID): boolean {
    return get(id).env.some((key) => Boolean(process.env[key]));
  }

  /**
   * Normalize any accepted model reference into a {@link ModelRef}.
   * Accepts: a `ModelRef`, a `"provider/model"` string, or a bare model id
   * resolved through the model registry; falls back to {@link DEFAULT_MODEL_ID}.
   */
  export function parse(input?: string | ModelRef | null): ModelRef {
    if (input && isModelRef(input)) return input;

    const raw = (typeof input === "string" && input.trim()) || DEFAULT_MODEL_ID;

    const slash = raw.indexOf("/");
    if (slash > 0) {
      const providerID = raw.slice(0, slash) as ProviderID;
      const modelID = raw.slice(slash + 1);
      if (MODELS[providerID]) return { providerID, modelID };
    }

    const known = providerForModel(raw);
    if (known) return { providerID: known, modelID: raw };

    // Heuristic for model ids not in the registry (e.g. "gpt-4.1-mini").
    const guess = guessProvider(raw);
    if (guess) return { providerID: guess, modelID: raw };

    // Last resort: route to the default model's provider but keep the id so the
    // SDK surfaces a precise upstream error instead of us guessing wrong.
    const fallback = providerForModel(DEFAULT_MODEL_ID)!;
    return { providerID: fallback, modelID: raw };
  }

  /** Best-effort provider detection from a bare model id by naming convention. */
  function guessProvider(modelID: string): ProviderID | undefined {
    const id = modelID.toLowerCase();
    if (id.startsWith("claude")) return "anthropic";
    if (id.startsWith("gpt") || id.startsWith("o1") || id.startsWith("o3") || id.startsWith("chatgpt"))
      return "openai";
    return undefined;
  }

  /** Resolve any model reference into a concrete AI SDK language model. */
  export function getLanguageModel(input?: string | ModelRef | null): LanguageModel {
    const ref = parse(input);
    return get(ref.providerID).languageModel(ref.modelID);
  }
}
