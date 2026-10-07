/**
 * SSE client for nikcli (spec 08-ai.md §3, WP8).
 *
 * The sidecar's `chatStream` endpoint is `HttpApiSchema.StreamSse({ data: unknown })`,
 * so the typed client resolves to `Effect<Stream<unknown, ...>>`. We narrow that
 * to the public `AiEvent` shape, decode each `data:` line as JSON, validate the
 * envelope, then run the nikcli-style tool-call checks (allow-list, input shape,
 * per-tool Effect Schema) before any event reaches the store.
 *
 * Aborting the chat uses the same `chatAbort` endpoint the store's `abort()`
 * calls; cancelling the stream is enough to keep the UI responsive.
 */
import { Effect, Queue, Schema, Stream } from "effect"
import type { Client, AppRuntime } from "../state/client.ts"
import type { AiEvent, AiTodo, ProviderId, Tier } from "./types.ts"
import type { ChatAttachment } from "./attachments.ts"
import { TOOL_IDS, type ToolId } from "./tools.ts"
import { ToolInputSchemas } from "./tool-schemas.ts"
import { sanitizeError } from "./errors.ts"

export class AiStreamError extends Schema.TaggedError<AiStreamError>()("AiStreamError", {
  message: Schema.String
}, { httpApiStatus: 500 }) {}

/** Cap the JSON size of one tool_call.input so a runaway AI can't push MBs through the UI. */
const MAX_INPUT_BYTES = 256_000
/** Cap individual text/output payloads to keep the transcript sane. */
const MAX_TEXT_BYTES = 64_000
/** Cap tool_result output the same way: tool answers tend to be bounded. */
const MAX_OUTPUT_BYTES = 256_000

const AiEventSchema = Schema.fromJsonString(
  Schema.Struct({
    type: Schema.String,
    sessionId: Schema.String,
    text: Schema.optional(Schema.String),
    callId: Schema.optional(Schema.String),
    tool: Schema.optional(Schema.String),
    input: Schema.optional(Schema.Unknown),
    ok: Schema.optional(Schema.Boolean),
    output: Schema.optional(Schema.String),
    requestId: Schema.optional(Schema.String),
    permission: Schema.optional(Schema.String),
    patterns: Schema.optional(Schema.Array(Schema.String)),
    code: Schema.optional(Schema.String),
    message: Schema.optional(Schema.String),
    usage: Schema.optional(Schema.Struct({
      inputTokens: Schema.Number,
      outputTokens: Schema.Number
    }))
  })
)

const decodeEvent = (json: string): AiEvent => {
  const raw = JSON.parse(json) as Record<string, unknown>
  const type = raw["type"]
  const sessionId = typeof raw["sessionId"] === "string" ? (raw["sessionId"] as string) : ""
  if (type === "delta") return { type: "delta", sessionId, text: typeof raw["text"] === "string" ? cap(raw["text"], MAX_TEXT_BYTES, "<truncated>") : "" }
  if (type === "tool_call") return {
    type: "tool_call", sessionId,
    callId: typeof raw["callId"] === "string" ? (raw["callId"] as string) : "",
    tool: typeof raw["tool"] === "string" ? (raw["tool"] as string) : "",
    input: raw["input"]
  }
  if (type === "tool_result") return {
    type: "tool_result", sessionId,
    callId: typeof raw["callId"] === "string" ? (raw["callId"] as string) : "",
    tool: typeof raw["tool"] === "string" ? (raw["tool"] as string) : "",
    ok: raw["ok"] === true,
    output: typeof raw["output"] === "string" ? cap(raw["output"], MAX_OUTPUT_BYTES, "<truncated>") : ""
  }
  if (type === "permission_request") return {
    type: "permission_request", sessionId,
    requestId: typeof raw["requestId"] === "string" ? (raw["requestId"] as string) : "",
    permission: typeof raw["permission"] === "string" ? (raw["permission"] as string) : "",
    patterns: Array.isArray(raw["patterns"]) ? (raw["patterns"] as ReadonlyArray<string>) : []
  }
  if (type === "done") {
    const u = raw["usage"] as { inputTokens?: number; outputTokens?: number } | undefined
    return {
      type: "done", sessionId,
      text: typeof raw["text"] === "string" ? cap(raw["text"], MAX_TEXT_BYTES, "<truncated>") : "",
      ...(u && typeof u.inputTokens === "number" && typeof u.outputTokens === "number"
        ? { usage: { inputTokens: u.inputTokens, outputTokens: u.outputTokens } } : {})
    }
  }
  if (type === "error") {
    const code = raw["code"] === "config" || raw["code"] === "aborted" || raw["code"] === "internal" ? raw["code"] : "provider"
    const rawMessage = typeof raw["message"] === "string" ? cap(raw["message"], MAX_TEXT_BYTES, "<truncated>") : "AI request failed"
    // Provider errors arrive as raw JSON with auth-header names and request
    // ids. The UI transcript must not surface those; sanitise here.
    if (code === "provider") console.error("AI provider error", rawMessage)
    return { type: "error", sessionId, code, message: sanitizeError(rawMessage) }
  }
  return { type: "error", sessionId, code: "internal", message: sanitizeError(`Unknown AI event: ${type}`) }
}

