/// <reference path="./sdk-next.d.ts" />
import type { HostEvent } from "@nikcli-ai/sdk-next"
import type { AiEvent } from "../events.ts"
import { childAgent } from "./agents.ts"

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
  /** Texts this stream sent itself (the prompt, a re-sent prompt): a user message with one of them is not news. */
  readonly ownTexts: Set<string>
  /** User messages already reported as `user_message`. */
  readonly reportedUser: Set<string>
}

export const newMapperState = (): EventMapperState => ({
  userMessages: new Set(),
  internalMessages: new Set(),
  startedCalls: new Set(),
  finishedCalls: new Set(),
  progress: new Map(),
  plans: new Map(),
  step: 0,
  idle: false,
  retry: undefined,
  sessionError: undefined,
  todos: [],
  toolCalls: 0,
  lastToolError: undefined,
  ownTexts: new Set(),
  reportedUser: new Set()
})

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)
const rec = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined

const STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const
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
  if (!output.startsWith("{")) return undefined
  try {
    const value = JSON.parse(output) as { ok?: unknown; error?: unknown; problems?: unknown }
    if (value.ok !== false) return undefined
    // `ok:false` with findings (a design check, a simulation) is a result about the model, not a refused call.
    return typeof value.error === "string" ? value.error : Array.isArray(value.problems) && value.problems.length > 0 ? value.problems.map(String).join("; ") : undefined
  } catch { return undefined }
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
  if ((status === "completed" || status === "error") && !state.finishedCalls.has(callId)) {
    state.finishedCalls.add(callId)
    const output = (status === "completed" ? str(toolState?.["output"]) : str(toolState?.["error"])) ?? ""
    state.lastToolError = toolFailure(status, output)
    out.push({ type: "tool_result", sessionId, agent, callId, tool, ok: status === "completed", output })
  }
  return out
}

export const mapHostEvent = (sessionId: string, event: HostEvent, state: EventMapperState): ReadonlyArray<AiEvent> => {
  const props = event.properties
  switch (event.type) {
    case "message.updated": {
      const info = rec(props["info"])
      if (info && str(info["sessionID"]) === sessionId && info["role"] === "user") {
        const id = str(info["id"])
        if (id) state.userMessages.add(id)
      }
      if (info && str(info["sessionID"]) === sessionId && (info["summary"] === true || info["agent"] === "compaction")) {
        const id = str(info["id"])
        if (id) state.internalMessages.add(id)
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
        state.step += 1
        return [{ type: "step", sessionId, phase: "start", index: state.step }]
      }
      if (type === "step-finish") {
        const tokens = rec(part["tokens"])
        const input = typeof tokens?.["input"] === "number" ? tokens["input"] : 0
        const output = typeof tokens?.["output"] === "number" ? tokens["output"] : 0
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
          const finalOutput = (status === "completed" ? str(toolState?.["output"]) : str(toolState?.["error"])) ?? ""
          state.lastToolError = toolFailure(status, finalOutput)
          out.push({ type: "tool_result", sessionId, callId, tool, ok: status === "completed", output: finalOutput })
          return out
        }
      }
      return []
    }
    case "permission.asked": {
      if (str(props["sessionID"]) !== sessionId) return []
      const patterns = Array.isArray(props["patterns"]) ? props["patterns"].filter((p): p is string => typeof p === "string") : []
      return [
        {
          type: "permission_request",
          sessionId,
          requestId: str(props["id"]) ?? "",
          permission: str(props["permission"]) ?? "unknown",
          patterns
        }
      ]
    }
    case "session.status": {
      if (str(props["sessionID"]) !== sessionId) return []
      const status = rec(props["status"])
      if (status?.["type"] === "retry") {
        const attempt = Number(status["attempt"] ?? 0)
        const message = str(status["message"]) ?? "The model request failed."
        const fresh = state.retry?.attempt !== attempt
        state.retry = { attempt, message }
        if (fresh) return [{ type: "retry", sessionId, attempt, message }]
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
      return str(props["sessionID"]) === sessionId ? [{ type: "compacted", sessionId }] : []
    }
    case "session.idle": {
      if (str(props["sessionID"]) === sessionId) state.idle = true
      return []
    }
    default:
      return []
  }
}
