// src/lib/ai/provider/providers/openai.ts
/**
 * OpenAI provider, backed exclusively by the Vercel AI SDK (`@ai-sdk/openai`).
 * We never touch the raw `openai` SDK directly.
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { ProviderDefinition } from "../provider";

let _client: ReturnType<typeof createOpenAI> | null = null;

function client() {
  if (!_client) {
    _client = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? "",
      organization: process.env.OPENAI_ORG_ID || undefined,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      compatibility: "strict",
    });
  }
  return _client;
}

export const definition: ProviderDefinition = {
  id: "openai",
  env: ["OPENAI_API_KEY"],
  languageModel: (modelID): LanguageModel => client()(modelID),
};