export { decodeEvent }

export interface StreamCallbacks {
  readonly onEvent: (event: AiEvent) => void
  readonly onError: (message: string) => void
  readonly onDone: () => void
}

/** How long, and how often, a dropped turn is looked up before giving up. */
const RECOVER_WINDOW_MS = 20 * 60_000
const RECOVER_POLL_MS = 1_500

export interface StreamInput {
  readonly message: string
  readonly sessionId: string
  readonly projectId?: string
  readonly context?: string
  readonly attachments?: ReadonlyArray<ChatAttachment>
  readonly model?: { readonly provider: ProviderId; readonly model: string; readonly tier?: Tier }
}

export interface StreamHandle {
  abort(): void
}

/** The full Effect: POST + SSE parsing + per-line decoding, exposed for tests. */
export const streamChatEffect = (
  client: Client,
  input: StreamInput,
  signal?: AbortSignal
): Stream.Stream<AiEvent, AiStreamError> =>
  Stream.callback<AiEvent, AiStreamError>((queue) =>
    Effect.gen(function* () {
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener("abort", abort, { once: true })
      yield* Effect.addFinalizer(() => Effect.sync(() => {
        signal?.removeEventListener("abort", abort)
        controller.abort()
      }))
      const offer = (event: AiEvent) => void Queue.offerUnsafe(queue, event)
      /** Per-session tool-call tracking, mirrors `event-mapper.ts` in nikcli:
       *  a `tool_result` without a preceding `tool_call` gets the call synthesised
       *  so the store always sees the start of a tool. */
      const calls: CallState = { started: new Set<string>(), finished: new Set<string>() }

      /**
       * The turn belongs to the host session, so a dropped connection does not end it. Ask the host how the conversation stands until
       * it is idle, then hand over what it finished with. Returns false when nothing could be read back.
       */
      const recover = async (): Promise<boolean> => {
        const until = Date.now() + RECOVER_WINDOW_MS
        let misses = 0
        while (!controller.signal.aborted && Date.now() < until) {
          try {
            const state = await Effect.runPromise(client.ai.sessionState({ payload: { sessionId: input.sessionId, ...(input.projectId !== undefined ? { projectId: input.projectId } : {}) } }))
            misses = 0
            if (!state.busy) {
              if (state.error !== undefined) offer({ type: "error", sessionId: input.sessionId, code: "provider", message: sanitizeError(state.error) })
              else if (state.text.trim() !== "") offer({ type: "done", sessionId: input.sessionId, text: state.text, recovered: true })
              else return false
              return true
            }
          } catch {
            if (++misses >= 5) return false
          }
          await new Promise((resolve) => setTimeout(resolve, RECOVER_POLL_MS))
        }
        return false
      }

      const pump = (async () => {
        let ended = false
        try {
          const http = client.ai.chatStream({ payload: {
            message: input.message,
            sessionId: input.sessionId,
            ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
            ...(input.context !== undefined ? { context: input.context } : {}),
            ...(input.attachments !== undefined && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
            ...(input.model !== undefined ? { model: input.model } : {})
          } })
          const stream = await Effect.runPromise(http)
          const items = Stream.toAsyncIterable(stream)
          for await (const item of items) {
            if (controller.signal.aborted) break
            // Keep-alive events carry nothing for the transcript.
            if (isHeartbeat(item)) continue
            const decoded = await Effect.runPromise(decodeEventSafely(item))
            for (const event of dispatch(decoded, calls)) {
              if (event.type === "done" || event.type === "error") ended = true
              offer(event)
            }
          }
          // A stream that stops without its closing event was cut, not finished.
          if (!ended && !controller.signal.aborted) throw new Error("The connection closed before the answer was complete")
        } catch (cause) {
          if (controller.signal.aborted) return
          // The full cause goes to the console for debugging; the UI sees a sanitised message.
          console.error("AI stream interrupted", cause)
          if (await recover()) return
          offer({
            type: "error" as const, sessionId: input.sessionId, code: "internal" as const, message: sanitizeError(describe(cause))
          })
        }
      })()

      yield* Effect.tryPromise({
        try: async () => { await pump },
        catch: (cause) => new AiStreamError({ message: sanitizeError(describe(cause)) })
      }).pipe(
        Effect.matchCauseEffect({
          onSuccess: () => Queue.end(queue),
          onFailure: (cause) => Queue.failCause(queue, cause)
        })
      )
    })
  )

const describe = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === "string" ? e : "The AI sidecar is unreachable."

/** Events of the agent loop (steps, plan, reasoning, progress, retry, compaction, goal): passed on whole, only shape-checked. */
const decodeAgentEvent = (raw: unknown): AiEvent | undefined => {
  if (typeof raw !== "object" || raw === null) return undefined
  const r = raw as Record<string, unknown>
  const sessionId = typeof r["sessionId"] === "string" ? r["sessionId"] : ""
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)
  switch (r["type"]) {
    case "reasoning": return typeof r["text"] === "string" && r["text"] !== "" ? { type: "reasoning", sessionId, text: cap(r["text"], MAX_TEXT_BYTES, "<truncated>") } : undefined
    case "tool_progress": return { type: "tool_progress", sessionId, callId: String(r["callId"] ?? ""), tool: String(r["tool"] ?? ""), chars: num(r["chars"]) }
    case "step": {
      const u = r["usage"] as { inputTokens?: unknown; outputTokens?: unknown } | undefined
      return {
        type: "step", sessionId, phase: r["phase"] === "finish" ? "finish" : "start", index: num(r["index"]),
        ...(typeof r["reason"] === "string" ? { reason: r["reason"] } : {}),
        ...(u && typeof u.inputTokens === "number" && typeof u.outputTokens === "number" ? { usage: { inputTokens: u.inputTokens, outputTokens: u.outputTokens } } : {})
      }
    }
    case "todo": {
      const statuses = ["pending", "in_progress", "completed", "cancelled"] as const
      const todos = (Array.isArray(r["todos"]) ? r["todos"] : []).flatMap((t): AiTodo[] => {
        const x = t as Record<string, unknown>
        return typeof x["content"] === "string"
          ? [{ ...(typeof x["id"] === "string" ? { id: x["id"] } : {}), content: x["content"], status: statuses.find((s) => s === x["status"]) ?? "pending", ...(typeof x["priority"] === "string" ? { priority: x["priority"] } : {}) }]
          : []
      })
      return { type: "todo", sessionId, todos }
    }
    case "retry": return { type: "retry", sessionId, attempt: num(r["attempt"]), message: sanitizeError(String(r["message"] ?? "")) }
    case "compacted": return { type: "compacted", sessionId }
    case "goal": {
      const g = r["goal"] as Record<string, unknown> | null
      if (g === null || typeof g !== "object") return { type: "goal", sessionId, goal: null }
      const statuses = ["active", "paused", "blocked", "usage_limited", "budget_limited", "complete"] as const
      const status = statuses.find((s) => s === g["status"])
      if (status === undefined || typeof g["objective"] !== "string") return undefined
      return { type: "goal", sessionId, goal: { objective: g["objective"], status, iteration: num(g["iteration"]), tokensUsed: num(g["tokensUsed"]), ...(typeof g["tokenBudget"] === "number" ? { tokenBudget: g["tokenBudget"] } : {}) } }
    }
    default: return undefined
  }
}

