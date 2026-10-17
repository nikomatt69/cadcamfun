import type { ChatEvent } from "./sse"

/**
 * The rendered transcript, folded from raw stream frames.
 *
 * Consecutive `delta` frames fold into one assistant bubble — one answer is one bubble, not one
 * per token chunk. Tool calls surface as muted rows so the user can watch the assistant work
 * (vcs_start_change, cad_*, cam_*…), and permission requests arrive as a `request` row the
 * composer can answer inline.
 */
export type PlanItem = { readonly content: string; readonly status: "pending" | "in_progress" | "completed" | "cancelled" }

export type ChatRow =
  /** `queued`: sent while the desktop was busy and not yet taken into the conversation. */
  | { kind: "user"; text: string; queued?: boolean }
  | { kind: "assistant"; text: string; sessionId: string }
  | { kind: "tool"; tool: string; rawTool?: string; ok: boolean | null; callId: string; input?: unknown; output?: string; agent?: string; diagnostic?: { message: string; severity: string; recovery?: string } }
  | { kind: "question"; sessionId: string; requestId: string; questions: Extract<ChatEvent, { type: "question_request" }>["questions"]; answered: boolean }
  | { kind: "request"; sessionId: string; requestId: string; permission: string; patterns: readonly string[]; answered: boolean }
  | { kind: "error"; message: string }
  /** The agent's plan (todo list); one row per session, updated in place. */
  | { kind: "plan"; sessionId: string; items: readonly PlanItem[] }
  /** Host notices that are not part of the answer: provider retries, compaction, blocked permissions. */
  | { kind: "notice"; tone: "info" | "warning"; text: string; retry?: boolean }

/** The one non-server frame: the user's own message, appended before the stream starts. */
export interface UserEvent {
  type: "user"
  text: string
  queued?: boolean
}

export type LogEvent = ChatEvent | UserEvent

export const emptyLog: readonly ChatRow[] = []

const toolLabel = (tool: string): string =>
  tool
    .replace(/^vcs_/, "")
    .replace(/^cad_/, "")
    .replace(/^cam_/, "")
    .replaceAll("_", " ")

