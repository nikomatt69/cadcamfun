import type { APIRoute } from "astro"
import { canViewArtifact, readArtifact, readArtifactContent } from "../../../lib/artifact"

export const prerender = false

// Self-contained pages only: no external scripts, styles or fetches; media
// from data: URIs. Mirrors the sandbox the viewer puts around the iframe.
const HTML_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
].join("; ")

/** Serves the artifact's current (or ?v=N) content. Access requires the ?key= capability. */
export const GET: APIRoute = async (context) => {
  const env = context.locals.runtime?.env
  if (!env?.ARTIFACTS) return new Response("Artifact storage unavailable", { status: 503 })

  const id = context.params.id
  if (!id) return new Response("Missing artifact id", { status: 400 })

  const stored = await readArtifact(env.ARTIFACTS, id)
  if (!stored) return new Response("Artifact not found", { status: 404 })
  if (!canViewArtifact(stored, context.url.searchParams.get("key"))) {
    return new Response("Unauthorized", { status: 401 })
  }

  const requested = Number(context.url.searchParams.get("v"))
  const version =
    Number.isInteger(requested) && requested >= 1 && requested <= stored.version ? requested : stored.version

  const object = await readArtifactContent(env.ARTIFACTS, id, version)
  if (!object) return new Response("Artifact content missing", { status: 404 })

  const headers: Record<string, string> = {
    "Content-Type": stored.contentType,
    "Content-Length": String(object.size),
    // Capability-gated content: never let shared caches hold it.
    "Cache-Control": "private, max-age=60",
    "X-Content-Type-Options": "nosniff",
    ETag: object.httpEtag,
  }
  if (stored.kind === "html") headers["Content-Security-Policy"] = HTML_CSP
  // Never let browsers sniff Markdown or plain text into renderable HTML.
  if (stored.kind !== "html") headers["Content-Type"] = "text/plain; charset=utf-8"

  return new Response(object.body, { status: 200, headers })
}
