// src/lib/ai/provider/compat.ts
/**
 * Compatibility helpers that bridge the legacy OpenAI/Anthropic wire shapes the
 * existing services speak to the Vercel AI SDK's normalized `CoreMessage` /
 * tool model. These keep every consumer working unchanged while the actual
 * transport runs through the single unified provider.
 */

import { jsonSchema, tool, type CoreMessage, type ToolSet } from "ai";

/** OpenAI-style function tool: `{ type:"function", function:{ name, description, parameters } }`. */
interface OpenAIFunctionTool {
  type?: "function";
  function: { name: string; description?: string; parameters?: any };
}

/**
 * Convert OpenAI Chat-style messages (string content or multimodal
 * `image_url` / `text` parts) into AI SDK {@link CoreMessage}s.
 */
export function toCoreMessages(messages: any[]): CoreMessage[] {
  return (messages || []).map((m): CoreMessage => {
    const role = m.role === "tool" ? "assistant" : m.role;

    if (typeof m.content === "string" || m.content == null) {
      return { role, content: m.content ?? "" } as CoreMessage;
    }

    if (Array.isArray(m.content)) {
      const parts = m.content.map((part: any) => {
        if (part.type === "text") return { type: "text", text: part.text };
        if (part.type === "image_url") {
          const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url;
          return { type: "image", image: url };
        }
        if (part.type === "image") return { type: "image", image: part.image };
        return { type: "text", text: typeof part === "string" ? part : JSON.stringify(part) };
      });
      return { role, content: parts } as CoreMessage;
    }

    return { role, content: String(m.content) } as CoreMessage;
  });
}

/**
 * Convert OpenAI function tools into an AI SDK {@link ToolSet}. The tools carry
 * no `execute`, so `generateText` returns the model's tool calls without running
 * them — matching the proxy contract where the client executes tools itself.
 */
export function toAISDKTools(openaiTools?: OpenAIFunctionTool[]): ToolSet | undefined {
  if (!openaiTools?.length) return undefined;
  const set: ToolSet = {};
  for (const t of openaiTools) {
    const fn = t.function;
    if (!fn?.name) continue;
    set[fn.name] = tool({
      description: fn.description,
      parameters: jsonSchema(fn.parameters ?? { type: "object", properties: {} }),
    });
  }
  return Object.keys(set).length ? set : undefined;
}

/** Map an OpenAI `tool_choice` value to the AI SDK `toolChoice` option. */
export function toAISDKToolChoice(toolChoice: any) {
  if (!toolChoice) return undefined;
  if (toolChoice === "auto" || toolChoice === "none" || toolChoice === "required") return toolChoice;
  if (typeof toolChoice === "object" && toolChoice.function?.name) {
    return { type: "tool" as const, toolName: toolChoice.function.name };
  }
  return undefined;
}

/** Rebuild OpenAI `message.tool_calls` from an AI SDK result's tool calls. */
export function toOpenAIToolCalls(toolCalls?: any[]) {
  if (!toolCalls?.length) return undefined;
  return toolCalls.map((tc) => ({
    id: tc.toolCallId,
    type: "function" as const,
    function: {
      name: tc.toolName,
      arguments: typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args ?? {}),
    },
  }));
}
