/**
 * A small Markdown parser for the assistant's prose (nikcli renders it with react-native-markdown-display; this is the
 * subset the model actually emits, with no dependency, so the phone build stays as it is and the rules are testable).
 *
 * Supported: paragraphs, ATX headings, fenced code, bullet / ordered / task lists (nested), block quotes, rules,
 * tables, and the inline forms bold, italic, strike, code spans, links (+ images, shown as links) and bare URLs.
 *
 * Two properties matter more than completeness here:
 *  - It is streaming-safe. The answer arrives token by token, so an unclosed fence is a code block that is still
 *    open, and an unclosed `**` stays literal until its partner arrives. It never throws and never drops text.
 *  - It never guesses at identifiers. Tool and parameter names are full of `_` and `*` (`cad_extrude`, `*.nc`): an
 *    underscore only opens emphasis at a word boundary and a star only when it is followed by a non-space.
 *
 * Every block carries `raw`, its source text. The renderer memoizes blocks by it, so while an answer streams only the
 * block being written re-renders.
 */

export type Inline =
  | { readonly t: "text"; readonly v: string }
  | { readonly t: "code"; readonly v: string }
  | { readonly t: "br" }
  | { readonly t: "strong" | "em" | "del"; readonly c: readonly Inline[] }
  | { readonly t: "link"; readonly href: string; readonly c: readonly Inline[] }

export type Align = "left" | "center" | "right"

export interface ListItem {
  readonly blocks: readonly Block[]
  /** Set for task items (`- [x]`). */
  readonly checked?: boolean
}

export type Block =
  | { readonly t: "p"; readonly c: readonly Inline[]; readonly raw: string }
  | { readonly t: "h"; readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly c: readonly Inline[]; readonly raw: string }
  /** `closed` is false while the fence is still being written (or the answer ended inside it). */
  | { readonly t: "code"; readonly lang: string; readonly v: string; readonly closed: boolean; readonly raw: string }
  | { readonly t: "list"; readonly ordered: boolean; readonly start: number; readonly items: readonly ListItem[]; readonly raw: string }
  | { readonly t: "quote"; readonly blocks: readonly Block[]; readonly raw: string }
  | { readonly t: "hr"; readonly raw: string }
  | { readonly t: "table"; readonly align: readonly Align[]; readonly head: readonly (readonly Inline[])[]; readonly rows: readonly (readonly (readonly Inline[])[])[]; readonly raw: string }

const MAX_DEPTH = 6

/* ----------------------------------------------------------------------------------------------- inline */

const PUNCT = /[!-/:-@[-`{-~]/
const isSpace = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch)
const isWord = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}]/u.test(ch)

/** Only links that leave the app through the system browser or mail/phone: never `javascript:` or a custom scheme. */
export function safeHref(href: string): string | null {
  const value = href.trim().replace(/^<|>$/g, "")
  if (/^(?:https?:\/\/|mailto:|tel:)/i.test(value) && !/\s/.test(value)) return value
  return null
}

/** Index of the next backtick run of exactly `n` backticks at or after `from`, or -1. */
function findBacktickRun(s: string, from: number, n: number): number {
  let i = from
  while (i < s.length) {
    if (s[i] !== "`") { i++; continue }
    let run = 1
    while (s[i + run] === "`") run++
    if (run === n) return i
    i += run
  }
  return -1
}

/** The closing delimiter of an emphasis run: exact length, preceded by non-space, skipping code spans and escapes. */
function findCloser(s: string, from: number, ch: string, n: number): number {
  let j = from
  while (j < s.length) {
    const c = s[j]
    if (c === "\\") { j += 2; continue }
    if (c === "`") {
      let run = 1
      while (s[j + run] === "`") run++
      const close = findBacktickRun(s, j + run, run)
      j = close >= 0 ? close + run : j + run
      continue
    }
    if (c === ch) {
      let run = 1
      while (s[j + run] === ch) run++
      if (run === n && j > from && !isSpace(s[j - 1]) && (ch !== "_" || !isWord(s[j + run]))) return j
      j += run
      continue
    }
    j++
  }
  return -1
}

/** `[text](url "title")` starting at `[`: the text span, the destination and where it ends; null when it is not a link. */
function matchLink(s: string, at: number): { text: string; href: string; end: number } | null {
  let depth = 0
  let j = at
  for (; j < s.length; j++) {
    const c = s[j]
    if (c === "\\") { j++; continue }
    if (c === "[") depth++
    else if (c === "]") { depth--; if (depth === 0) break }
  }
  if (j >= s.length || s[j + 1] !== "(") return null
  let k = j + 2
  let parens = 1
  for (; k < s.length; k++) {
    const c = s[k]
    if (c === "\\") { k++; continue }
    if (c === "(") parens++
    else if (c === ")") { parens--; if (parens === 0) break }
    else if (c === "\n") return null
  }
  if (k >= s.length) return null
  const destination = s.slice(j + 2, k).trim()
  const href = /^<([^>]*)>/.exec(destination)?.[1] ?? destination.split(/\s+/)[0] ?? ""
  return { text: s.slice(at + 1, j), href, end: k + 1 }
}

