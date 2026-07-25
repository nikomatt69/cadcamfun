// src/lib/ai/provider/providers/anthropic.ts
/**
 * Anthropic provider, backed exclusively by the Vercel AI SDK
 * (`@ai-sdk/anthropic`). We never touch `@anthropic-ai/sdk` directly.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type { ProviderDefinition } from "../provider";

let _client: ReturnType<typeof createAnthropic> | null = null;

function client() {
  if (!_client) {
    _client = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    });
  }
  return _client;
}

export const definition: ProviderDefinition = {
  id: "anthropic",
  env: ["ANTHROPIC_API_KEY"],
  languageModel: (modelID): LanguageModel => client()(modelID),
};
