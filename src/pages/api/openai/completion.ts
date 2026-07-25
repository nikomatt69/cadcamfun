// src/pages/api/openai/completion.ts
import { NextApiRequest, NextApiResponse } from "next";
import { LLMClient } from "@/src/lib/ai/provider";
import { toCoreMessages } from "@/src/lib/ai/provider/compat";

/**
 * OpenAI-compatible completion endpoint.
 *
 * Refactored onto the single unified provider (Vercel AI SDK) instead of a
 * hand-rolled axios call to api.openai.com. Callers keep the same request shape
 * ({ model, messages, temperature, max_tokens, response_format, isGcode }) and
 * the same response contract ({ content }, { content, json }, or { gcode }).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      model = "gpt-4o-mini",
      messages,
      temperature = 0.7,
      max_tokens = 1000,
      response_format,
    } = req.body;

    // Basic validation
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages are required and must be an array" });
    }

    const wantsJson = response_format?.type === "json_object";

    const result = await LLMClient.generate({
      model,
      messages: toCoreMessages(messages),
      temperature,
      maxTokens: max_tokens,
    });

    const content = result.text;

    // If response_format is json_object, parse the JSON
    if (wantsJson) {
      try {
        const json = JSON.parse(content);
        return res.status(200).json({ content, json });
      } catch (e) {
        console.error("Error parsing JSON response:", e);
        return res.status(200).json({ content, json: null });
      }
    }

    // Check if content is GCode (for generateGCode endpoint)
    if (req.body.isGcode) {
      return res.status(200).json({ gcode: content });
    }

    // Return the completion
    return res.status(200).json({ content });
  } catch (error: any) {
    console.error("Error communicating with AI provider:", error);

    // Propagate upstream status when the AI SDK surfaces one
    const status = error?.statusCode ?? error?.status ?? 500;
    return res.status(typeof status === "number" ? status : 500).json({
      error: error instanceof Error ? error.message : "Failed to communicate with AI provider",
    });
  }
}
