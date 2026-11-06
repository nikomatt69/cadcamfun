/// <reference path="./sdk-next.d.ts" />
import { Duration, Effect, Queue, Stream } from "effect"
import type { HostClient, HostPromptResult, HostSession } from "@nikcli-ai/sdk-next"
import { AiConfigError, AiProviderError } from "../errors.ts"
import type { AiEvent } from "../events.ts"
import { isContextOverflowError } from "../provider-error.ts"
import type { ObservationPart } from "../context-assembly.ts"
import { CADCAM_AGENT, PRIMARY_STEP_LIMIT } from "./config.ts"
import { currentHostAgent } from "./primaries.ts"
import { primaryOfHost, reminderFor } from "../prompts/reminders.ts"
import { mapHostEvent, newMapperState, type EventMapperState } from "./event-mapper.ts"
import { compactHostSession, readHostContextPolicy } from "./context.ts"
import type { StopHook, StopHookVerdict } from "./stop-hooks.ts"
import type { ProjectHost } from "./runtime.ts"
import { formatGoalStatus, goalSubcommandTexts, parseGoalArguments, type GoalCommand, type GoalSubcommand } from "./goal.ts"

export interface HostChatInput {
  readonly host: ProjectHost
  readonly sessionId: string
  readonly message: string
  /** Images the model looks at (`data:` URLs). */
  readonly files?: ReadonlyArray<{ readonly mime: string; readonly filename: string; readonly url: string }>
  /** Extra system text appended for this turn (project context). */
  readonly system?: string
  /**
   * The editor observation this turn adds to the user message (`planObservation`): one synthetic text part after the user's
   * text and files. It is only given when the session does not hold it yet, so the history stays append-only.
   */
  readonly observation?: ObservationPart
  readonly model: { readonly providerID: string; readonly modelID: string }
  readonly agent?: string
  readonly variant?: string
  /** The arguments of a `/goal` line (`status`, `pause`, an objective, ...): the turn runs the host's own `goal` command instead of a prompt. */
  readonly goalArguments?: string
  /**
   * How many times the turn is resumed on its own after the provider failed for a reason that passes (overload, rate limit,
   * outage, a dropped provider connection). Each resume waits longer (nikcli's retry curve, capped); the count restarts whenever
   * the turn made progress, so a long job outlasts any number of separate outages. `0` reports the first failure at once. Default 5.
   */
  readonly continues?: number
  /**
   * How many times the turn is continued on its own when the agent stopped with work left (see `continuationFor`). nikcli's host
   * ends a turn as soon as the model answers without a tool call, so a plan announced in prose, a plan with items left or a
   * failed call that was not retried would end the work there. It stops
   * earlier whenever recovery stalls (see `MAX_STALLS`). Ordinary chat permits eight continuations; explicit goals retain 50.
   * `0` leaves the host's behaviour.
   */
  readonly autoContinues?: number
  /**
   * The operator's stop hooks (`stop-hooks.ts`, spec 08 "Stop hooks"): asked when the turn would end as done, with no other
   * continuation. A block sends the agent back with the hook's reason and counts like any other continuation.
   */
  readonly stopHook?: StopHook
}

