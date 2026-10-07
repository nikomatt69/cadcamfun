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
  /** Names of the files sent with a user message. */
  readonly attachments?: ReadonlyArray<string>
  /** The model's reasoning for this answer, as it was written. */
  readonly thinking?: string
}

export type AiEvent =
  | { readonly type: "delta"; readonly sessionId: string; readonly text: string }
  | { readonly type: "tool_call"; readonly sessionId: string; readonly callId: string; readonly tool: string; readonly input: unknown }
  | { readonly type: "tool_result"; readonly sessionId: string; readonly callId: string; readonly tool: string; readonly ok: boolean; readonly output: string }
  | { readonly type: "permission_request"; readonly sessionId: string; readonly requestId: string; readonly permission: string; readonly patterns: ReadonlyArray<string> }
  | { readonly type: "done"; readonly sessionId: string; readonly text: string; readonly usage?: AiUsage; /** The connection dropped and the finished answer was read back from the host. */ readonly recovered?: boolean }
  | { readonly type: "error"; readonly sessionId: string; readonly code: "provider" | "config" | "aborted" | "internal"; readonly message: string }
  | { readonly type: "reasoning"; readonly sessionId: string; readonly text: string }
  | { readonly type: "tool_progress"; readonly sessionId: string; readonly callId: string; readonly tool: string; readonly chars: number }
  | { readonly type: "step"; readonly sessionId: string; readonly phase: "start" | "finish"; readonly index: number; readonly reason?: string; readonly usage?: AiUsage }
  | { readonly type: "todo"; readonly sessionId: string; readonly todos: ReadonlyArray<AiTodo> }
  | { readonly type: "retry"; readonly sessionId: string; readonly attempt: number; readonly message: string }
  | { readonly type: "compacted"; readonly sessionId: string }
  | { readonly type: "goal"; readonly sessionId: string; readonly goal: AiGoal | null }

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled"
export interface AiTodo { readonly id?: string; readonly content: string; readonly status: TodoStatus; readonly priority?: string }
export type GoalStatus = "active" | "paused" | "blocked" | "usage_limited" | "budget_limited" | "complete"
export interface AiGoal { readonly objective: string; readonly status: GoalStatus; readonly iteration: number; readonly tokensUsed: number; readonly tokenBudget?: number }

/** What the agent is doing right now, from the events of the turn in progress. */
export interface AiActivity {
  /** Step of the turn (a model call plus its tools); 0 before the first. */
  readonly step: number
  /** A tool whose arguments are still being written, with how many characters so far. */
  readonly preparing?: { readonly tool: string; readonly chars: number }
  /** The provider failed and the host is trying again, or the turn is being resumed. */
  readonly retry?: { readonly attempt: number; readonly message: string }
  /** The conversation was summarised to fit the model's window. */
  readonly compacted: boolean
}

export interface AiToolCall {
  readonly tool: string
  readonly input: unknown
  readonly status: "preparing" | "running" | "ok" | "error"
  /** Characters of arguments written so far, while `preparing`. */
  readonly chars?: number
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
  /** The project whose host holds the conversation. */
  readonly projectId?: string
}

export interface AiStatus {
  readonly providers: Readonly<Record<string, "configured" | "missing">>
  readonly configured: boolean
  readonly host: "nikcli" | "direct"
}