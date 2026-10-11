import { createContext, useContext, useMemo, type PropsWithChildren } from "react"
import { View, useColorScheme } from "react-native"
import { vars } from "nativewind"
import { useUIStore } from "./store"

/**
 * The CADCAMFUN mobile theme — the iOS system palette, so the app reads as native on every
 * iOS release. Colors adapt to light/dark through CSS variables consumed by NativeWind
 * (`bg-surface`, `text-ink`, `border-border`…), and are also exposed as a typed palette for
 * StyleSheet code and native component props (tab tint, blur layers).
 */

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

const PALETTES: Record<ColorScheme, Palette> = {
  light: {
    background: "#F2F2F7",
    surface: "#FFFFFF",
    panel: "#ECECF1",
    border: "#D7D7DC",
    ink: "#000000",
    soft: "#3A3A3C",
    muted: "#8E8E93",
    accent: "#0A84FF",
    accentStrong: "#0055D4",
    accentSoft: "#5AC8FA",
    onAccent: "#FFFFFF",
    success: "#34C759",
    danger: "#FF3B30",
    warning: "#FF9500",
    info: "#5AC8FA",
    userBubble: "#0A84FF",
    assistantBubble: "#FFFFFF",
    focusRing: "#0A84FF",
    overlay: "#000000",
  },
  dark: {
    background: "#000000",
    surface: "#1C1C1E",
    panel: "#2C2C2E",
    border: "#3A3A3C",
    ink: "#FFFFFF",
    soft: "#C6C6C8",
    muted: "#8E8E93",
    accent: "#0A84FF",
    accentStrong: "#6FB4FF",
    accentSoft: "#0A84FF",
    onAccent: "#FFFFFF",
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

const GLASS: Record<ColorScheme, GlassTokens> = {
  light: {
    shell: "rgba(255, 255, 255, 0.72)",
    shellStrong: "rgba(255, 255, 255, 0.85)",
    panel: "rgba(242, 242, 247, 0.68)",
    border: "rgba(0, 0, 0, 0.1)",
    scrim: "rgba(0, 0, 0, 0.025)",
  },
  dark: {
    shell: "rgba(28, 28, 30, 0.72)",
    shellStrong: "rgba(36, 36, 40, 0.85)",
    panel: "rgba(36, 36, 40, 0.68)",
    border: "rgba(255, 255, 255, 0.1)",
    scrim: "rgba(0, 0, 0, 0.18)",
  },
}

const channels = (color: string): string => {
  const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color)
  if (hex) return `${parseInt(hex[1] ?? "0", 16)} ${parseInt(hex[2] ?? "0", 16)} ${parseInt(hex[3] ?? "0", 16)}`
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color)
  if (rgba) return `${rgba[1] ?? "0"} ${rgba[2] ?? "0"} ${rgba[3] ?? "0"}`
  return "0 0 0"
}

/** `#RRGGBB` + alpha → `rgba(r, g, b, a)`. Theme tints are all derived this way, so every color
 * stays inside the active palette instead of carrying its own private hex. */
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!match) return hex
  const r = parseInt(match[1] ?? "0", 16)
  const g = parseInt(match[2] ?? "0", 16)
  const b = parseInt(match[3] ?? "0", 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface ThemeValue {
  colorScheme: ColorScheme
  isDark: boolean
  palette: Palette
  glass: GlassTokens
  setColorScheme: (scheme: "system" | ColorScheme) => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme()
  const themeMode = useUIStore((state) => state.themeMode)
  const setThemeMode = useUIStore((state) => state.setThemeMode)

  const colorScheme: ColorScheme = themeMode === "system" ? (system === "dark" ? "dark" : "light") : themeMode

  const value = useMemo<ThemeValue>(
    () => ({
      colorScheme,
      isDark: colorScheme === "dark",
      palette: PALETTES[colorScheme],
      glass: GLASS[colorScheme],
      setColorScheme: (scheme) => setThemeMode(scheme),
    }),
    [colorScheme, setThemeMode],
  )

  const { palette } = value
  const themeVariables = useMemo(
    () =>
      vars({
        "--color-background": channels(palette.background),
        "--color-surface": channels(palette.surface),
        "--color-panel": channels(palette.panel),
        "--color-border": channels(palette.border),
        "--color-accent": channels(palette.accent),
        "--color-accent-strong": channels(palette.accentStrong),
        "--color-accent-soft": channels(palette.accentSoft),
        "--color-muted": channels(palette.muted),
        "--color-ink": channels(palette.ink),
        "--color-soft": channels(palette.soft),
        "--color-user-bubble": channels(palette.userBubble),
        "--color-assistant-bubble": channels(palette.assistantBubble),
        "--color-success": channels(palette.success),
        "--color-danger": channels(palette.danger),
        "--color-warning": channels(palette.warning),
        "--color-info": channels(palette.info),
        "--color-glass-shell": channels(value.glass.shell),
        "--color-glass-shell-strong": channels(value.glass.shellStrong),
        "--color-glass-panel": channels(value.glass.panel),
        "--color-glass-border": channels(value.glass.border),
        "--color-overlay": channels(palette.overlay),
        "--color-focus-ring": channels(palette.focusRing),
      }),
    [palette, value.glass],
  )

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used within a ThemeProvider")
  return context
}

/** Convenience alias matching the app's naming. */
export const useAppTheme = useTheme