const isHeartbeat = (raw: unknown): boolean => {
  if (typeof raw === "string") return raw.includes('"heartbeat"') && raw.length < 64 && raw.includes('"type"')
  return typeof raw === "object" && raw !== null && (raw as { type?: unknown }).type === "heartbeat"
}

const decodeEventSafely = (raw: unknown): Effect.Effect<AiEvent, AiStreamError> =>
  Effect.try({
    try: () => {
      const text = typeof raw === "string" ? raw : JSON.stringify(raw)
      const parsed = JSON.parse(text) as unknown
      const agent = decodeAgentEvent(parsed)
      if (agent !== undefined) return agent
      // Schema validation is best-effort: a non-conforming event still becomes a
      // valid error event rather than crashing the stream. The narrow
      // `decodeEvent` (the original lenient decoder) is the source of truth.
      try {
        const value = Schema.decodeUnknownSync(AiEventSchema)(parsed)
        return decodeEventFromUnknown(value)
      } catch {
        // Fallback to the lenient decoder that does not throw on unknown types.
        const json = typeof parsed === "string" ? parsed : text
        return decodeEvent(json)
      }
    },
    catch: (e) => new AiStreamError({ message: e instanceof Error ? e.message : "Failed to parse AI event." })
  })

const decodeEventFromUnknown = (raw: { type: string; sessionId: string; text?: string; callId?: string; tool?: string; input?: unknown; ok?: boolean; output?: string; requestId?: string; permission?: string; patterns?: ReadonlyArray<string>; code?: string; message?: string; usage?: { inputTokens: number; outputTokens: number } }): AiEvent => {
  if (raw.type === "delta") return { type: "delta", sessionId: raw.sessionId, text: cap(raw.text ?? "", MAX_TEXT_BYTES, "<truncated>") }
  if (raw.type === "tool_call") return { type: "tool_call", sessionId: raw.sessionId, callId: raw.callId ?? "", tool: raw.tool ?? "", input: raw.input }
  if (raw.type === "tool_result") return { type: "tool_result", sessionId: raw.sessionId, callId: raw.callId ?? "", tool: raw.tool ?? "", ok: raw.ok === true, output: cap(raw.output ?? "", MAX_OUTPUT_BYTES, "<truncated>") }
  if (raw.type === "permission_request") return { type: "permission_request", sessionId: raw.sessionId, requestId: raw.requestId ?? "", permission: raw.permission ?? "", patterns: raw.patterns ?? [] }
  if (raw.type === "done") return {
    type: "done", sessionId: raw.sessionId, text: cap(raw.text ?? "", MAX_TEXT_BYTES, "<truncated>"),
    ...(raw.usage ? { usage: { inputTokens: raw.usage.inputTokens, outputTokens: raw.usage.outputTokens } } : {})
  }
  const code = raw.code === "config" || raw.code === "aborted" || raw.code === "internal" ? raw.code : "provider"
  const rawMessage = cap(raw.message ?? "AI request failed", MAX_TEXT_BYTES, "<truncated>")
  if (code === "provider") console.error("AI provider error", rawMessage)
  return { type: "error", sessionId: raw.sessionId, code, message: sanitizeError(rawMessage) }
}

