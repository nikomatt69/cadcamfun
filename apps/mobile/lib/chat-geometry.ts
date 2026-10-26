/**
 * Sizes the transcript derives from the window, kept out of the components so they can be tested.
 *
 * A user's bubble is as wide as its words up to 82% of the row (nikcli); at large Dynamic Type sizes it may use the
 * whole row. A picture inside it cannot be "as wide as its words", so it needs a number: the room the bubble has left
 * after its padding, capped so a single photo never takes over the screen.
 */

/** The row's side margin and the bubble's own horizontal padding (see MessageBubble). */
const ROW_GUTTER = 16
const BUBBLE_PADDING = 16

/** Above this the user bubble uses the full row: wide type needs the width more than the capsule shape. */
export const WIDE_TYPE_SCALE = 1.3

/** The widest a user bubble may be, in points. */
export function userBubbleMaxWidth(windowWidth: number, fontScale: number): number {
  const row = Math.max(0, windowWidth - ROW_GUTTER * 2)
  return fontScale <= WIDE_TYPE_SCALE ? Math.round(row * 0.82) : row
}

/** The width of the picture card inside a user bubble. */
export function bubbleImageWidth(windowWidth: number, fontScale: number): number {
  return Math.max(120, Math.min(320, userBubbleMaxWidth(windowWidth, fontScale) - BUBBLE_PADDING * 2))
}

export interface ImageGrid {
  readonly columns: number
  /** Side of one square tile. */
  readonly tile: number
}

/** Several pictures as squares: two per row, as large as the card allows. */
export function imageGrid(count: number, cardWidth: number, gap = 6): ImageGrid {
  const columns = count <= 1 ? 1 : 2
  return { columns, tile: Math.floor((cardWidth - gap * (columns - 1)) / columns) }
}

/** A picture's aspect ratio from its pixel size, kept within what a bubble can show without becoming a sliver or a tower. */
export function clampAspect(width: number, height: number, fallback = 4 / 3): number {
  if (!(width > 0) || !(height > 0)) return fallback
  return Math.min(2.4, Math.max(0.6, width / height))
}
