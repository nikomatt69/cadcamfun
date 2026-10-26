/**
 * The keymap: the catalog's default chords with the user's overrides applied, and the rules that keep it valid.
 *
 * Pure and total: any stored value resolves to a usable keymap (a malformed or stale override is dropped and reported,
 * never thrown), and `checkBinding` says exactly why a new chord is refused so the settings screen can show it.
 */
import {
  COMMANDS, commandById, scopesOverlap, type CommandDef, type Scope
} from "./catalog.ts"
import { canonicalChord, formatChord, hasCommandModifier, parseChord, type Chord } from "./chord.ts"

/** command id -> canonical chords. An empty list unbinds the command; an absent id keeps the defaults. */
export type Overrides = Readonly<Record<string, ReadonlyArray<string>>>

/**
 * Chords the operating system, the webview or text editing owns. Binding one would either never fire or break
 * something the user relies on everywhere (cut, quit, close, devtools).
 */
export const RESERVED_CHORDS: ReadonlyArray<string> = [
  "Mod+Q", "Mod+W", "Mod+M", "Mod+H", "Mod+Tab", "Alt+F4", "F12", "Mod+X", "Mod+Shift+I"
]

const RESERVED: ReadonlySet<string> = new Set(RESERVED_CHORDS.map((text) => canonicalChord(text) ?? text))

export interface KeymapEntry {
  readonly command: CommandDef
  readonly chords: ReadonlyArray<Chord>
  /** True when the user replaced the defaults for this command. */
  readonly customised: boolean
}

/** Something that was wrong in the stored overrides; the keymap is still built without it. */
export type KeymapIssue =
  | { readonly kind: "unknownCommand"; readonly id: string }
  | { readonly kind: "invalidChord"; readonly id: string; readonly chord: string }
  | { readonly kind: "reserved"; readonly id: string; readonly chord: string }
  | { readonly kind: "needsModifier"; readonly id: string; readonly chord: string }
  | { readonly kind: "conflict"; readonly id: string; readonly chord: string; readonly other: string }

export interface Keymap {
  readonly entries: ReadonlyArray<KeymapEntry>
  readonly overrides: Overrides
  readonly issues: ReadonlyArray<KeymapIssue>
  entry(id: string): KeymapEntry | undefined
  /** Commands bound to the chord whose scope is in `scopes`; the most specific scope first. */
  resolve(chord: Chord, scopes: ReadonlyArray<Scope>): ReadonlyArray<CommandDef>
}

/** Why a chord cannot go on a command; `ok` otherwise. */
export type BindingCheck =
  | { readonly ok: true; readonly chord: string }
  | { readonly ok: false; readonly reason: "invalidChord" | "reserved" | "needsModifier"; readonly chord: string }
  | { readonly ok: false; readonly reason: "conflict"; readonly chord: string; readonly with: ReadonlyArray<CommandDef> }

type StaticCheck = Exclude<BindingCheck, { readonly reason: "conflict" }>

const SPECIFICITY: Readonly<Record<Scope, number>> = { cad: 0, cam: 0, global: 1 }

const chordsOf = (command: CommandDef, overrides: Overrides): { readonly texts: ReadonlyArray<string>; readonly customised: boolean } => {
  const custom = overrides[command.id]
  return custom === undefined ? { texts: command.defaults, customised: false } : { texts: custom, customised: true }
}

/** Static validity of one chord for one command (no look at the other commands). */
const staticCheck = (command: CommandDef, text: string): StaticCheck => {
  const canonical = canonicalChord(text)
  if (canonical === undefined) return { ok: false, reason: "invalidChord", chord: text }
  if (RESERVED.has(canonical)) return { ok: false, reason: "reserved", chord: canonical }
  const chord = parseChord(canonical)!
  // A command that fires while typing must not be a chord that types: it would swallow the character.
  if (command.inText === true && !hasCommandModifier(chord)) return { ok: false, reason: "needsModifier", chord: canonical }
  return { ok: true, chord: canonical }
}

/** Commands that already own `chord` in a scope that can be live together with `command`'s. */
const owners = (keymapEntries: ReadonlyArray<KeymapEntry>, command: CommandDef, chord: string): ReadonlyArray<CommandDef> =>
  keymapEntries
    .filter((entry) => entry.command.id !== command.id && scopesOverlap(entry.command.scope, command.scope))
    .filter((entry) => entry.chords.some((candidate) => formatChord(candidate) === chord))
    .map((entry) => entry.command)

/**
 * Whether `text` may be bound to command `id` in `keymap`. A conflict lists the commands that own the chord, so the
 * caller can offer to reassign it.
 */