const cap = (text: string, limit: number, marker: string): string =>
  text.length <= limit ? text : `${text.slice(0, limit - marker.length)}${marker}`

interface CallState {
  readonly started: Set<string>
  readonly finished: Set<string>
}

const isToolId = (tool: string): tool is ToolId =>
  (TOOL_IDS as ReadonlyArray<string>).includes(tool)

const inputSize = (input: unknown): number => {
  try { return JSON.stringify(input).length } catch { return Number.POSITIVE_INFINITY }
}

/** nikcli-style rejection: the model attempted a tool, the host answered with
 *  an error. Same callId, ok:false, and the validator's message as the output
 *  so the UI's tool reducer marks the call as `error` and surfaces the reason. */
const rejectToolCall = (
  event: Extract<AiEvent, { type: "tool_call" }>,
  output: string
): AiEvent => ({
  type: "tool_result",
  sessionId: event.sessionId,
  callId: event.callId,
  tool: event.tool,
  ok: false,
  output
})

/**
 * Validate a `tool_call` event the way the nikcli sidecar does:
 *
 *   1. The cadcam allow-list (`packages/ai/src/nikcli/config.ts` exposes exactly
 *      the ids in `tools.ts`; everything else is filtered out before the model
 *      sees it). Mirrors nikcli's locked-down agent rule.
 *   2. The per-tool Effect Schema in `tool-schemas.ts`, which mirrors the zod
 *      schemas in `packages/ai/src/tools/catalogue.ts`. Mirrors nikcli's
 *      `Tool.define` calling `parameters.parse(args)` — strict `.parse`,
 *      throws on any deviation.
 *
 * On success the original `tool_call` is returned (with `callId` added to
 * `started` so a trailing `tool_result` reconciles). On failure both the
 * original `tool_call` and a `tool_result { ok: false }` are returned — the
 * same shape nikcli produces internally (a `tool-call` event followed by a
 * `tool-error`). The error wording matches what nikcli surfaces back to the
 * model after `parameters.parse(args)` rejects, so the transcript reads the
 * same on both sides.
 */