/** What the agent said it would do next, as the last sentence of its answer ("Let me build the wheels:", "Procedo con..."). */
const ANNOUNCES = /^(?:ok(?:ay)?[,.:]?\s+)?(?:let me|let['’]s|i['’]ll|i will|i['’]m going to|i am going to|now i|next,? i|first,? i|then i|procedo|vado a|inizio(?: a| con)?|comincio|ora (?:creo|costruisco|procedo|inizio|passo|aggiungo|genero)|adesso (?:creo|costruisco|procedo|inizio|passo|aggiungo|genero)|creo ora|costruisco ora|passo a)\b/i

export const announcesWork = (text: string): boolean => {
  const trimmed = text.trim()
  if (trimmed === "") return false
  const sentences = trimmed.split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter((s) => s !== "")
  const last = sentences.at(-1) ?? ""
  return !/\?$/.test(last) && ANNOUNCES.test(last)
}

/** The host's own refusal texts (`permission/next.ts`): a rejected call, a rule that forbids it, a cancelled run. */
const DENIAL = /permission (?:denied|rejected)|user (?:denied|rejected)|rejected permission|specified a rule which prevents you|execution cancel(?:led|ed)/i

/**
 * Why the turn should go on after the agent stopped, or undefined when it is done: its own plan still has open items, its last
 * tool call failed and it did not fix it, or it ended on an announcement of the next step without taking it. Each is a fact of
 * the turn, not a guess about the request; the answer to a question or a finished job matches none of them.
 */
export const continuationFor = (state: Pick<EventMapperState, "todos" | "lastToolError"> & { readonly repeatedFailure?: EventMapperState["repeatedFailure"]; readonly toolErrors?: ReadonlyMap<string, string> }, text: string, finish?: string): string | undefined => {
  // The same call failed with the same arguments again and again: another nudge would only run it again.
  if (state.repeatedFailure !== undefined) return undefined
  // Native refusal/unknown finishes and a request for missing input are not unfinished agent work.
  if (finish !== undefined && !["stop", "length", "tool-calls", "tool_calls"].includes(finish)) return undefined
  if (/\?\s*$/.test(text.trim())) return undefined
  if (state.lastToolError && DENIAL.test(state.lastToolError)) return undefined
  // The host counts `length` as a finished turn: a long tool call cut by the output limit ends the work right there.
  if (finish === "length") {
    return "Your last message was cut off by the output limit; if you were writing a tool call, it did not run. Resume directly from where you stopped: no apology, no recap. Split the remaining work into smaller calls (at most 10 elements per cad_edit action add call, one operation at a time) and keep going until the request is complete and checked."
  }
  const open = state.todos.filter((t) => t.status === "pending" || t.status === "in_progress")
  if (open.length > 0) {
    // A call the permission mode refused earlier in the turn stays refused: its items are reported, never retried.
    const denied = [...(state.toolErrors?.entries() ?? [])].filter(([, error]) => DENIAL.test(error)).map(([tool]) => tool)
    const denial = denied.length > 0 ? ` The ${denied.join(", ")} call(s) were refused by the permission mode earlier: do not retry them or reach the same effect another way; leave the items that need them open and list them for the user in your report.` : ""
    return `Your plan still has unfinished items:\n${open.map((t) => `- ${t.content}`).join("\n")}\nContinue with the next one now with the tools. Do not stop to report progress: finish every item, check the result, mark the items completed, and only then report.${denial}`
  }
  if (state.lastToolError !== undefined) {
    return `Your last tool call failed: ${state.lastToolError.slice(0, 1_200)}\nRead the full output, including error paths, problems and recovery hints. Fix the named cause on the same tool; never repeat unchanged arguments. Before retrying a mutation, inspect the document: preserve confirmed entity/operation ids and retry only skipped items. Rebuild and verify affected CAD/CAM work after the correction. If it truly cannot be done, say exactly what blocks it and what you tried.`
  }
  if (announcesWork(text)) return "You said what you would do next but did not do it. Do it now with the tools, and keep going until the request is complete and checked."
  return undefined
}

const MAX_STALLS = 2

/** The synthetic prompt that sends the agent back after a stop hook blocked; the hook's reason follows it. */
export const STOP_HOOK_PROMPT = "A stop hook reported that the work is not finished: "

/**
 * The turn did work with the tools and then ended without a word: the user would see changes and no answer. Asked once per
 * turn (Claude Code always closes a turn with a reply); a second silent answer ends the turn as it is.
 */
export const REPORT_PROMPT = "You finished without replying. In a few sentences, tell the user what you did, the result you checked, and anything left open. Do not call tools unless something is still unfinished."

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

/** A step that closed on tool calls: the model goes on once the tools answered (`tool-calls` and the OpenAI spelling). */
const isToolStepFinish = (reason: string | undefined): boolean => reason === "tool-calls" || reason === "tool_calls"

const STEP_LIMIT_NAME = "StepLimitError"
const STEP_LIMIT_MESSAGE = "The assistant used up the model steps of one run. Completed changes were preserved."
/** How many runs one turn may chain after step budgets ran out, as long as each run made tool calls. */
const MAX_STEP_RESUMES = 40
const STEP_LIMIT_PROMPT = "You used up the step budget of this run and were paused. Completed work is saved. Read the conversation and the last tool results, do not repeat steps that completed, and carry on until the request is complete and checked."

const RESUME_PROMPT = "The connection to the model failed and has been restored. Continue from where you stopped: do not repeat steps that already completed (read the conversation and the tool results), and carry on until the request is done."
/** nikcli's retry curve (`session/retry.ts`): 2 s, doubling, never longer than 30 s. */
const RESUME_BACKOFF_MS = 2_000
const RESUME_BACKOFF_MAX_MS = 30_000
/** A provider's own wait hint is a floor under the curve, bounded so a buggy hint cannot stall a turn (opencode `model-retry.ts`). */
const RETRY_HINT_MAX_MS = 15 * 60_000
/** A known unit after the number, or none at all: "3 hours" is not read as three seconds. */
const RETRY_HINT = /(?:retry[- ]after|try again in|retry in|retrying in|resets? in)[:\s]*(\d+(?:\.\d+)?)(?:\s*(ms|milliseconds?|s|secs?|seconds?|m|mins?|minutes?)\b|(?!\s*[a-z]))/i

/** The wait a failure message asks for ("Retry-After: 20", "Please try again in 7.5s", "retry in 1m"), or undefined. */
export const retryHintMs = (message: string): number | undefined => {
  const match = RETRY_HINT.exec(message)
  if (match === null) return undefined
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount < 0) return undefined
  const unit = (match[2] ?? "s").toLowerCase()
  const ms = unit.startsWith("ms") || unit.startsWith("milli") ? amount : unit.startsWith("m") ? amount * 60_000 : amount * 1_000
  return Math.min(Math.ceil(ms), RETRY_HINT_MAX_MS)
}

export const resumeDelay = (attempt: number, message?: string): number =>
  Math.max(Math.min(RESUME_BACKOFF_MS * 2 ** (attempt - 1), RESUME_BACKOFF_MAX_MS), (message === undefined ? undefined : retryHintMs(message)) ?? 0)

/** Automatic continuation is bounded independently of native goal iterations. */
export const DEFAULT_AUTO_CONTINUES = 8
export const DEFAULT_RESUMES = 5

const CONNECT_TIMEOUT_MS = 5_000
const IDLE_GRACE_MS = 2_000

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
export const findHostSession = Effect.fn("NikCli.findHostSession")(function* (
  host: ProjectHost,
  sessionId: string
): Effect.fn.Return<HostSession | undefined, AiConfigError> {
  const session = yield* Effect.tryPromise({
    try: async () => {
      try {
        return await host.client.session.get({ sessionID: sessionId })
      } catch (cause) {
        if (cause !== null && typeof cause === "object" && "cause" in cause) {
          const response = cause.cause
          if (response !== null && typeof response === "object" && "status" in response && response.status === 404) return undefined
        }
        throw cause
      }
    },
    catch: (cause) => new AiConfigError({ message: `Failed to resolve the conversation: ${describeHostFailure(cause)}` })
  })
  // The SDK's session database is shared: a successful GET does not establish directory ownership.
  if (session !== undefined && session.directory !== host.directory) {
    return yield* new AiConfigError({ message: "This conversation belongs to a different project workspace." })
  }
  return session
})

export const sessionExists = (host: ProjectHost, sessionId: string): Effect.Effect<boolean, AiConfigError> =>
  findHostSession(host, sessionId).pipe(Effect.map((session) => session !== undefined))

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
  readonly events?: ReadonlyArray<Extract<AiEvent, { type: "tool_call" | "tool_result" | "todo" | "tool_diagnostic" }>>
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number }
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
  /** Epoch milliseconds: queued, started, stopped. */
  readonly createdAt?: number
  readonly startedAt?: number
  readonly finishedAt?: number
}