export const appendChatEvent = (log: readonly ChatRow[], event: LogEvent): readonly ChatRow[] => {
  switch (event.type) {
    case "user": {
      // The ChatEvent union has an index-signature fallback, so an unmatched literal narrows to it
      // ("user" → unknown). The explicit cast recovers the UserEvent shape.
      const user = event as UserEvent
      return [...log, { kind: "user" as const, text: user.text, ...(user.queued ? { queued: true } : {}) }]
    }

    case "user_message": {
      // The desktop took a queued/steered message into the conversation; one typed on the desktop appears here too.
      const text = String((event as { text?: unknown }).text ?? "").trim()
      if (!text) return log
      const queued = log.findIndex((row) => row.kind === "user" && row.queued === true && row.text.trim() === text)
      if (queued >= 0) return log.map((row, index) => index === queued && row.kind === "user" ? { kind: "user", text: row.text } : row)
      const latest = log.findLast((row) => row.kind === "user")
      return latest?.kind === "user" && latest.text.trim() === text ? log : [...log, { kind: "user", text }]
    }

    case "todo": {
      const todo = event as Extract<ChatEvent, { type: "todo" }>
      const items = (Array.isArray(todo.todos) ? todo.todos : []).map((item) => ({ content: String(item.content), status: item.status }))
      const index = log.findIndex((row) => row.kind === "plan" && row.sessionId === todo.sessionId)
      if (index < 0) return items.length ? [...log, { kind: "plan", sessionId: todo.sessionId, items }] : log
      return items.length ? log.map((row, at) => at === index ? { kind: "plan", sessionId: todo.sessionId, items } : row) : log.filter((_, at) => at !== index)
    }

    case "retry": {
      const retry = event as Extract<ChatEvent, { type: "retry" }>
      const row: ChatRow = { kind: "notice", tone: "warning", retry: true, text: `Provider retry ${retry.attempt}${retry.message ? ` — ${retry.message}` : ""}` }
      const last = log[log.length - 1]
      return last?.kind === "notice" && last.retry ? [...log.slice(0, -1), row] : [...log, row]
    }

    case "compacted":
      return [...log, { kind: "notice", tone: "info", text: "Older messages were summarised to fit the model's context" }]

    case "permission_blocked": {
      const blocked = event as Extract<ChatEvent, { type: "permission_blocked" }>
      return [...log, { kind: "notice", tone: "warning", text: `${blocked.permission} was blocked: ${blocked.reason}` }]
    }

    case "delta": {
      const delta = event as Extract<ChatEvent, { type: "delta" }>
      const last = log[log.length - 1]
      if (last?.kind === "assistant" && last.sessionId === delta.sessionId) {
        return [...log.slice(0, -1), { kind: "assistant", text: last.text + delta.text, sessionId: delta.sessionId }]
      }
      return [...log, { kind: "assistant", text: delta.text, sessionId: delta.sessionId }]
    }

    case "tool_call": {
      const call = event as Extract<ChatEvent, { type: "tool_call" }>
      if (log.some((row) => row.kind === "tool" && row.callId === call.callId)) return log
      return [...log, { kind: "tool" as const, tool: toolLabel(call.tool), rawTool: call.tool, ok: null, callId: call.callId, input: call.input, ...(call.agent ? { agent: call.agent } : {}) }]
    }

    case "tool_result": {
      const result = event as Extract<ChatEvent, { type: "tool_result" }>
      const index = log.findIndex((row) => row.kind === "tool" && row.callId === result.callId)
      if (index < 0) return [...log, { kind: "tool" as const, tool: toolLabel(result.tool), rawTool: result.tool, ok: result.ok, callId: result.callId, output: result.output, ...(result.agent ? { agent: result.agent } : {}) }]
      const row = log[index]
      if (row?.kind !== "tool") return log
      return [...log.slice(0, index), { ...row, ok: result.ok, output: result.output }, ...log.slice(index + 1)]
    }

    case "permission_request": {
      const request = event as Extract<ChatEvent, { type: "permission_request" }>
      if (log.some((row) => row.kind === "request" && row.requestId === request.requestId)) return log
      return [
        ...log,
        {
          kind: "request" as const,
          sessionId: request.sessionId,
          requestId: request.requestId,
          permission: request.permission,
          patterns: request.patterns,
          answered: false,
        },
      ]
    }

    case "question_request": {
      const question = event as Extract<ChatEvent, { type: "question_request" }>
      if (log.some((row) => row.kind === "question" && row.requestId === question.requestId)) return log
      return [...log, { kind: "question", sessionId: question.sessionId, requestId: question.requestId, questions: question.questions, answered: false }]
    }
    case "question_resolved": {
      const resolved = event as Extract<ChatEvent, { type: "question_resolved" }>
      return log.map((row) => row.kind === "question" && row.requestId === resolved.requestId ? { ...row, answered: true } : row)
    }
    case "permission_resolved": {
      const resolved = event as Extract<ChatEvent, { type: "permission_resolved" }>
      return answerRequest(log, resolved.requestId, resolved.reply !== "reject")
    }
    case "tool_diagnostic": {
      const diagnostic = event as Extract<ChatEvent, { type: "tool_diagnostic" }>
      return log.map((row) => row.kind === "tool" && row.callId === diagnostic.callId ? { ...row, diagnostic: { message: diagnostic.message, severity: diagnostic.severity, ...(diagnostic.recovery ? { recovery: diagnostic.recovery } : {}) } } : row)
    }
    case "done": {
      const done = event as Extract<ChatEvent, { type: "done" }>
      // Retry notices describe a wait that is over once the turn finishes.
      const settled = log.filter((row) => row.kind !== "notice" || !row.retry).map((row) => (row.kind === "request" || row.kind === "question") && row.sessionId === done.sessionId ? { ...row, answered: true } : row)
      if (!done.text) return settled
      let start = settled.length
      while (start > 0 && settled[start - 1]?.kind !== "user") start--
      const current = settled.slice(start).filter((row) => row.kind !== "error")
      const streamed = current.flatMap((row) => row.kind === "assistant" && row.sessionId === done.sessionId ? [row.text] : []).join("")
      if (streamed === done.text) return [...settled.slice(0, start), ...current]
      return [...settled.slice(0, start), ...current.filter((row) => row.kind !== "assistant" || row.sessionId !== done.sessionId), { kind: "assistant", sessionId: done.sessionId, text: done.text }]
    }

    case "error": {
      const failure = event as Extract<ChatEvent, { type: "error" }>
      return [...log.filter((row) => row.kind !== "notice" || !row.retry), { kind: "error" as const, message: failure.message }]
    }

    default:
      return log
  }
}

/** Marks a permission request as answered so the button row collapses. */
export const answerRequest = (log: readonly ChatRow[], requestId: string, accepted: boolean): readonly ChatRow[] =>
  log.map((row) => (row.kind === "request" && row.requestId === requestId ? { ...row, answered: true } : row))

/** The last prompt the user sent, for "edit and resend". Never resent automatically. */
export const lastUserPrompt = (log: readonly ChatRow[]): string | undefined => {
  const row = log.findLast((item) => item.kind === "user")
  return row?.kind === "user" ? row.text : undefined
}

/** Plain text of the conversation for copy/share: prompts and answers, no tool noise. */
export const transcriptText = (log: readonly ChatRow[]): string => log
  .flatMap((row) => row.kind === "user" ? [`You: ${row.text}`] : row.kind === "assistant" ? [`Assistant: ${row.text}`] : [])
  .join("\n\n")
