/// <reference path="./sdk-next.d.ts" />
import { Effect, Queue, Stream } from "effect"
import type { HostPromptResult } from "@nikcli-ai/sdk-next"
import { AiConfigError, AiProviderError } from "../errors.ts"
import type { AiEvent } from "../events.ts"
import { isContextOverflowError } from "../provider-error.ts"
import { CADCAM_AGENT } from "./config.ts"
import { mapHostEvent, newMapperState, type EventMapperState } from "./event-mapper.ts"
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
   * outage, a dropped provider connection). Each resume waits longer (nikcli's retry curve, capped); the count restarts whenever
   * the turn made progress, so a long job outlasts any number of separate outages. `0` reports the first failure at once. Default 5.
   */
  readonly continues?: number
  /**
   * How many times the turn is continued on its own when the agent stopped with work left (see `continuationFor`). nikcli's host
   * ends a turn as soon as the model answers without a tool call, so a plan announced in prose, a plan with items left or a
   * failed call that was not retried would end the work there. Like nikcli's goal loop it runs up to 50 iterations, and it stops
   * earlier whenever a nudge brings no tool call (see `MAX_STALLS`). `0` leaves the host's behaviour.
   */
  readonly autoContinues?: number
}

/** What the agent said it would do next, as the last sentence of its answer ("Let me build the wheels:", "Procedo con..."). */
const ANNOUNCES = /^(?:ok(?:ay)?[,.:]?\s+)?(?:let me|let['’]s|i['’]ll|i will|i['’]m going to|i am going to|now i|next,? i|first,? i|then i|procedo|vado a|inizio(?: a| con)?|comincio|ora (?:creo|costruisco|procedo|inizio|passo|aggiungo|genero)|adesso (?:creo|costruisco|procedo|inizio|passo|aggiungo|genero)|creo ora|costruisco ora|passo a)\b/i

export const announcesWork = (text: string): boolean => {
  const trimmed = text.trim()
  if (trimmed === "") return false
  if (/:\s*$/.test(trimmed)) return true
  const sentences = trimmed.split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter((s) => s !== "")
  const last = sentences.at(-1) ?? ""
  return !/\?$/.test(last) && ANNOUNCES.test(last)
}

/**
 * Why the turn should go on after the agent stopped, or undefined when it is done: its own plan still has open items, its last
 * tool call failed and it did not fix it, or it ended on an announcement of the next step without taking it. Each is a fact of
 * the turn, not a guess about the request; the answer to a question or a finished job matches none of them.
 */
export const continuationFor = (state: Pick<EventMapperState, "todos" | "lastToolError">, text: string, finish?: string): string | undefined => {
  // The host counts `length` as a finished turn: a long tool call cut by the output limit ends the work right there.
  if (finish === "length") {
    return "Your last message was cut off by the output limit, so the tool call you were writing did not run. Continue from where you stopped in smaller steps: at most 10 elements per cad_add_elements call, one operation at a time, and keep going until the request is complete and checked."
  }
  const open = state.todos.filter((t) => t.status === "pending" || t.status === "in_progress")
  if (open.length > 0) {
    return `Your plan still has unfinished items:\n${open.map((t) => `- ${t.content}`).join("\n")}\nContinue with the next one now with the tools. Do not stop to report progress: finish every item, check the result, mark the items completed, and only then report.`
  }
  if (state.lastToolError !== undefined) {
    return `Your last tool call failed: ${state.lastToolError.slice(0, 400)}\nRead the error, fix the cause and carry on until the request is done. If it truly cannot be done, say exactly what blocks it and what you tried.`
  }
  if (announcesWork(text)) return "You said what you would do next but did not do it. Do it now with the tools, and keep going until the request is complete and checked."
  return undefined
}

const MAX_STALLS = 2

/** What a failure message says about its cause: worth waiting out, or something only the user can fix. */
export const isTransientFailure = (message: string): boolean => {
  // A full context window is cured by a summary, never by waiting.
  if (isContextOverflowError(message)) return false
  if (/auth|api key|unauthor|forbidden|credit|billing|quota|context.?(?:length|window)|too long|model not found|not found|invalid|bad request|content.?(?:filter|policy)/i.test(message)) return false
  return /overload|rate.?limit|too many|timed? ?out|timeout|temporar|unavailable|busy|\b5\d\d\b|network|fetch failed|econn|socket|terminated|connection|stream|decode|server error|try again/i.test(message)
}

/**
 * The host rejects a prompt that waited on a session whose running turn then finished, or was torn down, with "Session interrupted".
 * Nothing failed: the message was not answered, so it is sent again (or reported as an interruption, never as a provider error).
 */
export const isInterruption = (message: string): boolean => /session interrupted/i.test(message)
const INTERRUPT_BACKOFF_MS = 1_000
const INTERRUPTED_MESSAGE = "The assistant was interrupted before it could answer. Send the message again."

const RESUME_PROMPT = "The connection to the model failed and has been restored. Continue from where you stopped: do not repeat steps that already completed (read the conversation and the tool results), and carry on until the request is done."
/** nikcli's retry curve (`session/retry.ts`): 2 s, doubling, never longer than 30 s. */
const RESUME_BACKOFF_MS = 2_000
const RESUME_BACKOFF_MAX_MS = 30_000
export const resumeDelay = (attempt: number): number => Math.min(RESUME_BACKOFF_MS * 2 ** (attempt - 1), RESUME_BACKOFF_MAX_MS)

/** nikcli's `SessionGoal.MAX_ITERATIONS`: how many times one request is carried on after the agent stopped with work left. */
export const DEFAULT_AUTO_CONTINUES = 50
export const DEFAULT_RESUMES = 5

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
  /** The specialist tasks this conversation started (background ones keep running after the turn ended). */
  readonly tasks?: ReadonlyArray<HostTaskInfo>
}

export interface HostTaskInfo {
  readonly id: string
  readonly agent: string
  readonly description: string
  readonly status: "queued" | "running" | "completed" | "error" | "cancelled"
  /** The caller waited for it inside the turn (false: it reports back on its own). */
  readonly background: boolean
  /** The specialist's report, cut to a size a status poll can carry. */
  readonly text?: string
  readonly error?: string
}

const TASK_TEXT_LIMIT = 4_000

/** The tasks of one conversation as plain data. */
export const taskInfos = (
  manager: { list(owner: { projectId: string; parentSessionId: string }): ReadonlyArray<{ id: string; agent?: string; description: string; status: HostTaskInfo["status"]; background?: boolean; text?: string; error?: string }> },
  owner: { projectId: string; parentSessionId: string }
): ReadonlyArray<HostTaskInfo> =>
  manager.list(owner).map((task) => ({
    id: task.id,
    agent: task.agent ?? "researcher",
    description: task.description,
    status: task.status,
    background: task.background !== false,
    ...(task.text !== undefined ? { text: task.text.length > TASK_TEXT_LIMIT ? `${task.text.slice(0, TASK_TEXT_LIMIT)}…` : task.text } : {}),
    ...(task.error !== undefined ? { error: task.error } : {})
  }))

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
    aborted: error.name === "MessageAbortedError" || isInterruption(error.data?.message ?? error.name ?? "")
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
      state.ownTexts.add(input.message.trim())
      state.ownTexts.add(RESUME_PROMPT)
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

      /**
       * The host rejects the prompt that started a turn with "Session interrupted" when a message written meanwhile took the turn
       * over (nikcli's clients read the session, not that promise). The work went on: wait for the session to go idle and hand
       * over what it finished with.
       */
      const finishFromSession = async (answers: ReadonlyArray<string>): Promise<boolean> => {
        const until = Date.now() + 15 * 60_000
        while (!controller.signal.aborted && Date.now() < until) {
          const current = await Effect.runPromise(readHostSessionState(host, sessionId)).catch(() => undefined)
          if (current !== undefined && !current.busy) {
            finished = true
            if (current.error !== undefined) offer({ type: "error", sessionId, code: "provider", message: current.error })
            else offer({ type: "done", sessionId, text: [...answers, current.text].filter((t) => t.trim() !== "").join("\n\n") })
            controller.abort()
            return true
          }
          await new Promise((r) => setTimeout(r, 500))
        }
        return false
      }

      const run = (async () => {
        await Promise.race([connectedPromise, new Promise((r) => setTimeout(r, CONNECT_TIMEOUT_MS))])
        const resumes = input.continues ?? DEFAULT_RESUMES
        let attempt = 0
        const maxContinues = input.autoContinues ?? DEFAULT_AUTO_CONTINUES
        let continuations = 0
        let callsAtNudge: number | undefined
        let stalls = 0
        const answers: string[] = []
        let parts: Array<{ type: "text"; text: string; synthetic?: boolean } | { type: "file"; mime: string; filename: string; url: string }> = [
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
            if (isInterruption(message) && state.reportedUser.size > 0 && (await finishFromSession(answers))) return
            if (isInterruption(message)) {
              if (attempt < resumes && !controller.signal.aborted) {
                // The turn that was running when this message arrived has just ended: ask again, same message.
                attempt += 1
                offer({ type: "retry", sessionId, attempt, message: `The previous answer was still finishing. Sending your message again (${attempt}/${resumes}).` })
                await new Promise((r) => setTimeout(r, INTERRUPT_BACKOFF_MS * attempt))
                continue
              }
              finished = true
              controller.abort()
              offer({ type: "error", sessionId, code: "aborted", message: INTERRUPTED_MESSAGE })
              return
            }
            if (attempt < resumes && !controller.signal.aborted && isTransientFailure(message)) {
              attempt += 1
              offer({ type: "retry", sessionId, attempt, message: `${message} Resuming automatically (${attempt}/${resumes}).` })
              await new Promise((r) => setTimeout(r, resumeDelay(attempt)))
              parts = [{ type: "text", text: RESUME_PROMPT, synthetic: true }]
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
            await new Promise((r) => setTimeout(r, resumeDelay(attempt)))
            giveUp = undefined
            state.retry = undefined
            state.sessionError = undefined
            state.idle = false
            parts = [{ type: "text", text: RESUME_PROMPT, synthetic: true }]
            continue
          }
          // The call went through: the outage (if any) is over, so the next one gets its full set of resumes again.
          if (!failure) attempt = 0
          if (failure && isInterruption(failure.message) && state.reportedUser.size > 0 && (await finishFromSession(answers))) return
          const answerOf = (): string => (result.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("")
          if (!failure && !controller.signal.aborted && continuations < maxContinues) {
            const text = answerOf()
            // A nudge that produced no tool call at all did not help: stop nudging rather than loop on words.
            stalls = callsAtNudge !== undefined && state.toolCalls === callsAtNudge ? stalls + 1 : 0
            const nudge = stalls < MAX_STALLS ? continuationFor(state, text, result.info?.finish) : undefined
            if (nudge !== undefined) {
              if (text.trim() !== "") answers.push(text)
              continuations += 1
              callsAtNudge = state.toolCalls
              state.idle = false
              state.retry = undefined
              state.sessionError = undefined
              parts = [{ type: "text", text: nudge, synthetic: true }]
              continue
            }
          }
          finished = true
          if (failure) {
            // The host's "Session interrupted" (another message took over the session) is a cancellation, not a provider failure.
            const interrupted = failure.aborted || isInterruption(failure.message)
            offer({ type: "error", sessionId, code: interrupted ? "aborted" : "provider", message: isInterruption(failure.message) ? INTERRUPTED_MESSAGE : failure.message })
          } else {
            const text = [...answers, answerOf()].filter((t) => t.trim() !== "").join("\n\n")
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

export type PendingDelivery = "queue" | "steer"

/**
 * A message the user writes while the agent works (nikcli's prompt box does the same): the host admits it to the session's own
 * pending queue and takes it into the conversation at the next safe step (`queue`) or at once (`steer`). The running turn's
 * stream carries on and reports it as a `user_message` when it is taken in.
 */
export const queueHostMessage = (host: ProjectHost, sessionId: string, message: string, delivery: PendingDelivery): Effect.Effect<void, AiProviderError> =>
  Effect.tryPromise({
    try: async () => {
      await host.client["session-prompt"].promptAsync({ sessionID: sessionId, agent: CADCAM_AGENT, delivery, parts: [{ type: "text", text: message }] })
    },
    catch: (cause) => new AiProviderError({ message: describeHostFailure(cause) })
  })
