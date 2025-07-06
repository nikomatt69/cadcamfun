// src/pages/api/ai/openai-proxy.ts
import { NextApiRequest, NextApiResponse } from "next";

// --- Configure API Route ---
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb" // Increase limit to handle Base64 images
    }
  }
};
// --- End Configuration ---

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (process.env.NODE_ENV === "development") {
    console.log("--- [/api/ai/openai-proxy] Received Request --- ");
  }

  try {
    const { model, messages, max_tokens, temperature, tools, tool_choice } = req.body;

    // --- Log received messages structure ---
    console.log("Received messages structure (first few messages):");
    try {
      // Log only the first few messages and roles/content types to avoid huge logs
      const messagesSummary = (messages || []).slice(0, 3).map((msg: any) => ({
        role: msg?.role,
        contentType:
          typeof msg?.content === "string"
            ? "string"
            : Array.isArray(msg?.content)
              ? `array[${msg.content.length}]`
              : typeof msg?.content
      }));
      console.log(JSON.stringify(messagesSummary, null, 2));
      if ((messages || []).length > 3) {
        console.log(`... (${(messages || []).length} total messages)`);
      }
      // Optionally log the full content of the *last* message if debugging image format
      // if (messages && messages.length > 0) {
      //   console.log("Last message content:", JSON.stringify(messages[messages.length - 1].content));
      // }
    } catch (e) {
      console.error("Error logging received messages:", e);
      console.log("Raw messages slice:", messages?.slice(0, 1)); // Log raw first message if stringify fails
    }
    // --- End logging ---

    // Get the API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error("OpenAI API key is missing");
      return res.status(500).json({ error: "OpenAI API key is missing" });
    }

    // Configure request
    const openaiEndpoint = "https://api.openai.com/v1/chat/completions";
    const headers: HeadersInit = {
      // Use HeadersInit type
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    };

    // Add organization ID if available
    if (process.env.OPENAI_ORG_ID) {
      headers["OpenAI-Organization"] = process.env.OPENAI_ORG_ID;
    }

    // Build request body
    const requestBody: any = {
      model,
      messages, // Pass directly
      temperature: temperature || 0.7
    };

    // Add optional parameters
    if (max_tokens) requestBody.max_tokens = max_tokens;
    if (tools) requestBody.tools = tools;
    if (tool_choice) requestBody.tool_choice = tool_choice;

    console.log(`Forwarding request to OpenAI for model: ${model}`);
    // console.log("--- Sending Body to OpenAI (messages part only) ---"); // Optional detailed log
    // console.log(JSON.stringify(requestBody.messages, null, 2));

    // Call OpenAI API
    const openaiResponse = await fetch(openaiEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody)
    });

    console.log(`OpenAI response status: ${openaiResponse.status}`);

    // Forward the status code and body from OpenAI
    res.status(openaiResponse.status);
    // Pipe the response stream for efficiency, especially for large responses
    if (openaiResponse.body) {
      // Use ReadableStream.pipeTo() if available (Node.js 16+)
      // Note: Vercel environment might require specific handling
      try {
        res.setHeader("Content-Type", openaiResponse.headers.get("content-type") || "application/json");
        // Convert Node.js Readable stream to Web ReadableStream if necessary
        // This part can be tricky depending on the exact Node version and fetch implementation
        // For simplicity, let's parse and resend for now, though streaming is better for performance.
        const data = await openaiResponse.json();
        return res.json(data);
      } catch (streamError) {
        console.error("Error processing OpenAI response stream:", streamError);
        // Fallback if streaming/parsing fails
        return res.status(500).json({ error: "Error processing OpenAI response" });
      }
    } else {
      // Handle cases where there might be no body (e.g., 204 No Content)
      return res.end();
    }
  } catch (error) {
    console.error("OpenAI proxy error:", error);
    return res.status(500).json({
      error: "An error occurred while processing your request",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}
