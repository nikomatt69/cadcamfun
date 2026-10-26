/**
 * Key chords: the one representation every keybinding in the app uses.
 *
 * A chord is stored as a canonical string (`Mod+Shift+Z`) so a keymap saved on macOS reads the same on Windows:
 * `Mod` is Cmd on macOS and Ctrl elsewhere, `Ctrl` and `Meta` are the physical keys that are *not* `Mod` on the
 * current platform. Everything here is pure (no DOM), so the matching rules are testable with plain objects.
 */

export type Platform = "mac" | "other"

export interface Chord {
  /** Cmd on macOS, Ctrl elsewhere. */
  readonly mod: boolean
  /** The physical Ctrl key when it is not `Mod` (macOS only). */
  readonly ctrl: boolean
  /** The physical Meta/Win key when it is not `Mod` (Windows/Linux only). */
  readonly meta: boolean
  readonly alt: boolean
  readonly shift: boolean
  /** Lower-case key name: `a`, `1`, `escape`, `arrowup`, `f5`, `=`, `?`. */
  readonly key: string
}

/** The slice of a `KeyboardEvent` the matcher reads. */
export interface KeyEventLike {
  readonly key: string
  readonly code?: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
  readonly repeat?: boolean
}

const NAMED_KEYS: Readonly<Record<string, string>> = {
  " ": "space", spacebar: "space", esc: "escape", del: "delete", return: "enter", up: "arrowup", down: "arrowdown",
  left: "arrowleft", right: "arrowright", plus: "+", comma: ",", period: ".", minus: "-", equal: "=", slash: "/"
}

/** Keys that are a modifier by themselves: never a chord of their own. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(["control", "shift", "alt", "meta", "altgraph", "os", "capslock", "fn"])

const FUNCTION_KEY = /^f([1-9]|1[0-9]|2[0-4])$/
const NAMED_SET: ReadonlySet<string> = new Set([
  "space", "escape", "enter", "tab", "backspace", "delete", "insert", "home", "end", "pageup", "pagedown",
  "arrowup", "arrowdown", "arrowleft", "arrowright"
])

/** Printable, non-alphanumeric ASCII: its shift state is part of the character itself (`?` is `Shift+/` on US). */
const isSymbol = (key: string): boolean => key.length === 1 && !/^[a-z0-9]$/.test(key)

/** A key name the matcher can ever produce. */
export const isKnownKey = (key: string): boolean =>
  /^[a-z0-9]$/.test(key) || isSymbol(key) || NAMED_SET.has(key) || FUNCTION_KEY.test(key)

export const normaliseKey = (key: string): string => {
  const lower = key.length === 1 ? key.toLowerCase() : key.trim().toLowerCase()
  return NAMED_KEYS[lower] ?? lower
}

/** Detects macOS from the user agent platform; tests pass the platform explicitly. */
export const detectPlatform = (): Platform =>
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(`${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`) ? "mac" : "other"

const make = (key: string, mods: Partial<Omit<Chord, "key">> = {}): Chord => {
  const shift = mods.shift === true && !isSymbol(key)
  return { mod: mods.mod === true, ctrl: mods.ctrl === true, meta: mods.meta === true, alt: mods.alt === true, shift, key }
}

/**
 * Parses `Mod+Shift+Z`. Returns `undefined` for anything that is not a chord: an empty string, a lone modifier, an
 * unknown key name or a repeated modifier. A trailing `+` key (`Mod++`) is the plus key itself.
 */
export const parseChord = (text: string, platform: Platform = detectPlatform()): Chord | undefined => {
  const source = text.trim()
  if (source.length === 0) return undefined
  // `+` alone and a trailing `++` spell the plus key; a single trailing `+` is a dangling separator.
  if (source.endsWith("+") && source !== "+" && !source.endsWith("++")) return undefined
  const plus = source === "+" || source.endsWith("++")
  const rest = source === "+" ? "" : plus ? source.slice(0, -2) : source
  const parts = rest.split("+").map((part) => part.trim()).filter((part) => part.length > 0)
  const keyText = plus ? "+" : parts.pop()
  if (keyText === undefined) return undefined
  const mods: { -readonly [K in keyof Omit<Chord, "key">]?: boolean } = {}
  for (const part of parts) {
    const name = part.toLowerCase()
    const field = name === "mod" || name === "cmdorctrl" || name === "cmd/ctrl" ? "mod"
      : name === "ctrl" || name === "control" ? "ctrl"
      : name === "meta" || name === "win" || name === "super" || name === "cmd" ? "meta"
      : name === "alt" || name === "option" ? "alt"
      : name === "shift" ? "shift" : undefined
    if (field === undefined || mods[field] === true) return undefined
    mods[field] = true
  }
  const key = normaliseKey(keyText)
  if (MODIFIER_KEYS.has(key) || !isKnownKey(key)) return undefined
  // The platform's own command key is `Mod`: Ctrl on Windows/Linux, Cmd on macOS. Writing it by its name is the same key,
  // and writing both it and `Mod` names one key twice.
  const own = platform === "mac" ? "meta" : "ctrl"
  if (mods[own] === true) {
    if (mods.mod === true) return undefined
    mods.mod = true
    mods[own] = false
  }
  return make(key, mods)
}