/** Tools the host itself offers the agent (its skill loader, plan and goal): no schema of ours, never rejected. */
export const HOST_TOOLS: ReadonlyArray<string> = ["skill", "todowrite", "todoread", "get_goal", "create_goal", "update_goal"]

export const validateToolCall = (
  event: Extract<AiEvent, { type: "tool_call" }>,
  state: CallState
): ReadonlyArray<AiEvent> => {
  if (HOST_TOOLS.includes(event.tool)) return [event]
  if (!isToolId(event.tool)) {
    return [
      event,
      rejectToolCall(event, `Tool "${event.tool}" is not allowed. The cadcam agent may only call: ${TOOL_IDS.join(", ")}.`)
    ]
  }
  if (typeof event.input !== "object" || event.input === null || Array.isArray(event.input)) {
    return [
      event,
      rejectToolCall(event, `The ${event.tool} tool was called with invalid arguments: input must be a JSON object.`)
    ]
  }
  const size = inputSize(event.input)
  if (size > MAX_INPUT_BYTES) {
    return [
      event,
      rejectToolCall(event, `The ${event.tool} tool was called with invalid arguments: input is ${size} bytes; max is ${MAX_INPUT_BYTES}.`)
    ]
  }
  const schema = ToolInputSchemas[event.tool]
  try {
    Schema.decodeUnknownSync(schema as Schema.Decoder<unknown>)(event.input)
  } catch (cause) {
    const reason = cause instanceof Error
      ? cause.message.split("\n").slice(0, 2).join("; ")
      : "input failed schema validation"
    return [
      event,
      rejectToolCall(event, `The ${event.tool} tool was called with invalid arguments: ${reason}. Please rewrite the input so it satisfies the expected schema.`)
    ]
  }
  state.started.add(event.callId)
  return [event]
}

/**
 * If a `tool_result` arrives without a preceding `tool_call` (the host can
 * batch events) emit a synthetic call first so the transcript always shows
 * the start of a tool. Mirrors `mapHostEvent` in `event-mapper.ts`.
 */
const reconcileToolResult = (
  event: Extract<AiEvent, { type: "tool_result" }>,
  state: CallState
): ReadonlyArray<AiEvent> => {
  if (state.finished.has(event.callId)) return [event]
  const events: AiEvent[] = []
  if (!state.started.has(event.callId)) {
    state.started.add(event.callId)
    events.push({ type: "tool_call", sessionId: event.sessionId, callId: event.callId, tool: event.tool, input: {} })
  }
  state.finished.add(event.callId)
  events.push(event)
  return events
}

/**
 * Apply nikcli-pattern validation: validate every tool call before it reaches
 * the store; reconcile tool results that arrive without their call. All other
 * event types pass through untouched.
 */
export const dispatch = (event: AiEvent, state: CallState): ReadonlyArray<AiEvent> => {
  if (event.type === "tool_call") return validateToolCall(event, state)
  if (event.type === "tool_result") return reconcileToolResult(event, state)
  return [event]
}

/** Imperative wrapper: drives the Effect stream through callbacks the Solid store owns. */
export const streamChat = (
  deps: { readonly client: Client; readonly runtime: AppRuntime; readonly onEvent: StreamCallbacks["onEvent"]; readonly onError: StreamCallbacks["onError"]; readonly onDone: StreamCallbacks["onDone"] },
  input: StreamInput
): StreamHandle => {
  const controller = new AbortController()
  const program = streamChatEffect(deps.client, input, controller.signal).pipe(
    Stream.runForEach((event) => Effect.sync(() => deps.onEvent(event)))
  )
  const run = deps.runtime.run(program.pipe(Effect.ensuring(Effect.sync(() => deps.onDone()))))
  void run.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    deps.onError(message)
    deps.onDone()
  })
  return {
    abort: () => {
      controller.abort()
    }
  }
}