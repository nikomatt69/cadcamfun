/** Events of `POST /api/ai/chat/stream` (packages/ai `events.ts`); unknown types are kept so newer desktops do not break older phones. */
export type ChatEvent =
  | { type: "delta"; sessionId: string; text: string }
  | { type: "tool_call"; sessionId: string; callId: string; tool: string; input: unknown }
  | { type: "tool_result"; sessionId: string; callId: string; tool: string; ok: boolean; output: string }
  | { type: "permission_request"; sessionId: string; requestId: string; permission: string; patterns: string[] }
  | { type: "done"; sessionId: string; text: string }
  | { type: "error"; sessionId: string; code: string; message: string }
  | { type: string; [key: string]: unknown }

/** Incremental Server-Sent-Events parser: feed chunks, get complete `data:` payloads decoded as JSON. */
export const sseParser = (): ((chunk: string) => ChatEvent[]) => {
  let buffer = ""
  return (chunk) => {
    buffer += chunk.replaceAll("\r\n", "\n")
    const events: ChatEvent[] = []
    let end: number
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end)
      buffer = buffer.slice(end + 2)
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n")
      if (!data) continue
      try {
        events.push(JSON.parse(data) as ChatEvent)
      } catch {
        // A malformed frame is skipped rather than ending the conversation.
      }
    }
    return events
  }
}
