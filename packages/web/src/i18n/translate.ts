import domino from "@mixmark-io/domino"
import { createHash } from "node:crypto"
import { DEFAULT_LOCALE, localeInfo, localizePath, type Locale } from "./locales"

/**
 * Body translation for localized docs pages. The English article HTML is the
 * source; every visible text node outside code/pre/script is a segment.
 * Segments go to Workers AI in one batch and are cached in KV by content
 * hash, so a page is translated once per language until its text changes.
 * Without an AI binding (local dev, tests) the caller gets the English
 * segments back and shows the pending notice — chrome stays translated.
 */

export type SegmentTranslator = (segments: ReadonlyArray<string>, locale: Locale) => Promise<ReadonlyArray<string>>

const SKIP = new Set(["CODE", "PRE", "SCRIPT", "STYLE", "KBD", "SVG", "BUTTON", "TEXTAREA"])

interface TextNodeLike { nodeType: number; nodeValue: string | null; parentNode: { nodeName: string; hasAttribute?: (n: string) => boolean } | null }

function collectSegments(document: Document): { segments: string[]; nodes: TextNodeLike[] } {
  const segments: string[] = []
  const nodes: TextNodeLike[] = []
  const walk = (node: Node): void => {
    if (SKIP.has(node.nodeName)) return
    const el = node as unknown as { hasAttribute?: (n: string) => boolean }
    if (el.hasAttribute?.("data-llm-exclude")) return
    if (node.nodeType === 3) {
      const text = node.nodeValue ?? ""
      if (text.trim().length > 0) { segments.push(text); nodes.push(node as unknown as TextNodeLike) }
      return
    }
    node.childNodes.forEach((child) => walk(child as Node))
  }
  walk(document.body as unknown as Node)
  return { segments, nodes }
}

/** Localize `/docs/...` links inside an article; other links stay as they are. */
function rewriteLinks(document: Document, locale: Locale): void {
  document.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? ""
    if (href.startsWith("/docs")) anchor.setAttribute("href", localizePath(href, locale))
  })
}

export interface TranslatedArticle { html: string; translated: boolean; segments: number }

/**
 * Translate an article's inner HTML. `translator` is injectable for tests;
 * a translator that throws or returns a wrong-shaped result leaves the
 * English text in place (`translated: false`) instead of breaking the page.
 */
export async function translateArticleHtml(articleHtml: string, locale: Locale, translator?: SegmentTranslator): Promise<TranslatedArticle> {
  if (locale === DEFAULT_LOCALE) return { html: articleHtml, translated: true, segments: 0 }
  const document = domino.createDocument(`<body>${articleHtml}</body>`, true)
  rewriteLinks(document, locale)
  const { segments, nodes } = collectSegments(document)
  if (!translator || segments.length === 0) {
    return { html: document.body.innerHTML, translated: false, segments: segments.length }
  }
  try {
    const out = await translator(segments, locale)
    if (out.length !== segments.length) return { html: document.body.innerHTML, translated: false, segments: segments.length }
    nodes.forEach((node, i) => {
      const src = segments[i]!
      const lead = src.match(/^\s*/)?.[0] ?? ""
      const trail = src.match(/\s*$/)?.[0] ?? ""
      node.nodeValue = `${lead}${(out[i] ?? src).trim()}${trail}`
    })
    return { html: document.body.innerHTML, translated: true, segments: segments.length }
  } catch {
    return { html: document.body.innerHTML, translated: false, segments: segments.length }
  }
}

const hash = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 24)

interface AiBinding { run(model: string, inputs: Record<string, unknown>): Promise<unknown> }
interface KvBinding { get(k: string): Promise<string | null>; put(k: string, v: string, o?: { expirationTtl?: number }): Promise<void> }

/** Workers-AI translator with a KV segment cache. Returns undefined without an AI binding. */
export function workersAiTranslator(env: { AI?: AiBinding; SESSIONS?: KvBinding; DOCS_ASSISTANT_MODEL?: string } | undefined, fetchFallback?: never): SegmentTranslator | undefined {
  if (!env?.AI) return undefined
  const ai = env.AI
  const kv = env.SESSIONS
  const model = env.DOCS_ASSISTANT_MODEL ?? "@cf/meta/llama-3.1-8b-instruct-fast"
  return async (segments, locale) => {
    const results: string[] = new Array(segments.length).fill("")
    const missing: { index: number; text: string; key: string }[] = []
    for (let i = 0; i < segments.length; i++) {
      const key = `i18n:v1:${locale}:${hash(segments[i]!)}`
      const cached = kv ? await kv.get(key).catch(() => null) : null
      if (cached) results[i] = cached
      else missing.push({ index: i, text: segments[i]!, key })
    }
    // Long pages carry hundreds of segments: translate in small batches so
    // one model reply never has to hold a whole page (and cannot truncate it).
    const BATCH = 40
    for (let start = 0; start < missing.length; start += BATCH) {
      const batch = missing.slice(start, start + BATCH)
      const name = localeInfo(locale).name
      const raw = await ai.run(model, {
        messages: [
          { role: "system", content: `You translate CAD/CAM documentation into ${name}. Reply with a JSON array of strings only, same length and order as the input array. Keep code, commands, file paths, identifiers, units and numbers unchanged. Translate nothing inside backticks.` },
          { role: "user", content: JSON.stringify(batch.map((m) => m.text)) },
        ],
      }) as { response?: string } | string
      const text = typeof raw === "string" ? raw : (raw.response ?? "")
      const match = text.match(/\[[\s\S]*\]/)
      if (!match) throw new Error("translator returned no JSON array")
      const parsed = JSON.parse(match[0]) as unknown
      if (!Array.isArray(parsed) || parsed.length !== batch.length) throw new Error("translator returned wrong segment count")
      for (let j = 0; j < batch.length; j++) {
        const value = String(parsed[j] ?? batch[j]!.text)
        results[batch[j]!.index] = value
        if (kv) await kv.put(batch[j]!.key, value, { expirationTtl: 60 * 60 * 24 * 30 }).catch(() => undefined)
      }
    }
    return results
  }
}