const TASK_TEXT_LIMIT = 4_000

/** The tasks of one conversation as plain data. */
export const taskInfos = (
  manager: { list(owner: { projectId: string; parentSessionId: string }): ReadonlyArray<{ id: string; agent?: string; description: string; status: HostTaskInfo["status"]; background?: boolean; text?: string; error?: string; createdAt?: number; startedAt?: number; finishedAt?: number }> },
  owner: { projectId: string; parentSessionId: string }
): ReadonlyArray<HostTaskInfo> =>
  manager.list(owner).map((task) => ({
    id: task.id,
    agent: task.agent ?? "researcher",
    description: task.description,
    status: task.status,
    background: task.background !== false,
    ...(task.createdAt !== undefined ? { createdAt: task.createdAt } : {}),
    ...(task.startedAt !== undefined ? { startedAt: task.startedAt } : {}),
    ...(task.finishedAt !== undefined ? { finishedAt: task.finishedAt } : {}),
    ...(task.text !== undefined ? { text: task.text.length > TASK_TEXT_LIMIT ? `${task.text.slice(0, TASK_TEXT_LIMIT)}…` : task.text } : {}),
    ...(task.error !== undefined ? { error: task.error } : {})
  }))

/**
 * Where a conversation stands, from the host's own record: what a client that lost its connection needs to carry on. The turn
 * is finished when the newest non-summary message is an assistant message with a turn-ending `finish` reason (or an error).
 */
/** Rebuild continuation evidence after a detached stream stopped receiving live events. */
const readContinuationState = (host: ProjectHost, sessionId: string): Promise<EventMapperState> =>
  host.client.session.messages({ sessionID: sessionId, limit: 40 }).then((messages) => {
    const visible = messages.filter((message) => message.info.summary !== true && message.info.agent !== "compaction")
    let first = 0
    for (const [index, message] of visible.entries()) {
      const synthetic = message.parts.length > 0 && message.parts.every((part) => part.type === "text" && "synthetic" in part && part.synthetic === true)
      if (message.info.role === "user" && !synthetic) first = index + 1
    }
    const state = newMapperState()
    for (const message of visible.slice(first)) {
      if (message.info.role !== "assistant") continue
      for (const part of message.parts) {
        if (part.type !== "tool") continue
        mapHostEvent(sessionId, { type: "message.part.updated", properties: { part: { ...part, sessionID: sessionId, messageID: message.info.id } } }, state)
      }
    }
    const last = visible.at(-1)
    state.sessionError = last?.info.error?.data?.message ?? last?.info.error?.name
    return state
  })

