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
    info: "#006E9C",
    userBubble: "#0060DB",
    assistantBubble: "#FFFFFF",
    focusRing: "#0A84FF",
    overlay: "#000000",
  },
  dark: {
    background: "#0B1018",
    surface: "#151E2B",
    panel: "#202D3E",
    border: "#38485E",
    ink: "#FFFFFF",
    soft: "#C5CFDE",
    muted: "#94A5BC",
    accent: "#4C9EFF",
    accentStrong: "#6FB4FF",
    accentSoft: "#0A84FF",
    onAccent: "#08172A",
    success: "#30D158",
    danger: "#FF6961",
    warning: "#FFB340",
    info: "#64D2FF",
    userBubble: "#0A67E6",
    assistantBubble: "#1B2635",
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

