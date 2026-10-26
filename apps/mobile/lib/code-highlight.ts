/**
 * Line-level syntax colour for the code the assistant shows. nikcli highlights general-purpose code; the code a CAD/CAM
 * answer carries is G-code and JSON (tool inputs, parameters), so those two are tokenized and everything else stays
 * plain rather than being coloured wrongly. Pure: tokens name a *kind*, the renderer maps kinds to palette colours.
 */

export type TokenKind = "plain" | "comment" | "command" | "motion" | "param" | "feed" | "number" | "string" | "key" | "keyword" | "punct"

export interface Token {
  readonly text: string
  readonly kind: TokenKind
}

export type CodeLanguage = "gcode" | "json" | "plain"

const GCODE_LANGS = new Set(["gcode", "g-code", "g_code", "nc", "ngc", "cnc", "tap", "gc", "cam", "fanuc", "haas", "mach3", "linuxcnc", "grbl", "marlin", "heidenhain"])
const JSON_LANGS = new Set(["json", "jsonc", "json5"])

/** A line that opens like a program block (`N10 G90`, `G21`, `M3 S12000`): enough to colour an untagged fence. */
const LOOKS_LIKE_GCODE = /^\s*(?:N\d+\s+)?[GM]\d+(?:\.\d+)?(?:\s|$)/i

/** The language to colour a fence as: its tag, or for an untagged fence what its first line looks like. */
export function languageOf(lang: string, code: string): CodeLanguage {
  const tag = lang.trim().toLowerCase()
  if (GCODE_LANGS.has(tag)) return "gcode"
  if (JSON_LANGS.has(tag)) return "json"
  if (tag) return "plain"
  const first = code.split("\n", 12).find((line) => line.trim() !== "")
  if (first && LOOKS_LIKE_GCODE.test(first)) return "gcode"
  return "plain"
}

const GCODE_TOKEN = /\(.*?(?:\)|$)|;.*$|%|[NnGgMm][-+]?\d+(?:\.\d+)?|[FfSsTt][-+]?\d*\.?\d+|[A-Za-z][-+]?\d*\.?\d+|\s+|[^\sA-Za-z%;(]+|[\s\S]/g

function gcodeLine(line: string): Token[] {
  const tokens: Token[] = []
  for (const match of line.matchAll(GCODE_TOKEN)) {
    const text = match[0]
    const first = text[0]!
    const upper = first.toUpperCase()
    let kind: TokenKind = "plain"
    if (first === ";" || first === "(") kind = "comment"
    else if (first === "%") kind = "punct"
    else if (/\s/.test(first)) kind = "plain"
    else if (upper === "N" && /\d/.test(text[1] ?? "")) kind = "punct"
    else if (upper === "G" && /^[Gg]\d/.test(text)) kind = "command"
    else if (upper === "M" && /^[Mm]\d/.test(text)) kind = "motion"
    else if ((upper === "F" || upper === "S" || upper === "T") && /\d/.test(text)) kind = "feed"
    else if (/^[A-Za-z][-+]?\d*\.?\d+$/.test(text)) kind = "param"
    else if (/^[-+]?\d*\.?\d+$/.test(text)) kind = "number"
    tokens.push({ text, kind })
  }
  return tokens
}

const JSON_TOKEN = /"(?:[^"\\]|\\.)*"(?=\s*:)|"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|\btrue\b|\bfalse\b|\bnull\b|[{}[\],:]|\s+|[^\s"{}[\],:\d-]+|[\s\S]/g

function jsonLine(line: string): Token[] {
  const tokens: Token[] = []
  for (const match of line.matchAll(JSON_TOKEN)) {
    const text = match[0]
    const first = text[0]!
    let kind: TokenKind = "plain"
    if (first === '"') kind = line.slice((match.index ?? 0) + text.length).trimStart().startsWith(":") ? "key" : "string"
    else if (/^-?\d/.test(text)) kind = "number"
    else if (text === "true" || text === "false" || text === "null") kind = "keyword"
    else if (/^[{}[\],:]$/.test(text)) kind = "punct"
    tokens.push({ text, kind })
  }
  return tokens
}

/** One line as coloured runs. The runs always join back to the line, so nothing the model wrote is lost. */
export function highlightLine(language: CodeLanguage, line: string): readonly Token[] {
  if (line === "") return []
  const tokens = language === "gcode" ? gcodeLine(line) : language === "json" ? jsonLine(line) : [{ text: line, kind: "plain" as const }]
  // Adjacent runs of one kind merge, so a long line is a handful of spans instead of hundreds.
  const merged: Token[] = []
  for (const token of tokens) {
    const last = merged[merged.length - 1]
    if (last && last.kind === token.kind) merged[merged.length - 1] = { text: last.text + token.text, kind: token.kind }
    else merged.push(token)
  }
  return merged
}

/** A block of code as runs per line (the renderer joins the lines with a newline). */
export const highlightCode = (language: CodeLanguage, code: string): readonly (readonly Token[])[] =>
  code.split("\n").map((line) => highlightLine(language, line))
