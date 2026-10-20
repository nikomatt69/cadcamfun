import type { AiSessionMessage, AiSessionTool } from "@cadcamfun/api"
import { toolLabel, type ChatRow } from "./chat-log"

/**
 * The stored conversation, folded into the transcript the phone renders.
 *
 * A live turn arrives as stream frames and is folded by `appendChatEvent`. An *older* turn is read back from
 * the desktop's session history (`GET /api/ai/sessions/:id/messages`), which keeps the answer, the tool calls
 * and their results but not the reasoning. Both paths must produce the same rows, or a reopened conversation
 * would look different from the one the user watched.
 */

/** `pending` and `running` are still in flight; only a settled call has an answer. */
const toolOk = (status: AiSessionTool["status"]): boolean | null => {
  if (status === "completed") return true
  if (status === "error") return false
  return null
}

/** One tool call as the transcript shows it. */
export const toolRow = (tool: AiSessionTool, agent?: string | null): ChatRow => ({
  kind: "tool",
  tool: toolLabel(tool.tool),
  rawTool: tool.tool,
  ok: toolOk(tool.status),
  callId: tool.callId,
  ...(tool.input === undefined ? {} : { input: tool.input }),
  output: tool.output,
  ...(agent ? { agent } : {}),
})

/**
 * One stored message as transcript rows: the tools it ran (they came first, like in a live turn) and then the
 * answer. A message the host could not finish keeps its error as an error row instead of a silent gap.
 */
export const rowsFromMessage = (message: AiSessionMessage, sessionId: string): readonly ChatRow[] => {
  const rows: ChatRow[] = []
  for (const tool of message.tools ?? []) rows.push(toolRow(tool, message.agent))
  if (message.error) {
    rows.push({ kind: "error", message: message.error })
    return rows
  }
  if (message.role === "user") {
    if (message.text) rows.push({ kind: "user", text: message.text })
    return rows
  }
  if (message.text) rows.push({ kind: "assistant", text: message.text, sessionId })
  if (message.truncated) rows.push({ kind: "notice", tone: "info", text: "This message was cut short to fit the desktop's history limit." })
  return rows
}

/** A page of stored messages, oldest first, folded into transcript rows. */
export const rowsFromMessages = (messages: readonly AiSessionMessage[], sessionId: string): readonly ChatRow[] =>
  messages.flatMap((message) => rowsFromMessage(message, sessionId))

/**
 * The newest first line of a conversation: the title the desktop gave it, or the first thing that was said.
 * The list shows one line per conversation, so a long answer must not become the title.
 */
export const sessionTitle = (summary: { readonly title: string; readonly id: string }, firstMessage?: string): string => {
  const title = summary.title.trim()
  if (title) return title
  const first = firstMessage?.trim()
  if (first) return first.length > 60 ? `${first.slice(0, 57)}…` : first
  return "Conversation"
}
