import type { NextApiRequest, NextApiResponse } from "next";
import Anthropic from "@anthropic-ai/sdk";
import { AIRequest, AIResponse } from "@/src/types/ai"; // Adjust path if necessary

// Define the expected request body structure from the client
interface AnthropicProxyRequestBody extends Omit<AIRequest, "parseResponse" | "onProgress" | "retryCount"> {
  anthropicToolOptions?: any; // For web_search tool or other MCP tools
  // Add any other specific parameters aiCore.processWithMCPThinking might send
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export default async function handler(req: NextApiRequest, res: NextApiResponse<AIResponse<any> | { error: string }>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[Anthropic Proxy] CRITICAL: ANTHROPIC_API_KEY is not set in environment variables.");
    return res.status(500).json({ error: "API key not configured on server." });
  }

  const {
    prompt,
    model,
    systemPrompt,
    temperature,
    maxTokens,
    anthropicToolOptions // Extract tool options
    // ... any other parameters passed from client ...
  } = req.body as AnthropicProxyRequestBody;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  try {
    const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: prompt }];

    const requestPayload: Anthropic.Messages.MessageCreateParams = {
      model: model || "claude-3-haiku-20240307", // Default model, adjust as needed
      max_tokens: maxTokens || 4000,
      messages,
      ...(systemPrompt && { system: systemPrompt }),
      ...(temperature && { temperature }),
      // IMPORTANT: Include tools if anthropicToolOptions are provided
      ...(anthropicToolOptions && { tools: [anthropicToolOptions] })
    };

    console.log("[Anthropic Proxy] Sending request to Anthropic:", JSON.stringify(requestPayload, null, 2));

    const anthropicResponse = await anthropic.messages.create(requestPayload);

    console.log("[Anthropic Proxy] Received response from Anthropic.");

    // The client-side will have its own parseResponse logic.
    // Here, we return the raw-ish response structure expected by the client's parse function.
    // For web search, the response will be multi-modal (text + tool_use/tool_result blocks)
    // The webSearchService.parseSearchResponse on the client will handle this.

    // Construct a structure that the client-side AICore/WebSearchService can work with.
    // This might need adjustment based on how parseResponse expects the data.
    // For now, let's assume it expects something like the original Anthropic.Messages.Message object.
    res.status(200).json({
      rawResponse: anthropicResponse as any, // Send the full Anthropic message object
      data: anthropicResponse, // Or specifically anthropicResponse.content for some parsers
      success: true
      // processingTime, model, etc., can be added if needed, or derived client-side
    });
  } catch (error: any) {
    console.error("[Anthropic Proxy] Error calling Anthropic API:", error);
    const errorMessage = error.message || "An unknown error occurred";
    // Pass along more detailed error info if available (e.g., from Anthropic's error object)
    const errorDetails = error.error?.message || error.response?.data?.error?.message;
    res.status(error.status || 500).json({
      error: `Anthropic API Error: ${errorDetails || errorMessage}`,
      success: false,
      rawResponse: null,
      data: null
    });
  }
}
