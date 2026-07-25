// src/lib/ai/provider/client.ts
/**
 * LLMClient — the single entrypoint every server route uses to talk to a model.
 *
 * It resolves a model reference through {@link Provider} and runs the request
 * through the Vercel AI SDK (`generateText` / `streamText`). Because the SDK
 * normalizes requests and responses across providers, callers no longer branch
 * on "is this Anthropic or OpenAI" — they pass a model id and get a uniform
 * result. Anthropic extended-thinking is exposed through `reasoning`.
 */

import {
  generateText,
  streamText,
  type CoreMessage,
  type GenerateTextResult,
  type StreamTextResult,
  type ToolSet,
} from "ai";
import { toOpenAIToolCalls } from "./compat";
import { Provider } from "./provider";
import { DEFAULT_MODEL_ID, getModelInfo } from "./models";
import type { ModelRef } from "./schema";

export interface LLMRequest {
  /** ModelRef, "provider/model" string, or bare model id. */
  model?: string | ModelRef | null;
  /** System prompt. */
  system?: string;
  /** Single-turn prompt (mutually exclusive with `messages`). */
  prompt?: string;
  /** Multi-turn conversation. */
  messages?: CoreMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Enable Anthropic extended thinking when the model supports it. */
  reasoning?: boolean;
  /** Token budget for extended thinking. */
  thinkingBudget?: number;
  /** Escape hatch for provider-specific options. */
  providerOptions?: Record<string, any>;
  /** AI SDK tool set (use compat helpers to convert OpenAI tools). */
  tools?: ToolSet;
  /** AI SDK tool choice. */
  toolChoice?: any;
  abortSignal?: AbortSignal;
}

function buildArgs(req: LLMRequest) {
  const model = Provider.getLanguageModel(req.model);
  const info = getModelInfo(
    typeof req.model === "string"
      ? req.model.includes("/")
        ? req.model.split("/")[1]
        : req.model
      : req.model?.modelID ?? DEFAULT_MODEL_ID
  );

  const reasoningEnabled = Boolean(req.reasoning && info?.reasoning);
  const maxTokens = req.maxTokens ?? info?.maxOutput ?? 4096;

  const providerOptions: Record<string, any> = { ...req.providerOptions };
  if (reasoningEnabled) {
    const budgetTokens = Math.max(
      1024,
      Math.min(req.thinkingBudget ?? Math.floor(maxTokens / 2), maxTokens - 1)
    );
    providerOptions.anthropic = {
      ...providerOptions.anthropic,
      thinking: { type: "enabled", budgetTokens },
    };
  }

  return {
    model,
    system: req.system,
    ...(req.messages ? { messages: req.messages } : { prompt: req.prompt ?? "" }),
    maxTokens,
    // Extended thinking requires temperature = 1.
    temperature: reasoningEnabled ? 1 : req.temperature ?? 0.7,
    ...(req.tools ? { tools: req.tools } : {}),
    ...(req.toolChoice ? { toolChoice: req.toolChoice } : {}),
    ...(Object.keys(providerOptions).length ? { providerOptions } : {}),
    abortSignal: req.abortSignal,
  };
}

export namespace LLMClient {
  /** One-shot text generation. */
  export function generate(req: LLMRequest): Promise<GenerateTextResult<any, any>> {
    return generateText(buildArgs(req) as any);
  }

  /** Streaming text generation (returns the AI SDK stream result). */
  export function stream(req: LLMRequest): StreamTextResult<any, any> {
    return streamText(buildArgs(req) as any);
  }

  /**
   * Adapt a {@link generate} result to the Anthropic Messages API response
   * shape that the legacy `unifiedAIService` proxy contract expects
   * (`content[0].text`, `usage.input_tokens` / `output_tokens`).
   */
  export function toAnthropicMessageResponse(
    result: GenerateTextResult<any, any>,
    model: string
  ) {
    return {
      id: result.response?.id ?? `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text: result.text }],
      stop_reason: result.finishReason,
      usage: {
        input_tokens: result.usage?.promptTokens ?? 0,
        output_tokens: result.usage?.completionTokens ?? 0,
      },
    };
  }

  /**
   * Adapt a {@link generate} result to the OpenAI Chat Completions response
   * shape used by the legacy openai proxy contract.
   */
  export function toOpenAIChatResponse(
    result: GenerateTextResult<any, any>,
    model: string
  ) {
    return {
      id: result.response?.id ?? `chatcmpl_${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.text || null,
            ...(result.toolCalls?.length
              ? { tool_calls: toOpenAIToolCalls(result.toolCalls) }
              : {}),
          },
          finish_reason:
            result.finishReason === "tool-calls"
              ? "tool_calls"
              : result.finishReason ?? "stop",
        },
      ],
      usage: {
        prompt_tokens: result.usage?.promptTokens ?? 0,
        completion_tokens: result.usage?.completionTokens ?? 0,
        total_tokens: result.usage?.totalTokens ?? 0,
      },
    };
  }
}
