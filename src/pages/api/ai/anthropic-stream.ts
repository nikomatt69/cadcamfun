// src/pages/api/ai/anthropic-stream.ts
import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";
import { LLMClient, DEFAULT_MODEL_ID } from "@/src/lib/ai/provider";
import { toCoreMessages } from "@/src/lib/ai/provider/compat";

/**
 * Streaming chat endpoint, refactored onto the single unified provider
 * (Vercel AI SDK `streamText`). The SSE event protocol is preserved exactly
 * (`thinking`, `thinking_summary`, `text`, `done`, `error`) so existing client
 * stream parsers keep working. Anthropic extended thinking maps to the AI SDK
 * `reasoning` stream parts.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const {
      model = DEFAULT_MODEL_ID,
      messages: incomingMessages = [],
      max_tokens = 4096,
      temperature = 1,
      system,
      reasoningEnabled = true,
    } = req.body;

    // --- Set Up Streaming Response ---
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let streamClosed = false;
    const closeStream = (reason: string) => {
      if (!streamClosed) {
        res.write(`event: done\ndata: ${JSON.stringify({ reason })}\n\n`);
        res.end();
        streamClosed = true;
      }
    };

    const result = LLMClient.stream({
      model,
      system,
      messages: toCoreMessages(incomingMessages),
      maxTokens: max_tokens,
      temperature,
      reasoning: reasoningEnabled,
    });

    let thinkingContent = "";
    const thinkingStartTime = Date.now();

    try {
      for await (const part of result.fullStream) {
        if (streamClosed) break;

        if (part.type === "reasoning") {
          thinkingContent += part.textDelta;
          res.write(`event: thinking\ndata: ${JSON.stringify({ chunk: part.textDelta })}\n\n`);
        } else if (part.type === "text-delta") {
          // Flush the accumulated thinking summary before the first text token.
          if (thinkingContent) {
            const thinkingDuration = Math.round((Date.now() - thinkingStartTime) / 1000);
            res.write(
              `event: thinking_summary\ndata: ${JSON.stringify({
                thinking: thinkingContent,
                duration: thinkingDuration,
              })}\n\n`
            );
            thinkingContent = "";
          }
          res.write(`event: text\ndata: ${JSON.stringify({ chunk: part.textDelta })}\n\n`);
        } else if (part.type === "error") {
          const message = part.error instanceof Error ? part.error.message : String(part.error);
          res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
          closeStream("error");
          break;
        } else if (part.type === "finish") {
          closeStream("stop");
          break;
        }
      }
    } catch (error: any) {
      console.error("Anthropic stream processing error:", error);
      if (!streamClosed) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message || "Stream processing error" })}\n\n`);
        closeStream("error");
      }
    } finally {
      if (!streamClosed) {
        closeStream("finished");
      }
    }
  } catch (error: any) {
    console.error("Error in anthropic-stream handler:", error);
    if (!res.writableEnded) {
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to process request", details: error.message || String(error) });
      } else {
        try {
          res.write(`event: error\ndata: ${JSON.stringify({ message: error.message || "Handler error" })}\n\n`);
        } finally {
          res.end();
        }
      }
    }
  }
}