/** Canonical text of a chord; `parseChord(formatChord(c))` returns `c`. */
export const formatChord = (chord: Chord): string => {
  const parts: string[] = []
  if (chord.mod) parts.push("Mod")
  if (chord.ctrl) parts.push("Ctrl")
  if (chord.meta) parts.push("Meta")
  if (chord.alt) parts.push("Alt")
  if (chord.shift) parts.push("Shift")
  const key = chord.key.length === 1 ? chord.key.toUpperCase() : chord.key.charAt(0).toUpperCase() + chord.key.slice(1)
  parts.push(key)
  return parts.join("+")
}

/** Canonical form of any chord text on `platform`, or `undefined` when it is not one. */
export const canonicalChord = (text: string, platform: Platform = detectPlatform()): string | undefined => {
  const chord = parseChord(text, platform)
  return chord === undefined ? undefined : formatChord(chord)
}

/**
 * The key a event stands for. Letters and digits come from `event.key` (so AZERTY and Dvorak users get the letter printed on
 * the key); when a modifier turned that into a symbol (Alt+F on macOS types `ƒ`, Shift+1 types `!`) the physical `code`
 * names the letter or digit instead.
 */
const eventKey = (event: KeyEventLike): string => {
  const key = normaliseKey(event.key)
  if (/^[a-z0-9]$/.test(key) || key.length !== 1) return key
  const code = event.code ?? ""
  const letter = /^Key([A-Z])$/.exec(code)?.[1]?.toLowerCase()
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code)?.[1]
  if (letter !== undefined && (event.altKey || event.ctrlKey || event.metaKey)) return letter
  if (digit !== undefined && (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)) return digit
  return key
}

/** The chord a keyboard event produces on `platform`, or `undefined` for a lone modifier press. */
export const chordFromEvent = (event: KeyEventLike, platform: Platform = detectPlatform()): Chord | undefined => {
  const key = eventKey(event)
  if (MODIFIER_KEYS.has(key) || key === "dead" || key === "unidentified" || key === "process" || key === "") return undefined
  const mac = platform === "mac"
  return make(key, {
    mod: mac ? event.metaKey : event.ctrlKey,
    ctrl: mac ? event.ctrlKey : false,
    meta: mac ? false : event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey
  })
}

export const sameChord = (a: Chord, b: Chord): boolean =>
  a.key === b.key && a.mod === b.mod && a.ctrl === b.ctrl && a.meta === b.meta && a.alt === b.alt && a.shift === b.shift

/** True when the event is exactly this chord on `platform`. */
export const matchesChord = (event: KeyEventLike, chord: Chord, platform: Platform = detectPlatform()): boolean => {
  const produced = chordFromEvent(event, platform)
  return produced !== undefined && sameChord(produced, chord)
}

/** Whether a chord needs a modifier other than Shift (these are the only chords allowed while typing in a field). */
export const hasCommandModifier = (chord: Chord): boolean => chord.mod || chord.ctrl || chord.meta || chord.alt

const MAC_SYMBOLS: Readonly<Record<string, string>> = {
  mod: "⌘", ctrl: "⌃", meta: "⌘", alt: "⌥", shift: "⇧", escape: "Esc", enter: "↵", backspace: "⌫", delete: "⌦", tab: "⇥",
  arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", space: "Space"
}
const OTHER_SYMBOLS: Readonly<Record<string, string>> = {
  mod: "Ctrl", ctrl: "Ctrl", meta: "Win", alt: "Alt", shift: "Shift", escape: "Esc", enter: "Enter", backspace: "Backspace",
  delete: "Del", tab: "Tab", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", space: "Space"
}

const WORDS: Readonly<Record<string, string>> = { pageup: "Page Up", pagedown: "Page Down", insert: "Insert" }

/** A letter or symbol in capitals, a function key as `F5`, a named key (`Home`, `Page Up`) as a word. */
const keyLabel = (key: string): string =>
  key.length === 1 || /^f\d+$/.test(key) ? key.toUpperCase() : WORDS[key] ?? key.charAt(0).toUpperCase() + key.slice(1)

/** The parts of a chord as the platform prints them: `["⇧", "⌘", "Z"]` on macOS, `["Ctrl", "Shift", "Z"]` elsewhere. */
export const chordLabels = (chord: Chord, platform: Platform = detectPlatform()): ReadonlyArray<string> => {
  const table = platform === "mac" ? MAC_SYMBOLS : OTHER_SYMBOLS
  const modifiers: string[] = []
  if (chord.ctrl || (chord.mod && platform !== "mac")) modifiers.push(table["ctrl"]!)
  if (chord.alt) modifiers.push(table["alt"]!)
  if (chord.shift) modifiers.push(table["shift"]!)
  if (chord.meta || (chord.mod && platform === "mac")) modifiers.push(table["meta"]!)
  return [...modifiers, table[chord.key] ?? keyLabel(chord.key)]
}

/** One display string: `⌘⇧Z` on macOS, `Ctrl+Shift+Z` elsewhere. */
export const displayChord = (chord: Chord, platform: Platform = detectPlatform()): string =>
  platform === "mac" ? chordLabels(chord, platform).join("") : chordLabels(chord, platform).join("+")
