/**
 * Finding something in a long conversation.
 *
 * The answer the user is looking for is usually in the text of a message they
 * have already scrolled past. The search is deliberately simple and local: the
 * conversation is already on screen, so there is nothing to ask the host.
 */
import type { AiMessage } from "./types.ts"

/** The text of a message, as the user sees it. */
export const messageText = (message: AiMessage): string => message.text

/**
 * True when the message carries the query. The comparison ignores case and the
 * spaces around the words, so "wall thickness" finds "Wall  Thickness".
 */
export const matchesQuery = (message: AiMessage, query: string): boolean => {
  const needle = query.trim().toLowerCase()
  if (needle === "") return true
  return messageText(message).toLowerCase().includes(needle)
}

/**
 * The messages that carry the query, in the order they were said. An empty
 * query keeps everything.
 */
export const filterMessages = (messages: ReadonlyArray<AiMessage>, query: string): ReadonlyArray<AiMessage> => {
  if (query.trim() === "") return messages
  return messages.filter((message) => matchesQuery(message, query))
}

/**
 * Where the matches are in the conversation: the index of every message that
 * carries the query. The transcript uses it to say how many there are.
 */
export const matchCount = (messages: ReadonlyArray<AiMessage>, query: string): number =>
  filterMessages(messages, query).length
