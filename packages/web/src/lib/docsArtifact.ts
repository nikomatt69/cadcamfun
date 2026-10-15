import { type ArtifactBucket, artifactKind, artifactShareUrl, writeArtifact } from "./artifact"

/**
 * Artifact authoring for the docs assistant.
 *
 * The assistant can emit a fenced block tagged `artifact` with attributes on
 * the info string; the content is published as a real, standalone HTML file on
 * /artifact/:id, reachable through its `?key=` capability link:
 *
 * ```artifact title="Fanuc post checklist" filename="fanuc-post.html"
 * ## Before you post
 * …
 * ```
 *
 * The artifact page renders it in a sandboxed iframe, so the document may
 * carry its own styles and scripts, but it must be self-contained.
 */

export type PublishedArtifact = {
  id: string
  url: string
  title: string
  filename: string
}

export type ArtifactRequest = {
  title: string
  filename: string
  content: string
}

/** Max artifact the assistant may publish on its own. */
const MAX_ARTIFACT_BYTES = 256 * 1024

const ARTIFACT_BLOCK = /```artifact([^\n]*)\n([\s\S]*?)```(?:\s*\n|\s*$)/
/** Same block, left open because the model ran out of output tokens. */
const OPEN_ARTIFACT_BLOCK = /```artifact([^\n]*)\n([\s\S]*)$/
export const ARTIFACT_MARKER = "```artifact"

function attribute(info: string, name: string) {
  const match = info.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"))
  return match?.[1].trim() ?? ""
}

export function safeFilename(value: string) {
  const cleaned = value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80)
  const base = cleaned || "artifact"
  if (/\.html?$/i.test(base)) return base
  const stem = base.replace(/\.[^.]*$/, "").replace(/[-.]+$/, "")
  return `${stem || "artifact"}.html`
}

/**
 * Pulls the first artifact block out of an answer. Returns the answer with the
 * block removed, so the chat transcript stays readable.
 */
