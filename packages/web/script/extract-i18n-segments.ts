/**
 * Collects the English strings the localized site must translate.
 * Docs pages are read from a running `astro dev` (default http://127.0.0.1:4321)
 * so the keys match rendered text nodes. Client-only copy is listed below.
 *
 * Digits become `#` so "12 endpoints" and "3 endpoints" share one catalog entry.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import domino from "@mixmark-io/domino"
import { sidebarHrefs } from "../src/data/docsSidebar"
import { apiDocument } from "../src/lib/apiReference"
import { isStableSegment, segmentKey } from "../src/i18n/segment"

const origin = process.env.DOCS_ORIGIN ?? "http://127.0.0.1:4322"
const SKIP = new Set(["CODE", "PRE", "SCRIPT", "STYLE", "KBD", "SVG", "TEXTAREA"])

/** Client copy that is not in the first HTML payload. */
const CLIENT_COPY = [
  "Disk image",
  "MSI installer",
  "NSIS installer",
  "Debian package",
  "RPM package",
  "SHA-256 checksums",
  "Release notes",
  "Apple Silicon",
  "Intel",
  "Not in this release.",
  "Detected {os}. Matching builds are marked below.",
  "No stable desktop installers are published yet. Build from source with the quickstart.",
  "The release list could not be loaded. Open the GitHub releases page, or try again in a moment.",
  "Copy",
  "Copied",
  "No API keys.",
  "Revoke",
  "Could not revoke the key",
  "The local Studio API is not running. Start it with bun run dev in packages/web.",
  "Account editing uses that same local API.",
  "Signed in",
  "No projects in this database.",
  "The account could not be loaded.",
  "Could not save the profile",
  "Could not change the password",
  "Could not save the git identity",
  "Could not create the key",
  "Copy this key now. It will not be shown again: {key}",
  "Sign in failed",
  "How do I install and run CADCAMFUN locally?",
  "How does a toolpath become G-code for my machine?",
  "What is CADCAMFUN?",
  "Build me a checklist for generating and verifying G-code",
  "Explain {title} in simple terms",
  "Grounded in the docs · reading {title}",
  "Grounded in the CADCAMFUN documentation",
  "Ask the docs",
  "Docs assistant",
  "New",
  "Your question",
  "Ask about CADCAMFUN…",
  "AI-generated from the docs. It can be wrong. Verify commands and simulate G-code before running it on a machine.",
  "Reading the docs…",
  "Clear conversation",
  "Minimize",
  "Minimize the documentation assistant",
  "Expand the documentation assistant",
  "Close the documentation assistant",
  "Close",
  "Send question",
  "The connection to the assistant was interrupted.",
  "No answer was returned. Try rephrasing your question.",
  "Engine answering your questions",
  "Enter the sidecar URL first.",
  "Checking…",
  "Connected",
  "HTTP {status}",
  "The sidecar answered 401: check the bearer token.",
  "The sidecar answered {status}.",
  "Unreachable",
  "No response. Check the URL and port; from a non-loopback origin the browser blocks the request (CORS).",
  "Not connected",
  "Set the base URL in the playground at the top of the page.",
  "Fill in every path parameter.",
  "Copied.",
  "Sending…",
  "failed",
  "The request failed before a response: wrong URL, sidecar stopped, or blocked by CORS.",
  "Playground",
  "Base URL",
  "Bearer token",
  "Session token",
  "optional",
  "Check connection",
  "Clear",
  "How this works",
  "On this page",
  "Next",
  "Related",
  "Copy code",
  "Drag to orbit · scroll to zoom · right-drag to pan",
  "Enable JavaScript to view this interactive 3D example.",
  "Replay toolpath",
  "WebGL is not available in this browser.",
  "Deprecated.",
  "Public: no bearer token is needed.",
  "Requires",
  "Parameters",
  "Name",
  "In",
  "Type",
  "Required",
  "required",
  "Request body",
  "Responses",
  "No body",
  "Example response",
  "captured",
  "SDK example",
  "fetch example",
  "Try it",
  "Copy as curl",
  "Send",
  "This operation takes {media}; use the curl or fetch example.",
  "Field",
  "Presence",
  "Type and constraints",
  "Operations",
  "Schemas",
  "Calling this group",
  "Troubleshooting",
  "Symptom",
  "Likely cause",
  "Fix",
  "Link to",
  "Skip to content",
  "Mobile",
]

function keep(raw: string): string | null {
  const key = segmentKey(raw)
  if (isStableSegment(key)) return null
  if (key.length < 2 || !/[A-Za-z]/.test(key)) return null
  if (key.length > 2000) return null
  if (/^https?:\/\//.test(key) || key.startsWith("/") || key.startsWith("@") || key.startsWith("#")) return null
  if (/[a-z][A-Z]/.test(key) && !key.includes(" ")) return null
  if (/^[A-Za-z0-9_./:@|+-]+$/.test(key) && (key.includes("/") || key.includes("@") || key.includes("_") || key.includes("."))) return null
  if (/^[a-z]{1,2}$/.test(key)) return null
  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(key)) return null
  return key
}

function add(bucket: Set<string>, value: string | null | undefined) {
  if (!value) return
  const key = keep(value)
  if (key) bucket.add(key)
}

function collectHtml(html: string, bucket: Set<string>) {
  const document = domino.createDocument(html, true)
  const walk = (node: Node): void => {
    if (SKIP.has(node.nodeName)) return
    if (node.nodeType === 1) {
      const el = node as unknown as { getAttribute?: (name: string) => string | null; childNodes: Node[] }
      for (const attr of ["aria-label", "placeholder", "title", "alt"]) add(bucket, el.getAttribute?.(attr))
    }
    if (node.nodeType === 3) add(bucket, node.nodeValue)
    node.childNodes?.forEach((child) => walk(child as Node))
  }
  walk(document.body as unknown as Node)
}

async function fetchText(pathname: string): Promise<string | null> {
  try {
    const response = await fetch(new URL(pathname, origin), {
      headers: { Cookie: "cadcamfun_locale=en" },
      signal: AbortSignal.timeout(90_000),
    })
    if (!response.ok) {
      console.error(`skip ${pathname}: ${response.status}`)
      return null
    }
    return response.text()
  } catch (error) {
    console.error(`skip ${pathname}: ${error instanceof Error ? error.message : "failed"}`)
    return null
  }
}

const pages = [...new Set([...sidebarHrefs(), "/", "/download", "/studio", "/studio/login"])]
const bucket = new Set<string>()
for (const copy of CLIENT_COPY) add(bucket, copy)
for (const item of Object.values(apiDocument.paths)) {
  for (const op of Object.values(item)) {
    if (!op || typeof op !== "object" || !("responses" in op)) continue
    for (const response of Object.values(op.responses)) add(bucket, response.description)
  }
}

let fetched = 0
const queue = [...pages]
const workers = Array.from({ length: 4 }, async () => {
  for (;;) {
    const pathname = queue.shift()
    if (!pathname) return
    const html = await fetchText(pathname)
    if (!html) continue
    collectHtml(html, bucket)
    fetched += 1
    if (fetched % 10 === 0) console.error(`fetched ${fetched}/${pages.length} · ${bucket.size} segments`)
  }
})
await Promise.all(workers)

const segments = [...bucket].sort((a, b) => a.localeCompare(b))
mkdirSync(new URL("../src/i18n/catalog/", import.meta.url), { recursive: true })
writeFileSync(new URL("../src/i18n/catalog/segments.json", import.meta.url), `${JSON.stringify(segments, null, 2)}\n`)
console.log(`pages ${fetched}/${pages.length} segments ${segments.length}`)
