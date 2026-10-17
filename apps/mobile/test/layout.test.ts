import { describe, expect, test } from "bun:test"
import { contentGutter, layout, previewHeight } from "../lib/layout"
import { PALETTES, STATUS_FILL_ALPHA } from "../lib/palette"

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
}
function contrast(first: string, second: string): number {
  const a = luminance(first), b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
function tint(foreground: string, background: string): string {
  return "#" + [1, 3, 5].map((offset) => {
    const foregroundChannel = parseInt(foreground.slice(offset, offset + 2), 16)
    const backgroundChannel = parseInt(background.slice(offset, offset + 2), 16)
    return Math.round(foregroundChannel * STATUS_FILL_ALPHA + backgroundChannel * (1 - STATUS_FILL_ALPHA)).toString(16).padStart(2, "0")
  }).join("")
}

describe("mobile reading geometry", () => {
  test("preserves usable gutters on compact phones and limits wide reading surfaces", () => {
    for (const width of [320, 360, 375, 390, 430, 768, 1024, 1366]) {
      const gutter = contentGutter(width)
      expect(gutter).toBeGreaterThanOrEqual(16)
      expect(width - gutter * 2).toBeGreaterThanOrEqual(288)
      expect(width - gutter * 2).toBeLessThanOrEqual(layout.contentWidth)
    }
  })
  test("preview leaves space for controls and lists on short screens and larger text", () => {
    for (const kind of ["mesh", "toolpath"] as const) {
      for (const height of [568, 667, 844, 932, 1366]) {
        for (const fontScale of [1, 1.3, 2, 3]) {
          const size = previewHeight(height, fontScale, kind)
          expect(size).toBeGreaterThanOrEqual(140)
          expect(size).toBeLessThanOrEqual(kind === "mesh" ? 360 : 300)
          expect(size).toBeLessThan(height / 2)
          expect(size).toBeLessThanOrEqual(previewHeight(height, 1, kind))
        }
      }
    }
  })
})

describe("text contrast", () => {
  for (const mode of ["light", "dark"] as const) {
    const palette = PALETTES[mode]
    test(`${mode}: primary actions have legible labels`, () => {
      expect(contrast(palette.onAccent, palette.accent)).toBeGreaterThanOrEqual(4.5)
    })
    test(`${mode}: body, metadata and status text remain readable on content surfaces`, () => {
      for (const surface of [palette.background, palette.surface]) {
        for (const text of [palette.ink, palette.soft, palette.muted, palette.accent, palette.danger, palette.warning, palette.success]) {
          expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5)
        }
      }
    })
    test(`${mode}: status chips retain text contrast after their tint is composited`, () => {
      for (const color of [palette.accent, palette.success, palette.danger, palette.warning, palette.info, palette.soft]) {
        expect(contrast(color, tint(color, palette.surface))).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})
