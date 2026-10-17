/** Shared geometry for phone, landscape and tablet layouts, independent of native rendering. */
export const layout = {
  gutter: 20,
  gap: 16,
  cardRadius: 22,
  controlRadius: 16,
  contentWidth: 760,
  touchTarget: 44,
} as const

export function contentGutter(width: number): number {
  return Math.max(width < 375 ? 16 : layout.gutter, (width - layout.contentWidth) / 2)
}

export function previewHeight(height: number, fontScale: number, kind: "mesh" | "toolpath"): number {
  const ratio = kind === "mesh" ? 0.36 : 0.3
  return Math.max(140, Math.min(kind === "mesh" ? 360 : 300, height * ratio / Math.max(1, fontScale * 0.8)))
}
