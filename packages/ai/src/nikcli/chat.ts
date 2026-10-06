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
  /** Extra system text appended for this turn (project context). */
  readonly system?: string
  readonly model: { readonly providerID: string; readonly modelID: string }
}

const CONNECT_TIMEOUT_MS = 5_000
const IDLE_GRACE_MS = 2_000
/** The host retries failed provider calls with growing backoff; we give up after this many. */
const MAX_HOST_RETRIES = 2

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

      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          if (!finished) {
            controller.abort()
            await host.client.session.abort({ sessionID: sessionId }).catch(() => undefined)
          }
        })
      )

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
        let result: HostPromptResult
        try {
          result = await host.client["session-prompt"].prompt(
            {
              sessionID: sessionId,
              agent: CADCAM_AGENT,
              model: input.model,
              ...(input.system ? { system: input.system } : {}),
              parts: [{ type: "text", text: input.message }]
            },
            { signal: controller.signal }
          )
        } catch (cause) {
          finished = true
          controller.abort()
          offer({
            type: "error",
            sessionId,
            code: "provider",
            message: describeHostFailure(cause)
          })
          return
        }
        // Let trailing bus events (final deltas, session.idle) reach the subscriber.
        const deadline = Date.now() + IDLE_GRACE_MS
        while (!state.idle && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10))
        finished = true
        const failure =
          giveUp !== undefined
            ? { message: giveUp, aborted: false }
            : (failureOf(result) ?? (state.sessionError !== undefined ? { message: state.sessionError, aborted: false } : undefined))
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
