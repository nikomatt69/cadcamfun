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
  readonly variant?: string
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
  readonly inputWindow?: number
  readonly reasoning?: boolean
  readonly variants?: ReadonlyArray<string>
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

export interface AiQuestion {
  readonly header: string
  readonly question: string
  readonly options: ReadonlyArray<{ readonly label: string; readonly description: string }>
  readonly multiple?: boolean
  readonly custom?: boolean
}
export interface AiPendingQuestion { readonly requestId: string; readonly questions: ReadonlyArray<AiQuestion> }
export interface AiAgent { readonly id: string; readonly title: string; readonly description: string; readonly tools: ReadonlyArray<string>; readonly edits: boolean }
export interface AiContextState {
  readonly memory?: { readonly enabled: boolean; readonly memoryEnabled: boolean; readonly minHours: number; readonly minSessions: number; readonly sessionsSinceLastBrain: number }
  readonly auto: boolean; readonly prune: boolean; readonly reserved?: number
  readonly provider?: string; readonly model?: string; readonly contextWindow?: number; readonly inputWindow?: number
  readonly maxOutput?: number; readonly requestOutput?: number; readonly compactAt?: number; readonly tokens?: number; readonly compacted: boolean
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
  /** The model that answered (provider/model), for the turn footer. */
  readonly model?: string
  readonly finishedAt?: string
  /** The user stopped the turn. */
  readonly interrupted?: boolean
}

export type AiEvent = import("@cadcamfun/api").AiStreamEvent

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

/** A job handed to a specialist agent (`agent_task`), as the host reports it. */
export interface AiTask {
  readonly id: string
  readonly agent: string
  readonly description: string
  readonly status: "queued" | "running" | "completed" | "error" | "cancelled"
  /** false: the main agent waited for it inside the turn. */
  readonly background: boolean
  readonly text?: string
  readonly error?: string
}

export interface AiToolCall {
  readonly images?: ReadonlyArray<string>
  /** The specialist running it; absent when the main agent does. */
  readonly agent?: string
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
  readonly tools?: ReadonlyArray<{ readonly id: string; readonly description: string }>
  readonly providers: Readonly<Record<string, "configured" | "missing">>
  readonly configured: boolean
  readonly host: "nikcli" | "direct"
}
