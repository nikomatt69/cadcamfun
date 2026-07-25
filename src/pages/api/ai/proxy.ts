// src/pages/api/ai/proxy.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";
import { LLMClient, DEFAULT_MODEL_ID } from "@/src/lib/ai/provider";

/**
 * Anthropic-compatible proxy used by UnifiedAIService.
 *
 * Refactored to route through the single unified provider (Vercel AI SDK)
 * instead of hand-rolling a fetch to api.anthropic.com. The response is shaped
 * like the Anthropic Messages API so the existing client parser keeps working.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { model, messages, max_tokens, temperature, system, reasoning } = req.body;

    const modelID = model || DEFAULT_MODEL_ID;

    const result = await LLMClient.generate({
      model: modelID,
      system,
      messages,
      maxTokens: max_tokens,
      temperature,
      reasoning,
    });

    return res.status(200).json(LLMClient.toAnthropicMessageResponse(result, modelID));
  } catch (error) {
    console.error("Error in AI proxy:", error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : "Error calling AI provider",
    });
  }
}

// Extended timeout configuration for serverless functions
export const config = {
  api: {
    responseLimit: "16mb",
    // Extended timeout for complex CAD operations (max 2 minutes)
    maxDuration: 120, // 120 seconds = 2 minutes
  },
};