export function extractArtifact(answer: string): {
  text: string
  artifact: ArtifactRequest | null
} {
  const match = answer.match(ARTIFACT_BLOCK) ?? answer.match(OPEN_ARTIFACT_BLOCK)
  if (!match) return { text: answer, artifact: null }

  const [block, info, content] = match
  const body = content.replace(/\n+$/, "")
  if (!body.trim()) return { text: answer.replace(block, ""), artifact: null }

  return {
    text: answer
      .replace(block, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    artifact: {
      title: attribute(info, "title") || "CADCAMFUN guide",
      filename: safeFilename(attribute(info, "filename")),
      content: body,
    },
  }
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const looksLikeHtml = (content: string) =>
  /<(!doctype|html|body|main|header|footer|nav|aside|section|article|div|span|h[1-6]|p|ul|ol|table|pre|form|button|input|label|canvas|figure|style|script)\b/i.test(
    content,
  )

const isFullDocument = (content: string) => /<!doctype html|<html[\s>]/i.test(content)

/** Minimal Markdown → HTML, for when the model answers with Markdown anyway. */
export function markdownToHtml(source: string) {
  return source
    .split(/```/)
    .map((block, index) => {
      if (index % 2 === 1) {
        const body = block.replace(/^[a-zA-Z0-9+#-]*\n/, "").replace(/\n$/, "")
        return `<pre><code>${escapeHtml(body)}</code></pre>`
      }

      const html: string[] = []
      let list: { type: "ul" | "ol"; items: string[] } | null = null
      let table: string[][] | null = null

      const inline = (value: string) =>
        escapeHtml(value)
          .replace(/`([^`]+)`/g, "<code>$1</code>")
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')

      const cells = (line: string) =>
        line
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((cell) => cell.trim())

      const flushTable = () => {
        if (!table) return
        const [head, ...rows] = table
        const row = (values: string[], tag: "th" | "td") =>
          `<tr>${values.map((value) => `<${tag}>${inline(value)}</${tag}>`).join("")}</tr>`
        html.push(`<table><thead>${row(head, "th")}</thead><tbody>${rows.map((values) => row(values, "td")).join("")}</tbody></table>`)
        table = null
      }

      const flush = () => {
        flushTable()
        if (!list) return
        html.push(`<${list.type}>${list.items.map((item) => `<li>${item}</li>`).join("")}</${list.type}>`)
        list = null
      }

      for (const rawLine of block.split("\n")) {
        const line = rawLine.trimEnd()
        if (!line.trim()) {
          flush()
          continue
        }

        if (/^\s*\|.*\|\s*$/.test(line)) {
          const values = cells(line)
          if (values.every((value) => /^:?-{2,}:?$/.test(value))) continue
          ;(table ??= []).push(values)
          continue
        }
        flushTable()

        const heading = line.match(/^(#{1,6})\s+(.*)$/)
        if (heading) {
          flush()
          const level = Math.min(heading[1].length + 1, 6)
          html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
          continue
        }

        const bullet = line.match(/^\s*[-*]\s+(.*)$/)
        if (bullet) {
          if (list?.type !== "ul") flush()
          list ??= { type: "ul", items: [] }
          list.items.push(inline(bullet[1]))
          continue
        }

        const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/)
        if (ordered) {
          if (list?.type !== "ol") flush()
          list ??= { type: "ol", items: [] }
          list.items.push(inline(ordered[1]))
          continue
        }

        flush()
        html.push(`<p>${inline(line)}</p>`)
      }

      flush()
      return html.join("\n")
    })
    .join("\n")
}

/**
 * CADCAMFUN tokens for self-contained artifacts: the site palette (cool gray
 * light, black dark, CADCAMFUN blue accent) and 6px plates. Fonts stay on the
 * system stack because the sandbox blocks external font files.
 */
export const ARTIFACT_TOKENS = `:root {
  color-scheme: light dark;
  --bg: #eaf0f7; --panel: #ffffff; --raised: #ffffff; --text: #0f172a; --muted: #475569;
  --border: #c6d0dd; --accent: #0060ae; --accent-soft: rgba(0, 96, 174, 0.12); --on-accent: #ffffff;
  --ok: #0c9048; --warn: #a85c12; --danger: #ea1921; --code: #f5f8fb; --radius: 6px;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.05), 0 12px 32px -10px rgba(15, 23, 42, 0.16);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000000; --panel: #101010; --raised: #141414; --text: #fafafa; --muted: #a8a8a8;
    --border: #2e2e2e; --accent: #fafafa; --accent-soft: rgba(255, 255, 255, 0.1); --on-accent: #000000;
    --ok: #58d692; --warn: #e8b860; --danger: #ff7a76; --code: #0c0c0c;
    --shadow: 0 1px 1px rgba(255, 255, 255, 0.04), 0 18px 40px -14px rgba(0, 0, 0, 0.85);
  }
}`

/**
 * Wraps a fragment in a self-contained, responsive, theme-aware document so
 * every artifact is a real HTML file that stands on its own.
 */
function htmlDocument(title: string, body: string, source: string) {
  // When the artifact ships its own CSS, stay out of its way: only a reset.
  const styled = /<style[\s>]/i.test(body)
  if (styled) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="CADCAMFUN docs assistant" />
<base target="_blank" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.6 ui-rounded, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
  img, svg, video, canvas { max-width: 100%; height: auto; }
  pre { overflow-x: auto; }
</style>
</head>
<body>
${body}
</body>
</html>
`
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="CADCAMFUN docs assistant" />
<base target="_blank" />
<title>${escapeHtml(title)}</title>
<style>
  ${ARTIFACT_TOKENS}
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2.5rem 1.25rem 4rem; background: var(--bg); color: var(--text);
    font: 16px/1.7 ui-rounded, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 46rem; margin: 0 auto; }
  h1, h2, h3, h4 { line-height: 1.15; letter-spacing: -0.02em; margin: 2rem 0 0.75rem; text-wrap: balance; }
  h1 { font-size: clamp(1.75rem, 4vw, 2.4rem); margin-top: 0; }
  h2 { font-size: 1.35rem; } h3 { font-size: 1.1rem; }
  a { color: var(--accent); text-underline-offset: 3px; }
  ul, ol { padding-left: 1.25rem; }
  li { margin: 0.35rem 0; }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.875em; background: var(--code); border-radius: 4px; padding: 0.1rem 0.35rem;
    box-shadow: var(--shadow);
  }
  pre {
    background: var(--code); border-radius: var(--radius); box-shadow: var(--shadow);
    padding: 0.9rem 1rem; overflow-x: auto;
  }
  pre code { background: none; box-shadow: none; padding: 0; font-size: 0.85rem; }
  table { width: 100%; border-collapse: collapse; display: block; overflow-x: auto; font-variant-numeric: tabular-nums; }
  th, td { border-bottom: 1px solid var(--border); padding: 0.5rem 0.7rem; text-align: left; vertical-align: top; }
  th { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  blockquote { margin: 1rem 0; padding: 0.6rem 1rem; border-left: 3px solid var(--border); color: var(--muted); }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.8rem; }
</style>
</head>
<body>
<main>
${body}
<footer>Generated by the <a href="${escapeHtml(source)}/docs">CADCAMFUN</a> docs assistant from the documentation. Verify commands and G-code before running them on a machine.</footer>
</main>
</body>
</html>
`
}

/**
 * Injected into every published artifact: whatever the model wrote, wide
 * content scrolls inside its own box instead of scrolling the page sideways
 * on a phone.
 */
const RESPONSIVE_GUARD = `<style>
  html, body { max-width: 100%; overflow-x: hidden; }
  table { display: block; width: 100%; max-width: 100%; overflow-x: auto; }
  pre, .scroll { max-width: 100%; overflow-x: auto; }
  img, svg, video, canvas, iframe { max-width: 100%; height: auto; }
  * { min-width: 0; overflow-wrap: anywhere; }
</style>`

function withResponsiveGuard(html: string) {
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${RESPONSIVE_GUARD}\n</head>`)
  if (/<body[^>]*>/i.test(html)) return html.replace(/(<body[^>]*>)/i, `$1\n${RESPONSIVE_GUARD}`)
  return `${RESPONSIVE_GUARD}\n${html}`
}

/** Normalizes assistant output into a complete HTML document. */
export function toHtmlFile(request: ArtifactRequest, origin: string) {
  if (isFullDocument(request.content)) return withResponsiveGuard(request.content)
  const body = looksLikeHtml(request.content) ? request.content : markdownToHtml(request.content)
  return withResponsiveGuard(htmlDocument(request.title, body, origin))
}

/**
 * Publishes an artifact anonymously (reachable through the capability link)
 * and returns its shareable URL.
 */
export async function publishArtifact(
  bucket: ArtifactBucket,
  request: ArtifactRequest,
  options: { origin: string; publicOrigin?: string; sessionID?: string },
): Promise<PublishedArtifact | null> {
  const content = new TextEncoder().encode(toHtmlFile(request, options.publicOrigin || options.origin))
  if (content.byteLength === 0 || content.byteLength > MAX_ARTIFACT_BYTES) return null

  const contentType = "text/html; charset=utf-8"
  const kind = artifactKind(contentType)
  if (!kind) return null

  const id = crypto.randomUUID()
  const viewKey = crypto.randomUUID().replace(/-/g, "")
  const now = Date.now()

  await writeArtifact(
    bucket,
    {
      id,
      secret: crypto.randomUUID(),
      viewKey,
      title: request.title,
      description: "Created by the CADCAMFUN docs assistant",
      filename: request.filename,
      contentType,
      kind,
      size: content.byteLength,
      version: 1,
      sessionID: options.sessionID,
      author: "CADCAMFUN docs assistant",
      time: { created: now, updated: now },
    },
    content.buffer as ArrayBuffer,
  )

  return {
    id,
    url: artifactShareUrl(id, viewKey, options.publicOrigin || options.origin),
    title: request.title,
    filename: request.filename,
  }
}
