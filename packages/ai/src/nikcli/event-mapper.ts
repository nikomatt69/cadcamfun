/// <reference path="./sdk-next.d.ts" />
import { drainProgramCalls, forgetProgramCalls } from "./program-calls.ts"
import type { HostEvent } from "@nikcli-ai/sdk-next"
import type { AiEvent } from "../events.ts"
import { childAgent } from "./agents.ts"

/** Only bounded inline PNG evidence from the application's own viewport tools reaches the UI. */
const toolImages = (tool: string, state: Record<string, unknown> | undefined) => {
  // Only the viewport reads of `cad` and `cam` carry images; every image is still checked as a bounded PNG data URL.
  if (tool !== "cad" && tool !== "cam") return {}
  const attachments = state?.["attachments"]
  const images = (Array.isArray(attachments) ? attachments : []).map((file) => file?.url).filter((url): url is string => typeof url === "string" && url.length <= 4_000_100 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(url)).slice(0, 2)
  return images.length ? { images } : {}
}

/**
 * Maps the host's bus events for ONE session to `AiEvent`s.
 *
 * Observed shapes (nikcli 1.428.0): text parts arrive as `message.part.updated`
 * with `delta`; tool parts go `pending` (input still empty) -> `running` (input
 * known) -> `completed|error`. User messages also produce text parts, so message
 * roles are tracked from `message.updated` and user parts are skipped.
 */
export interface EventMapperState {
  readonly userMessages: Set<string>
  readonly internalMessages: Set<string>
  readonly startedCalls: Set<string>
  readonly finishedCalls: Set<string>
  /** Characters of arguments last reported per call still being written (progress is throttled). */
  readonly progress: Map<string, number>
  readonly plans: Map<string, string>
  readonly completedSteps: Set<string>
  readonly startedSteps: Set<string>
  usage: { inputTokens: number; outputTokens: number }
  /** Steps of the current turn so far. */
  step: number
  idle: boolean
  /** Last `session.status: retry` seen (the host retries provider failures with backoff). */
  retry: { attempt: number; message: string } | undefined
  /** Message of a `session.error` for this session. */
  sessionError: string | undefined
  /** The agent's plan as of its last `todowrite`. */
  todos: ReadonlyArray<{ readonly content: string; readonly status: string }>
  /** Tool calls started in this turn, by the agent and by its specialists. */
  toolCalls: number
  /** The most recent tool call ended in an error, and what it said; cleared by the next success. */
  lastToolError: string | undefined
  readonly toolErrors: Map<string, string>
  /** Texts this stream sent itself (the prompt, a re-sent prompt): a user message with one of them is not news. */
  readonly ownTexts: Set<string>
  /** User messages already reported as `user_message`. */
  readonly reportedUser: Set<string>
  /** Inner calls of `code_mode` programs reported so far (their call ids are numbered). */
  programCalls: number
  /** User messages the host writes for a command this stream ran (`/goal`): its own wording, not something the user said meanwhile. */
  skipUserMessages: number
}

export const newMapperState = (): EventMapperState => ({
  userMessages: new Set(),
  internalMessages: new Set(),
  startedCalls: new Set(),
  finishedCalls: new Set(),
  progress: new Map(),
  plans: new Map(),
  completedSteps: new Set(),
  startedSteps: new Set(),
  usage: { inputTokens: 0, outputTokens: 0 },
  step: 0,
  idle: false,
  retry: undefined,
  sessionError: undefined,
  todos: [],
  toolCalls: 0,
  lastToolError: undefined,
  toolErrors: new Map(),
  ownTexts: new Set(),
  reportedUser: new Set(),
  programCalls: 0,
  skipUserMessages: 0
})

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)
const rec = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined

const STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const

/** Partial mutations are successful writes with unfinished items, even without an explicit error flag. */
const partialProblem = (value: Record<string, unknown> | undefined): string | undefined => {
  const skipped = value?.["skipped"]
  const count = typeof skipped === "number" ? skipped : Array.isArray(skipped) ? skipped.length : 0
  if (!(count > 0)) return undefined
  const details = Array.isArray(skipped) ? skipped.slice(0, 8).flatMap((item) => {
    if (typeof item === "string") return [item]
    const detail = rec(item)
    const error = str(detail?.["error"]) ?? str(detail?.["message"])
    return error ? [`${typeof detail?.["index"] === "number" ? `elements[${detail["index"]}]: ` : ""}${error}`] : []
  }) : []
  return `Partial result: ${count} item(s) skipped${details.length ? `: ${details.join("; ")}` : ""}. Inspect confirmed changes and retry only skipped items.`.slice(0, 2_000)
}

