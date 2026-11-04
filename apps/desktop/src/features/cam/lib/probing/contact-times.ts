/**
 * When each probe contact happens on the playback timeline (spec 73 §4): a simulated contact carries the 1-based NC line of its touch
 * block (spec 73 §1), the motion track knows the source line of every move, and the playback knows when each move ends. The contact
 * happens at the end of the first move of path `path` written on that line.
 */
import { playbackSegments, type Playback } from "../../../../viewport/view3d/playback.ts"
import type { ProbeSimContact } from "./contract.ts"

/** Seconds at which each move (by path and move index) ends. */
export const moveEndTimes = (playback: Playback): ReadonlyMap<string, number> => {
  const out = new Map<string, number>()
  for (const s of playbackSegments(playback)) out.set(`${s.path}:${s.index}`, s.start + s.duration)
  return out
}

/**
 * The playback time of each contact (undefined when it has no line or the line has no move): `lines[i]` is the source line of
 * move `i` of the path (the motion track's `lines`, 1-based as the NC text).
 */
export const contactTimes = (contacts: ReadonlyArray<ProbeSimContact>, lines: ReadonlyArray<number> | undefined, ends: ReadonlyMap<string, number>, path = 0): ReadonlyArray<number | undefined> => {
  if (lines === undefined) return contacts.map(() => undefined)
  const firstMoveOfLine = new Map<number, number>()
  lines.forEach((line, move) => { if (!firstMoveOfLine.has(line)) firstMoveOfLine.set(line, move) })
  return contacts.map((c) => {
    if (c.line === undefined) return undefined
    const move = firstMoveOfLine.get(c.line)
    return move === undefined ? undefined : ends.get(`${path}:${move}`)
  })
}

/**
 * The same times read from the visualizer's own timeline (`cam.viewer.Timeline`): each move knows the NC line that wrote it, so a
 * contact happens at the end of the first move on its touch line.
 */
export const contactTimesOnTimeline = (contacts: ReadonlyArray<ProbeSimContact>, timeline: { readonly moves: ReadonlyArray<{ readonly start: number; readonly duration: number; readonly state: { readonly line?: number | undefined } }> }): ReadonlyArray<number | undefined> => {
  const endOfLine = new Map<number, number>()
  for (const move of timeline.moves) {
    const line = move.state.line
    if (line !== undefined && !endOfLine.has(line)) endOfLine.set(line, move.start + move.duration)
  }
  return contacts.map((contact) => (contact.line === undefined ? undefined : endOfLine.get(contact.line)))
}
