/**
 * The pairing story on the connect screen, written the stageshow way: one thing happens (the phone finds the Mac and
 * its work arrives), in five beats and a payoff that holds, then a reset with a visible cause (the link drops).
 * Times are milliseconds on one looping clock; the component interpolates every layer against the same table, so the
 * beats and the poster cannot drift apart.
 */
export const STORY_MS = 9000

export const BEATS = {
  /** Searching, nothing else on screen yet. */
  searchEnd: 1200,
  /** The status flips to Connected over this span. */
  connected: [1200, 1700],
  /** Each row rises and fades in; they overlap, staggered. */
  rowA: [1900, 2500],
  rowB: [2250, 2850],
  /** The payoff holds untouched until here. */
  hold: 7200,
  /** The link drops: everything folds back together. */
  drop: [7200, 7900],
} as const

const ramp = (t: number, [from, to]: readonly [number, number]): number => Math.min(1, Math.max(0, (t - from) / (to - from)))

export interface StoryFrame { readonly connected: number; readonly rowA: number; readonly rowB: number }

/** Every layer's 0..1 amount at clock time `t` (ms, modulo the loop). */
export function storyAt(time: number): StoryFrame {
  const t = ((time % STORY_MS) + STORY_MS) % STORY_MS
  const keep = 1 - ramp(t, BEATS.drop)
  return {
    connected: ramp(t, BEATS.connected) * keep,
    rowA: ramp(t, BEATS.rowA) * keep,
    rowB: ramp(t, BEATS.rowB) * keep,
  }
}

/** The frame a thumbnail, Reduce Motion or a screenshot shows: the result left on screen, never mid-change. */
export const POSTER: StoryFrame = { connected: 1, rowA: 1, rowB: 1 }