/** A bare URL at `at`, without the punctuation that ends the sentence rather than the address. */
function matchBareUrl(s: string, at: number): string | null {
  const match = /^https?:\/\/[^\s<>]+/i.exec(s.slice(at, at + 2048))
  if (!match) return null
  let url = match[0]
  for (;;) {
    const last = url[url.length - 1]
    if (last === undefined) break
    const unbalanced = last === ")" && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)
    if (/[.,;:!?'"\]}>*_~]/.test(last) || unbalanced) url = url.slice(0, -1)
    else break
  }
  return url.length > "https://".length ? url : null
}

export function parseInline(s: string, depth = 0): readonly Inline[] {
  const out: Inline[] = []
  let text = ""
  const flush = () => {
    if (text) { out.push({ t: "text", v: text }); text = "" }
  }
  let i = 0
  while (i < s.length) {
    const ch = s[i]!
    if (ch === "\\" && i + 1 < s.length && PUNCT.test(s[i + 1]!)) { text += s[i + 1]; i += 2; continue }
    if (ch === "\n") {
      text = text.replace(/ +$/, "")
      flush()
      out.push({ t: "br" })
      i++
      continue
    }
    if (ch === "`") {
      let n = 1
      while (s[i + n] === "`") n++
      const close = findBacktickRun(s, i + n, n)
      if (close >= 0) {
        flush()
        let v = s.slice(i + n, close).replace(/\n/g, " ")
        if (v.length > 2 && v.startsWith(" ") && v.endsWith(" ") && v.trim()) v = v.slice(1, -1)
        out.push({ t: "code", v })
        i = close + n
        continue
      }
      text += s.slice(i, i + n)
      i += n
      continue
    }
    if ((ch === "[" || (ch === "!" && s[i + 1] === "[")) && depth < MAX_DEPTH) {
      const image = ch === "!"
      const link = matchLink(s, image ? i + 1 : i)
      const href = link ? safeHref(link.href) : null
      if (link && href) {
        flush()
        const label = link.text.trim() || (image ? "image" : href)
        out.push({ t: "link", href, c: parseInline(label, depth + 1) })
        i = link.end
        continue
      }
      if (link) {
        // Not a link the phone may open (relative path, odd scheme): the words stay, the destination goes.
        flush()
        out.push(...parseInline(link.text, depth + 1))
        i = link.end
        continue
      }
    }
    if (ch === "<") {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(s.slice(i, i + 2048))
      if (auto) {
        flush()
        out.push({ t: "link", href: auto[1]!, c: [{ t: "text", v: auto[1]! }] })
        i += auto[0].length
        continue
      }
    }
    if ((ch === "h" || ch === "H") && !isWord(s[i - 1]) && /^https?:\/\//i.test(s.slice(i, i + 8))) {
      const url = matchBareUrl(s, i)
      if (url) {
        flush()
        out.push({ t: "link", href: url, c: [{ t: "text", v: url }] })
        i += url.length
        continue
      }
    }
    if ((ch === "*" || ch === "_" || ch === "~") && depth < MAX_DEPTH) {
      let n = 1
      while (s[i + n] === ch) n++
      const valid = ch === "~" ? n === 2 : n <= 3
      const opens = valid && !isSpace(s[i + n]) && (ch !== "_" || !isWord(s[i - 1]))
      const close = opens ? findCloser(s, i + n, ch, n) : -1
      if (close >= 0) {
        flush()
        const inner = parseInline(s.slice(i + n, close), depth + 1)
        out.push(ch === "~" ? { t: "del", c: inner } : n === 1 ? { t: "em", c: inner } : n === 2 ? { t: "strong", c: inner } : { t: "strong", c: [{ t: "em", c: inner }] })
        i = close + n
        continue
      }
      text += s.slice(i, i + n)
      i += n
      continue
    }
    text += ch
    i++
  }
  flush()
  return out
}

/* ------------------------------------------------------------------------------------------------ blocks */

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/
const HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE = /^ {0,3}>/
const LIST_MARKER = /^( {0,3})([-*+]|\d{1,9}[.)])( +|$)(.*)$/
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/

const isBlank = (line: string | undefined): boolean => line === undefined || line.trim() === ""
const indentOf = (line: string): number => line.length - line.trimStart().length

