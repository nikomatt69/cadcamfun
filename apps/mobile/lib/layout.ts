/**
 * Shared geometry for phone, landscape and tablet layouts, independent of native rendering.
 *
 * Gutter rule (one number for every screen, sheet, banner, toast and transcript row):
 *   - `layout.gutter` is the iOS compact-width layout margin, 16pt. Content never sits closer to the
 *     screen edge than that, and nothing in the app uses a different phone margin (no 20pt variants).
 *   - Inside a scroll owner, read the gutter from `useContentLayout().gutter` (= `contentGutter`) so
 *     it follows the presented container. It is 16pt on every phone width and grows only when the
 *     container is wider than `contentWidth`, which centres the reading column instead of stretching it.
 *   - Code that cannot measure (static sheet bodies) uses `layout.gutter` directly; on a phone the two
 *     are always equal, so mixing them can never misalign a header and its content.
 *   - Landscape/notch insets are added on top of the gutter by the screen that owns the safe area.
 */
export const layout = {
  gutter: 16,
  gap: 16,
  cardRadius: 22,
  controlRadius: 16,
  contentWidth: 760,
  touchTarget: 44,
  /** Visible height of a chip; its hit area is `touchTarget`. */
  chipHeight: 36,
  /** Resting height of a list row with a subtitle; `rowMinHeightDense` is the single-line row. */
  rowMinHeight: 64,
  rowMinHeightDense: 48,
  /** Default control heights: regular buttons and text fields share one height so a form row lines up. */
  controlHeight: 52,
} as const

export function contentGutter(width: number): number {
  return Math.max(layout.gutter, (width - layout.contentWidth) / 2)
}

export function previewHeight(height: number, fontScale: number, kind: "mesh" | "toolpath"): number {
  const ratio = kind === "mesh" ? 0.36 : 0.3
  return Math.max(140, Math.min(kind === "mesh" ? 360 : 300, height * ratio / Math.max(1, fontScale * 0.8)))
}
