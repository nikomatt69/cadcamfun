/**
 * SSE client for nikcli (spec 08-ai.md §3, WP8).
 *
 * The sidecar's `chatStream` endpoint carries the shared Effect event union.
 * We decode each `data:` line as JSON, validate the
 * envelope, then run the nikcli-style tool-call checks (allow-list, input shape,
 * per-tool Effect Schema) before any event reaches the store.
 *
 * Aborting the chat uses the same `chatAbort` endpoint the store's `abort()`
 * calls; cancelling the stream is enough to keep the UI responsive.
 */
import { Effect, Queue, Schema, Stream } from "effect"
import { AiStreamEventSchema } from "@cadcamfun/api"
import type { Client, AppRuntime } from "../../../shared/state/client.ts"
import type { AiEvent, ProviderId, Tier } from "./types.ts"
import type { ChatAttachment } from "./attachments.ts"
import { TOOL_IDS, type ToolId } from "./tools.ts"
import { ToolInputSchemas } from "./tool-schemas.ts"
import { sanitizeError } from "./errors.ts"
import { t } from "../../../i18n/index.ts"

export class AiStreamError extends Schema.TaggedError<AiStreamError>()("AiStreamError", {
  message: Schema.String
}, { httpApiStatus: 500 }) {}

/** Cap the JSON size of one tool_call.input so a runaway AI can't push MBs through the UI. */
const MAX_INPUT_BYTES = 256_000
/** Cap individual text/output payloads to keep the transcript sane. */
const MAX_TEXT_BYTES = 64_000
const EVENT_TYPES = new Set<string>(AiStreamEventSchema.members.map((member) => member.fields.type.literal))

const viewportImages = (value: unknown): ReadonlyArray<string> => (Array.isArray(value) ? value : []).filter((url): url is string => typeof url === "string" && url.length <= 4_000_100 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(url)).slice(0, 2)

/** The API's Effect union is the single desktop wire decoder. */
export const decodeEvent = (json: string): AiEvent => decodeWireEvent(JSON.parse(json))

