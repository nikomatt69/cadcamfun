/// <reference path="./sdk-next.d.ts" />
import { Effect, Queue, Stream } from "effect"
import type { HostPromptResult } from "@nikcli-ai/sdk-next"
import { AiConfigError, AiProviderError } from "../errors.ts"
import type { AiEvent } from "../events.ts"
import { CADCAM_AGENT } from "./config.ts"
import { mapHostEvent, newMapperState } from "./event-mapper.ts"
import type { ProjectHost } from "./runtime.ts"

export interface HostChatInput {
  readonly host: ProjectHost
  readonly sessionId: string
  readonly message: string
  /** Images the model looks at (`data:` URLs). */
  readonly files?: ReadonlyArray<{ readonly mime: string; readonly filename: string; readonly url: string }>
  /** Extra system text appended for this turn (project context). */
  readonly system?: string
  readonly model: { readonly providerID: string; readonly modelID: string }
  /**
   * How many times the turn is resumed on its own after the provider failed for a reason that passes (overload, rate limit,
   * outage, a dropped provider connection). Each resume waits longer; `0` reports the first failure at once. Default 3.
   */
  readonly continues?: number
}

/** What a failure message says about its cause: worth waiting out, or something only the user can fix. */
export const isTransientFailure = (message: string): boolean => {
  if (/auth|api key|unauthor|forbidden|credit|billing|quota|context.?(?:length|window)|too long|model not found|not found|invalid|bad request|content.?(?:filter|policy)/i.test(message)) return false
  return /overload|rate.?limit|too many|timed? ?out|timeout|temporar|unavailable|busy|\b5\d\d\b|network|fetch failed|econn|socket|terminated|connection|stream|decode|server error|try again/i.test(message)
}

const RESUME_PROMPT = "The connection to the model failed and has been restored. Continue from where you stopped: do not repeat steps that already completed (read the conversation and the tool results), and carry on until the request is done."
const RESUME_BACKOFF_MS = 5_000

const CONNECT_TIMEOUT_MS = 5_000
const IDLE_GRACE_MS = 2_000
/** The host retries failed provider calls with growing backoff; we give up after this many (the host's own backoff grows each time, so a rate limit or a brief outage has time to clear). */
const MAX_HOST_RETRIES = 4

export const createHostSession = (host: ProjectHost, title: string): Effect.Effect<string, AiConfigError> =>
  Effect.tryPromise({
    try: async () => (await host.client.session.create({ title })).id,
    catch: (cause) => new AiConfigError({ message: `Failed to create a session: ${describeHostFailure(cause)}` })
  })

/**
 * Is this session still known to the host? The UI owns the session id it shows,
 * and it can point at a session the host dropped (app restart, cleared state,
 * another project). Checking before prompting turns a bare `UnexpectedStatus`
 * into a transparent recovery.
 */
export const sessionExists = (host: ProjectHost, sessionId: string): Effect.Effect<boolean> =>
  Effect.tryPromise({
    try: async () => {
      await host.client.session.get({ sessionID: sessionId })
      return true
    },
    catch: () => false
  }).pipe(Effect.orElseSucceed(() => false))

/**
 * The generated client throws `ClientError(reason, { cause })` and drops the
 * response body, so `UnexpectedStatus` is all a caller sees. Map the known
 * statuses to something a user can act on; anything else keeps its own message.
 */
export const describeHostFailure = (cause: unknown): string => {
  if (cause === null || typeof cause !== "object") return String(cause)
  const reason = (cause as { reason?: unknown }).reason
  const status = (cause as { cause?: { status?: unknown } }).cause?.status
  if (typeof reason !== "string") return cause instanceof Error ? cause.message : String(cause)
  if (reason !== "UnexpectedStatus") return cause instanceof Error ? cause.message : reason
  switch (status) {
    case 400:
      return "nikcli rejected the request (400). The session or message was malformed."
    case 404:
      return "The AI session no longer exists (404). Start a new conversation."
    case 409:
      return "The AI session is busy (409). Wait for the current answer to finish, or stop it."
    case 429:
      return "The AI session is rate limited (429). Try again in a moment."
    default:
      return `The AI host answered with HTTP ${typeof status === "number" ? status : "?"}.`
  }
}