const outputRecord = (output: string): Record<string, unknown> | undefined => {
  try { return rec(JSON.parse(output)) } catch { return undefined }
}

const toolDiagnostics = (sessionId: string, callId: string, tool: string, output: string, failure?: string, agent?: string): ReadonlyArray<AiEvent> => {
  let value: Record<string, unknown> | undefined
  try { value = rec(JSON.parse(output)) } catch { /* Native execution errors may be plain text. */ }
  const shared = { sessionId, callId, tool, ...(agent ? { agent } : {}) }
  if (failure) {
    const partial = (typeof value?.["skipped"] === "number" && value["skipped"] > 0) || (Array.isArray(value?.["skipped"]) && value["skipped"].length > 0)
    const argument = value?.["_tag"] === "InvalidToolArguments" || /invalid arguments|schema validation|required field|elements\[|history\./i.test(failure)
    return [{ type: "tool_diagnostic", ...shared, kind: partial ? "partial" : argument ? "argument" : "execution", severity: "error", message: failure,
      ...(str(value?.["recovery"]) ? { recovery: str(value?.["recovery"])! } : {}),
      ...(typeof value?.["mutationApplied"] === "boolean" ? { mutationApplied: value["mutationApplied"] } : {}) }]
  }
  const partial = partialProblem(value)
  if (partial) return [{ type: "tool_diagnostic", ...shared, kind: "partial", severity: "warning", message: partial,
    recovery: str(value?.["recovery"]) ?? "Inspect confirmed changes; correct and retry only skipped items.",
    ...(typeof value?.["mutationApplied"] === "boolean" ? { mutationApplied: value["mutationApplied"] } : tool === "cad_edit" && Array.isArray(value?.["elements"]) && value["elements"].length > 0 ? { mutationApplied: true } : {}) }]
  if (!["cad", "cam", "cam_edit"].includes(tool) || !Array.isArray(value?.["issues"])) return []
  return value["issues"].slice(0, 8).flatMap((item): AiEvent[] => {
    const issue = rec(item)
    const message = str(issue?.["message"])
    if (!message) return []
    const severity = issue?.["severity"] === "error" ? "error" : issue?.["severity"] === "warning" ? "warning" : "info"
    return [{ type: "tool_diagnostic", ...shared, kind: "verification", severity, message: `${str(issue?.["code"]) ?? "Finding"}: ${message}`.slice(0, 2_000) }]
  })
}
/** The host's todo list as plain data; anything that is not a list of {content, status} yields undefined. */
const todosOf = (value: unknown): Array<{ id?: string; content: string; status: (typeof STATUSES)[number]; priority?: string }> | undefined => {
  if (!Array.isArray(value)) return undefined
  const out: Array<{ id?: string; content: string; status: (typeof STATUSES)[number]; priority?: string }> = []
  for (const item of value) {
    const t = rec(item)
    const content = str(t?.["content"])
    if (content === undefined) continue
    const status = STATUSES.find((s) => s === t?.["status"]) ?? "pending"
    out.push({ ...(str(t?.["id"]) !== undefined ? { id: str(t?.["id"])! } : {}), content, status, ...(str(t?.["priority"]) !== undefined ? { priority: str(t?.["priority"])! } : {}) })
  }
  return out
}

/**
 * Why a finished tool call counts as failed: the host marked it an error, or the tool answered `{ok:false, error}` (our tools
 * report a refused call that way, as a normal result). Undefined when it worked.
 */
export const toolFailure = (status: string | undefined, output: string): string | undefined => {
  if (status === "error") return output || "The tool call failed."
  try {
    const value = rec(JSON.parse(output))
    if (!value) return undefined
    const problem = (item: unknown): string | undefined => {
      if (typeof item === "string") return item
      const detail = rec(item)
      const message = str(detail?.["message"]) ?? str(detail?.["error"])
      return message ? `${str(detail?.["path"]) ?? str(detail?.["code"]) ?? ""}: ${message}`.replace(/^: /, "") : undefined
    }
    const error = problem(value["error"])
    const problems = Array.isArray(value["problems"]) ? value["problems"].flatMap((item) => problem(item) ?? []).slice(0, 8) : []
    const errors = Array.isArray(value["errors"]) ? value["errors"].flatMap((item) => problem(item) ?? []).slice(0, 8) : []
    // `ok:false` with findings (a design check, a simulation) is a result about the model, not a refused call.
    const details = [error, ...problems, ...errors].filter((item): item is string => item !== undefined && item !== "")
    if (details.length === 0) return value["success"] === false ? "The tool reported success:false without an error description." : undefined
    if (value["ok"] !== false && value["success"] !== false && errors.length === 0) return undefined
    const partial = (typeof value["skipped"] === "number" && value["skipped"] > 0) || (Array.isArray(value["skipped"]) && value["skipped"].length > 0)
    return `${details.join("; ")}${partial ? " Partial result: inspect confirmed changes and retry only skipped items." : ""}`.slice(0, 2_000)
  } catch { return undefined }
}

/**
 * The inner calls of a `code_mode` program that finished since the last update of its part, as the same events a direct call
 * produces. Their call ids hang off the program's, so a host that reuses ids across sessions cannot collide.
 */
const programCallEvents = (sessionId: string, programCallId: string, state: EventMapperState, agent?: string): ReadonlyArray<AiEvent> => {
  const out: AiEvent[] = []
  for (const call of drainProgramCalls(programCallId)) {
    const callId = `${programCallId}#${state.programCalls++}`
    state.startedCalls.add(callId)
    state.finishedCalls.add(callId)
    state.toolCalls += 1
    const failure = call.failed ? call.output || "The tool call failed." : toolFailure(undefined, call.output)
    const shared = { sessionId, callId, tool: call.tool, ...(agent ? { agent } : {}) }
    out.push({ type: "tool_call", ...shared, input: call.input ?? {} })
    out.push({ type: "tool_result", ...shared, ok: failure === undefined, output: call.output })
    out.push(...toolDiagnostics(sessionId, callId, call.tool, call.output, failure, agent))
  }
  return out
}

/** The tool events of a specialist's session, as events of the parent's turn (call ids carry the child's session id: two sessions may reuse one). */
const mapChildTool = (sessionId: string, childId: string, agent: string, part: Record<string, unknown>, state: EventMapperState): ReadonlyArray<AiEvent> => {
  if (str(part["type"]) !== "tool") return []
  const tool = str(part["tool"]) ?? ""
  if (tool === "" || tool === "todowrite" || tool === "todoread" || tool === "skill") return []
  const callId = `${childId}:${str(part["callID"]) ?? str(part["id"]) ?? ""}`
  const toolState = rec(part["state"])
  const status = str(toolState?.["status"])
  if (status === "pending") {
    const chars = str(toolState?.["raw"])?.length ?? 0
    const last = state.progress.get(callId)
    if (state.startedCalls.has(callId) || (last !== undefined && chars - last < 500)) return []
    state.progress.set(callId, chars)
    return [{ type: "tool_progress", sessionId, agent, callId, tool, chars }]
  }
  const out: AiEvent[] = []
  if ((status === "running" || status === "completed" || status === "error") && !state.startedCalls.has(callId)) {
    state.startedCalls.add(callId)
    state.toolCalls += 1
    out.push({ type: "tool_call", sessionId, agent, callId, tool, input: toolState?.["input"] ?? {} })
  }
  // A specialist's program: its inner calls are recorded under the host's own call id, not the prefixed one.
  const hostCallId = str(part["callID"]) ?? str(part["id"]) ?? ""
  if (tool === "code_mode" && (status === "running" || status === "completed" || status === "error")) out.push(...programCallEvents(sessionId, hostCallId, state, agent))
  else if (status === "completed" || status === "error") forgetProgramCalls(hostCallId)
  if ((status === "completed" || status === "error") && !state.finishedCalls.has(callId)) {
    state.finishedCalls.add(callId)
    const output = (status === "completed" ? str(toolState?.["output"]) : str(toolState?.["error"])) ?? ""
    const failure = toolFailure(status, output)
    out.push({ type: "tool_result", sessionId, agent, callId, tool, ok: status === "completed" && failure === undefined, output, ...toolImages(tool, toolState) })
    out.push(...toolDiagnostics(sessionId, callId, tool, output, failure, agent))
  }
  return out
}

const mapHostEventParts = (sessionId: string, event: HostEvent, state: EventMapperState): ReadonlyArray<AiEvent> => {
  const props = event.properties
  switch (event.type) {
    case "question.asked": {
      const source = str(props["sessionID"])
      if (!source || source !== sessionId && childAgent(sessionId, source) === undefined) return []
      const requestId = str(props["id"])
      if (!requestId || !Array.isArray(props["questions"])) return []
      const questions = props["questions"].flatMap((value) => {
        const q = rec(value)
        if (!q || typeof q["header"] !== "string" || typeof q["question"] !== "string" || !Array.isArray(q["options"])) return []
        const options = q["options"].flatMap((value) => {
          const option = rec(value)
          return option && typeof option["label"] === "string" && typeof option["description"] === "string" ? [{ label: option["label"], description: option["description"] }] : []
        })
        return [{ header: q["header"], question: q["question"], options, ...(typeof q["multiple"] === "boolean" ? { multiple: q["multiple"] } : {}), ...(typeof q["custom"] === "boolean" ? { custom: q["custom"] } : {}) }]
      })
      return questions.length ? [{ type: "question_request", sessionId, requestId, questions }] : []
    }
    case "question.replied":
    case "question.rejected": {
      const source = str(props["sessionID"])
      if (!source || source !== sessionId && childAgent(sessionId, source) === undefined) return []
      return [{ type: "question_resolved", sessionId, requestId: str(props["requestID"]) ?? "" }]
    }
    case "message.updated": {
      const info = rec(props["info"])
      if (info && str(info["sessionID"]) === sessionId && info["role"] === "user") {
        const id = str(info["id"])
        if (id) state.userMessages.add(id)
      }
      if (info && str(info["sessionID"]) === sessionId && (info["summary"] === true || info["agent"] === "compaction")) {
        const id = str(info["id"])
        if (id && !state.internalMessages.has(id)) {
          state.internalMessages.add(id)
          return [{ type: "compaction", sessionId, phase: "start" }]
        }
      }
      return []
    }
    case "message.part.updated": {
      const part = rec(props["part"])
      const partSession = str(part?.["sessionID"])
      if (!part || partSession === undefined) return []
      // A specialist the agent handed work to runs in a child session: its tool calls are part of this turn (the editor shows
      // what it changes as it happens), its text and reasoning stay with it.
      const agent = partSession === sessionId ? undefined : childAgent(sessionId, partSession)
      if (partSession !== sessionId && agent === undefined) return []
      if (agent !== undefined) return mapChildTool(sessionId, partSession, agent, part, state)
      const messageId = str(part["messageID"])
      const type = str(part["type"])
      // A user message the stream did not send itself and that is not the application's own wording (continuations, task
      // reports are synthetic): the user wrote it while the agent worked, and it has just been taken into the conversation.
      if (type === "text" && messageId && state.userMessages.has(messageId)) {
        const text = str(part["text"])?.trim()
        const partId = str(part["id"]) ?? messageId
        if (text && part["synthetic"] !== true && !state.ownTexts.has(text) && !state.reportedUser.has(partId)) {
          state.reportedUser.add(partId)
          if (state.skipUserMessages > 0) { state.skipUserMessages -= 1; return [] }
          return [{ type: "user_message", sessionId, text }]
        }
        return []
      }
      if (messageId && (state.userMessages.has(messageId) || state.internalMessages.has(messageId))) return []
      if (type === "reasoning") {
        const messageId = str(part["messageID"])
        const delta = str(props["delta"])
        if (!delta || (messageId && (state.userMessages.has(messageId) || state.internalMessages.has(messageId)))) return []
        return [{ type: "reasoning", sessionId, text: delta }]
      }
      if (type === "step-start") {
        const id = str(part["id"])
        if (id && state.startedSteps.has(id)) return []
        if (id) state.startedSteps.add(id)
        state.step += 1
        return [{ type: "step", sessionId, phase: "start", index: state.step }]
      }
      if (type === "step-finish") {
        const id = str(part["id"]) ?? `${messageId ?? ""}:${state.step}`
        if (state.completedSteps.has(id)) return []
        state.completedSteps.add(id)
        const tokens = rec(part["tokens"])
        const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
        const input = count(tokens?.["input"])
        const output = count(tokens?.["output"])
        state.usage = { inputTokens: state.usage.inputTokens + input, outputTokens: state.usage.outputTokens + output }
        const reason = str(part["reason"])
        return [{ type: "step", sessionId, phase: "finish", index: Math.max(1, state.step), ...(reason !== undefined ? { reason } : {}), usage: { inputTokens: input, outputTokens: output } }]
      }
      if (type === "text") {
        const messageId = str(part["messageID"])
        const delta = str(props["delta"])
        if (!delta || (messageId && (state.userMessages.has(messageId) || state.internalMessages.has(messageId)))) return []
        return [{ type: "delta", sessionId, text: delta }]
      }
      if (type === "tool") {
        const callId = str(part["callID"]) ?? str(part["id"]) ?? ""
        const tool = str(part["tool"]) ?? ""
        const toolState = rec(part["state"])
        const status = str(toolState?.["status"])
        if (status === "pending" && tool !== "" && !state.startedCalls.has(callId)) {
          // The model is still writing the arguments: report how far it is, so a long call is visibly alive.
          const chars = str(toolState?.["raw"])?.length ?? 0
          const last = state.progress.get(callId)
          if (last === undefined || chars - last >= 500) {
            state.progress.set(callId, chars)
            return [{ type: "tool_progress", sessionId, callId, tool, chars }]
          }
          return []
        }
        const todos = tool === "todowrite" && (status === "running" || status === "completed") ? todosOf(rec(toolState?.["input"])?.["todos"]) : undefined
        const plan = todos === undefined ? undefined : JSON.stringify(todos)
        if (todos !== undefined && plan !== undefined && plan !== state.plans.get(callId)) {
          state.plans.set(callId, plan)
          state.todos = todos
          const out: AiEvent[] = [{ type: "todo", sessionId, todos }]
          if (status === "completed" && !state.finishedCalls.has(callId)) { state.finishedCalls.add(callId); state.startedCalls.add(callId) }
          return out
        }
        if (tool === "todowrite" || tool === "todoread") return []
        if (status === "running" && !state.startedCalls.has(callId)) {
          state.startedCalls.add(callId)
          state.toolCalls += 1
          return [{ type: "tool_call", sessionId, callId, tool, input: toolState?.["input"] ?? {} }]
        }
        if ((status === "completed" || status === "error") && !state.finishedCalls.has(callId)) {
          state.finishedCalls.add(callId)
          const out: AiEvent[] = []
          if (!state.startedCalls.has(callId)) {
            state.startedCalls.add(callId)
            state.toolCalls += 1
            out.push({ type: "tool_call", sessionId, callId, tool, input: toolState?.["input"] ?? {} })
          }
          // A bounded answer stores its whole value in the metadata: the editor mirrors that, never the model's shortened text.
          const stored = status === "completed" ? rec(toolState?.["metadata"])?.["value"] : undefined
          const finalOutput = (stored !== undefined ? JSON.stringify(stored) : status === "completed" ? str(toolState?.["output"]) : str(toolState?.["error"])) ?? ""
          const failure = toolFailure(status, finalOutput)
          const unresolved = failure ?? partialProblem(outputRecord(finalOutput))
          if (unresolved !== undefined) state.toolErrors.set(tool, unresolved)
          else state.toolErrors.delete(tool)
          state.lastToolError = [...state.toolErrors.values()].at(-1)
          out.push({ type: "tool_result", sessionId, callId, tool, ok: status === "completed" && failure === undefined, output: finalOutput, ...toolImages(tool, toolState) })
          out.push(...toolDiagnostics(sessionId, callId, tool, finalOutput, failure))
          return out
        }
      }
      return []
    }
    case "permission.asked": {
      const owner = str(props["sessionID"])
      if (!owner || (owner !== sessionId && childAgent(sessionId, owner) === undefined)) return []
      const patterns = Array.isArray(props["patterns"]) ? props["patterns"].filter((p): p is string => typeof p === "string") : []
      return [
        {
          type: "permission_request",
          sessionId: owner,
          requestId: str(props["id"]) ?? "",
          permission: str(props["permission"]) ?? "unknown",
          patterns
        }
      ]
    }
    case "permission.replied": {
      const owner = str(props["sessionID"])
      if (!owner || owner !== sessionId && childAgent(sessionId, owner) === undefined) return []
      const reply = props["reply"]
      const requestId = str(props["requestID"])
      return requestId && (reply === "once" || reply === "always" || reply === "reject") ? [{ type: "permission_resolved", sessionId: owner, requestId, reply }] : []
    }
    case "permission.blocked": {
      const owner = str(props["sessionID"])
      if (!owner || owner !== sessionId && childAgent(sessionId, owner) === undefined) return []
      return [{ type: "permission_blocked", sessionId: owner, permission: str(props["permission"]) ?? "unknown", patterns: Array.isArray(props["patterns"]) ? props["patterns"].filter((value): value is string => typeof value === "string") : [], reason: str(props["reason"]) ?? "The host denied this action." }]
    }
    case "session.status": {
      if (str(props["sessionID"]) !== sessionId) return []
      const status = rec(props["status"])
      if (status?.["type"] === "busy" || status?.["type"] === "idle") return [{ type: "session_status", sessionId, status: status["type"] }]
      if (status?.["type"] === "retry") {
        const attempt = Number(status["attempt"] ?? 0)
        const message = str(status["message"]) ?? "The model request failed."
        const fresh = state.retry?.attempt !== attempt
        state.retry = { attempt, message }
        if (fresh) return [{ type: "session_status", sessionId, status: "retry" }, { type: "retry", sessionId, attempt, message }]
      }
      return []
    }
    case "session.error": {
      if (str(props["sessionID"]) !== sessionId) return []
      const error = rec(props["error"])
      state.sessionError = str(rec(error?.["data"])?.["message"]) ?? str(error?.["name"]) ?? "The session failed."
      return []
    }
    case "session.goal": {
      if (str(props["sessionID"]) !== sessionId) return []
      const goal = rec(props["goal"])
      if (goal === undefined) return [{ type: "goal", sessionId, goal: null }]
      const status = ["active", "paused", "blocked", "usage_limited", "budget_limited", "complete"].find((x) => x === goal["status"])
      const objective = str(goal["objective"])
      if (status === undefined || objective === undefined) return []
      return [{
        type: "goal", sessionId,
        goal: {
          objective, status: status as "active", iteration: typeof goal["iterationCount"] === "number" ? goal["iterationCount"] : 0,
          tokensUsed: typeof goal["tokensUsed"] === "number" ? goal["tokensUsed"] : 0,
          ...(typeof goal["tokenBudget"] === "number" ? { tokenBudget: goal["tokenBudget"] } : {})
        }
      }]
    }
    case "session.compacted": {
      return str(props["sessionID"]) === sessionId ? [{ type: "compaction", sessionId, phase: "finish" }, { type: "compacted", sessionId }] : []
    }
    case "session.idle": {
      if (str(props["sessionID"]) === sessionId) state.idle = true
      return []
    }
    default:
      return []
  }
}

/**
 * Maps one host event to the application's events. A `code_mode` program's inner calls are interleaved with its own part:
 * after its start and before its result, so the transcript and the editor see them in the order they ran.
 */
export const mapHostEvent = (sessionId: string, event: HostEvent, state: EventMapperState): ReadonlyArray<AiEvent> => {
  const events = mapHostEventParts(sessionId, event, state)
  const part = event.type === "message.part.updated" ? rec(event.properties["part"]) : undefined
  if (part === undefined || str(part["type"]) !== "tool") return events
  const callId = str(part["callID"]) ?? str(part["id"]) ?? ""
  const tool = str(part["tool"]) ?? ""
  const status = str(rec(part["state"])?.["status"])
  if (tool !== "code_mode") {
    // A direct call recorded under its own id: nothing will drain it.
    if (status === "completed" || status === "error") forgetProgramCalls(callId)
    return events
  }
  if (callId === "" || (status !== "running" && status !== "completed" && status !== "error")) return events
  const inner = programCallEvents(sessionId, callId, state)
  if (inner.length === 0) return events
  const result = events.findIndex((e) => e.type === "tool_result" && e.callId === callId)
  return result === -1 ? [...events, ...inner] : [...events.slice(0, result), ...inner, ...events.slice(result)]
}
