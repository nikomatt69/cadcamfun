/**
 * The one way text that somebody else wrote reaches the model as data (spec 64, prompt-injection defence).
 *
 * Most of what the assistant reads was typed by a person or a program that is not the user at this moment: layer and element
 * names in a drawing, comments in a G-code file, a DXF the user downloaded, notes an earlier session saved, memory Brain
 * consolidated, a skill pasted from the internet. None of it may be mistaken for the system prompt, for the framing the app put
 * around it, or for a message of the user. The defence is the same in every renderer, so it lives here once:
 *
 * 1. strip what a reader cannot see or a terminal would interpret (NUL, ESC, C1 controls, bidi overrides, zero-width and
 *    "tag" characters that hide a second message inside a visible one);
 * 2. neutralise text that imitates our own delimiters (a closing `</project_memory>`, a `<system-reminder>` block, a chat
 *    template token, a `Current context:` header at the start of a line) by replacing its leading `<` with `‹`;
 * 3. cap the length and say how much was left out;
 * 4. label the source, so the model knows where the data came from.
 *
 * Nothing here decides whether a sentence "sounds like an instruction": that cannot be detected reliably. The base prompt says
 * names, notes, attachments and document text are evidence; this module makes sure the frame around them cannot be forged.
 * Every function is total and idempotent: sealing sealed text changes nothing.
 */

/** C0 (except tab and line feed), DEL, C1, line/paragraph separators (turned into a line feed first), zero-width and bidi controls, tag characters. */
const INVISIBLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u180e\u200b\u2060-\u2064\u2066-\u2069\u202a-\u202e\ufeff\u{e0000}-\u{e007f}]/gu

/**
 * Tag names our own prompts and renderers use as delimiters, or that a model reads as a role / reminder boundary.
 * `memory action` is the tag of the project rules block (`<memory action context_read>`).
 */
const RESERVED_TAGS = [
  "system", "system[-_]reminder", "developer", "assistant", "user", "human", "instructions?", "context", "context[-_]omitted",
  "project[-_]memory", "user[-_]habits", "memory\\s+action", "untrusted", "editor[-_]state", "env", "language", "thinking",
  "subagent[-_]report", "security[-_](?:warning|note)", "tool[-_](?:call|result|use|response)s?", "function[-_](?:call|result)s?",
  "available[-_]skills", "skill(?:[-_]content)?"
]
const RESERVED_TAG = new RegExp(`<(?=\\s*/?\\s*(?:${RESERVED_TAGS.join("|")})(?![A-Za-z0-9]))`, "gi")
/** `<|im_start|>`, `<|endoftext|>`: chat-template tokens of open models. */
const TEMPLATE_TOKEN = /<\|([^|\n]{0,60})\|>/g
const TEMPLATE_TOKEN_OPEN = /<(?=\|)/g
/** Llama-style `[INST]`, `<<SYS>>`. */
const LLAMA_MARKER = /\[(\/?)INST\]/gi
const LLAMA_SYS = /<<(?=\s*\/?\s*SYS\b)/gi
/** The header the turn prompt puts above the context; a copy at the start of a line would end the real block. */
const CONTEXT_HEADER = /^([ \t]*)(current context)[ \t]*:/gim

/** Removes characters that are invisible or interpreted by a terminal; keeps `\n` and `\t`, turns `\r` and U+2028/9 into `\n`. */
export const stripInvisible = (text: string): string =>
  text.replace(/\r\n?|[\u2028\u2029\u0085]/g, "\n").replace(INVISIBLE, "")

/** Makes text that imitates a delimiter of ours harmless. The text stays readable: only the leading `<` or `[` changes. */
export const neutralizeDelimiters = (text: string): string =>
  text
    .replace(RESERVED_TAG, "‹")
    .replace(TEMPLATE_TOKEN, "‹|$1|›")
    .replace(TEMPLATE_TOKEN_OPEN, "‹")
    .replace(LLAMA_SYS, "‹‹")
    .replace(LLAMA_MARKER, "(‹$1INST›)")
    .replace(CONTEXT_HEADER, "$1$2 -")

/** Both steps, for text that may span lines. */
export const sealText = (text: string): string => neutralizeDelimiters(stripInvisible(text))

/** Cuts at `max` characters without splitting a surrogate pair. */
const cut = (text: string, max: number): string => {
  if (text.length <= max) return text
  const end = max > 0 && (text.charCodeAt(max - 1) & 0xfc00) === 0xd800 ? max - 1 : max
  return text.slice(0, Math.max(0, end))
}

/**
 * One line of untrusted text (a layer name, a note, a G-code line): no line breaks, whitespace collapsed, delimiters
 * neutralised, at most `max` characters (an ellipsis marks a cut).
 */
export const untrustedLine = (text: unknown, max = 300): string => {
  const raw = typeof text === "string" ? text : ""
  const line = sealText(raw).replace(/\s+/g, " ").trim()
  if (line.length <= max) return line
  return `${cut(line, Math.max(0, max - 1)).trimEnd()}…`
}

export interface UntrustedBlockOptions {
  /** What the text is and where it came from, e.g. `attachment "notes.txt"`. Shown to the model. */
  readonly source: string
  readonly text: string
  /** Characters of the body that are published; the rest is counted, not shown. Default 6 000. */
  readonly max?: number
}

/**
 * A multi-line piece of untrusted text inside a labelled block. The body cannot close the block or open another one, so
 * whatever it says stays inside `<untrusted>` and is read as data, whatever its wording.
 */
export const untrustedBlock = ({ source, text, max = 6_000 }: UntrustedBlockOptions): string => {
  const limit = Math.max(0, Math.floor(Number.isFinite(max) ? max : 6_000))
  const sealed = sealText(text).replace(/\n{4,}/g, "\n\n\n").trim()
  const body = sealed.length <= limit ? sealed : `${cut(sealed, limit).trimEnd()}\n[... ${sealed.length - cut(sealed, limit).length} more characters not shown]`
  return `<untrusted source=${JSON.stringify(untrustedLine(source, 120).replace(/"/g, "'"))}>\n${body}\n</untrusted>`
}
