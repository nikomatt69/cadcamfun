/**
 * How a streamed assistant reply becomes a chat log.
 *
 * A model sends its answer as a long run of `delta` frames. Rendering one bubble per frame turns a
 * single sentence into a screenful of fragments, so consecutive deltas of the same session are folded
 * into the last text bubble instead. Anything that is not a delta — a tool call, a permission request,
 * an error, the next turn — starts a new entry, so the log still reads as a sequence of steps.
 *
 * Pure and free of JSX so the rule can be tested without a component runtime.
 */
import type { ChatEvent } from "../companion/sse.ts"

/** Appends one streamed frame to the log, merging it into the open assistant bubble when it continues one. */
export const appendChatEvent = (log: ReadonlyArray<ChatEvent>, event: ChatEvent): ReadonlyArray<ChatEvent> => {
  const previous = log[log.length - 1]
  const continuing = event.type === "delta" && previous?.type === "delta" && previous.sessionId === event.sessionId
  return continuing
    ? [...log.slice(0, -1), { ...previous, text: `${(previous as { text: string }).text}${(event as { text: string }).text}` }]
    : [...log, event]
}