function openFence(line: string): { char: string; length: number; lang: string; indent: number } | null {
  const match = FENCE.exec(line)
  if (!match) return null
  const marker = match[1]!
  const info = match[2]!.trim()
  if (marker[0] === "`" && info.includes("`")) return null
  const lang = (info.split(/\s+/)[0] ?? "").replace(/^\{\.?|\}$/g, "").toLowerCase()
  return { char: marker[0]!, length: marker.length, lang, indent: indentOf(line) }
}

function splitCells(line: string): string[] {
  let body = line.trim()
  if (body.startsWith("|")) body = body.slice(1)
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1)
  const cells: string[] = []
  let cell = ""
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!
    if (c === "\\" && body[i + 1] === "|") { cell += "|"; i++; continue }
    if (c === "|") { cells.push(cell.trim()); cell = ""; continue }
    cell += c
  }
  cells.push(cell.trim())
  return cells
}

const startsTable = (lines: readonly string[], at: number): boolean =>
  lines[at]!.includes("|") && at + 1 < lines.length && lines[at + 1]!.includes("|") && TABLE_DELIMITER.test(lines[at + 1]!) && lines[at + 1]!.includes("-")

/** A line that cannot continue a paragraph because it opens another block. */
function opensBlock(lines: readonly string[], at: number): boolean {
  const line = lines[at]!
  return openFence(line) !== null || (HEADING.test(line) && /^ {0,3}#/.test(line)) || HR.test(line) || QUOTE.test(line) || LIST_MARKER.test(line) || startsTable(lines, at)
}

function parseList(lines: readonly string[], start: number): { block: Block; next: number } {
  const first = LIST_MARKER.exec(lines[start]!)!
  const ordered = /\d/.test(first[2]!)
  const markerIndent = first[1]!.length
  const items: ListItem[] = []
  let i = start
  while (i < lines.length) {
    const match = LIST_MARKER.exec(lines[i]!)
    if (!match || match[1]!.length > markerIndent + 1 || /\d/.test(match[2]!) !== ordered) break
    if (match[1]!.length < markerIndent && items.length > 0) break
    const spaces = match[3]!.length
    const contentIndent = match[1]!.length + match[2]!.length + (spaces > 4 || spaces === 0 ? 1 : spaces)
    const body = [match[4]!]
    i++
    while (i < lines.length) {
      const line = lines[i]!
      if (isBlank(line)) {
        let j = i
        while (j < lines.length && isBlank(lines[j])) j++
        if (j < lines.length && indentOf(lines[j]!) > markerIndent) {
          for (let k = i; k < j; k++) body.push("")
          i = j
          continue
        }
        break
      }
      const indent = indentOf(line)
      if (indent > markerIndent) {
        body.push(line.slice(Math.min(indent, contentIndent)))
        i++
        continue
      }
      // A lazy continuation: plain text right under the item's own text belongs to it.
      const previous = body[body.length - 1]
      if (!isBlank(previous) && !opensBlock(lines, i) && !(body.length > 0 && openFence(body[body.length - 1]!))) {
        body.push(line.trim())
        i++
        continue
      }
      break
    }
    let checked: boolean | undefined
    const task = /^\[( |x|X)\]\s+/.exec(body[0]!)
    if (task) {
      checked = task[1]!.toLowerCase() === "x"
      body[0] = body[0]!.slice(task[0].length)
    }
    items.push({ blocks: parseBlocks(body), ...(checked === undefined ? {} : { checked }) })
  }
  const startNumber = ordered ? Number.parseInt(first[2]!, 10) : 1
  return { block: { t: "list", ordered, start: startNumber, items, raw: lines.slice(start, i).join("\n") }, next: i }
}

function parseBlocks(lines: readonly string[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (isBlank(line)) { i++; continue }

    const fence = openFence(line)
    if (fence) {
      const body: string[] = []
      const closing = new RegExp(`^ {0,3}${fence.char === "`" ? "`" : "~"}{${fence.length},}\\s*$`)
      let j = i + 1
      let closed = false
      for (; j < lines.length; j++) {
        if (closing.test(lines[j]!)) { closed = true; break }
        const l = lines[j]!
        body.push(l.slice(Math.min(indentOf(l), fence.indent)))
      }
      const end = closed ? j + 1 : j
      blocks.push({ t: "code", lang: fence.lang, v: body.join("\n"), closed, raw: lines.slice(i, end).join("\n") })
      i = end
      continue
    }

    const heading = HEADING.exec(line)
    if (heading && /^ {0,3}#/.test(line)) {
      blocks.push({ t: "h", level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, c: parseInline(heading[2] ?? ""), raw: line })
      i++
      continue
    }

    if (HR.test(line)) { blocks.push({ t: "hr", raw: line }); i++; continue }

    if (QUOTE.test(line)) {
      const inner: string[] = []
      let j = i
      while (j < lines.length && QUOTE.test(lines[j]!)) { inner.push(lines[j]!.replace(/^ {0,3}> ?/, "")); j++ }
      blocks.push({ t: "quote", blocks: parseBlocks(inner), raw: lines.slice(i, j).join("\n") })
      i = j
      continue
    }

    if (LIST_MARKER.test(line)) {
      const { block, next } = parseList(lines, i)
      blocks.push(block)
      i = next
      continue
    }

    if (startsTable(lines, i)) {
      const head = splitCells(line)
      const align = splitCells(lines[i + 1]!).map((cell): Align => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left")
      const rows: (readonly Inline[])[][] = []
      let j = i + 2
      while (j < lines.length && !isBlank(lines[j]) && lines[j]!.includes("|")) {
        const cells = splitCells(lines[j]!)
        rows.push(head.map((_, column) => parseInline(cells[column] ?? "")))
        j++
      }
      blocks.push({ t: "table", align: head.map((_, column) => align[column] ?? "left"), head: head.map((cell) => parseInline(cell)), rows, raw: lines.slice(i, j).join("\n") })
      i = j
      continue
    }

    const paragraph: string[] = [line.trimEnd()]
    let j = i + 1
    while (j < lines.length && !isBlank(lines[j]) && !opensBlock(lines, j)) { paragraph.push(lines[j]!.trimEnd()); j++ }
    blocks.push({ t: "p", c: parseInline(paragraph.map((l, index) => (index === 0 ? l.trimStart() : l.trim())).join("\n")), raw: lines.slice(i, j).join("\n") })
    i = j
  }
  return blocks
}

const CACHE_LIMIT = 48
const cache = new Map<string, readonly Block[]>()

/** The answer as blocks. Parsing the same text twice (a re-render, a restored row) is free. */
export function parseMarkdown(text: string): readonly Block[] {
  const hit = cache.get(text)
  if (hit) return hit
  const blocks = parseBlocks(text.replace(/\r\n?/g, "\n").replaceAll("\t", "    ").split("\n"))
  cache.set(text, blocks)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  return blocks
}

/* ------------------------------------------------------------------------------------------------ queries */

/** The words of some inline content, with the formatting taken off. */
export function inlineText(nodes: readonly Inline[]): string {
  return nodes.map((node) => node.t === "text" || node.t === "code" ? node.v : node.t === "br" ? " " : inlineText(node.c)).join("")
}

export const codeLineCount = (code: string): number => (code === "" ? 0 : code.split("\n").length)

/** What a screen reader says for a block: the words, and for code only that it is code (reading G-code aloud helps nobody). */
function blockSpeech(block: Block): string {
  switch (block.t) {
    case "p": return inlineText(block.c)
    case "h": return inlineText(block.c)
    case "code": {
      const lines = codeLineCount(block.v)
      return `${block.lang ? `${block.lang} ` : ""}code block, ${lines} ${lines === 1 ? "line" : "lines"}`
    }
    case "list": return block.items.map((item, index) => `${block.ordered ? `${block.start + index}.` : "•"} ${item.blocks.map(blockSpeech).join(" ")}`).join("\n")
    case "quote": return block.blocks.map(blockSpeech).join("\n")
    case "hr": return ""
    case "table": return [block.head, ...block.rows].map((row) => row.map(inlineText).join(", ")).join(". ")
  }
}

/** One label for the whole message when a screen reader treats it as a single element. */
export const speechText = (blocks: readonly Block[]): string => blocks.map(blockSpeech).filter(Boolean).join("\n")

const inlineHasLink = (nodes: readonly Inline[]): boolean => nodes.some((node) => node.t === "link" || ((node.t === "strong" || node.t === "em" || node.t === "del") && inlineHasLink(node.c)))

/**
 * Whether anything in the answer can be activated on its own (a code block's Copy, a link). Such an answer cannot be one
 * flat accessibility element, or VoiceOver users could never reach those controls.
 */
export function hasInteractiveContent(blocks: readonly Block[]): boolean {
  return blocks.some((block) => {
    switch (block.t) {
      case "code": return true
      case "p": case "h": return inlineHasLink(block.c)
      case "list": return block.items.some((item) => hasInteractiveContent(item.blocks))
      case "quote": return hasInteractiveContent(block.blocks)
      case "table": return [block.head, ...block.rows].some((row) => row.some(inlineHasLink))
      case "hr": return false
    }
  })
}
