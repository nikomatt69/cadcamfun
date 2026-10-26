import { hexToRgba, type Palette } from "./palette"

/**
 * The one tone vocabulary of the app: status chips, banners, icon tiles and meters all pick a tone and
 * ask this module for colors, so "success" is the same green in a pill, an icon badge and a toast.
 * Pure (no React Native imports) so the contrast guarantees can be unit-tested.
 */

export type Tone = "neutral" | "accent" | "success" | "warning" | "info" | "danger"

export const TONES: readonly Tone[] = ["neutral", "accent", "success", "warning", "info", "danger"]

/** Fill of a tinted status chip. Matches the assistant's InfoChip so a Pill and an InfoChip are one object. */
export const TONE_FILL_ALPHA = 0.14
/** Fill of the neutral chip: a barely-there ink wash, the same step the chat uses for resting controls. */
export const NEUTRAL_FILL_ALPHA = 0.06
/** Banner/card wash for a tone (error banners, tinted cards). Lighter than a chip: it carries a paragraph. */
export const TONE_WASH_ALPHA = 0.08
export const TONE_WASH_BORDER_ALPHA = 0.22

/** The tone's solid color. Neutral is the secondary text color. */
export function toneColor(palette: Palette, tone: Tone): string {
  switch (tone) {
    case "accent": return palette.accent
    case "success": return palette.success
    case "warning": return palette.warning
    case "info": return palette.info
    case "danger": return palette.danger
    default: return palette.soft
  }
}

/**
 * The tone's color for text on a tint of itself. Identical to `toneColor` except for the brand accent,
 * whose resting blue is 4.25:1 on its own 14% wash in light mode; `accentStrong` clears 4.5:1 in both themes.
 */
export function toneText(palette: Palette, tone: Tone): string {
  return tone === "accent" ? palette.accentStrong : toneColor(palette, tone)
}

export interface ToneChip {
  /** Text/icon color. */
  readonly color: string
  /** Translucent fill. */
  readonly background: string
  /** Hairline edge, for chips that need to read on a same-colored surface. */
  readonly border: string
}

/** Colors of a status chip in a tone. */
export function toneChip(palette: Palette, tone: Tone): ToneChip {
  const base = toneColor(palette, tone)
  return {
    color: toneText(palette, tone),
    background: tone === "neutral" ? hexToRgba(palette.ink, NEUTRAL_FILL_ALPHA) : hexToRgba(base, TONE_FILL_ALPHA),
    border: tone === "neutral" ? hexToRgba(palette.ink, 0.1) : hexToRgba(base, 0.28),
  }
}

/** The opaque fill a chip produces over `surface` - what the eye (and a contrast check) actually sees. */
export function toneChipFill(palette: Palette, tone: Tone): { base: string; alpha: number } {
  return tone === "neutral" ? { base: palette.ink, alpha: NEUTRAL_FILL_ALPHA } : { base: toneColor(palette, tone), alpha: TONE_FILL_ALPHA }
}

export interface ToneWash {
  readonly accent: string
  readonly background: string
  readonly border: string
}

/** Colors of a banner or tinted card in a tone (the error banner, an info strip). */
export function toneWash(palette: Palette, tone: Tone): ToneWash {
  const accent = toneColor(palette, tone === "neutral" ? "info" : tone)
  return { accent, background: hexToRgba(accent, TONE_WASH_ALPHA), border: hexToRgba(accent, TONE_WASH_BORDER_ALPHA) }
}
