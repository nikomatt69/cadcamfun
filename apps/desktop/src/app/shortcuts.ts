/**
 * Keyboard-first plumbing for the shell (spec 06-desktop-ui.md §1).
 *
 * Kept out of the components so it can be unit-tested without a DOM: the palette needs
 * to know which shortcuts exist and what they run, the Settings screen renders the same
 * table, and both must agree.
 */
import type { ActivityId } from "./layout.ts"

export interface Shortcut {
  /** Stable id; also the i18n key suffix (`settings.shortcut.palette` etc.). */
  readonly id: string
  /** i18n key for the human label. */
  readonly labelKey: string
  /** Accelerator as shown to the user, e.g. `Cmd/Ctrl+K`. */
  readonly keys: string
  readonly group: "navigation" | "edit" | "view" | "ai"
  /** What the shortcut does; the shell supplies the behaviour. */
  readonly run: (context: ShortcutContext) => void
}

export interface ShortcutContext {
  readonly activity: ActivityId
  readonly go: (route: string) => void
  readonly togglePanel: () => void
  readonly openPalette: () => void
  readonly newProject: () => void
  readonly undo: () => void
  readonly redo: () => void
  readonly zoomFit: () => void
  readonly zoomIn: () => void
  readonly zoomOut: () => void
}

/** The palette shortcut; `Cmd/Ctrl+K` is the spec's requirement. */
export const PALETTE_KEY = "k"

/** True when the event should be ignored because the user is typing. */
export const isTextEntry = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null
  if (element === null || element === undefined) return false
  const tag = element.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.isContentEditable === true
  )
}

/**
 * Whether a keyboard event should trigger a shortcut. `mod` is Cmd on macOS and Ctrl
 * elsewhere, which is what every accelerator in this app means.
 */
export const matchesShortcut = (event: KeyboardEvent, shortcut: Pick<Shortcut, "keys">): boolean => {
  const parts = shortcut.keys.split("+").map((part) => part.trim().toLowerCase())
  const mod = parts.includes("cmd/ctrl")
  const key = parts[parts.length - 1] ?? ""
  const wantsShift = parts.includes("shift")
  const wantsAlt = parts.includes("alt")

  const modDown = event.metaKey || event.ctrlKey
  if (mod !== modDown) return false
  if (wantsShift !== event.shiftKey) return false
  if (wantsAlt !== event.altKey) return false
  return event.key.toLowerCase() === key
}

/** The shortcuts the shell registers, in palette order. */
export const shortcuts = (context: ShortcutContext): ReadonlyArray<Shortcut> => [
  { id: "palette", labelKey: "settings.shortcut.palette", keys: "Cmd/Ctrl+K", group: "navigation", run: context.openPalette },
  { id: "newProject", labelKey: "settings.shortcut.newProject", keys: "Cmd/Ctrl+Shift+P", group: "navigation", run: context.newProject },
  { id: "undo", labelKey: "settings.shortcut.undo", keys: "Cmd/Ctrl+Z", group: "edit", run: context.undo },
  { id: "redo", labelKey: "settings.shortcut.redo", keys: "Cmd/Ctrl+Shift+Z", group: "edit", run: context.redo },
  { id: "save", labelKey: "settings.shortcut.save", keys: "Cmd/Ctrl+S", group: "edit", run: () => {} },
  { id: "export", labelKey: "settings.shortcut.export", keys: "Cmd/Ctrl+Shift+E", group: "edit", run: () => {} },
  { id: "zoomFit", labelKey: "settings.shortcut.zoomFit", keys: "Cmd/Ctrl+0", group: "view", run: context.zoomFit },
  { id: "zoomIn", labelKey: "settings.shortcut.zoomIn", keys: "Cmd/Ctrl+=", group: "view", run: context.zoomIn },
  { id: "zoomOut", labelKey: "settings.shortcut.zoomOut", keys: "Cmd/Ctrl+-", group: "view", run: context.zoomOut },
  { id: "toggleAi", labelKey: "settings.shortcut.toggleAi", keys: "Cmd/Ctrl+J", group: "ai", run: context.togglePanel }
]

/**
 * The first shortcut an event triggers, or `undefined`. Pure, so the keyboard test can
 * feed synthetic events without a renderer.
 */
export const findShortcut = (event: KeyboardEvent, all: ReadonlyArray<Shortcut>): Shortcut | undefined =>
  isTextEntry(event.target) ? undefined : all.find((shortcut) => matchesShortcut(event, shortcut))

/** Filters the palette list by a free-text query, case-insensitively. */
export const filterCommands = <T extends { readonly label: string }>(
  commands: ReadonlyArray<T>,
  query: string
): ReadonlyArray<T> => {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return commands
  return commands.filter((command) => command.label.toLowerCase().includes(needle))
}
