// src/lib/ai/provider/index.ts
/**
 * Unified AI provider — single entrypoint for the whole app.
 *
 * Inspired by nikcli's `@nikcli-ai/llm` package structure (Provider registry +
 * model registry + a thin client), but the wire protocol is delegated to the
 * Vercel AI SDK (`ai` + `@ai-sdk/*`). Nothing else in the codebase should
 * instantiate `@ai-sdk/*`, `@anthropic-ai/sdk`, or `openai` directly.
 *
 * Usage:
 *   import { LLMClient, Provider, MODELS } from "@/src/lib/ai/provider";
 *   const result = await LLMClient.generate({ model: "claude-sonnet-4-20250514", prompt });
 *   const model  = Provider.getLanguageModel("openai/gpt-4o");
 */

export { Provider } from "./provider";
export type { ProviderDefinition } from "./provider";

export { LLMClient } from "./client";
export type { LLMRequest } from "./client";

export {
  MODELS,
  MODEL_INDEX,
  DEFAULT_MODEL_ID,
  getModelInfo,
  providerForModel,
} from "./models";
export type { ModelInfo, ProviderInfo } from "./models";

export { modelRef, formatModelRef, isModelRef } from "./schema";
export type { ModelRef, ModelID, ProviderID } from "./schema";
