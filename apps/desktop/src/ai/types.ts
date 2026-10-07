/**
 * The contract the AI store and the UI share (spec 08-ai.md §3).
 *
 * Mirrors the SSE contract the sidecar streams: `AiEvent` is the wire format
 * nikcli emits through `/api/ai/chat/stream` after `event-mapper.ts` translates
 * the host bus into the public stream events. Everything is plain JSON-safe.
 */

export type Tier = "fast" | "balanced" | "best"
/**
 * Any provider the embedded host knows: the models.dev catalogue merged with
 * `nikcli.json` (spec 08-ai.md §2). Deliberately not a closed union — the
 * settings browser offers every provider nikcli can talk to.
 */
export type ProviderId = string

export interface ChatModel {
  readonly provider: ProviderId
  readonly model: string
  readonly tier?: Tier
}

export interface ModelInfo {
  readonly id: string
  readonly provider: ProviderId
  /** Absent for models.dev entries: only our built-in fallback tiers carry one. */
  readonly tier?: Tier
  readonly contextWindow: number
  readonly tools: boolean
  readonly vision: boolean
  readonly configured: boolean
}

/** One model of a catalogue provider, exactly as `GET /api/ai/providers` returns it. */
export interface HostModel {
  readonly id: string
  readonly name: string
  readonly provider: string
  readonly contextWindow: number
  readonly maxOutput: number
  readonly tools: boolean
  readonly vision: boolean
  /** USD per million tokens. */
  readonly cost: { readonly input: number; readonly output: number }
}

/** One provider of `GET /api/ai/providers`: the host's catalogue plus our key state. */
export interface ProviderInfo {
  readonly id: string
  readonly name: string
  /** Where the host got it: `models.dev`, `config`, … */
  readonly source: string
  /** How it can be authenticated (`api`, `oauth`). */
  readonly auth: ReadonlyArray<string>
  readonly configured: boolean
  /** Present when the base URL was overridden (OpenAI-compatible endpoints). */
  readonly baseUrl?: string
  readonly models: ReadonlyArray<HostModel>
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