const decodeWireEvent = (raw: unknown): AiEvent => {
  const event = Schema.decodeUnknownSync(AiStreamEventSchema)(raw)
  switch (event.type) {
    case "delta": case "user_message": case "reasoning": case "done":
      return { ...event, text: cap(event.text, MAX_TEXT_BYTES, "<truncated>") }
    case "tool_result":
      // This is the complete result used for reconciliation, including identities and receipts. The host bounds the
      // model's preview separately; slicing here would corrupt JSON and silently discard confirmed editor changes.
      return { ...event, ...(event.images ? { images: viewportImages(event.images) } : {}) }
    case "error": case "retry": case "tool_diagnostic":
      return { ...event, message: sanitizeError(cap(event.message, MAX_TEXT_BYTES, "<truncated>")) }
    default: return event
  }
}

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
  /** The drawing this turn works on (the one open when it was sent). */
  readonly drawingId?: string
  readonly context?: string
  readonly includeContext?: boolean
  readonly attachments?: ReadonlyArray<ChatAttachment>
  readonly model?: { readonly provider: ProviderId; readonly model: string; readonly tier?: Tier; readonly variant?: string }
  readonly permissionMode?: "auto" | "ask" | "approve"
  readonly agent?: string
  /** A built-in mode id or one an enabled plugin contributes (`<pluginId>:<id>`). */
  readonly mode?: string
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
      if (signal?.aborted) controller.abort()
      yield* Effect.addFinalizer(() => Effect.sync(() => {
        signal?.removeEventListener("abort", abort)
        controller.abort()
      }))
      const offer = (event: AiEvent) => { if (!controller.signal.aborted) Queue.offerUnsafe(queue, event) }
      /** Per-session tool-call tracking, mirrors `event-mapper.ts` in nikcli:
       *  a `tool_result` without a preceding `tool_call` gets the call synthesised
       *  so the store always sees the start of a tool. */
      const calls: CallState = { started: new Set<string>(), finished: new Set<string>() }
      let nativeSessionId = input.sessionId

      /**
       * The turn belongs to the host session, so a dropped connection does not end it. Ask the host how the conversation stands until
       * it is idle, then hand over what it finished with. Returns false when nothing could be read back.
       */
      const recover = async (): Promise<boolean> => {
        const until = Date.now() + RECOVER_WINDOW_MS
        let misses = 0
        const requests = new Set<string>()
        const diagnostics = new Set<string>()
        let plan = ""
        while (!controller.signal.aborted && Date.now() < until) {
          try {
            const state = await Effect.runPromise(client.ai.sessionState({ payload: { sessionId: nativeSessionId, ...(input.projectId !== undefined ? { projectId: input.projectId } : {}) } }), { signal: controller.signal })
            misses = 0
            for (const raw of state.events ?? []) {
              const event = decodeEvent(JSON.stringify(raw))
              if (!("agent" in event && event.agent !== undefined) && event.type !== "error" && nativeSessionId === input.sessionId) nativeSessionId = event.sessionId
              if (!("agent" in event && event.agent !== undefined) && event.sessionId !== input.sessionId && event.sessionId !== nativeSessionId) continue
              if (event.type === "tool_call" && calls.started.has(event.callId)) continue
              if (event.type === "tool_diagnostic") {
                const key = JSON.stringify(event)
                if (diagnostics.has(key)) continue
                diagnostics.add(key)
              }
              if (event.type === "todo") {
                const key = JSON.stringify(event.todos)
                if (key === plan) continue
                plan = key
              }
              for (const mapped of dispatch(event, calls)) offer(mapped)
            }
            // Pending native decisions can outlive their SSE connection. Restore them while the turn waits.
            if (state.busy && typeof client.ai.sessionControl === "function") {
              try {
                const controls = await Effect.runPromise(client.ai.sessionControl({ payload: { action: "status", sessionId: nativeSessionId, ...(input.projectId !== undefined ? { projectId: input.projectId } : {}) } }), { signal: controller.signal })
                for (const question of controls.questions) {
                  if (requests.has(question.requestId)) continue
                  requests.add(question.requestId)
                  offer({ type: "question_request", sessionId: input.sessionId, ...question })
                }
                for (const permission of controls.permissions ?? []) {
                  if (requests.has(permission.requestId)) continue
                  requests.add(permission.requestId)
                  offer({ type: "permission_request", ...permission })
                }
              } catch { /* A controls failure does not discard successfully recovered tool evidence. */ }
            }
            if (!state.busy) {
              if (state.error !== undefined) offer({ type: "error", sessionId: input.sessionId, code: /aborted|cancelled|session interrupted/i.test(state.error) ? "aborted" : "provider", message: sanitizeError(state.error) })
              else if (state.text.trim() !== "" || (state.events?.length ?? 0) > 0) offer({ type: "done", sessionId: input.sessionId, text: state.text, recovered: true, ...(state.usage ? { usage: state.usage } : {}) })
              else return false
              return true
            }
          } catch {
            if (++misses >= 5) return false
          }
          await Effect.runPromise(Effect.sleep(`${RECOVER_POLL_MS} millis`), { signal: controller.signal }).catch(() => undefined)
        }
        return false
      }

      const pump = (async () => {
        let ended = false
        try {
          if (controller.signal.aborted) return
          const http = client.ai.chatStream({ payload: {
            message: input.message,
            sessionId: input.sessionId,
            ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
            ...(input.drawingId !== undefined ? { drawingId: input.drawingId } : {}),
            ...(input.context !== undefined ? { context: input.context } : {}),
            ...(input.includeContext !== undefined ? { includeContext: input.includeContext } : {}),
            ...(input.attachments !== undefined && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
            ...(input.model !== undefined ? { model: input.model } : {}),
            ...(input.permissionMode ? { permissionMode: input.permissionMode } : {}),
            ...(input.agent !== undefined ? { agent: input.agent } : {}), ...(input.mode !== undefined ? { mode: input.mode } : {})
          } })
          const stream = await Effect.runPromise(http, { signal: controller.signal })
          await Effect.runPromise(stream.pipe(
            Stream.filter((item) => !isIgnoredEvent(item)),
            Stream.mapEffect(decodeEventSafely),
            Stream.filter((event) => "agent" in event && event.agent !== undefined || nativeSessionId === input.sessionId || event.sessionId === input.sessionId || event.sessionId === nativeSessionId),
            Stream.takeUntil((event) => event.type === "done" || event.type === "error"),
            Stream.runForEach((decoded) => Effect.sync(() => {
            if (controller.signal.aborted || ended) return
            if (!("agent" in decoded && decoded.agent !== undefined) && nativeSessionId !== input.sessionId && decoded.sessionId !== input.sessionId && decoded.sessionId !== nativeSessionId) return
            for (const event of dispatch(decoded, calls)) {
              if (!("agent" in event && event.agent !== undefined) && event.type !== "error" && nativeSessionId === input.sessionId) nativeSessionId = event.sessionId
              if (event.type === "done" || event.type === "error") ended = true
              offer(event)
            }
          }))
          ), { signal: controller.signal })
          // A stream that stops without its closing event was cut, not finished.
          if (!ended && !controller.signal.aborted) throw new Error("The connection closed before the answer was complete")
        } catch (cause) {
          if (controller.signal.aborted) return
          if (ended) return
          offer({ type: "turn", sessionId: input.sessionId, phase: "recovering", reason: "The stream disconnected; reading stored tool evidence and pending decisions." })
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

/** Unknown event names are forward compatible; known events still require valid payloads. */
const isIgnoredEvent = (raw: unknown): boolean => {
  if (typeof raw === "string") {
    try { return isIgnoredEvent(JSON.parse(raw)) } catch { return false }
  }
  if (typeof raw !== "object" || raw === null) return false
  const type = (raw as { type?: unknown }).type
  return typeof type === "string" && type.length > 0 && !EVENT_TYPES.has(type)
}

const decodeEventSafely = (raw: unknown): Effect.Effect<AiEvent, AiStreamError> => Effect.try({
  try: () => decodeWireEvent(typeof raw === "string" ? JSON.parse(raw) : raw),
  catch: () => new AiStreamError({ message: t("ai.stream.invalidEvent") })
})

const cap = (text: string, limit: number, marker: string): string =>
  text.length <= limit ? text : `${text.slice(0, limit - marker.length)}${marker}`

interface CallState {
  readonly started: Set<string>
  readonly finished: Set<string>
}

/** Is this one of the catalogue tools this build validates the input of? */
export const isToolId = (tool: string): tool is ToolId =>
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
/**
 * Tools the host itself offers the agent: no schema of ours, never rejected. Delegation, version control and workflows are
 * NOT here — `agent`, `vcs` and `vcs_edit` are catalogue tools like `cad`, so they carry the same input contract and are
 * validated the same way. Listing them twice is how a tool id drifts into being exempt from the checks it must pass.
 */
export const HOST_TOOLS: ReadonlyArray<string> = [
  "question", "search_tools", "invalid", "skill", "todowrite", "todoread", "get_goal", "create_goal", "update_goal", "code_mode"
]

export const validateToolCall = (
  event: Extract<AiEvent, { type: "tool_call" }>,
  state: CallState
): ReadonlyArray<AiEvent> => {
  if (HOST_TOOLS.includes(event.tool)) {
    // Started, so its result does not make the transcript invent a second call with an empty input.
    state.started.add(event.callId)
    return [event]
  }
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
  if (state.finished.has(event.callId)) return []
  const events: AiEvent[] = []
  if (!state.started.has(event.callId)) {
    state.started.add(event.callId)
    events.push({ type: "tool_call", sessionId: event.sessionId, ...(event.agent !== undefined ? { agent: event.agent } : {}), callId: event.callId, tool: event.tool, input: {} })
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
  if (event.type === "tool_call") return state.started.has(event.callId) ? [] : validateToolCall(event, state)
  if (event.type === "tool_result") return reconcileToolResult(event, state)
  return [event]
}

/** A connection that stays silent this long (two heartbeats and some margin) is dead and is reopened. */
export const FOLLOW_STALE_MS = 40_000
const FOLLOW_RECONNECT_MIN_MS = 1_000
const FOLLOW_RECONNECT_MAX_MS = 15_000
/** Connections in a row that never got a greeting before the session is given up on (it is not one the host knows). */
const FOLLOW_MAX_FAILURES = 5

export interface FollowInput {
  readonly sessionId: string
  readonly signal: AbortSignal
  /** Every greeting; `reconnected` from the second one on. `reset` means the journal cannot replay what was missed. */
  readonly onConnected: (frame: { readonly busy: boolean; readonly seq: number; readonly reset: boolean }, reconnected: boolean) => void
  readonly onEvent: (event: AiEvent) => void
}

/**
 * Follows one conversation the way the phone does (nikcli's session stream): the sidecar journals every turn, whoever
 * started it, so this sees a turn the phone sent while it happens. The cursor resumes after a drop without replaying
 * what was already shown; a conversation the host does not know ends the follow after a few refusals.
 */
export const followSessionEvents = async (client: Client, input: FollowInput): Promise<void> => {
  let cursor: number | undefined
  let greetings = 0
  let failures = 0
  const calls: CallState = { started: new Set<string>(), finished: new Set<string>() }
  while (!input.signal.aborted && failures < FOLLOW_MAX_FAILURES) {
    const connection = new AbortController()
    const abort = () => connection.abort()
    input.signal.addEventListener("abort", abort, { once: true })
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => connection.abort(), FOLLOW_STALE_MS) }
    try {
      arm()
      const http = client.ai.sessionStream({ params: { sessionId: input.sessionId }, query: cursor !== undefined ? { after: cursor } : {} })
      const stream = await Effect.runPromise(http, { signal: connection.signal })
      await Effect.runPromise(stream.pipe(
        Stream.runForEach((frame) => Effect.sync(() => {
          if (connection.signal.aborted) return
          arm()
          if (frame.type === "server.connected") {
            failures = 0
            // A reset greeting carries the live edge; the old cursor would replay nothing.
            if (frame.reset === true || cursor === undefined) cursor = frame.seq
            input.onConnected({ busy: frame.busy, seq: frame.seq, reset: frame.reset === true }, greetings++ > 0)
            return
          }
          if (frame.type !== "event") return
          cursor = frame.seq
          if (isIgnoredEvent(frame.event)) return
          let decoded: AiEvent
          try { decoded = decodeWireEvent(frame.event) } catch { return }
          if (decoded.type === "turn" && decoded.phase === "start") { calls.started.clear(); calls.finished.clear() }
          for (const event of dispatch(decoded, calls)) input.onEvent(event)
        }))
      ), { signal: connection.signal })
    } catch {
      /* A dropped connection reconnects below; an aborted one ends the loop. */
    } finally {
      clearTimeout(watchdog)
      input.signal.removeEventListener("abort", abort)
      connection.abort()
    }
    if (input.signal.aborted) return
    // A connection that never greeted counts as a failure; one that did was healthy and just ended.
    if (greetings === 0 || failures > 0) failures += 1
    await new Promise<void>((resolve) => {
      const wait = setTimeout(done, Math.min(FOLLOW_RECONNECT_MIN_MS * 2 ** Math.max(failures, 0), FOLLOW_RECONNECT_MAX_MS))
      function done() { clearTimeout(wait); input.signal.removeEventListener("abort", done); resolve() }
      input.signal.addEventListener("abort", done, { once: true })
    })
  }
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
  const run = deps.runtime.run(program, { signal: controller.signal })
  void run.catch((error: unknown) => {
    if (!controller.signal.aborted) deps.onError(sanitizeError(describe(error)))
  }).finally(() => deps.onDone())
  return {
    abort: () => {
      controller.abort()
    }
  }
}
