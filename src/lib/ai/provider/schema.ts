// src/lib/ai/provider/schema.ts
/**
 * Core identifiers for the unified AI provider layer.
 *
 * Mirrors the shape of `@nikcli-ai/llm` schema (ProviderID / ModelID / ModelRef)
 * but is intentionally lightweight: the wire protocol is delegated to the
 * Vercel AI SDK (`ai` + `@ai-sdk/*`) instead of being implemented by hand.
 */

export type ProviderID = "anthropic" | "openai";

export type ModelID = string;

/** A fully-qualified reference to a model on a given provider. */
export interface ModelRef {
  readonly providerID: ProviderID;
  readonly modelID: ModelID;
}

/** Build a {@link ModelRef} from its parts. */
export function modelRef(providerID: ProviderID, modelID: ModelID): ModelRef {
  return { providerID, modelID };
}

export function isModelRef(value: unknown): value is ModelRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "providerID" in value &&
    "modelID" in value
  );
}

/** Serialize a {@link ModelRef} to the canonical `provider/model` string. */
export function formatModelRef(ref: ModelRef): string {
  return `${ref.providerID}/${ref.modelID}`;
}
