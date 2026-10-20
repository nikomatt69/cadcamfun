import type { AiSessionMessage } from "@cadcamfun/api"
import type { AiEvent, AiMessage } from "./types.ts"

/** Stored history is presentation data. Reopening a phone conversation must never replay its mutations. */
export const serverMessages = (messages: ReadonlyArray<AiSessionMessage>, sessionId: string): ReadonlyArray<AiMessage> =>
  messages.map((message) => {
    const events: AiEvent[] = []
    for (const tool of message.tools) {
      events.push({ type: "tool_call", sessionId, callId: tool.callId, tool: tool.tool, input: tool.input ?? {} })
      if (tool.status === "completed" || tool.status === "error") events.push({ type: "tool_result", sessionId,
        callId: tool.callId, tool: tool.tool, ok: tool.status === "completed", output: tool.output })
    }
    return { id: message.id, role: message.role, text: message.text, createdAt: message.createdAt ?? "1970-01-01T00:00:00.000Z",
      status: message.error ? "error" : "done", events, ...(message.error ? { error: message.error } : {}) }
  })
