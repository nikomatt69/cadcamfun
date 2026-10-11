import type { TextStyle } from "react-native"

/**
 * Type that changes shape with size (Apple §15 — typography).
 *
 * A single letterSpacing applied across a scale is wrong somewhere by construction: as type grows
 * the letters read too far apart and want negative tracking, while small text needs extra air.
 * Leading moves the other way — tight on display sizes, generous on body copy.
 * Both curves are anchored tables interpolated linearly, so any size in between is defined.
 */

type Anchor = readonly [size: number, value: number]

/** Tracking as a fraction of font size: +2% at caption sizes, crossing zero at 15, negative above. */
const TRACKING: readonly Anchor[] = [
  [11, 0.02],
  [13, 0.01],
  [15, 0],
  [17, -0.006],
  [20, -0.011],
  [24, -0.015],
  [28, -0.018],
  [34, -0.021],
  [48, -0.024],
]

/** Line height as a multiple of font size — inverse to size. */
const LEADING: readonly Anchor[] = [
  [11, 1.45],
  [13, 1.4],
  [15, 1.35],
  [17, 1.32],
  [20, 1.25],
  [24, 1.2],
  [28, 1.15],
  [34, 1.1],
  [48, 1.05],
]

function interpolate(anchors: readonly Anchor[], size: number): number {
  const first = anchors[0]
  const last = anchors[anchors.length - 1]
  if (!first || !last) return 0
  if (size <= first[0]) return first[1]
  if (size >= last[0]) return last[1]
  for (let index = 1; index < anchors.length; index++) {
    const upper = anchors[index]
    const lower = anchors[index - 1]
    if (!upper || !lower || size > upper[0]) continue
    const span = upper[0] - lower[0]
    const ratio = span === 0 ? 0 : (size - lower[0]) / span
    return lower[1] + (upper[1] - lower[1]) * ratio
  }
  return last[1]
}

const round = (value: number) => Math.round(value * 100) / 100

/** Letter spacing in px for a given font size. Negative above ~15px, positive below. */
export function tracking(fontSize: number): number {
  return round(fontSize * interpolate(TRACKING, fontSize))
}

/** Line height in px for a given font size. */
export function leading(fontSize: number): number {
  return Math.round(fontSize * interpolate(LEADING, fontSize))
}

export type TypeOptions = {
  weight?: TextStyle["fontWeight"]
  /** Multiplies the derived leading — `0.92` for dense rows, `1.1` for long-form reading. */
  leadingScale?: number
  /** Extra tracking on top of the size-derived value. Use for all-caps labels. */
  trackingBoost?: number
}

/**
 * Size-derived text style. Prefer this over hand-picked `letterSpacing` / `lineHeight` pairs
 * so a size change carries its tracking and leading with it.
 */
export function type(fontSize: number, options: TypeOptions = {}): TextStyle {
  const { weight, leadingScale = 1, trackingBoost = 0 } = options
  return {
    fontSize,
    lineHeight: Math.round(leading(fontSize) * leadingScale),
    letterSpacing: round(tracking(fontSize) + trackingBoost),
    ...(weight ? { fontWeight: weight } : null),
  }
}

/**
 * All-caps eyebrow/section labels. Capitals have no ascender/descender variety to separate
 * them, so they need markedly more tracking than the size curve alone gives.
 */
export function caps(fontSize = 11, options: TypeOptions = {}): TextStyle {
  return {
    ...type(fontSize, { weight: "600", ...options, trackingBoost: (options.trackingBoost ?? 0) + 0.8 }),
    textTransform: "uppercase",
  }
}

/** Monospaced code/commit text. Slightly looser leading — code is scanned line by line. */
export function mono(fontSize: number, options: TypeOptions = {}): TextStyle {
  return {
    ...type(fontSize, { leadingScale: 1.08, ...options }),
    fontFamily: "Menlo",
    letterSpacing: 0,
  }
}