export const readHostSessionSnapshot = (host: ProjectHost, sessionId: string): Effect.Effect<{ readonly messages: Awaited<ReturnType<HostClient["session"]["messages"]>>; readonly state: HostSessionState }, AiConfigError> =>
  Effect.tryPromise({
    try: async () => {
      const messages = await host.client.session.messages({ sessionID: sessionId, limit: 40 })
      return { messages, state: sessionStateFromMessages(sessionId, messages) }
    },
    catch: (cause) => new AiConfigError({ message: `Failed to read the session: ${describeHostFailure(cause)}` })
  })

export const readHostSessionState = (host: ProjectHost, sessionId: string): Effect.Effect<HostSessionState, AiConfigError> =>
  readHostSessionSnapshot(host, sessionId).pipe(Effect.map((snapshot) => snapshot.state))

const sessionStateFromMessages = (sessionId: string, messages: Awaited<ReturnType<HostClient["session"]["messages"]>>): HostSessionState => {
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
  const recovered: Array<Extract<AiEvent, { type: "tool_call" | "tool_result" | "todo" | "tool_diagnostic" }>> = []
  const mapper = newMapperState()
  for (const message of answer) {
    for (const part of message.parts) {
      if (part.type !== "tool" || !part.tool || !part.callID) continue
      for (const event of mapHostEvent(sessionId, { type: "message.part.updated", properties: { part: { ...part, sessionID: sessionId, messageID: message.info.id } } }, mapper)) {
        if (event.type === "tool_call" || event.type === "todo" || event.type === "tool_diagnostic") recovered.push(event)
        if (event.type === "tool_result") recovered.push(event)
      }
    }
  }
  const tokens = answer.flatMap((message) => message.info.tokens ? [message.info.tokens] : [])
  const usage = tokens.reduce((total, item) => ({ inputTokens: total.inputTokens + item.input, outputTokens: total.outputTokens + item.output }), { inputTokens: 0, outputTokens: 0 })
  return { busy, text, ...(error !== undefined ? { error } : {}), ...(recovered.length ? { events: recovered } : {}), ...(tokens.length ? { usage } : {}) } satisfies HostSessionState
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

interface TurnFailure {
  readonly message: string
  readonly aborted: boolean
  /** The provider refused the request as longer than the model's context window. */
  readonly overflow: boolean
}

const failureOf = (result: HostPromptResult): TurnFailure | undefined => {
  if (result.info === undefined) {
    const message = result.data?.message ?? result.name ?? "The host rejected the prompt."
    return { message, aborted: false, overflow: isContextOverflowError(message) }
  }
  const error = result.info.error
  if (error === undefined) return undefined
  const message = error.data?.message ?? error.name ?? "The model request failed."
  return {
    message,
    aborted: error.name === "MessageAbortedError" || isInterruption(error.data?.message ?? error.name ?? ""),
    overflow: error.name === "MessageContextOverflowError" || error.name === "ContextOverflowError" || isContextOverflowError(message)
  }
}

const failureOfMessage = (message: string): TurnFailure => ({ message, aborted: false, overflow: isContextOverflowError(message) })

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
      const subscriber = new AbortController()
      yield* Effect.addFinalizer(() => Effect.sync(() => subscriber.abort()))
      // The turn below is Promise code driven by the host's events; its pauses and host reads run with this stream's services
      // (logger, tracer, Clock) instead of an empty runtime.
      const runHere = Effect.runPromiseWith(yield* Effect.context<never>())
      /** A pause on Effect's clock. Not tied to the client's connection: the turn goes on when the client leaves. */
      const pause = (ms: number): Promise<void> => runHere(Effect.sleep(Duration.millis(ms)))

      // The turn belongs to the host session, not to this stream: when the client's connection drops (a closed laptop lid, a
      // restarted webview, an idle proxy) the assistant keeps working and finishes what it started, as nikcli does. Only an
      // explicit abort (`abortHostSession`) stops a turn; the client recovers the result with `readHostSessionState`.

      const state = newMapperState()
      // One budget for every turn, `/goal` included. The host restarts its own step count at each goal iteration and this count
      // never restarts within a run, so the pause always lands at or before the host's forced-summary step. An aborted step
      // does not pause the goal: the resumed run finishes, and the host's goal continuation carries on from there.
      let stepCeiling = PRIMARY_STEP_LIMIT
      let limitReached!: (result: HostPromptResult) => void
      let stepLimit = new Promise<HostPromptResult>((resolve) => { limitReached = resolve })
      // True from the moment the step budget ran out until the turn is resumed: the aborted run's trailing events are not shown.
      let suspended = false
      let terminal = false
      state.ownTexts.add(input.message.trim())
      state.ownTexts.add(RESUME_PROMPT)
      state.ownTexts.add(REPORT_PROMPT)
      let connected!: () => void
      const connectedPromise = new Promise<void>((resolve) => (connected = resolve))
      const offer = (event: AiEvent) => {
        if (terminal || subscriber.signal.aborted || suspended) return
        if (event.type === "done" || event.type === "error") terminal = true
        if (event.type === "done" || event.type === "error") Queue.offerUnsafe(queue, { type: "turn", sessionId, phase: "finish", reason: event.type === "done" ? "completed" : event.code })
        Queue.offerUnsafe(queue, event)
      }

      const pump = (async () => {
        try {
          for await (const event of host.client.events.subscribe({ signal: controller.signal })) {
            // The in-process SSE body ignores the abort signal once headers are out, so the
            // loop only notices cancellation when the next bus event (telemetry, heartbeat) arrives. Keep this monitor alive
            // after a UI disconnect: the turn and its hard step budget belong to the host session.
            if (controller.signal.aborted) break
            if (event.type === "server.connected") {
              connected()
              continue
            }
            for (const mapped of mapHostEvent(sessionId, event, state)) {
              if (mapped.type !== "step" || suspended) {
                offer(mapped)
                continue
              }
              // The last step of the budget closed on tool calls: its tools have answered and the host is about to send the next
              // request, which on its own last step is nikcli's forced summary. Pause here so that request is never sent.
              const spentAfter = mapped.phase === "finish" && mapped.index >= stepCeiling && isToolStepFinish(mapped.reason)
              // Backstop: a step past the budget started anyway (the finish was missed or came without a reason).
              const spentBefore = mapped.phase === "start" && mapped.index > stepCeiling
              if (spentAfter) offer(mapped)
              if (spentAfter || spentBefore) {
                // The step budget of one run is spent, not the job: the run is stopped here and the turn resumes by itself (see `STEP_LIMIT_NAME`).
                suspended = true
                limitReached({ name: STEP_LIMIT_NAME, data: { message: STEP_LIMIT_MESSAGE } })
                void Promise.resolve().then(() => host.client.session.abort({ sessionID: sessionId })).catch(() => undefined)
                break
              }
              offer(mapped)
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
          const current = await runHere(readHostSessionState(host, sessionId)).catch(() => undefined)
          if (current !== undefined && !current.busy) {
            if (current.error !== undefined) offer({ type: "error", sessionId, code: "provider", message: current.error })
            else offer({ type: "done", sessionId, text: [...answers, current.text].filter((t) => t.trim() !== "").join("\n\n") })
            controller.abort()
            return true
          }
          await pause(500)
        }
        return false
      }

      /**
       * The pinned host applies a `/goal` change and then fails to encode its reply (`UnexpectedStatus`, the reply of a command that
       * writes no answer). So the reply proves nothing either way: the effect is read back from the goal itself, and only a goal
       * that did not change is an error.
       */
      const runGoalSubcommand = async (command: GoalSubcommand): Promise<string> => {
        const readGoal = () => host.client.session.goal({ sessionID: sessionId }, { signal: controller.signal })
        const before = await readGoal().catch(() => null)
        if (command === "status") return formatGoalStatus(before)
        const texts = goalSubcommandTexts(command, before)
        for (const text of texts) state.ownTexts.add(text)
        let failure: unknown
        await host.client.session.command(
          { sessionID: sessionId, command: "goal", arguments: command, agent: input.agent ?? CADCAM_AGENT, model: `${input.model.providerID}/${input.model.modelID}` },
          { signal: controller.signal }
        ).catch((cause: unknown) => { failure = cause })
        const after = await readGoal().catch(() => undefined)
        const applied = before === null || before === undefined || (after !== undefined && (command === "clear" ? after === null : after !== null && after.status === (command === "pause" ? "paused" : "active")))
        if (!applied) throw failure ?? new Error(`The host did not ${command} the goal.`)
        return texts[0]!
      }

      const run = (async () => {
        await Promise.race([connectedPromise, pause(CONNECT_TIMEOUT_MS)])
        offer({ type: "turn", sessionId, phase: "start" })
        const resumes = input.continues ?? DEFAULT_RESUMES
        let attempt = 0
        const maxContinues = input.autoContinues ?? (input.goalArguments !== undefined ? 50 : DEFAULT_AUTO_CONTINUES)
        let continuations = 0
        let successesAtNudge: ReadonlyMap<string, string> | undefined
        let failedToolsAtNudge: ReadonlySet<string> = new Set()
        let stalls = 0
        let askedForReport = false
        let compactedForOverflow = false
        /** The current run was started by a stop-hook block (`stop_hook_active` for the next call). */
        let continuedByHook = false
        let stepResumes = 0
        let successesAtStepLimit = 0
        const answers: string[] = []
        let parts: Array<{ type: "text"; text: string; synthetic?: boolean; metadata?: Record<string, unknown> } | { type: "file"; mime: string; filename: string; url: string }> = [
          { type: "text", text: input.message },
          ...(input.files ?? []).map((f) => ({ type: "file" as const, mime: f.mime, filename: f.filename, url: f.url })),
          ...(input.observation !== undefined ? [{ type: "text" as const, text: input.observation.text, synthetic: true, metadata: { ...input.observation.metadata } }] : [])
        ]
        // Evidence only: a host without the read (or one that throws synchronously) must not turn a healthy prompt into an error.
        const readMessages = (limit: number) => Promise.resolve().then(() => host.client.session.messages({ sessionID: sessionId, limit })).catch(() => undefined)
        let beforePrompt: string | undefined
        let beforePromptKnown = false
        const recoverInterruption = async (): Promise<"retry" | "finished"> => {
          const messages = await readMessages(40)
          const progressed = beforePromptKnown && messages !== undefined && messages.at(-1)?.info.id !== beforePrompt
          const current = progressed ? await runHere(readHostSessionState(host, sessionId)).catch(() => undefined) : undefined
          // Prompt waiters can be rejected after the host already saved a complete answer.
          if (current && !current.busy && !current.error && current.text.trim() !== "") {
            offer({ type: "done", sessionId, text: [...answers, current.text].filter((text) => text.trim() !== "").join("\n\n"), recovered: true, ...(current.usage ? { usage: current.usage } : {}) })
            controller.abort()
            return "finished"
          }
          const ranTools = state.toolCalls > 0 || current?.events?.some((event) => event.type === "tool_call")
          if ((state.reportedUser.size > 0 || ranTools) && await finishFromSession(answers)) return "finished"
          // A missing record cannot establish that resending a mutation is safe. A saved user message means the host
          // took this prompt: resending would only stack copies of it in the conversation (six per phone message).
          if (beforePromptKnown && messages !== undefined && !progressed && !ranTools && attempt < resumes && !controller.signal.aborted) {
            attempt += 1
            offer({ type: "retry", sessionId, attempt, message: `The previous answer was still finishing. Sending your message again (${attempt}/${resumes}).` })
            await pause(INTERRUPT_BACKOFF_MS * attempt)
            state.sessionError = undefined
            state.idle = false
            return "retry"
          }
          controller.abort()
          // The host's own reason (an unknown model, a rejected key) when it gave one; the message stays saved, never resent.
          const reason = current?.error ?? (state.sessionError && !isInterruption(state.sessionError) ? state.sessionError : undefined)
          offer({ type: "error", sessionId, code: reason ? "provider" : "aborted", message: reason ?? INTERRUPTED_MESSAGE })
          return "finished"
        }
        // `/goal`: the host's own command sets, pauses, resumes, clears or reads the goal; the application only parses the line
        // and carries the answer. An objective then runs as the turn: the command writes its brief and starts the agent.
        const hostModel = `${input.model.providerID}/${input.model.modelID}`
        let goalPending: GoalCommand | undefined
        let usedGoalCommand = false
        if (input.goalArguments !== undefined) {
          let command: GoalCommand
          try { command = parseGoalArguments(input.goalArguments) } catch (cause) {
            controller.abort()
            offer({ type: "error", sessionId, code: "config", message: cause instanceof Error ? cause.message : String(cause) })
            return
          }
          if (command.type === "subcommand") {
            try {
              const text = await runGoalSubcommand(command.command)
              offer({ type: "delta", sessionId, text })
              offer({ type: "done", sessionId, text })
            } catch (cause) {
              offer({ type: "error", sessionId, code: "provider", message: describeHostFailure(cause) })
            }
            controller.abort()
            return
          }
          if (command.objective === "") {
            controller.abort()
            offer({ type: "error", sessionId, code: "config", message: "You must provide a goal condition." })
            return
          }
          goalPending = command
          // The host records its own brief as a user message of the session: the stream's, not something the user wrote meanwhile.
          state.skipUserMessages += 1
        }
        // nikcli's plan-mode and build-switch reminders (`prompts/reminders.ts`): a short synthetic part, sent once when the primary
        // changes. The previous primary is read from the session's latest assistant message; a compaction summary or a session
        // without one counts as none, so a conversation that just entered Plan, or lost the reminder in a summary, gets it.
        if (goalPending === undefined) {
          const recent = await readMessages(20)
          const lastAssistant = recent?.findLast((entry) => entry.info.role === "assistant" && entry.info.summary !== true)?.info
          const reminder = reminderFor(primaryOfHost(input.agent ?? CADCAM_AGENT), primaryOfHost(lastAssistant?.agent))
          if (reminder !== undefined) parts = [...parts, { type: "text", text: reminder, synthetic: true }]
        }
        for (;;) {
          let result: HostPromptResult
          try {
            const snapshot = await readMessages(1)
            beforePromptKnown = snapshot !== undefined
            beforePrompt = snapshot?.at(-1)?.info.id
            stepCeiling = state.step + PRIMARY_STEP_LIMIT
            usedGoalCommand = false
            if (goalPending !== undefined) {
              goalPending = undefined
              usedGoalCommand = true
              result = await Promise.race([stepLimit, host.client.session.command(
                { sessionID: sessionId, command: "goal", arguments: input.goalArguments!, agent: input.agent ?? CADCAM_AGENT, model: hostModel, ...(input.variant ? { variant: input.variant } : {}) },
                { signal: controller.signal }
              )])
            } else
            result = await Promise.race([stepLimit, host.client["session-prompt"].prompt(
              { sessionID: sessionId, agent: input.agent ?? CADCAM_AGENT, model: input.model, ...(input.variant ? { variant: input.variant } : {}), ...(input.system ? { system: input.system } : {}), parts },
              { signal: controller.signal }
            )])
          } catch (cause) {
            const message = describeHostFailure(cause)
            // The host started the goal and ran its loop, then failed to encode the command's reply: the work is in the session.
            if (usedGoalCommand && !isInterruption(message) && !controller.signal.aborted && (await host.client.session.goal({ sessionID: sessionId }).catch(() => null)) !== null && (await finishFromSession(answers))) return
            if (isInterruption(message)) {
              if (await recoverInterruption() === "retry") continue
              return
            }
            if (attempt < resumes && !controller.signal.aborted && isTransientFailure(message)) {
              attempt += 1
              offer({ type: "turn", sessionId, phase: "recovering", reason: message })
              offer({ type: "retry", sessionId, attempt, message: `${message} Resuming automatically (${attempt}/${resumes}).` })
              await pause(resumeDelay(attempt, message))
              parts = [{ type: "text", text: RESUME_PROMPT, synthetic: true }]
              continue
            }
            controller.abort()
            offer({ type: "error", sessionId, code: "provider", message })
            return
          }
          if (result.info === undefined && result.name === STEP_LIMIT_NAME) {
            // Keep moving: the host session was aborted by the pump; wait for it to settle, then start the next run.
            const settle = Date.now() + 5_000
            while (!controller.signal.aborted && !state.idle && Date.now() < settle) await pause(25)
            const progressed = state.successfulCalls.size > successesAtStepLimit
            // A detached webview is not a cancellation: the session still owns this run and its next budget.
            if (controller.signal.aborted) return
            if (!progressed || stepResumes >= MAX_STEP_RESUMES) {
              suspended = false
              offer({ type: "error", sessionId, code: "internal", message: `${STEP_LIMIT_MESSAGE} It made no further progress on its own: review the last tool result, then tell it to continue.` })
              controller.abort()
              return
            }
            stepResumes += 1
            successesAtStepLimit = state.successfulCalls.size
            suspended = false
            stepLimit = new Promise<HostPromptResult>((resolve) => { limitReached = resolve })
            state.idle = false
            state.retry = undefined
            state.sessionError = undefined
            offer({ type: "turn", sessionId, phase: "continuing", reason: STEP_LIMIT_PROMPT })
            parts = [{ type: "text", text: STEP_LIMIT_PROMPT, synthetic: true }]
            state.ownTexts.add(STEP_LIMIT_PROMPT)
            continue
          }
          // Let trailing bus events (final deltas, session.idle) reach the subscriber.
          const deadline = Date.now() + IDLE_GRACE_MS
          while (!subscriber.signal.aborted && !state.idle && Date.now() < deadline) await pause(10)
          // Detached UI subscribers no longer update tool/todo state; use the host record, never stale live evidence.
          let continuationState: EventMapperState | undefined = state
          if (subscriber.signal.aborted) continuationState = await readContinuationState(host, sessionId).catch(() => undefined)
          const sessionError = continuationState?.sessionError
          const failure = failureOf(result) ?? (sessionError !== undefined ? failureOfMessage(sessionError) : undefined)
          // The pinned host stores a provider's context-overflow refusal as the turn's error and stops: its own compaction only
          // runs on its token estimate. Summarise once and carry on, as Claude Code and upstream opencode do; a second overflow
          // in the same turn means the summary did not help, and it is reported. As upstream, only the user compacts when
          // automatic compaction is off, overflow included.
          if (failure?.overflow && !failure.aborted && !compactedForOverflow && !controller.signal.aborted
            && await runHere(readHostContextPolicy(host).pipe(Effect.map((policy) => policy.auto), Effect.catch(() => Effect.succeed(true))))) {
            compactedForOverflow = true
            offer({ type: "turn", sessionId, phase: "recovering", reason: failure.message })
            const compactionsBefore = state.compactions
            const compacted = await runHere(compactHostSession(host, sessionId, input.model).pipe(Effect.as(true), Effect.catch(() => Effect.succeed(false))))
            // Let the summary's bus events (`session.compacted`) reach the subscriber before the next run starts.
            const settle = Date.now() + IDLE_GRACE_MS
            while (compacted && !subscriber.signal.aborted && state.compactions === compactionsBefore && Date.now() < settle) await pause(10)
            if (compacted && !controller.signal.aborted) {
              state.retry = undefined
              state.sessionError = undefined
              state.idle = false
              parts = [{ type: "text", text: RESUME_PROMPT, synthetic: true }]
              continue
            }
          }
          if (failure && !failure.aborted && attempt < resumes && isTransientFailure(failure.message)) {
            // The host gave up on this call; the conversation is intact, so ask it to carry on after a pause.
            attempt += 1
            offer({ type: "turn", sessionId, phase: "recovering", reason: failure.message })
            offer({ type: "retry", sessionId, attempt, message: `${failure.message} Resuming automatically (${attempt}/${resumes}).` })
            await pause(resumeDelay(attempt, failure.message))
            state.retry = undefined
            state.sessionError = undefined
            state.idle = false
            parts = [{ type: "text", text: RESUME_PROMPT, synthetic: true }]
            continue
          }
          // The call went through: the outage (if any) is over, so the next one gets its full set of resumes again.
          if (!failure) attempt = 0
          if (failure && isInterruption(failure.message)) {
            if (await recoverInterruption() === "retry") continue
            return
          }
          const answerOf = (): string => (result.parts ?? []).filter((p) => p.type === "text").map((p) => p.text ?? "").join("")
          if (!failure && !controller.signal.aborted && continuationState?.repeatedFailure !== undefined) {
            const repeated = continuationState.repeatedFailure
            offer({ type: "error", sessionId, code: "internal", message: `The assistant stopped because the same ${repeated.tool} call failed ${repeated.count} times with the same arguments${repeated.error ? `: ${repeated.error}` : ""}. Completed changes were preserved. Automatic recovery made no progress: change the approach or the arguments before trying again.` })
            controller.abort()
            return
          }
          if (!failure && !controller.signal.aborted && continuationState !== undefined && maxContinues > 0) {
            const text = answerOf()
            // Stored snapshots have bounded, changing windows. Compare completed call identities, never started-call
            // counts or error wording. While recovering a failed tool, unrelated successful reads do not fix it.
            const previousSuccesses = successesAtNudge
            const progressed = previousSuccesses === undefined || [...continuationState.successfulCalls].some(([callId, tool]) =>
              !previousSuccesses.has(callId) && (failedToolsAtNudge.size === 0 || failedToolsAtNudge.has(tool)))
            stalls = progressed ? 0 : stalls + 1
            // Never at the cost of an error: with the budget spent, a silent turn still ends as done.
            const silent = text.trim() === "" && answers.length === 0 && !askedForReport && continuations < maxContinues && continuationState.successfulCalls.size > 0
            const own = continuationFor(continuationState, text, result.info?.finish) ?? (silent ? REPORT_PROMPT : undefined)
            if (own === REPORT_PROMPT) { askedForReport = true; stalls = 0 }
            // The turn would end as done: the operator's stop hooks may send it back with a reason (Claude Code's `Stop`).
            let blockedBy: string | undefined
            if (own === undefined && input.stopHook !== undefined) {
              const verdict: StopHookVerdict = await runHere(input.stopHook({
                sessionId, cwd: host.directory, stopHookActive: continuedByHook, lastAssistantMessage: text,
                openTodos: continuationState.todos.filter((t) => t.status === "pending" || t.status === "in_progress").map((t) => t.content)
              })).catch(() => ({ decision: "allow" as const }))
              if (verdict.decision === "block") blockedBy = verdict.reason
            }
            const nudge = own ?? (blockedBy !== undefined ? `${STOP_HOOK_PROMPT}${blockedBy}` : undefined)
            if (nudge !== undefined) {
              if (stalls >= MAX_STALLS || continuations >= maxContinues) {
                offer({ type: "error", sessionId, code: "internal", message: stalls >= MAX_STALLS
                  ? "The assistant stopped because automatic recovery made no progress. Completed changes were preserved. Review the last tool result before trying again."
                  : "The assistant reached its automatic continuation limit with work still open. Completed changes were preserved. Review the remaining plan before continuing." })
                controller.abort()
                return
              }
              if (text.trim() !== "") answers.push(text)
              continuations += 1
              continuedByHook = blockedBy !== undefined
              offer({ type: "turn", sessionId, phase: "continuing", reason: nudge })
              successesAtNudge = new Map(continuationState.successfulCalls)
              failedToolsAtNudge = new Set(continuationState.toolErrors.keys())
              state.idle = false
              state.retry = undefined
              state.sessionError = undefined
              parts = [{ type: "text", text: nudge, synthetic: true }]
              continue
            }
          }
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
              ...(state.completedSteps.size > 0 ? { usage: state.usage } : tokens ? { usage: { inputTokens: tokens.input, outputTokens: tokens.output } } : {})
            })
          }
          controller.abort()
          return
        }
      })()

      yield* Effect.tryPromise({
        try: async () => {
          await run
          subscriber.abort()
          await Promise.race([pump, pause(150)])
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
      const previous = (await host.client.session.messages({ sessionID: sessionId, limit: 20 })).findLast((entry) => entry.info.role === "user")?.info
      const model = previous?.model
      await host.client["session-prompt"].promptAsync({
        sessionID: sessionId, agent: currentHostAgent(previous?.agent) ?? CADCAM_AGENT,
        ...(typeof model?.providerID === "string" && typeof model.modelID === "string" ? { model: { providerID: model.providerID, modelID: model.modelID } } : {}),
        ...(previous?.variant ? { variant: previous.variant } : {}),
        delivery, parts: [{ type: "text", text: message }]
      })
    },
    catch: (cause) => new AiProviderError({ message: describeHostFailure(cause) })
  })
