/**
 * The program as the phone's review screen reads it (preview format 4): the operations of a multi-operation
 * program, the contacts on the playback clock and the cutter at the playhead.
 *
 * Pure: the screen owns the state, this module only answers questions about the payload.
 */
import type { PreviewCollisionEvent, PreviewCutter, PreviewOperation } from "@cadcamfun/api"

/** The operation that owns a path segment, or undefined when the payload names none. */
export const operationAt = (operations: readonly PreviewOperation[], segment: number): PreviewOperation | undefined =>
  operations.find((operation) => segment >= operation.startSegment && segment <= operation.endSegment)

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
