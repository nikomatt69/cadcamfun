/** Semantic colors shared by native controls, content and accessibility checks. */
export const STATUS_FILL_ALPHA = 0.06

/** `#RRGGBB` + alpha -> `rgba(r, g, b, a)`. Theme tints are all derived this way, so every color
 * stays inside the active palette instead of carrying its own private hex. Re-exported by `lib/theme`. */
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!match) return hex
  const r = parseInt(match[1] ?? "0", 16)
  const g = parseInt(match[2] ?? "0", 16)
  const b = parseInt(match[3] ?? "0", 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const channelsOf = (hex: string): [number, number, number] => {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return [parseInt(match?.[1] ?? "0", 16), parseInt(match?.[2] ?? "0", 16), parseInt(match?.[3] ?? "0", 16)]
}

/** WCAG 2.x relative luminance of a `#RRGGBB` color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channelsOf(hex).map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}

/** WCAG contrast ratio between two opaque `#RRGGBB` colors (1 to 21). */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** The opaque color a translucent `foreground` produces over `background` - what a tint really looks like. */
export function blendOver(foreground: string, background: string, alpha: number): string {
  const f = channelsOf(foreground)
  const b = channelsOf(background)
  return "#" + [0, 1, 2].map((index) => Math.round((f[index] ?? 0) * alpha + (b[index] ?? 0) * (1 - alpha)).toString(16).padStart(2, "0")).join("").toUpperCase()
}

export type ColorScheme = "light" | "dark"

export interface Palette {
  background: string
  surface: string
  /** One step above `surface`: secondary buttons, toasts and cards that sit on a card. Equals `surface` in light. */
  surfaceRaised: string
  panel: string
  border: string
  ink: string
  soft: string
  muted: string
  accent: string
  accentStrong: string
  accentSoft: string
  onAccent: string
  success: string
  danger: string
  warning: string
  info: string
  userBubble: string
  assistantBubble: string
  focusRing: string
  overlay: string
  /** Shadow color; shadows are this at an alpha, never a private rgba. */
  shadow: string
}

export interface GlassTokens {
  shell: string
  shellStrong: string
  panel: string
  border: string
  scrim: string
}

export const PALETTES: Record<ColorScheme, Palette> = {
  light: {
    background: "#F4F5F8",
    surface: "#FFFFFF",
    surfaceRaised: "#FFFFFF",
    panel: "#E9EDF3",
    border: "#D3D9E3",
    ink: "#172133",
    soft: "#475569",
    muted: "#566579",
    accent: "#0060DB",
    accentStrong: "#0050C8",
    accentSoft: "#5AC8FA",
    onAccent: "#FFFFFF",
    success: "#14704A",
    danger: "#B9261F",
    warning: "#935100",
    info: "#00668F",
    userBubble: "#0060DB",
    assistantBubble: "#FFFFFF",
    focusRing: "#0A84FF",
    overlay: "#000000",
    shadow: "#000000",
  },
  dark: {
    background: "#000000",
    surface: "#1C1C1E",
    surfaceRaised: "#2C2C2E",
    panel: "#2C2C2E",
    border: "#38383A",
    ink: "#FFFFFF",
    soft: "#D1D1D6",
    muted: "#A1A1A8",
    accent: "#4C9EFF",
    accentStrong: "#6FB4FF",
    accentSoft: "#0A84FF",
    onAccent: "#000000",
    success: "#30D158",
    danger: "#FF6961",
    warning: "#FFB340",
    info: "#64D2FF",
    userBubble: "#2C2C2E",
    assistantBubble: "#1C1C1E",
    focusRing: "#0A84FF",
    overlay: "#000000",
    shadow: "#000000",
  },
}

export const GLASS: Record<ColorScheme, GlassTokens> = {
  light: {
    shell: "rgba(255, 255, 255, 0.72)",
    shellStrong: "rgba(255, 255, 255, 0.85)",
    panel: "rgba(242, 242, 247, 0.68)",
    border: "rgba(0, 0, 0, 0.1)",
    scrim: "rgba(0, 0, 0, 0.025)",
  },
  dark: {
    shell: "rgba(28, 28, 30, 0.72)",
    shellStrong: "rgba(28, 28, 30, 0.85)",
    panel: "rgba(44, 44, 46, 0.68)",
    border: "rgba(255, 255, 255, 0.1)",
    scrim: "rgba(0, 0, 0, 0.18)",
  },
}

