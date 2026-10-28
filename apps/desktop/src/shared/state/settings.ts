/**
 * Persisted user preferences (spec 06-desktop-ui.md §1: units, theme, locale and
 * post-processor defaults).
 *
 * Everything lives in one `localStorage` key so a settings write is a single
 * atomic-ish operation, and so a corrupt value degrades to the defaults instead of
 * breaking the shell.
 */
import { createEffect, createSignal, type Accessor } from "solid-js"
import { DEFAULT_LOCALE, isLocale, type Locale } from "../../i18n/registry.ts"
import { DEFAULT_TOLERANCE, isTolerance } from "@cadcamfun/core"
import { isDisplayUnits, type DisplayUnits } from "../../viewport/units.ts"

export const THEMES = ["light", "dark", "system"] as const
export type Theme = (typeof THEMES)[number]

/** Grammar the post-processor emits; the sidecar has the same list. */
export const POST_PROCESSORS = ["grbl", "linuxcnc", "smoothwb", "gcode", "fanuc"] as const
export type PostProcessor = (typeof POST_PROCESSORS)[number]

export interface Settings {
  readonly units: DisplayUnits
  readonly theme: Theme
  readonly locale: Locale
  /** Decimal places used when formatting lengths; spec 01 §1 fixes the format. */
  readonly decimals: number
  readonly postProcessor: PostProcessor
  /** Shown in the status bar; the editor itself always works in millimetres. */
  readonly snapEnabled: boolean
  /** Drawing tolerance in millimetres: how closely curves are drawn and the default of the toolpath and its verification. */
  readonly tolerance: number
  /** Liquid Glass window material (macOS, inside the desktop app); everywhere else it has no effect. */
  readonly glass: boolean
  /** Native OS popups for important synced notifications (Tauri notification plugin); the feed syncs regardless. */
  readonly nativeNotifications: boolean
  /** Save the open drawing and CAM program on their own while they have unsaved changes. */
  readonly autosave: boolean
  /** Minutes between automatic saves (one of `AUTOSAVE_MINUTES`). */
  readonly autosaveMinutes: number
}

/** The intervals the settings offer; a stored value outside this list falls back to the default. */
export const AUTOSAVE_MINUTES = [1, 2, 5, 10, 15, 30] as const

export const DEFAULT_SETTINGS: Settings = {
  units: "mm",
  theme: "system",
  locale: DEFAULT_LOCALE,
  decimals: 3,
  postProcessor: "grbl",
  snapEnabled: true,
  tolerance: DEFAULT_TOLERANCE,
  glass: true,
  nativeNotifications: true,
  autosave: true,
  autosaveMinutes: 2
}

const STORAGE_KEY = "cadcamfun.settings"

const isOneOf = <A extends string>(values: ReadonlyArray<A>, value: unknown): value is A =>
  typeof value === "string" && (values as ReadonlyArray<string>).includes(value)

/** Keeps only fields that decode; a partial or hand-edited record is not fatal. */
export const decodeSettings = (raw: unknown): Settings => {
  if (typeof raw !== "object" || raw === null) return DEFAULT_SETTINGS
  const record = raw as Record<string, unknown>
  return {
    units: isDisplayUnits(record["units"]) ? record["units"] : DEFAULT_SETTINGS.units,
    theme: isOneOf(THEMES, record["theme"]) ? record["theme"] : DEFAULT_SETTINGS.theme,
    locale: isLocale(record["locale"]) ? record["locale"] : DEFAULT_SETTINGS.locale,
    decimals:
      typeof record["decimals"] === "number" && Number.isInteger(record["decimals"]) &&
        (record["decimals"] as number) >= 0 && (record["decimals"] as number) <= 6
        ? (record["decimals"] as number)
        : DEFAULT_SETTINGS.decimals,
    postProcessor: isOneOf(POST_PROCESSORS, record["postProcessor"])
      ? record["postProcessor"]
      : DEFAULT_SETTINGS.postProcessor,
    snapEnabled:
      typeof record["snapEnabled"] === "boolean" ? record["snapEnabled"] : DEFAULT_SETTINGS.snapEnabled,
    tolerance: isTolerance(record["tolerance"]) ? record["tolerance"] : DEFAULT_SETTINGS.tolerance,
    glass: typeof record["glass"] === "boolean" ? record["glass"] : DEFAULT_SETTINGS.glass,
    nativeNotifications: typeof record["nativeNotifications"] === "boolean" ? record["nativeNotifications"] : DEFAULT_SETTINGS.nativeNotifications,
    autosave: typeof record["autosave"] === "boolean" ? record["autosave"] : DEFAULT_SETTINGS.autosave,
    autosaveMinutes: (AUTOSAVE_MINUTES as ReadonlyArray<unknown>).includes(record["autosaveMinutes"]) ? record["autosaveMinutes"] as number : DEFAULT_SETTINGS.autosaveMinutes
  }
}

/** `localStorage` access is lazy so this module is importable in a non-DOM test. */
const readStored = (): Settings => {
  const store = globalThis.localStorage
  if (store === undefined) return DEFAULT_SETTINGS
  try {
    const raw = store.getItem(STORAGE_KEY)
    return raw === null ? DEFAULT_SETTINGS : decodeSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_SETTINGS
  }
}

const writeStored = (settings: Settings): void => {
  const store = globalThis.localStorage
  if (store === undefined) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // A full or blocked storage must not break editing; the settings simply do not persist.
  }
}

export interface SettingsStore {
  readonly settings: Accessor<Settings>
  /** Merges a patch, persists it and returns the new value. */
  update(patch: Partial<Settings>): Settings
  reset(): Settings
}

/** Signals for the settings, plus persistence; one instance per app (and per test). */
export const createSettings = (initial?: Settings): SettingsStore => {
  const [settings, setSettings] = createSignal<Settings>(initial ?? readStored())
  const commit = (next: Settings): Settings => {
    writeStored(next)
    setSettings(next)
    return next
  }
  return {
    settings,
    update: (patch) => commit({ ...settings(), ...patch }),
    reset: () => commit(DEFAULT_SETTINGS)
  }
}

/** Applies `theme` to `<html>`, resolving `system` through `matchMedia`. */
export const applyTheme = (theme: Theme): void => {
  if (typeof document === "undefined") return
  const root = document.documentElement
  const dark = theme === "dark" ||
    (theme === "system" && typeof window !== "undefined" && typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  root.classList.toggle("dark", dark)
  root.dataset["theme"] = theme
}

export interface ThemeController {
  /** Applies `theme` now and remembers it as the preference to re-apply on change. */
  apply(theme: Theme): void
  /** Stops following the OS preference; call on cleanup. */
  dispose(): void
}

/** `true` when `theme` means "dark" right now, resolving `system` through the OS. */
export const prefersDark = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches === true

/**
 * Applies themes and re-applies `system` whenever the OS preference flips.
 * The returned controller unsubscribes, so a test never leaks a listener.
 */
export const watchSystemTheme = (): ThemeController => {
  let theme: Theme = "system"
  const query =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : undefined
  const handler = () => {
    if (theme === "system") applyTheme(theme)
  }
  query?.addEventListener("change", handler)
  return {
    apply: (next) => {
      theme = next
      applyTheme(next)
    },
    dispose: () => query?.removeEventListener("change", handler)
  }
}

/** Wires a settings store to the theme side effects; returns the cleanup. */
export const connectTheme = (store: SettingsStore): (() => void) => {
  const controller = watchSystemTheme()
  createEffect(() => controller.apply(store.settings().theme))
  return () => controller.dispose()
}
