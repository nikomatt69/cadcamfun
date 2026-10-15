import type { APIRoute } from "astro"
import { docsNav } from "../data/docsSidebar"
import { docsFetcher, docsPaths, fetchDocMarkdown, normalizeDocsPath } from "../lib/docsMarkdown"

export const prerender = false

/**
 * The documentation as GitHub-flavored Markdown, for AI tools and for the docs
 * assistant's grounding. `/llm` lists every page; `/llm?path=/docs/cam`
 * returns one page; `&format=prompt` wraps it in a ready-to-use prompt.
 */

function headers(request: Request) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "*",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    "Content-Type": "text/markdown; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  }
}

function docsIndexMarkdown(origin: string) {
  const sections = docsNav
    .map((section) => {
      const groups = section.groups
        .map((group) => {
          const pages = group.items
            .map((item) => `- [${item.title}](${origin}/llm?path=${encodeURIComponent(item.href)})`)
            .join("\n")
          return `### ${group.title}\n\n${pages}`
        })
        .join("\n\n")
      return `## ${section.title}\n\n${groups}`
    })
    .join("\n\n")

  return `# CADCAMFUN documentation for AI\n\nThis endpoint serves the CADCAMFUN documentation as GitHub-flavored Markdown. Fetch a page with \`/llm?path=/docs/<page>\`. Add \`&format=prompt\` for a ready-to-use AI prompt containing that page.\n\n${sections}\n`
}

function asPrompt(input: { markdown: string; source: string; endpoint: string; title: string }) {
  return `You are working with the CADCAMFUN documentation. Use it as the source of truth for CADCAMFUN behaviour, commands, packages, APIs, the geometry kernel, CAM and G-code. Do not invent unsupported features. If the documentation is insufficient or conflicts with the user's code, state that clearly and verify against the local repository.\n\nDocumentation page: ${input.title}\nCanonical source: ${input.source}\nMachine-readable endpoint: ${input.endpoint}\nDocumentation index: ${new URL("/llm", input.source).toString()}\n\nAnswer the user's request using the documentation below. Cite the relevant section or source path when useful.\n\n<cadcamfun_documentation>\n${input.markdown}\n</cadcamfun_documentation>\n`
}

export const OPTIONS: APIRoute = ({ request }) => new Response(null, { status: 204, headers: headers(request) })

export const GET: APIRoute = async ({ request, locals, url }) => {
  const responseHeaders = headers(request)
  const rawPath = url.searchParams.get("path")
  if (!rawPath) return new Response(docsIndexMarkdown(url.origin), { headers: responseHeaders })

  const pathname = normalizeDocsPath(rawPath, url.origin)
  if (!docsPaths.has(pathname)) {
    return new Response(`Unknown documentation path: ${pathname}\n`, { status: 404, headers: responseHeaders })
  }

  try {
    const doc = await fetchDocMarkdown(pathname, url.origin, docsFetcher(locals.runtime?.env))
    const markdown = `${doc.markdown}\n\n---\n\nSource: ${doc.source}\n`
    if (url.searchParams.get("format") !== "prompt") {
      return new Response(markdown, { headers: responseHeaders })
    }

    const endpoint = new URL("/llm", url.origin)
    endpoint.searchParams.set("path", pathname)
    return new Response(asPrompt({ markdown, source: doc.source, endpoint: endpoint.toString(), title: doc.title }), {
      headers: responseHeaders,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not convert documentation to Markdown"
    return new Response(`${message}\n`, {
      status: message.startsWith("Could not load") ? 502 : 500,
      headers: responseHeaders,
    })
  }
}
