/// <reference path="./sdk-next.d.ts" />
import type { HostEvent } from "@nikcli-ai/sdk-next"
import type { AiEvent } from "../events.ts"

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
  sessionError: undefined
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
      if (!part || str(part["sessionID"]) !== sessionId) return []
      const messageId = str(part["messageID"])
      if (messageId && (state.userMessages.has(messageId) || state.internalMessages.has(messageId))) return []
      const type = str(part["type"])
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
          const out: AiEvent[] = [{ type: "todo", sessionId, todos }]
          if (status === "completed" && !state.finishedCalls.has(callId)) { state.finishedCalls.add(callId); state.startedCalls.add(callId) }
          return out
        }
        if (tool === "todowrite" || tool === "todoread") return []
        if (status === "running" && !state.startedCalls.has(callId)) {
          state.startedCalls.add(callId)
          return [{ type: "tool_call", sessionId, callId, tool, input: toolState?.["input"] ?? {} }]
        }
        if ((status === "completed" || status === "error") && !state.finishedCalls.has(callId)) {
          state.finishedCalls.add(callId)
          const out: AiEvent[] = []
          if (!state.startedCalls.has(callId)) {
            state.startedCalls.add(callId)
            out.push({ type: "tool_call", sessionId, callId, tool, input: toolState?.["input"] ?? {} })
          }
          out.push({
            type: "tool_result",
            sessionId,
            callId,
            tool,
            ok: status === "completed",
            output: (status === "completed" ? str(toolState?.["output"]) : str(toolState?.["error"])) ?? ""
          })
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
