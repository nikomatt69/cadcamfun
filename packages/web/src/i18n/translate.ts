import domino from "@mixmark-io/domino"
import { createHash } from "node:crypto"
import { catalogFor } from "./catalog"
import { DEFAULT_LOCALE, localeInfo, localizePath, type Locale } from "./locales"
import { isStableSegment, lookupSegment, segmentKey } from "./segment"

/**
 * Body translation for localized docs pages. The English article HTML is the
 * source; every visible text node outside code/pre/script is a segment.
 * Segments go to Workers AI in one batch and are cached in KV by content
 * hash, so a page is translated once per language until its text changes.
 * A checked-in catalog supplies the translation. Workers AI fills only the
 * segments the catalog does not have yet. Without either, English remains.
 */

export type SegmentTranslator = (segments: ReadonlyArray<string>, locale: Locale) => Promise<ReadonlyArray<string>>

const SKIP = new Set(["CODE", "PRE", "SCRIPT", "STYLE", "KBD", "SVG", "TEXTAREA"])
const TRANSLATED_ATTRS = ["aria-label", "title", "placeholder", "alt"] as const

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
interface AttrSlot { element: Element; name: string; value: string }

function collectAttrs(document: Document): AttrSlot[] {
  const slots: AttrSlot[] = []
  const walk = (node: Node): void => {
    if (SKIP.has(node.nodeName)) return
    if (node.nodeType === 1) {
      const element = node as Element
      for (const name of TRANSLATED_ATTRS) {
        const value = element.getAttribute(name)
        if (value && value.trim().length > 0) slots.push({ element, name, value })
      }
    }
    node.childNodes.forEach((child) => walk(child as Node))
  }
  walk(document.body as unknown as Node)
  return slots
}

async function resolveSegments(
  segments: readonly string[],
  locale: Locale,
  translator: SegmentTranslator | undefined,
  dict: Readonly<Record<string, string>>,
): Promise<{ values: string[]; complete: boolean }> {
  const resolved: Array<string | undefined> = segments.map((source) => {
    const hit = lookupSegment(dict, source)
    if (hit != null) return hit
    if (isStableSegment(segmentKey(source))) return source.trim()
    return undefined
  })
  const missing = resolved.flatMap((value, index) => (value == null ? [index] : []))
  if (missing.length > 0 && translator) {
    try {
      const out = await translator(missing.map((index) => segments[index]!), locale)
      if (out.length === missing.length) missing.forEach((index, offset) => { resolved[index] = out[offset] })
    } catch {
      // A failed model leaves those segments in English.
    }
  }
  return {
    values: resolved.map((value, index) => value ?? segments[index]!),
    complete: resolved.every((value) => value != null),
  }
}

/** Translate plain strings (titles, subtitles, table-of-contents entries) with the same catalog. */
export async function translateTextList(
  segments: readonly string[],
  locale: Locale,
  translator?: SegmentTranslator,
  dict: Readonly<Record<string, string>> = catalogFor(locale),
): Promise<{ values: string[]; complete: boolean }> {
  if (locale === DEFAULT_LOCALE || segments.length === 0) return { values: [...segments], complete: true }
  return resolveSegments(segments, locale, translator, dict)
}

export async function translateArticleHtml(
  articleHtml: string,
  locale: Locale,
  translator?: SegmentTranslator,
  dict: Readonly<Record<string, string>> = catalogFor(locale),
): Promise<TranslatedArticle> {
  if (locale === DEFAULT_LOCALE) return { html: articleHtml, translated: true, segments: 0 }
  const document = domino.createDocument(`<body>${articleHtml}</body>`, true)
  rewriteLinks(document, locale)
  const { segments, nodes } = collectSegments(document)
  const attrs = collectAttrs(document)
  const sources = [...segments, ...attrs.map((slot) => slot.value)]
  if (sources.length === 0) return { html: document.body.innerHTML, translated: true, segments: 0 }
  const { values, complete } = await resolveSegments(sources, locale, translator, dict)
  nodes.forEach((node, index) => {
    const src = segments[index]!
    const lead = src.match(/^\s*/)?.[0] ?? ""
    const trail = src.match(/\s*$/)?.[0] ?? ""
    node.nodeValue = `${lead}${values[index]!.trim()}${trail}`
  })
  attrs.forEach((slot, index) => slot.element.setAttribute(slot.name, values[segments.length + index]!.trim()))
  return { html: document.body.innerHTML, translated: complete, segments: sources.length }
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
