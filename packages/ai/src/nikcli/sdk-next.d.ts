/**
 * Ambient declaration for the part of `@nikcli-ai/sdk-next@1.428.0` this
 * package uses. The upstream package ships `index.js` only (spec 08, 6.1).
 * Everything the app touches is imported through `./host.ts`, so a future API
 * change is confined to this folder.
 */
declare module "@nikcli-ai/sdk-next" {
  import type { Effect } from "effect"
  import type { z } from "zod"

  /** Context handed to `Tool.define(...).execute`. */
  export interface ToolExecuteContext {
    readonly sessionID: string
    readonly messageID: string
    readonly agent: string
    readonly callID?: string
    readonly ask: (input: { permission: string; patterns: string[]; always: string[]; metadata: Record<string, unknown> }) => Promise<void>
    readonly abort: AbortSignal
  }

  export interface ToolExecuteResult {
    readonly title: string
    readonly output: string
    /** The success value Code Mode receives when the tool declares an `output` codec. */
    readonly value?: unknown
    readonly metadata: Record<string, unknown>
    readonly attachments?: ReadonlyArray<{ readonly id: string; readonly sessionID: string; readonly messageID: string; readonly type: "file"; readonly mime: string; readonly filename?: string; readonly url: string }>
  }

  export interface ToolDefinition {
    readonly description: string
    /** A zod 4 object schema. */
    readonly parameters: unknown
    /** A zod codec for `value`; when present, Code Mode reads `value` instead of the text `output`. */
    readonly output?: unknown
    readonly formatValidationError?: (error: z.ZodError) => string
    readonly execute: (args: never, ctx: ToolExecuteContext) => Promise<ToolExecuteResult>
  }

  /** Opaque value accepted by `NikCli.tools.register`. */
  export interface ToolInfo {
    readonly id: string
  }

  export const Tool: {
    define(id: string, init: () => Promise<ToolDefinition>): ToolInfo
  }

  export class ClientError extends Error {
    readonly reason: string
  }

  /** Subset of the host's SSE bus event. */
  export interface HostEvent {
    readonly type: string
    readonly properties: Record<string, unknown>
  }

  export interface HostGoalState {
    readonly sessionID: string
    readonly objective: string
    readonly status: "active" | "paused" | "blocked" | "usage_limited" | "budget_limited" | "complete"
    readonly tokenBudget?: number
    readonly tokensUsed: number
    readonly timeUsedSeconds: number
    readonly iterationCount: number
  }

  export interface HostContextBreakdown {
    readonly estimatedTotal: number
    readonly reported?: { readonly total: number }
    readonly sources: ReadonlyArray<{ readonly category: string; readonly label: string; readonly tokens: number; readonly enabled: boolean }>
  }

  export interface HostSession {
    readonly id: string
    readonly parentID?: string
    readonly title: string
    readonly directory: string
  }

  export interface HostMessageInfo {
    readonly id: string
    readonly role: string
    readonly error?: { readonly name?: string; readonly data?: { readonly message?: string } }
    readonly tokens?: { readonly input: number; readonly output: number; readonly total?: number; readonly cache?: { readonly read: number; readonly write: number } }
    readonly finish?: string
    readonly summary?: boolean
    readonly system?: string
    readonly variant?: string
    readonly agent?: string
    /** On a user message: the model the turn was sent with. */
    readonly model?: { readonly providerID?: string; readonly modelID?: string }
  }

  export interface HostPart {
    readonly id: string
    readonly type: string
    readonly text?: string
    /** Attributes a part was stored with (a text part keeps the `metadata` it was prompted with). */
    readonly metadata?: Readonly<Record<string, unknown>>
    readonly tool?: string
    readonly callID?: string
    readonly state?: {
      readonly status: string
      readonly input?: unknown
      readonly output?: string
      readonly error?: string
    }
  }

  export interface HostPromptResult {
    readonly info?: HostMessageInfo
    readonly parts?: ReadonlyArray<HostPart>
    /** Present instead of `info` when the host rejected the prompt. */
    readonly name?: string
    readonly data?: { readonly message?: string }
  }

  export interface RequestOptions {
    readonly signal?: AbortSignal
    readonly headers?: HeadersInit
  }

