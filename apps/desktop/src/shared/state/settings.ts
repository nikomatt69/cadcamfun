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
  /** Defaults of new probe cycles (spec 73). */
  readonly probing: ProbingDefaults
}

/** How a probe cycle uses what it measured (core `UpdateMode`, spec 73 §5.3). */
export const PROBE_UPDATE_MODES = ["set", "report", "update-within-tolerance", "alarm-outside-tolerance"] as const
export type ProbeUpdateMode = (typeof PROBE_UPDATE_MODES)[number]

/**
 * Defaults a new probe cycle starts from (spec 73 §4), in millimetres and mm/min. The machine's probe configuration and the cycle
 * itself override them; these only fill what neither says.
 */
export interface ProbingDefaults {
  readonly touchFeed: number
  readonly fastFeed: number
  /** Distance above the surface the probe starts its search from. */
  readonly clearance: number
  readonly safeHeight: number
  /** How far past the expected surface the probe searches before it reports a miss. */
  readonly search: number
  readonly overtravel: number
  readonly defaultUpdateMode: ProbeUpdateMode
  readonly defaultWorkOffset: string
  /** Inspection tolerance a new check starts with (± mm). */
  readonly defaultTolerance: number
  /** How much the 3D view exaggerates a measured deviation so a few microns are visible. */
  readonly deviationScale: number
}

export const DEFAULT_PROBING: ProbingDefaults = {
  touchFeed: 100,
  fastFeed: 1000,
  clearance: 5,
  safeHeight: 25,
  search: 10,
  overtravel: 2,
  defaultUpdateMode: "set",
  defaultWorkOffset: "G54",
  defaultTolerance: 0.05,
  deviationScale: 100
}

/** Bounds per numeric probing default: a value outside them falls back to its default (field by field). */
export const PROBING_BOUNDS: Readonly<Record<Exclude<keyof ProbingDefaults, "defaultUpdateMode" | "defaultWorkOffset">, readonly [number, number]>> = {
  touchFeed: [1, 2000],
  fastFeed: [1, 10000],
  clearance: [0.5, 100],
  safeHeight: [1, 500],
  search: [0.5, 100],
  overtravel: [0, 50],
  defaultTolerance: [0.0005, 5],
  deviationScale: [1, 10000]
}

/** Work offsets a default may name: G54..G59, G54.1 P1..P300, G505..G599 (Siemens), or a LinuxCNC G59.1..G59.3. */
const WORK_OFFSET = /^(G5[4-9]|G54\.1 P([1-9]\d?|[12]\d\d|300)|G5(0[5-9]|[1-9]\d)|G59\.[1-3])$/

/** Decodes the probing defaults one field at a time, so one bad field does not reset the others. */
export const decodeProbingDefaults = (raw: unknown): ProbingDefaults => {
  if (typeof raw !== "object" || raw === null) return DEFAULT_PROBING
  const record = raw as Record<string, unknown>
  const numeric = Object.fromEntries(Object.entries(PROBING_BOUNDS).map(([key, [min, max]]) => {
    const value = record[key]
    return [key, typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : DEFAULT_PROBING[key as keyof typeof PROBING_BOUNDS]]
  })) as Pick<ProbingDefaults, keyof typeof PROBING_BOUNDS>
  return {
    ...numeric,
    defaultUpdateMode: isOneOf(PROBE_UPDATE_MODES, record["defaultUpdateMode"]) ? record["defaultUpdateMode"] : DEFAULT_PROBING.defaultUpdateMode,
    defaultWorkOffset: typeof record["defaultWorkOffset"] === "string" && WORK_OFFSET.test(record["defaultWorkOffset"]) ? record["defaultWorkOffset"] : DEFAULT_PROBING.defaultWorkOffset
  }
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
  autosaveMinutes: 2,
  probing: DEFAULT_PROBING
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
    autosaveMinutes: (AUTOSAVE_MINUTES as ReadonlyArray<unknown>).includes(record["autosaveMinutes"]) ? record["autosaveMinutes"] as number : DEFAULT_SETTINGS.autosaveMinutes,
    probing: decodeProbingDefaults(record["probing"])
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
