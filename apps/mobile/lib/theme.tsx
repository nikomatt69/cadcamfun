import { createContext, useContext, useMemo, type PropsWithChildren } from "react"
import { View, useColorScheme } from "react-native"
import { vars } from "nativewind"
import { useUIStore } from "./store"
import { PALETTES, GLASS, hexToRgba, type ColorScheme, type Palette, type GlassTokens } from "./palette"
export type { ColorScheme, Palette, GlassTokens } from "./palette"
export { hexToRgba }

/**
 * The companion theme shares semantic colors across content and native navigation. Colors adapt to light/dark through CSS variables consumed by NativeWind
 * (`bg-surface`, `text-ink`, `border-border`…), and are also exposed as a typed palette for
 * StyleSheet code and native component props (tab tint, blur layers).
 */

const channels = (color: string): string => {
  const hex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color)
  if (hex) return `${parseInt(hex[1] ?? "0", 16)} ${parseInt(hex[2] ?? "0", 16)} ${parseInt(hex[3] ?? "0", 16)}`
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color)
  if (rgba) return `${rgba[1] ?? "0"} ${rgba[2] ?? "0"} ${rgba[3] ?? "0"}`
  return "0 0 0"
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
        "--color-surface-raised": channels(palette.surfaceRaised),
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
        "--color-shadow": channels(palette.shadow),
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
