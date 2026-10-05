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
  readonly startedCalls: Set<string>
  readonly finishedCalls: Set<string>
  idle: boolean
  /** Last `session.status: retry` seen (the host retries provider failures with backoff). */
  retry: { attempt: number; message: string } | undefined
  /** Message of a `session.error` for this session. */
  sessionError: string | undefined
}

export const newMapperState = (): EventMapperState => ({
  userMessages: new Set(),
  startedCalls: new Set(),
  finishedCalls: new Set(),
  idle: false,
  retry: undefined,
  sessionError: undefined
})

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)
const rec = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined

export const mapHostEvent = (sessionId: string, event: HostEvent, state: EventMapperState): ReadonlyArray<AiEvent> => {
  const props = event.properties
  switch (event.type) {
    case "message.updated": {
      const info = rec(props["info"])
      if (info && str(info["sessionID"]) === sessionId && info["role"] === "user") {
        const id = str(info["id"])
        if (id) state.userMessages.add(id)
      }
      return []
    }
    case "message.part.updated": {
      const part = rec(props["part"])
      if (!part || str(part["sessionID"]) !== sessionId) return []
      const type = str(part["type"])
      if (type === "text") {
        const messageId = str(part["messageID"])
        const delta = str(props["delta"])
        if (!delta || (messageId && state.userMessages.has(messageId))) return []
        return [{ type: "delta", sessionId, text: delta }]
      }
      if (type === "tool") {
        const callId = str(part["callID"]) ?? str(part["id"]) ?? ""
        const tool = str(part["tool"]) ?? ""
        const toolState = rec(part["state"])
        const status = str(toolState?.["status"])
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
        state.retry = { attempt: Number(status["attempt"] ?? 0), message: str(status["message"]) ?? "The model request failed." }
      }
      return []
    }
    case "session.error": {
      if (str(props["sessionID"]) !== sessionId) return []
      const error = rec(props["error"])
      state.sessionError = str(rec(error?.["data"])?.["message"]) ?? str(error?.["name"]) ?? "The session failed."
      return []
    }
    case "session.idle": {
      if (str(props["sessionID"]) === sessionId) state.idle = true
      return []
    }
    default:
      return []
  }
}
