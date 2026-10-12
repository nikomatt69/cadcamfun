/**
 * ThemeToggle — light/dark/system modes, persisted in localStorage.
 *
 * - Adds/removes `html.dark` so all existing components pick up the theme
 *   via the existing CSS variables (no new tokens, no content changes).
 * - Sun/moon icon swap with cross-fade (icon swap happens instantly so it
 *   reads correctly even on reduced motion).
 * - Press feedback inherited from `--ui-press` (the .ui-press class).
 *
 * Use `useTheme()` to react to the current theme inside other components.
 */
import { Motion } from "solid-motionone"
import { type JSX, createSignal, onMount } from "solid-js"
import Sun from "lucide-solid/icons/sun"
import Moon from "lucide-solid/icons/moon"
import { IconButton } from "./button.tsx"
import { prefersReducedMotion } from "./animated-section.tsx"

export type ThemeMode = "light" | "dark" | "system"

const STORAGE_KEY = "ui.theme"

const reduced = prefersReducedMotion

const [mode, setMode] = createSignal<ThemeMode>("system")
const [resolved, setResolved] = createSignal<"light" | "dark">("light")
let initialized = false

const systemPref = (): "light" | "dark" => {
  if (typeof window === "undefined") return "light"
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches === true ? "dark" : "light"
}

const apply = (next: "light" | "dark"): void => {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", next === "dark")
  setResolved(next)
}

const persist = (next: ThemeMode): void => {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore quota / privacy errors */ }
}

export const initTheme = (): void => {
  if (initialized || typeof window === "undefined") return
  initialized = true
  const stored = ((): ThemeMode => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw === "light" || raw === "dark" || raw === "system") return raw
    } catch { /* ignore */ }
    return "system"
  })()
  setMode(stored)
  apply(stored === "system" ? systemPref() : stored)
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (mode() === "system") apply(systemPref())
  })
}

export function useTheme(): { readonly mode: typeof mode; readonly resolved: typeof resolved; readonly setMode: (next: ThemeMode) => void } {
  return {
    mode,
    resolved,
    setMode: (next) => {
      setMode(next)
      persist(next)
      apply(next === "system" ? systemPref() : next)
    }
  }
}

export interface ThemeToggleProps {
  readonly variant?: "icon" | "switch"
}

export function ThemeToggle(props: ThemeToggleProps): JSX.Element {
  onMount(initTheme)
  const theme = useTheme()
  const next = (): ThemeMode => {
    const current = theme.mode()
    return current === "light" ? "dark" : current === "dark" ? "system" : "light"
  }
  const cycle = (): void => { theme.setMode(next()) }
  const icon = (): JSX.Element => {
    const current = theme.resolved()
    return current === "dark" ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />
  }
  const label = (): string => {
    const current = theme.mode()
    return current === "system" ? "Theme: system (auto)" : current === "dark" ? "Theme: dark" : "Theme: light"
  }
  void reduced
  if (props.variant === "switch") {
    return (
      <button
        type="button"
        class="ui-theme-toggle"
        aria-label={label()}
        onClick={cycle}
      >
        <span class="ui-theme-toggle-icon"><Motion.span animate={reduced() ? undefined : { rotate: theme.resolved() === "dark" ? 180 : 0 }} transition={{ duration: 0.35 }}>{icon()}</Motion.span></span>
        <span class="ui-theme-toggle-label">{label()}</span>
      </button>
    )
  }
  return (
    <IconButton aria-label={label()} onClick={cycle}>
      <Motion.span animate={reduced() ? undefined : { rotate: theme.resolved() === "dark" ? 180 : 0 }} transition={{ duration: 0.35 }}>{icon()}</Motion.span>
    </IconButton>
  )
}