export interface HostSessionState {
  /** The last turn has not finished: the model is still writing or a tool is running. */
  readonly busy: boolean
  /** Text of the assistant's answer to the latest user message ("" while it has none). */
  readonly text: string
  readonly error?: string
}

/**
 * Where a conversation stands, from the host's own record: what a client that lost its connection needs to carry on. The turn
 * is finished when the newest non-summary message is an assistant message with a turn-ending `finish` reason (or an error).
 */
export const readHostSessionState = (host: ProjectHost, sessionId: string): Effect.Effect<HostSessionState, AiConfigError> =>
  Effect.tryPromise({
    try: async () => {
      const messages = await host.client.session.messages({ sessionID: sessionId, limit: 40 })
      const visible = messages.filter((m) => m.info.summary !== true && m.info.agent !== "compaction")
      const last = visible.at(-1)
      if (last === undefined) return { busy: false, text: "" } satisfies HostSessionState
      let firstOfTurn = 0
      for (const [index, message] of visible.entries()) {
        // The pinned host marks automatic continuation text parts as synthetic, not the user message itself.
        const synthetic = message.parts.length > 0 && message.parts.every((p) => p.type === "text" && "synthetic" in p && p.synthetic === true)
        if (message.info.role === "user" && !synthetic) firstOfTurn = index + 1
      }
      const answer = visible.slice(firstOfTurn).filter((m) => m.info.role === "assistant")
      const text = answer.flatMap((m) => m.parts.filter((p) => p.type === "text").map((p) => p.text ?? "")).join("")
      const error = last.info.error?.data?.message ?? last.info.error?.name
      // `tool-calls` closes a step, not the turn: the model goes on once the tools have answered.
      const stepOnly = last.info.finish === undefined || last.info.finish === "tool-calls" || last.info.finish === "tool_calls"
      const busy = last.info.role === "user" || (error === undefined && stepOnly)
      return { busy, text, ...(error !== undefined ? { error } : {}) } satisfies HostSessionState
    },
    catch: (cause) => new AiConfigError({ message: `Failed to read the session: ${describeHostFailure(cause)}` })
  })

export const abortHostSession = (host: ProjectHost, sessionId: string): Effect.Effect<void> =>
  Effect.promise(() => host.client.session.abort({ sessionID: sessionId }).then(() => undefined, () => undefined))

export const replyHostPermission = (
  host: ProjectHost,
  requestId: string,
  reply: "once" | "always" | "reject"
): Effect.Effect<void, AiProviderError> =>
  Effect.tryPromise({
    try: async () => {
      await host.client.permission.reply({ requestID: requestId, reply })
    },
    catch: (cause) => new AiProviderError({ message: cause instanceof Error ? cause.message : String(cause) })
  })

const failureOf = (result: HostPromptResult): { message: string; aborted: boolean } | undefined => {
  if (result.info === undefined) {
    return { message: result.data?.message ?? result.name ?? "The host rejected the prompt.", aborted: false }
  }
  const error = result.info.error
  if (error === undefined) return undefined
  return {
    message: error.data?.message ?? error.name ?? "The model request failed.",
    aborted: error.name === "MessageAbortedError"
  }
}

/**
 * One chat turn through the embedded host. Events are subscribed to BEFORE the
 * prompt is sent, the stream ends after the prompt resolved and the session went
 * idle. Mid-turn failures and aborts surface as a final `error` event; the
 * stream only fails for setup problems (it never sees the model).
 */