  /** A model as the host catalogue describes it. */
  export interface HostModel {
    readonly id?: string
    readonly name?: string
    readonly providerID?: string
    readonly capabilities?: {
      readonly toolcall?: boolean
      readonly attachment?: boolean
      readonly reasoning?: boolean
      readonly input?: { readonly text?: boolean; readonly image?: boolean }
    }
    readonly limit?: { readonly context?: number; readonly input?: number; readonly output?: number }
    readonly variants?: Readonly<Record<string, unknown>>
    readonly cost?: { readonly input?: number; readonly output?: number }
    readonly status?: string
  }

  /** A provider as the host catalogue describes it (models.dev ∪ `nikcli.json`). */
  export interface HostProvider {
    readonly id: string
    readonly name?: string
    readonly source?: string
    readonly env?: ReadonlyArray<string>
    readonly models: Readonly<Record<string, HostModel>>
  }

  export interface HostClient {
    readonly session: {
      create(input?: { title?: string; parentID?: string }, options?: RequestOptions): Promise<HostSession>
      list(input?: { limit?: number }, options?: RequestOptions): Promise<ReadonlyArray<HostSession>>
      get(input: { sessionID: string }, options?: RequestOptions): Promise<HostSession>
      remove(input: { sessionID: string }, options?: RequestOptions): Promise<boolean>
      abort(input: { sessionID: string }, options?: RequestOptions): Promise<boolean>
      summarize(input: { sessionID: string; providerID: string; modelID: string; auto?: boolean }, options?: RequestOptions): Promise<boolean>
      messages(
        input: { sessionID: string; limit?: number },
        options?: RequestOptions
      ): Promise<ReadonlyArray<{ info: HostMessageInfo; parts: ReadonlyArray<HostPart> }>>
      /** nikcli's `SessionGoal` state of the session, or null when it has none. */
      goal(input: { sessionID: string }, options?: RequestOptions): Promise<HostGoalState | null>
      /** Runs one of the host's commands (`goal`, `init`, ...) in the session; the result is the message it wrote or the turn it started. */
      command(
        input: { sessionID: string; command: string; arguments: string; agent?: string; model?: string; variant?: string; delivery?: "steer" | "queue" },
        options?: RequestOptions
      ): Promise<HostPromptResult>
      /** nikcli's `SessionContext.breakdown`: where the tokens of the next request come from (estimated, per source). */
      contextBreakdown(input: { sessionID: string }, options?: RequestOptions): Promise<HostContextBreakdown>
    }
    readonly "session-prompt": {
      prompt(
        input: {
          sessionID: string
          delivery?: "steer" | "queue"
          agent?: string
          model?: { providerID: string; modelID: string }
          variant?: string
          system?: string
          tools?: Record<string, boolean>
          parts: ReadonlyArray<
            | { type: "text"; text: string; synthetic?: boolean; metadata?: Record<string, unknown> }
            | { type: "file"; mime: string; filename?: string; url: string }
          >
        },
        options?: RequestOptions
      ): Promise<HostPromptResult>
      /** Pinned bundle: generated client /prompt_async; admission uses the native pending queue. The body is empty (204), the generated client returns the wrapper. */
      promptAsync(
        input: {
          sessionID: string
          delivery?: "steer" | "queue"
          agent?: string
          model?: { providerID: string; modelID: string }
          variant?: string
          parts: ReadonlyArray<{ type: "text"; text: string; synthetic?: boolean }>
        },
        options?: RequestOptions
      ): Promise<unknown>
    }
    readonly events: {
      subscribe(options?: RequestOptions): AsyncIterable<HostEvent>
    }
    readonly provider: {
      /** Every provider the host knows, with its models (models.dev ∪ config). */
      list(options?: RequestOptions): Promise<{
        all: ReadonlyArray<HostProvider>
        connected: ReadonlyArray<string>
      }>
      /** Which authentication methods each provider accepts. */
      auth(options?: RequestOptions): Promise<Readonly<Record<string, ReadonlyArray<{ type: string; label?: string }>>>>
      api(input: { providerID: string; key: string }, options?: RequestOptions): Promise<unknown>
      removeAuth(input: { providerID: string }, options?: RequestOptions): Promise<unknown>
      oauthAuthorize(input: { providerID: string; method: number }, options?: RequestOptions): Promise<unknown>
      oauthCallback(input: { providerID: string; method: number; code?: string }, options?: RequestOptions): Promise<boolean>
    }
    readonly permission: {
      list(options?: RequestOptions): Promise<ReadonlyArray<Record<string, unknown>>>
      reply(
        input: { requestID: string; reply: "once" | "always" | "reject"; message?: string },
        options?: RequestOptions
      ): Promise<boolean>
    }
    readonly brain: {
      status(options?: RequestOptions): Promise<HostBrainStatus>
      trigger(input: { force?: boolean; sessionID?: string }, options?: RequestOptions): Promise<{ success: boolean; sessionsReviewed: number; hoursSinceLastBrain: number; error?: string; sessionID?: string }>
    }
    readonly question: {
      list(options?: RequestOptions): Promise<ReadonlyArray<HostQuestionRequest>>
      reply(input: { requestID: string; answers: ReadonlyArray<ReadonlyArray<string>> }, options?: RequestOptions): Promise<boolean>
      reject(input: { requestID: string }, options?: RequestOptions): Promise<boolean>
    }
    readonly mcp: {
      status(options?: RequestOptions): Promise<Readonly<Record<string, { readonly status: string; readonly error?: string }>>>
      connect(input: { name: string }, options?: RequestOptions): Promise<unknown>
      disconnect(input: { name: string }, options?: RequestOptions): Promise<unknown>
    }
    readonly config: {
      get(options?: RequestOptions): Promise<Record<string, unknown>>
    }
    readonly "config-management": {
      reload(options?: RequestOptions): Promise<unknown>
    }
    readonly mod: {
      /** The mods the live host actually loaded, with the events each one hooks (spec 27 §4.3). */
      list(options?: RequestOptions): Promise<ReadonlyArray<HostModInfo>>
    }
    readonly "top-level": {
      agent(options?: RequestOptions): Promise<ReadonlyArray<Record<string, unknown>>>
      dispose(options?: RequestOptions): Promise<unknown>
      skill(options?: RequestOptions): Promise<ReadonlyArray<{ name: string; description: string; location: string }>>
    }
    readonly experimental: {
      toolIDs(options?: RequestOptions): Promise<ReadonlyArray<string>>
      tools(
        input: { provider: string; model: string },
        options?: RequestOptions
      ): Promise<ReadonlyArray<{ id: string; description: string; parameters: unknown }>>
    }
  }

