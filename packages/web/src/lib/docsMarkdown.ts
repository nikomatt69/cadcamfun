import domino from "@mixmark-io/domino"
import TurndownService from "turndown"
import { gfm } from "turndown-plugin-gfm"
import { sidebarHrefs } from "../data/docsSidebar"

/** Every documentation path the site is allowed to serve as Markdown. */
export const docsPaths = new Set(sidebarHrefs())

export function normalizeDocsPath(raw: string, origin: string) {
  return new URL(raw, origin).pathname.replace(/\/$/, "") || "/docs"
}

export function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
}

export function extractDocument(html: string) {
  const match = html.match(/<article[^>]*data-llm-document[^>]*>([\s\S]*?)<\/article>/i)
  if (!match) throw new Error("The documentation page does not expose AI-readable content")
  return match[1]
}

export function extractTitle(html: string) {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  return decodeHtml(match?.[1].replace(/<[^>]+>/g, "").trim() || "CADCAMFUN documentation")
}

/**
 * Converts the `data-llm-document` article of a docs page to GFM Markdown.
 *
 * The HTML is parsed with domino and handed to Turndown as a DOM node: given a
 * string, Turndown reaches for a global `document`, which neither the Worker
 * nor the SSR dev server has.
 */
export function toMarkdown(html: string) {
  const service = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    headingStyle: "atx",
    strongDelimiter: "**",
  })
  service.use(gfm)
  // A rule, not `service.remove()`: Turndown checks remove filters after its
  // built-in rules, so an excluded <p> or <h2> would still be converted.
  service.addRule("llm-exclude", {
    filter: (node) =>
      node.hasAttribute("data-llm-exclude") || ["SCRIPT", "STYLE", "SVG", "BUTTON"].includes(node.nodeName),
    replacement: () => "",
  })
  const document = domino.createDocument(`<body>${extractDocument(html)}</body>`, true)
  return service
    .turndown(document.body as unknown as HTMLElement)
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export type DocMarkdown = {
  title: string
  markdown: string
  source: string
}

/**
 * Anything that can serve a docs page: the ASSETS binding, or plain fetch.
 * Called with a URL string, never a `Request` — the dev server's `fetch` comes
 * from a different realm and rejects a Request built in this one.
 */
export type DocFetcher = {
  fetch(url: string, init?: { headers?: Record<string, string> }): Promise<Response>
}

/**
 * Docs pages are prerendered, so they are static assets of this deployment.
 * Reading them through the ASSETS binding keeps the request inside the Worker:
 * a subrequest to our own hostname leaves Cloudflare and comes back as a 522.
 */
export function docsFetcher(env?: { ASSETS?: DocFetcher }): DocFetcher {
  const live: DocFetcher = { fetch: (url, init) => fetch(url, init) }
  const assets = env?.ASSETS
  if (!assets) return live
  // Under `astro dev` the binding serves the last `dist/` build, which may not
  // have the page yet: fall back to the live render instead of failing.
  return {
    fetch: async (url, init) => {
      const response = await assets.fetch(url, init).catch(() => null)
      return response?.ok ? response : live.fetch(url, init)
    },
  }
}

/**
 * Renders a docs page and converts it to Markdown. Throws when the path is not
 * a known documentation page or the page cannot be rendered.
 */
export async function fetchDocMarkdown(
  pathname: string,
  origin: string,
  fetcher: DocFetcher = docsFetcher(),
): Promise<DocMarkdown> {
  if (!docsPaths.has(pathname)) throw new Error(`Unknown documentation path: ${pathname}`)

  const source = new URL(pathname, origin)
  const page = await fetcher.fetch(source.toString(), {
    headers: { Accept: "text/html" },
  })
  if (!page.ok) throw new Error(`Could not load ${pathname}: ${page.status}`)

  const html = await page.text()
  return {
    title: extractTitle(html),
    markdown: toMarkdown(html),
    source: source.toString(),
  }
}
