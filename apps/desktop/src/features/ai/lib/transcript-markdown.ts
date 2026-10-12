/**
 * The conversation as markdown, for `/export`.
 *
 * The assistant keeps tool traffic in memory but only text is worth exporting:
 * a reader wants what was asked and what was answered, with the model and the
 * timestamp so a transcript can be filed next to a drawing revision.
 */
import type { AiStore } from "../store/store.ts"

const timestamp = (iso: string): string => {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString()
}

const titleOf = (store: AiStore): string => {
  const session = store.sessions().find((entry) => entry.id === store.sessionId())
  return session?.title ?? "CADCAMFUN assistant"
}

/** The whole conversation as markdown; an empty conversation yields an empty string. */
export const transcriptMarkdown = (store: AiStore): string => {
  const messages = store.messages().filter((message) => message.text.trim() !== "")
  if (messages.length === 0) return ""
  const lines = [`# ${titleOf(store)}`, ""]
  for (const message of messages) {
    const who = message.role === "user" ? "You" : message.role === "assistant" ? "Assistant" : "System"
    lines.push(`## ${who}${message.model ? ` — ${message.model}` : ""}`, `_${timestamp(message.createdAt)}_`, "", message.text.trim(), "")
    if (message.attachments && message.attachments.length > 0) {
      lines.push(`Attachments: ${message.attachments.join(", ")}`, "")
    }
  }
  return lines.join("\n").trimEnd() + "\n"
}