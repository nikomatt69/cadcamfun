// src/pages/api/ai/anthropic-proxy.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { AIRequest, AIResponse } from "@/src/types/ai";
import { LLMClient, DEFAULT_MODEL_ID } from "@/src/lib/ai/provider";
import { toAISDKTools } from "@/src/lib/ai/provider/compat";

// Define the expected request body structure from the client
interface AnthropicProxyRequestBody extends Omit<AIRequest, "parseResponse" | "onProgress" | "retryCount"> {
  anthropicToolOptions?: any; // For function-style tools (MCP tools)
}

/**
 * Anthropic-compatible proxy (used by AICore.processWithMCPThinking).
 *
 * Refactored onto the single unified provider (Vercel AI SDK). The response is
 * reconstructed into the Anthropic Messages shape (`content[]` of text /
 * tool_use blocks + `stop_reason`) that the client-side parsers consume.
 *
 * NOTE: Anthropic's server-side `web_search` tool is not exposed by the pinned
 * `@ai-sdk/anthropic`; function-style tools are forwarded, server tools degrade
 * to a text-only answer. See follow-up note in the refactor summary.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse<AIResponse<any> | { error: string }>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const {
    prompt,
    model,
    systemPrompt,
    temperature,
    maxTokens,
    anthropicToolOptions,
  } = req.body as AnthropicProxyRequestBody;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    // Forward only function-style tools the AI SDK understands.
    const tools = anthropicToolOptions?.function?.name
      ? toAISDKTools([anthropicToolOptions])
      : undefined;

    const modelID = model || DEFAULT_MODEL_ID;

    const result = await LLMClient.generate({
      model: modelID,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxTokens: maxTokens || 4000,
      temperature,
      tools,
    });

    // Reconstruct an Anthropic Messages-shaped object for the client parsers.
    const content: any[] = [];
    if (result.text) content.push({ type: "text", text: result.text });
    for (const tc of result.toolCalls ?? []) {
      content.push({ type: "tool_use", id: tc.toolCallId, name: tc.toolName, input: tc.args });
    }

    const anthropicResponse = {
      id: result.response?.id ?? `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      model: modelID,
      content,
      stop_reason: result.finishReason === "tool-calls" ? "tool_use" : "end_turn",
      usage: {
        input_tokens: result.usage?.promptTokens ?? 0,
        output_tokens: result.usage?.completionTokens ?? 0,
      },
    };

    res.status(200).json({
      rawResponse: anthropicResponse as any,
      data: anthropicResponse as any,
      success: true,
    });
  } catch (error: any) {
    console.error("[Anthropic Proxy] Error calling AI provider:", error);
    const errorMessage = error.message || "An unknown error occurred";
    const errorDetails = error.error?.message || error.response?.data?.error?.message;
    res.status(error.statusCode || error.status || 500).json({
      error: `AI Provider Error: ${errorDetails || errorMessage}`,
      success: false,
      rawResponse: null,
      data: null,
    });
  }
}
