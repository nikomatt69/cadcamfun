/**
 * The program as the phone's review screen reads it (preview format 4): the operations of a multi-operation
 * program, the contacts on the playback clock and the cutter at the playhead.
 *
 * Pure: the screen owns the state, this module only answers questions about the payload.
 */
import type { PreviewCollisionEvent, PreviewCutter, PreviewOperation } from "@cadcamfun/api"
import { startTimeOf } from "./preview-sim"

/** The operation that owns a path segment, or undefined when the payload names none. */
export const operationAt = (operations: readonly PreviewOperation[], segment: number): PreviewOperation | undefined =>
  operations.find((operation) => segment >= operation.startSegment && segment <= operation.endSegment)

/** The viewport accepts hidden operation IDs, while the review selects the one to keep visible. */
export const hiddenOperationsForIsolation = (operations: readonly PreviewOperation[], selected: number | undefined): ReadonlySet<number> | undefined => {
  if (selected === undefined || !operations.some((operation) => operation.index === selected)) return undefined
  return new Set(operations.filter((operation) => operation.index !== selected).map((operation) => operation.index))
}

/** The cutter at the playhead: the tool the running operation uses. */
export const cutterAt = (operations: readonly PreviewOperation[], segment: number): PreviewCutter | undefined =>
  operationAt(operations, segment)?.cutter

/** The segments that carry a contact on the clock. */
export const contactSegments = (events: readonly PreviewCollisionEvent[]): ReadonlySet<number> =>
  new Set(events.map((event) => event.segment))

/**
 * The first contact at or after the playhead: where the playback stops when it must.
 *
 * The contacts are on the desktop's own clock, so they are ordered by the time they happen, not by the segment they
 * sit on: a program that cuts back and forth over the same wall reports the contact once, at its first moment.
 */
export const nextContact = (events: readonly PreviewCollisionEvent[], segment: number): PreviewCollisionEvent | undefined =>
  [...events].sort((a, b) => a.seconds - b.seconds).find((event) => event.segment >= segment)

/** First contact crossed since the previous playback update, including jumps across many segments. */
export const crossedContact = (events: readonly PreviewCollisionEvent[], after: number, through: number): PreviewCollisionEvent | undefined =>
  events.reduce<PreviewCollisionEvent | undefined>((first, event) => {
    if (event.segment <= after || event.segment > through) return first
    if (!first || event.segment < first.segment || (event.segment === first.segment && event.seconds < first.seconds)) return event
    return first
  }, undefined)

/** Read a bounded listing without splitting the entire program or claiming an exact limit was truncated. */
export function readGcodeLines(text: string, limit: number): { lines: string[]; truncated: boolean } {
  if (!text || limit <= 0) return { lines: [], truncated: text.length > 0 }
  const lines: string[] = []
  let start = 0
  while (lines.length < limit) {
    const end = text.indexOf("\n", start)
    if (end < 0) {
      lines.push(text.slice(start))
      return { lines, truncated: false }
    }
    lines.push(text.slice(start, end))
    start = end + 1
  }
  return { lines, truncated: true }
}

/** Unrepresented lines must not seek to the last visible segment of a truncated path. */
export const lineIsSeekable = (line: number, segmentCount: number, lastPreviewLine: number, pathTruncated: boolean): boolean =>
  segmentCount > 0 && line > 0 && (!pathTruncated || line <= lastPreviewLine)

/** Replay only after reaching the end, not just because the selected move happens to be the last. */
export function playbackStart(completed: boolean, clock: number, playhead: number, checkedSegment: number, ends: ArrayLike<number>) {
  return completed
    ? { clock: 0, checkedSegment: -1, playhead: 0 }
    : { clock: Math.max(clock, startTimeOf(ends, playhead)), checkedSegment, playhead }
}

const round = (value: number): string => String(Math.round(value * 100) / 100)

/** What the tool at the playhead is, in words. */
export const describeCutter = (cutter: PreviewCutter | undefined): string | undefined => {
  if (cutter === undefined) return undefined
  const parts = [`Ø${round(cutter.diameter)} mm`, `${round(cutter.fluteLength)} mm flute`]
  if (cutter.noseRadius > 0) parts.push(`${round(cutter.noseRadius)} mm nose`)
  parts.push(`${cutter.holder.kind} holder Ø${round(cutter.holder.diameter)} mm`)
  if (cutter.holder.assumed) parts.push("assumed")
  return parts.join(" · ")
}

/** The contacts of a program, worst first, then in the order they happen. */
export const orderedContacts = (events: readonly PreviewCollisionEvent[]): PreviewCollisionEvent[] =>
  [...events].sort((a, b) => (a.severity === b.severity ? a.seconds - b.seconds : a.severity === "error" ? -1 : 1))

/** Keeps the reviewed program and the selected block in the editable assistant request. */
export const toolpathAssistantPrompt = (toolpath: { readonly id: string; readonly name: string }, line?: number): string =>
  `Help me review toolpath "${toolpath.name}" (${toolpath.id}). ${line && line > 0 ? `Focus on NC line ${line}. ` : ""}Use the stored program and report the limits of any checks. My request: `
