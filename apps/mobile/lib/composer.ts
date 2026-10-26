import { MAX_ATTACHMENTS } from "./attachments"

/** Copy and small rules for the chat composer, kept apart from the view so they are testable. */

export type ComposerMode = "general" | "cad" | "cam" | "gcode" | "toolpath"

export const COMPOSER_MODES: ReadonlyArray<{ value: ComposerMode; label: string; hint: string }> = [
  { value: "general", label: "General", hint: "Any question about the project" },
  { value: "cad", label: "CAD", hint: "Sketches, features and geometry" },
  { value: "cam", label: "CAM", hint: "Setups, tools and operations" },
  { value: "toolpath", label: "Toolpath", hint: "Strategies, feeds and simulation" },
  { value: "gcode", label: "G-code", hint: "Review and post-processor output" },
]

const MODE_PLACEHOLDER: Record<ComposerMode, string> = {
  general: "Ask CADCAMFUN, or type / to focus",
  cad: "Describe the geometry…",
  cam: "Ask about setups and operations…",
  toolpath: "Ask for a toolpath…",
  gcode: "Ask about the G-code…",
}

/** The field's hint: the connection state wins, then the live turn, then the mode's own wording. */
export const composerPlaceholder = (state: { offline: boolean; busy: boolean; mode: ComposerMode }): string =>
  state.offline ? "Desktop offline · message waits to send" : state.busy ? "Steer the current turn…" : MODE_PLACEHOLDER[state.mode]

/** The focus chip in the toolbar names the mode, so the chosen focus is never hidden. */
export const modeLabel = (mode: ComposerMode): string => COMPOSER_MODES.find((item) => item.value === mode)?.label ?? mode

/** The accessible name of the focus chip: what it is, what it is set to, and what it does. */
export const modeChipAccessibilityLabel = (mode: ComposerMode): string => `Focus: ${modeLabel(mode)}`

/** The next mode in the list, wrapping around: what a VoiceOver increment or decrement lands on. */
export const stepMode = (mode: ComposerMode, direction: 1 | -1): ComposerMode => {
  const at = COMPOSER_MODES.findIndex((item) => item.value === mode)
  const next = (Math.max(at, 0) + direction + COMPOSER_MODES.length) % COMPOSER_MODES.length
  return COMPOSER_MODES[next]?.value ?? mode
}

/** The character count only appears once a message is long enough to need watching, and warns past a long one. */
export const COUNT_FROM = 100
export const COUNT_WARN = 400

export const characterCount = (length: number): { readonly visible: boolean; readonly warn: boolean } => ({
  visible: length > COUNT_FROM,
  warn: length > COUNT_WARN,
})

/** The editor grows to six lines of 22pt, between an 8pt and 12pt inset. Larger text sizes grow it, up to twice. */
const INPUT_LINE = 22
const INPUT_INSET_TOP = 12
const INPUT_INSET_BOTTOM = 8
const INPUT_MAX_ROWS = 6

export const inputHeights = (fontScale: number): { readonly min: number; readonly max: number; readonly line: number } => {
  const scale = Math.min(Math.max(fontScale, 1), 2)
  const line = Math.round(INPUT_LINE * scale)
  return {
    line,
    min: INPUT_INSET_TOP + line + INPUT_INSET_BOTTOM,
    max: INPUT_INSET_TOP + INPUT_MAX_ROWS * line + INPUT_INSET_BOTTOM,
  }
}

/** "Messages saved on this iPhone" line shown above the capsule while the outbox holds text. */
export const savedMessagesLabel = (count: number): string =>
  count === 1 ? "1 message saved · will send when the desktop is reachable" : `${count} messages saved · will send when the desktop is reachable`

/** The Camera row's second line in the context sheet: what it does, then how full the message is. */
export const cameraRowSubtitle = (attached: number): string =>
  attached <= 0
    ? "Photograph the part or a drawing"
    : attached >= MAX_ATTACHMENTS
      ? `${attached} of ${MAX_ATTACHMENTS} attached · remove one to add another`
      : `${attached} of ${MAX_ATTACHMENTS} attached · add another`

/** A message holds at most `MAX_ATTACHMENTS` pictures; the camera stops offering more once it is full. */
export const canAttachMore = (attached: number): boolean => attached < MAX_ATTACHMENTS

/**
 * Slash focus commands. Typing `/` in the field offers them, like nikcli's slash row, but here they move the
 * assistant's focus (General, CAD, CAM, Toolpath, G-code) instead of running a host command.
 */
export interface SlashCommand {
  /** What follows the slash, as the user types it. */
  readonly name: string
  readonly mode: ComposerMode
  readonly label: string
  readonly hint: string
}

export const SLASH_COMMANDS: readonly SlashCommand[] = COMPOSER_MODES.map((item) => ({ name: item.value, mode: item.value, label: item.label, hint: item.hint }))

/** Case and punctuation do not matter: `/G-code` and `/gcode` are the same command. */
const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "")

/**
 * The text typed after a leading slash while the command is still being typed, or undefined when the
 * field is not asking for a command (no slash, or the first word is already finished by a space).
 */
export const slashQuery = (text: string): string | undefined => {
  const match = /^\s*\/(\S*)$/.exec(text)
  return match ? normalize(match[1] ?? "") : undefined
}

/** The commands that fit what has been typed: a prefix of the name or of the label. An empty query lists all. */
export const slashCommands = (text: string): readonly SlashCommand[] => {
  const query = slashQuery(text)
  if (query === undefined) return []
  return SLASH_COMMANDS.filter((command) => normalize(command.name).startsWith(query) || normalize(command.label).startsWith(query))
}

/**
 * A finished leading command and what follows it: `/cam face the top` is CAM with "face the top".
 * Only a complete name counts, so `/ca` or a path such as `/usr/bin` is left alone as ordinary text.
 */
export const parseSlashCommand = (text: string): { readonly command: SlashCommand; readonly rest: string } | undefined => {
  const match = /^\s*\/(\S+)(?:\s+([\s\S]*))?$/.exec(text)
  if (!match) return undefined
  const word = normalize(match[1] ?? "")
  const command = SLASH_COMMANDS.find((item) => normalize(item.name) === word || normalize(item.label) === word)
  return command ? { command, rest: (match[2] ?? "").trim() } : undefined
}
