import { type DocsIndexEntry, docsIndex } from "../data/docsIndex"
import { sidebarGroup } from "../data/docsSidebar"

/**
 * Tiny lexical retrieval over the docs index. No vector store, no build step:
 * the corpus is ~25 pages, so keyword scoring over title + sidebar group +
 * slug + curated keywords + summary is enough to pick the pages to ground an
 * answer on. Same shape as nikcli `packages/web/src/lib/docsRetrieval.ts`.
 */

const STOPWORDS = new Set([
  // English
  "a", "about", "after", "all", "also", "am", "an", "and", "any", "are", "as", "at", "be", "been", "before",
  "being", "but", "by", "can", "cant", "could", "did", "do", "does", "doesnt", "doing", "dont", "for", "from",
  "get", "gets", "give", "had", "has", "have", "how", "i", "if", "im", "in", "into", "is", "it", "its", "just",
  "like", "make", "me", "my", "need", "no", "not", "of", "on", "one", "only", "or", "other", "our", "out",
  "please", "should", "so", "some", "tell", "than", "that", "the", "their", "them", "then", "there", "these",
  "they", "this", "those", "to", "up", "use", "using", "very", "want", "was", "we", "were", "what", "when",
  "where", "which", "who", "why", "will", "with", "without", "would", "you", "your",
  // Italian
  "che", "chi", "come", "con", "cosa", "dei", "del", "della", "delle", "di", "dove", "e", "ed", "fare", "gli",
  "ha", "ho", "il", "in", "la", "le", "lo", "mi", "mio", "ne", "non", "per", "perche", "piu", "posso", "puo",
  "qual", "quale", "quando", "quanto", "se", "si", "sono", "su", "sul", "sulla", "un", "una", "uno", "vorrei",
])

/**
 * CAD/CAM words people type that the docs spell differently. Each query token
 * also scores as its canonical form, so "fresatura" finds the CAM page and
 * "gcode" finds G-code posts.
 */
const SYNONYMS: Record<string, string> = {
  gcode: "g-code",
  nc: "g-code",
  cnc: "cam",
  fresatura: "milling",
  fresa: "tool",
  utensile: "tool",
  utensili: "tool",
  percorso: "toolpath",
  percorsi: "toolpaths",
  postprocessor: "post",
  postprocessore: "post",
  post_processor: "post",
  grezzo: "stock",
  attrezzatura: "fixture",
  staffaggio: "fixture",
  raccordo: "fillet",
  raccordi: "fillet",
  smusso: "chamfer",
  foro: "hole",
  fori: "hole",
  estrusione: "extrude",
  schizzo: "sketch",
  vincoli: "constraints",
  assieme: "assembly",
  disegno: "drawing",
  tavola: "drawing",
  database: "sqlite",
  migrazione: "migration",
  migrazioni: "migrations",
  installare: "install",
  installazione: "install",
  avvio: "quickstart",
  agente: "agent",
  agenti: "agents",
  assistente: "ai",
  rilascio: "release",
  firma: "signing",
  telefono: "mobile",
  storico: "history",
  cronologia: "history",
  brep: "b-rep",
  mesh: "mesh",
}

export type ScoredDoc = DocsIndexEntry & { score: number }

export function tokenize(query: string) {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[`*_>#[\]()]/g, " ")
    .split(/[^a-z0-9@/.-]+/)
    .map((token) => token.replace(/^[./-]+|[./-]+$/g, ""))
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .flatMap((token) => (SYNONYMS[token] ? [token, SYNONYMS[token]] : [token]))
}

function countOccurrences(haystack: string, needle: string) {
  if (!needle) return 0
  let count = 0
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return count
    count += 1
    from = at + needle.length
  }
}

function scoreEntry(entry: DocsIndexEntry, query: string, tokens: string[]) {
  const haystackTitle = `${entry.title} ${sidebarGroup(entry.href) ?? ""}`.toLowerCase()
  const slug = entry.href.replace("/docs", "").replace(/[/-]/g, " ").trim()
  const summary = entry.summary.toLowerCase()
  const keywords = entry.keywords.map((keyword) => keyword.toLowerCase())

  let score = 0

  // Multi-word keywords ("work packages") only match on the raw query.
  for (const keyword of keywords) {
    if (keyword.includes(" ") && query.includes(keyword)) score += 8
  }

  for (const token of tokens) {
    if (slug && slug.split(" ").includes(token)) score += 7
    else if (slug.includes(token)) score += 3

    if (haystackTitle.split(/[^a-z0-9-]+/).includes(token)) score += 6

    if (keywords.includes(token)) score += 5
    else if (keywords.some((keyword) => keyword.includes(token))) score += 2

    score += Math.min(countOccurrences(summary, token), 2) * 2
  }

  return score
}

/**
 * Ranks docs pages for a question. `currentPath` (the page the user is reading)
 * is always included so "how do I do this here?" questions stay grounded.
 */
export function selectDocs(input: { query: string; currentPath?: string; limit?: number }): ScoredDoc[] {
  const limit = input.limit ?? 3
  const query = input.query.toLowerCase()
  const tokens = tokenize(input.query)

  const ranked = docsIndex
    .map((entry) => ({ ...entry, score: scoreEntry(entry, query, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.href.localeCompare(b.href))

  const selected: ScoredDoc[] = []
  const current = input.currentPath ? docsIndex.find((entry) => entry.href === input.currentPath) : undefined
  if (current) selected.push({ ...current, score: Number.POSITIVE_INFINITY })

  for (const entry of ranked) {
    if (selected.length >= limit) break
    if (selected.some((picked) => picked.href === entry.href)) continue
    selected.push(entry)
  }

  // Nothing matched and no current page: fall back to the overview.
  if (selected.length === 0) {
    const overview = docsIndex.find((entry) => entry.href === "/docs")
    if (overview) selected.push({ ...overview, score: 0 })
  }

  return selected
}

/**
 * Trims a long page down to a character budget by keeping the intro plus the
 * highest-scoring `##` sections, so the model sees the relevant parts instead
 * of an arbitrary prefix.
 */
export function condenseMarkdown(markdown: string, tokens: string[], budget: number) {
  if (markdown.length <= budget) return markdown

  const parts = markdown.split(/\n(?=#{2,3} )/)
  const intro = parts.shift() ?? ""
  const scored = parts
    .map((section, order) => {
      const haystack = section.toLowerCase()
      const score = tokens.reduce((total, token) => total + Math.min(countOccurrences(haystack, token), 4), 0)
      return { section, order, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  const kept: typeof scored = []
  let used = Math.min(intro.length, budget)
  for (const entry of scored) {
    if (used + entry.section.length > budget) continue
    kept.push(entry)
    used += entry.section.length
  }

  kept.sort((a, b) => a.order - b.order)
  const body = [intro.slice(0, budget), ...kept.map((entry) => entry.section)].join("\n").trim()

  const omitted = parts.length - kept.length
  return omitted > 0
    ? `${body}\n\n_(${omitted} further section${omitted === 1 ? "" : "s"} of this page were omitted — link the user to the page for the full reference.)_`
    : body
}
