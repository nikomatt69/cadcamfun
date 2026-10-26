import type { TranscriptItem } from "./transcript-rows"

/**
 * What the assistant screen says about the state of the conversation, kept pure so the wording and the
 * conditions can be tested without rendering the screen.
 */

export type StreamLink = "idle" | "connecting" | "live" | "reconnecting"

/** The text of the status pill above the composer while the desktop runs a turn. */
export function statusLabel(input: { stopping: boolean; link: StreamLink; activity: string }): string {
  if (input.stopping) return "Stopping the desktop turn…"
  if (input.link === "reconnecting") return "Reconnecting to the desktop… the turn keeps running there"
  if (input.link === "connecting") return "Connecting to the desktop…"
  return `${input.activity} · send to steer`
}

export interface LinkNotice {
  readonly tone: "offline" | "reconnecting"
  readonly text: string
}

/**
 * The quiet strip under the header when the conversation is not live. Offline wins: it changes what a
 * message sent now means. Reconnecting stays silent while a turn runs, because the status pill says it.
 */
export function linkNotice(input: { online: boolean; link: StreamLink; busy: boolean }): LinkNotice | null {
  if (!input.online) return { tone: "offline", text: "Desktop offline · messages wait on this iPhone and send when it reconnects" }
  if (input.link === "reconnecting" && !input.busy) return { tone: "reconnecting", text: "Reconnecting to the conversation…" }
  return null
}

/**
 * The first read of a conversation is in flight and nothing can be shown yet: a stored conversation
 * being opened from the list, or a followed session whose journal is still being read. Showing the
 * empty hero there would say "nothing happened here" about a conversation that has a past.
 */
export function isHydrating(input: { opening: boolean; followed: boolean; transcriptEmpty: boolean; link: StreamLink; syncing: boolean }): boolean {
  if (!input.transcriptEmpty) return false
  if (input.opening) return true
  return input.followed && (input.syncing || input.link === "connecting")
}

/**
 * A prompt that follows something other than another prompt (an answer, a tool run, a notice) begins a new turn;
 * the bubble gives it a little more air above. `previous` is the item just before it in time.
 */
export function startsTurn(item: TranscriptItem, previous: TranscriptItem | undefined): boolean {
  if (!previous || item.kind !== "row" || item.row.kind !== "user") return false
  return !(previous.kind === "row" && previous.row.kind === "user")
}

/** What VoiceOver hears when a turn ends; iOS does not announce a pill that merely disappears. */
export function turnEndAnnouncement(outcome: "done" | "error"): string {
  return outcome === "done" ? "The assistant finished" : "The assistant stopped with an error"
}
