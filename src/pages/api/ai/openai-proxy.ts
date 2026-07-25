// src/pages/api/ai/openai-proxy.ts
import { NextApiRequest, NextApiResponse } from "next";
import { LLMClient } from "@/src/lib/ai/provider";
import { toCoreMessages, toAISDKTools, toAISDKToolChoice } from "@/src/lib/ai/provider/compat";

// --- Configure API Route ---
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb" // Increase limit to handle Base64 images
    }
  }
};
// --- End Configuration ---

/**
 * OpenAI-compatible proxy used by openaiService.
 *
 * Routes through the single unified provider (Vercel AI SDK). Function tools and
 * multimodal (image) messages are converted via the compat helpers, and the
 * response is reshaped to the OpenAI Chat Completions format the client expects
 * (`choices[0].message.content` / `.tool_calls`).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { model, messages, max_tokens, temperature, tools, tool_choice } = req.body;

    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key is missing");
      return res.status(500).json({ error: "OpenAI API key is missing" });
    }

    const result = await LLMClient.generate({
      model: model || "gpt-4.1",
      messages: toCoreMessages(messages),
      maxTokens: max_tokens,
      temperature: temperature ?? 0.7,
      tools: toAISDKTools(tools),
      toolChoice: toAISDKToolChoice(tool_choice),
    });

    return res.status(200).json(LLMClient.toOpenAIChatResponse(result, model || "gpt-4.1"));
  } catch (error) {
    console.error("OpenAI proxy error:", error);
    return res.status(500).json({
      error: "An error occurred while processing your request",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