export const hostChatStream = (input: HostChatInput): Stream.Stream<AiEvent, AiProviderError> =>
  Stream.callback<AiEvent, AiProviderError>((queue) =>
    Effect.gen(function* () {
      const { host, sessionId } = input
      const controller = new AbortController()
      let finished = false
      let giveUp: string | undefined

      // The turn belongs to the host session, not to this stream: when the client's connection drops (a closed laptop lid, a
      // restarted webview, an idle proxy) the assistant keeps working and finishes what it started, as nikcli does. Only an
      // explicit abort (`abortHostSession`) stops a turn; the client recovers the result with `readHostSessionState`.

      const state = newMapperState()
      let connected!: () => void
      const connectedPromise = new Promise<void>((resolve) => (connected = resolve))
      const offer = (event: AiEvent) => void Queue.offerUnsafe(queue, event)

      const pump = (async () => {
        try {
          for await (const event of host.client.events.subscribe({ signal: controller.signal })) {
            // The in-process SSE body ignores the abort signal once headers are out, so the
            // loop only notices cancellation when the next bus event (telemetry, heartbeat) arrives.
            if (controller.signal.aborted) break
            if (event.type === "server.connected") {
              connected()
              continue
            }
            for (const mapped of mapHostEvent(sessionId, event, state)) offer(mapped)
            if (state.retry && state.retry.attempt >= MAX_HOST_RETRIES && !giveUp) {
              giveUp = state.retry.message
              void host.client.session.abort({ sessionID: sessionId }).catch(() => undefined)
            }
          }
        } catch {
          // Aborted or transport closed: the prompt result decides the outcome.
        } finally {
          connected()
        }
      })()

      const run = (async () => {
        await Promise.race([connectedPromise, new Promise((r) => setTimeout(r, CONNECT_TIMEOUT_MS))])
        const resumes = input.continues ?? 3
        let attempt = 0
        let parts: Array<{ type: "text"; text: string } | { type: "file"; mime: string; filename: string; url: string }> = [
          { type: "text", text: input.message },
          ...(input.files ?? []).map((f) => ({ type: "file" as const, mime: f.mime, filename: f.filename, url: f.url }))
        ]
        for (;;) {
          let result: HostPromptResult
          try {
            result = await host.client["session-prompt"].prompt(
              { sessionID: sessionId, agent: CADCAM_AGENT, model: input.model, ...(input.system ? { system: input.system } : {}), parts },
              { signal: controller.signal }
            )
          } catch (cause) {
            const message = describeHostFailure(cause)
            if (attempt < resumes && !controller.signal.aborted && isTransientFailure(message)) {
              attempt += 1
              offer({ type: "retry", sessionId, attempt, message: `${message} Resuming automatically (${attempt}/${resumes}).` })
              await new Promise((r) => setTimeout(r, RESUME_BACKOFF_MS * 2 ** (attempt - 1)))
              parts = [{ type: "text", text: RESUME_PROMPT }]
              continue
            }
            finished = true
            controller.abort()
            offer({ type: "error", sessionId, code: "provider", message })
            return
          }
          // Let trailing bus events (final deltas, session.idle) reach the subscriber.
          const deadline = Date.now() + IDLE_GRACE_MS
          while (!state.idle && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10))
          const failure =
            giveUp !== undefined
              ? { message: giveUp, aborted: false }
              : (failureOf(result) ?? (state.sessionError !== undefined ? { message: state.sessionError, aborted: false } : undefined))
          if (failure && !failure.aborted && attempt < resumes && isTransientFailure(failure.message)) {
            // The host gave up on this call; the conversation is intact, so ask it to carry on after a pause.
            attempt += 1
            offer({ type: "retry", sessionId, attempt, message: `${failure.message} Resuming automatically (${attempt}/${resumes}).` })
            await new Promise((r) => setTimeout(r, RESUME_BACKOFF_MS * 2 ** (attempt - 1)))
            giveUp = undefined
            state.retry = undefined
            state.sessionError = undefined
            state.idle = false
            parts = [{ type: "text", text: RESUME_PROMPT }]
            continue
          }
          finished = true
          if (failure) {
            offer({ type: "error", sessionId, code: failure.aborted ? "aborted" : "provider", message: failure.message })
          } else {
            const text = (result.parts ?? [])
              .filter((p) => p.type === "text")
              .map((p) => p.text ?? "")
              .join("")
            const tokens = result.info?.tokens
            offer({
              type: "done",
              sessionId,
              text,
              ...(tokens ? { usage: { inputTokens: tokens.input, outputTokens: tokens.output } } : {})
            })
          }
          controller.abort()
          return
        }
      })()

      yield* Effect.tryPromise({
        try: async () => {
          await run
          await Promise.race([pump, new Promise((r) => setTimeout(r, 150))])
        },
        catch: (cause) => new AiProviderError({ message: cause instanceof Error ? cause.message : String(cause) })
      }).pipe(
        Effect.matchCauseEffect({
          onSuccess: () => Queue.end(queue),
          onFailure: (cause) => Queue.failCause(queue, cause)
        })
      )
    })
  )