  export interface HostRegistration {
    readonly close: () => Promise<void>
  }

  /** One entry of `mod.list`: a mod the live host loaded, as the host itself reports it. */
  export interface HostModInfo {
    /** For a mod declared by configuration, the `file://` spec it was loaded from. */
    readonly id: string
    readonly name: string
    readonly tier: string
    readonly rank: number
    /** The event names this mod registered a hook on; empty means it loaded but hooks nothing. */
    readonly events: ReadonlyArray<string>
    /** Names of the tools the mod registered. */
    readonly tools: ReadonlyArray<string>
    readonly commands: ReadonlyArray<string>
  }

  export interface NikCliHostInstance extends HostClient {
    readonly tools: {
      /** With the `registration-handles` host patch: one handle per batch; `close` removes exactly these registrations. */
      register(...tools: ToolInfo[]): Effect.Effect<HostRegistration, Error>
    }
  }

  export interface HostBrainStatus {
    readonly enabled: boolean; readonly memoryEnabled: boolean; readonly minHours: number; readonly minSessions: number
    readonly lastBrainAt: number; readonly hoursSinceLastBrain: number; readonly sessionsSinceLastBrain: number; readonly shouldTrigger: boolean
  }

  export interface HostQuestionRequest {
    readonly id: string
    readonly sessionID: string
    readonly questions: ReadonlyArray<{ readonly header: string; readonly question: string; readonly options: ReadonlyArray<{ readonly label: string; readonly description: string }>; readonly multiple?: boolean; readonly custom?: boolean }>
  }

  export namespace NikCli {
    function create(options?: { directory?: string }): Effect.Effect<NikCliHostInstance>
  }
}
