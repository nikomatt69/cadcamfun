/** Lexical colouring for the NC editor: it classifies words only and says nothing about whether a program is valid. */
export type GCodeTokenKind = "comment" | "g" | "m" | "tool" | "feed" | "seq" | "text"

export interface GCodeToken {
  readonly text: string
  readonly kind: GCodeTokenKind
}

const WORD = /\([^)]*\)|;.*$|[A-Za-z]\s*[-+]?[\d.]+|\s+|[^\s]/g

/** Splits one line into tokens whose texts concatenate back to the line. */
export function tokenizeGcodeLine(line: string): readonly GCodeToken[] {
  const tokens: GCodeToken[] = []
  for (const match of line.matchAll(WORD)) {
    const text = match[0]
    tokens.push({ text, kind: kindOf(text) })
  }
  return tokens
}

function kindOf(text: string): GCodeTokenKind {
  if (text.startsWith("(") || text.startsWith(";")) return "comment"
  switch (text[0]?.toUpperCase()) {
    case "G": return /^[Gg]\s*[-+]?[\d.]/.test(text) ? "g" : "text"
    case "M": return /^[Mm]\s*[-+]?[\d.]/.test(text) ? "m" : "text"
    case "T": return /^[Tt]\s*\d/.test(text) ? "tool" : "text"
    case "F": case "S": return /^[FfSs]\s*[-+]?[\d.]/.test(text) ? "feed" : "text"
    case "N": case "O": return /^[NnOo]\s*\d/.test(text) ? "seq" : "text"
    default: return "text"
  }
}

/** 1-based line and column of a caret offset. */
export function caretPosition(code: string, offset: number): { readonly line: number; readonly column: number } {
  const before = code.slice(0, Math.max(0, Math.min(offset, code.length)))
  const start = before.lastIndexOf("\n") + 1
  let line = 1
  for (let i = before.indexOf("\n"); i !== -1; i = before.indexOf("\n", i + 1)) line++
  return { line, column: before.length - start + 1 }
}
