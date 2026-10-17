/** Semantic colors shared by native controls, content and accessibility checks. */
export const STATUS_FILL_ALPHA = 0.06

export type ColorScheme = "light" | "dark"

export interface Palette {
  background: string
  surface: string
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
    panel: "#E9EDF3",
    border: "#DCE1EA",
    ink: "#172133",
    soft: "#475569",
    muted: "#5E6D82",
    accent: "#0066E8",
    accentStrong: "#0055D4",
    accentSoft: "#5AC8FA",
    onAccent: "#FFFFFF",
    success: "#18794E",
    danger: "#C62B24",
    warning: "#A85D00",
    info: "#0077A8",
    userBubble: "#0066E8",
    assistantBubble: "#FFFFFF",
    focusRing: "#0A84FF",
    overlay: "#000000",
  },
  dark: {
    background: "#0B1018",
    surface: "#151E2B",
    panel: "#202D3E",
    border: "#304055",
    ink: "#FFFFFF",
    soft: "#C5CFDE",
    muted: "#94A5BC",
    accent: "#4C9EFF",
    accentStrong: "#6FB4FF",
    accentSoft: "#0A84FF",
    onAccent: "#08172A",
    success: "#30D158",
    danger: "#FF453A",
    warning: "#FFB340",
    info: "#64D2FF",
    userBubble: "#0A84FF",
    assistantBubble: "#1C1C1E",
    focusRing: "#0A84FF",
    overlay: "#000000",
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
    shell: "rgba(21, 30, 43, 0.72)",
    shellStrong: "rgba(21, 30, 43, 0.85)",
    panel: "rgba(32, 45, 62, 0.68)",
    border: "rgba(255, 255, 255, 0.1)",
    scrim: "rgba(0, 0, 0, 0.18)",
  },
}

