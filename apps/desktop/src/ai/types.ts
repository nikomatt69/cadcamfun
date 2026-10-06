/**
 * The contract the AI store and the UI share (spec 08-ai.md §3).
 *
 * Mirrors the SSE contract the sidecar streams: `AiEvent` is the wire format
 * nikcli emits through `/api/ai/chat/stream` after `event-mapper.ts` translates
 * the host bus into the public stream events. Everything is plain JSON-safe.
 */

export type ProviderId = "anthropic" | "openai" | "minimax" | "gateway"
export type Tier = "fast" | "balanced" | "best"

export interface ChatModel {
  readonly provider: ProviderId
  readonly model: string
  readonly tier?: Tier
}

export interface ModelInfo {
  readonly id: string
  readonly provider: ProviderId
  readonly tier: Tier
  readonly contextWindow: number
  readonly tools: boolean
  readonly vision: boolean
  readonly configured: boolean
}

export interface AiUsage {
  readonly inputTokens: number
  readonly outputTokens: number
}

export type AiMessageStatus = "streaming" | "done" | "error"

export interface AiMessage {
  readonly id: string
  readonly role: "user" | "assistant" | "system"
  readonly text: string
  readonly createdAt: string
  readonly events: ReadonlyArray<AiEvent>
  readonly status: AiMessageStatus
  readonly usage?: AiUsage
  readonly error?: string
}

export type AiEvent =
  | { readonly type: "delta"; readonly sessionId: string; readonly text: string }
  | { readonly type: "tool_call"; readonly sessionId: string; readonly callId: string; readonly tool: string; readonly input: unknown }
  | { readonly type: "tool_result"; readonly sessionId: string; readonly callId: string; readonly tool: string; readonly ok: boolean; readonly output: string }
  | { readonly type: "permission_request"; readonly sessionId: string; readonly requestId: string; readonly permission: string; readonly patterns: ReadonlyArray<string> }
  | { readonly type: "done"; readonly sessionId: string; readonly text: string; readonly usage?: AiUsage }
  | { readonly type: "error"; readonly sessionId: string; readonly code: "provider" | "config" | "aborted" | "internal"; readonly message: string }

export interface AiToolCall {
  readonly tool: string
  readonly input: unknown
  readonly status: "running" | "ok" | "error"
  readonly output?: string
  readonly sessionId: string
}

export type AiToolCalls = Readonly<Record<string, AiToolCall>>

export interface AiPermission {
  readonly requestId: string
  readonly permission: string
  readonly patterns: ReadonlyArray<string>
  readonly sessionId: string
}

export interface AiSession {
  readonly id: string
  readonly title: string
  readonly startedAt: string
  readonly updatedAt: string
  readonly exchanges: number
}

export interface AiStatus {
  readonly providers: Readonly<Record<string, "configured" | "missing">>
  readonly configured: boolean
  readonly host: "nikcli" | "direct"
}