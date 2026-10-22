/** Metadata-only entry point: bun --no-env-file apps/desktop/scripts/refresh-manual-catalogue.ts */
import { createHash } from "node:crypto"
import { mkdir, rename } from "node:fs/promises"
import { Window } from "happy-dom"
import { manualIndexes } from "./manual-sources.ts"

const output = new URL("../src/features/manuals/lib/indexed.json", import.meta.url)
const failures: string[] = []
const records: { id: string; title: string; publisher: string; category: string; collection: string; url: string; topics: readonly string[]; kind: "chapter"; access: "public"; language: "en" }[] = []

async function readIndex(source: typeof manualIndexes[number]) {
  const win = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } })
  try {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const origin = new URL(response.url)
    if (origin.protocol !== "https:" || ![new URL(source.url).hostname, ...(source.alternateHosts ?? [])].includes(origin.hostname)) throw new Error(`Unexpected index redirect: ${origin.hostname}`)
    const doc = new win.DOMParser().parseFromString(await response.text(), "text/html")
    const links = new Map<string, string>()
    for (const link of doc.querySelectorAll("a[href]")) {
      const raw = link.getAttribute("href") ?? ""
      if (!raw || raw.startsWith("#")) continue
      const url = new URL(raw, origin)
      url.hash = ""
      if (url.origin !== origin.origin || !source.prefixes.some((prefix) => url.pathname.startsWith(prefix)) || url.search || /(?:genindex|search|licens|copyright|changes|release|_sources|_static|_history|_edit|_new|\/pdf\/)/i.test(url.pathname) || /\.(?:pdf|zip|png|jpg|svg|xml|json|txt|md|ipynb)$/.test(url.pathname)) continue
      if (source.id === "klipper" && !/^\/[A-Z][A-Za-z_]+\.html$/.test(url.pathname)) continue
      const title = (link.textContent ?? "").replace(/[¶#]+$/g, "").replace(/\s+/g, " ").trim()
      if (title.length < 4 || /^(?:next|previous|home|index|edit|view|source|contents|table of contents|english|back to top)$/i.test(title) || /redirected/i.test(title)) continue
      if (!links.has(url.href)) links.set(url.href, title)
    }
    for (const [url, title] of [...links].slice(0, source.limit)) {
      if (records.some((r) => r.url === url)) continue
      records.push({ id: `${source.id}-${createHash("sha256").update(url).digest("hex").slice(0, 12)}`, title, collection: source.collection, publisher: source.publisher, category: source.category, url, topics: source.topics, kind: "chapter", access: "public", language: "en" })
    }
    console.log(`${source.id}: ${links.size} official links indexed`)
  } catch (error) { failures.push(`${source.id}: ${error instanceof Error ? error.message : String(error)}`) }
  finally { await win.happyDOM.close() }
}
for (let i = 0; i < manualIndexes.length; i += 3) await Promise.all(manualIndexes.slice(i, i + 3).map(readIndex))
for (const failure of failures) console.error(failure)
if (records.length < 150) throw new Error(`Only ${records.length} links found; existing catalogue preserved`)
records.sort((a, b) => a.collection.localeCompare(b.collection) || a.title.localeCompare(b.title))
await mkdir(new URL(".", output), { recursive: true })
const temporary = new URL("indexed.json.tmp", new URL(".", output))
await Bun.write(temporary, `${JSON.stringify({ indexedAt: new Date().toISOString(), documents: records }, null, 2)}\n`)
await rename(temporary, output)
console.log(`Saved ${records.length} catalogue entries. No manual bodies or PDFs downloaded.`)