export const checkBinding = (keymap: Keymap, id: string, text: string): BindingCheck => {
  const command = commandById(id)
  if (command === undefined) return { ok: false, reason: "invalidChord", chord: text }
  const checked = staticCheck(command, text)
  if (!checked.ok) return checked
  const clash = owners(keymap.entries, command, checked.chord)
  return clash.length > 0 ? { ok: false, reason: "conflict", chord: checked.chord, with: clash } : checked
}

/**
 * Builds the keymap. Order of precedence: a user's chord beats a default, and between two user chords the command
 * that comes first in the catalog wins; the loser is reported in `issues` and left unbound.
 */
export const buildKeymap = (stored: Overrides = {}): Keymap => {
  const issues: KeymapIssue[] = []
  // An override none of whose chords is usable (hand-edited, or from a catalog that changed) falls back to the defaults
  // instead of silently unbinding the command; an explicit empty list is the deliberate way to unbind.
  const overrides: Record<string, ReadonlyArray<string>> = {}
  for (const [id, texts] of Object.entries(stored)) {
    const command = commandById(id)
    if (command === undefined) { issues.push({ kind: "unknownCommand", id }); continue }
    const checks = texts.map((text) => staticCheck(command, text))
    if (texts.length > 0 && checks.every((check) => !check.ok)) {
      for (const check of checks) if (!check.ok) issues.push({ kind: check.reason, id, chord: check.chord })
      continue
    }
    overrides[id] = texts
  }

  const accepted: { command: CommandDef; chords: Chord[]; customised: boolean }[] = []
  const taken = (command: CommandDef, chord: string): CommandDef | undefined =>
    accepted.find((entry) => entry.command.id !== command.id && scopesOverlap(entry.command.scope, command.scope) && entry.chords.some((c) => formatChord(c) === chord))?.command

  const place = (command: CommandDef, customised: boolean, into: Chord[]): void => {
    const { texts } = chordsOf(command, overrides)
    for (const text of texts) {
      const checked = staticCheck(command, text)
      if (!checked.ok) {
        // A default is trusted by the catalog test; only stored values can be wrong.
        if (customised) issues.push({ kind: checked.reason, id: command.id, chord: checked.chord })
        continue
      }
      const other = taken(command, checked.chord)
      if (other !== undefined) {
        if (customised) issues.push({ kind: "conflict", id: command.id, chord: checked.chord, other: other.id })
        continue
      }
      if (!into.some((c) => formatChord(c) === checked.chord)) into.push(parseChord(checked.chord)!)
    }
  }

  const customCommands = COMMANDS.filter((command) => overrides[command.id] !== undefined)
  const defaultCommands = COMMANDS.filter((command) => overrides[command.id] === undefined)
  const byId = new Map<string, KeymapEntry>()
  for (const command of customCommands) {
    const entry = { command, chords: [] as Chord[], customised: true }
    accepted.push(entry)
    place(command, true, entry.chords)
  }
  for (const command of defaultCommands) {
    const entry = { command, chords: [] as Chord[], customised: false }
    accepted.push(entry)
    place(command, false, entry.chords)
  }
  const entries: ReadonlyArray<KeymapEntry> = COMMANDS.map((command) => accepted.find((entry) => entry.command.id === command.id)!)
  for (const entry of entries) byId.set(entry.command.id, entry)

  const byChord = new Map<string, CommandDef[]>()
  for (const entry of entries) {
    for (const chord of entry.chords) {
      const key = formatChord(chord)
      const list = byChord.get(key)
      if (list === undefined) byChord.set(key, [entry.command]); else list.push(entry.command)
    }
  }

  return {
    entries,
    overrides,
    issues,
    entry: (id) => byId.get(id),
    resolve: (chord, scopes) =>
      (byChord.get(formatChord(chord)) ?? [])
        .filter((command) => scopes.includes(command.scope))
        .sort((a, b) => SPECIFICITY[a.scope] - SPECIFICITY[b.scope])
  }
}

/** Canonicalises a list of chord texts, dropping the ones that are not chords and the duplicates. */
export const canonicalList = (texts: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>()
  for (const text of texts) {
    const canonical = canonicalChord(text)
    if (canonical !== undefined) seen.add(canonical)
  }
  return [...seen]
}

/** True when `chords` equals the command's defaults, so an override can be dropped instead of stored. */
export const isDefault = (command: CommandDef, chords: ReadonlyArray<string>): boolean => {
  const defaults = canonicalList(command.defaults)
  const next = canonicalList(chords)
  return defaults.length === next.length && defaults.every((chord) => next.includes(chord))
}
