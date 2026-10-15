import type { APIRoute } from "astro"
import { docsIndex } from "../../data/docsIndex"
import { guideTitle, parseMessages, visibleAnswer, wantsArtifact, withheldTail, workersAiDeltas, type AnswerChunk } from "../../lib/docsAssistant"
import { ARTIFACT_MARKER, ARTIFACT_TOKENS, type ArtifactRequest, extractArtifact, publishArtifact } from "../../lib/docsArtifact"
import { type DocFetcher, docsFetcher, fetchDocMarkdown, normalizeDocsPath } from "../../lib/docsMarkdown"
import { type ToolCall, planDocs } from "../../lib/docsPlanner"
import { condenseMarkdown, selectDocs, tokenize } from "../../lib/docsRetrieval"
import { nikcliBackendConfig, runNikcliTurn } from "../../lib/nikcliDocsSession"

export const prerender = false

/**
 * CADCAMFUN docs assistant. Ported from nikcli `packages/web`.
 *
 * Free for every visitor, no login: retrieval is lexical (no Vectorize),
 * grounding reuses the Markdown pipeline behind `/llm`, and generation runs on
 * a Cloudflare Workers AI model covered by the free daily Neuron allocation.
 *
 * When the deployment configures a nikcli server (CADCAMFUN_DOCS_SERVER +
 * CADCAMFUN_DOCS_TOKEN) the same request is answered by a real nikcli session
 * instead, and follow-ups reuse it. Either way the assistant can publish an
 * artifact (a guide, checklist or cheatsheet) from its answer.
 */

/** Small + fast, and cheap against the Workers AI free allocation. */
const DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast"
/**
 * Used only when the question asks for something buildable: writing a styled,
 * interactive HTML guide needs a stronger model than a two-line answer.
 */
const DEFAULT_ARTIFACT_MODEL = "@cf/openai/gpt-oss-20b"

const MAX_DOCS = 3
/** Per-page grounding budget, in characters (~1.2k tokens). */
const DOC_BUDGET = 5000
const MAX_OUTPUT_TOKENS = 900
/** Answer plus the outline of a guide. */
const MAX_OUTLINE_OUTPUT_TOKENS = 1400
/** The rendered guide: layout, CSS and script for the whole page. */
const MAX_ARTIFACT_OUTPUT_TOKENS = 4000
const RATE_LIMIT_PER_HOUR = 20

type Source = { title: string; href: string }
type Backend = "nikcli" | "workers-ai"

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })

/** Best-effort per-IP hourly cap so the free Workers AI allocation survives. */
async function rateLimited(env: CloudflareEnv, request: Request) {
  const kv = env.SESSIONS
  if (!kv) return false

  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
  if (!ip) return false

  const limit = Number(env.DOCS_ASSISTANT_RATE_LIMIT) || RATE_LIMIT_PER_HOUR
  const bucket = Math.floor(Date.now() / 3_600_000)
  const key = `docs-assistant:rl:${ip}:${bucket}`

  try {
    const used = Number((await kv.get(key)) ?? "0")
    if (used >= limit) return true
    await kv.put(key, String(used + 1), { expirationTtl: 3600 })
    return false
  } catch {
    return false
  }
}

/**
 * Renders a docs page to Markdown, cached in the Workers cache so repeat
 * questions do not re-render and re-convert the same HTML.
 */
async function loadDoc(href: string, origin: string, fetcher: DocFetcher) {
  const cacheKey = new Request(`${origin}/_docs-assistant-cache?path=${encodeURIComponent(href)}`)
  // `caches.default` is the Workers cache; outside a Worker there is none.
  const cache = (globalThis.caches as unknown as { default?: Cache } | undefined)?.default

  try {
    const hit = await cache?.match(cacheKey)
    if (hit) return await hit.text()
  } catch {
    // Cache unavailable (e.g. local dev) — fall through to a live render.
  }

  const doc = await fetchDocMarkdown(href, origin, fetcher)
  try {
    await cache?.put(
      cacheKey,
      new Response(doc.markdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Cache-Control": "public, max-age=1800",
        },
      }),
    )
  } catch {
    // Caching is an optimization only.
  }
  return doc.markdown
}

const ARTIFACT_INSTRUCTIONS = [
  "When the user asks for something they will keep, use or share — a guide, a walkthrough, a cheatsheet, a checklist, a setup sheet, a comparison, a reference — end your reply with exactly one fenced block:",
  '```artifact title="Short title" filename="name.html"',
  "## Section heading",
  "1. Step, with the exact command, file path or G-code word in `backticks`",
  "- Fact, option, default value or gotcha to show",
  "```",
  "Artifact rules:",
  "- Inside the block, write only the outline of the page: section headings, ordered steps, bullet points, tables, and the exact commands, config keys, code identifiers or G-code snippets. It is rendered into a designed, interactive HTML guide for you — do not write HTML, CSS or JavaScript yourself.",
  "- Cover the whole topic in that outline: every step, option and caveat you want on the page, taken from the documentation excerpts.",
  "- The block is removed from the chat and published as a shareable page; introduce it in one sentence before the block and do not repeat its content outside the block.",
  "- Use it only when a standalone page is genuinely useful; a normal answer needs no artifact.",
].join("\n")

/**
 * Renders an outline into the published artifact: a designed, interactive
 * guide in the CADCAMFUN look. The chat model only supplies content, so the
 * look stays consistent no matter which model answered.
 */
const HTML_BUILDER_PROMPT = `You build interactive HTML guides about CADCAMFUN, a local-first native CAD/CAM desktop app: 2D sketches, 3D and B-rep modelling, toolpaths, machine-specific G-code posts, a Bun sidecar with SQLite, a Tauri v2 window, and an AI assistant on the nikcli host.

Output raw HTML only: one complete <!doctype html> document. No Markdown, no code fence, no commentary before or after.

Start from this design system and keep its tokens and class names — fill it with the real content. It mirrors the CADCAMFUN site: cool gray in light, black in dark, floating plates separated by soft shadow (never a coloured border), 6px radii, the CADCAMFUN blue as the single accent.

<style>
${ARTIFACT_TOKENS}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);
  font:16px/1.65 "IBM Plex Sans","Segoe UI",sans-serif;font-synthesis:none;-webkit-font-smoothing:antialiased}
em,i,cite,dfn,blockquote{font-style:normal}
em,i{font-weight:500}
.wrap{max-width:52rem;margin:0 auto;padding:2rem 1.1rem 4rem}
.plate{background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow)}
.hero{background:linear-gradient(180deg,var(--accent-soft),transparent),var(--panel);box-shadow:var(--shadow);
  border-radius:var(--radius);padding:1.6rem 1.4rem;margin-bottom:1.5rem}
.hero h1{margin:0 0 .4rem;font-size:clamp(1.6rem,4vw,2.2rem);letter-spacing:-.025em;line-height:1.1;text-wrap:balance}
.hero p{margin:0;color:var(--muted)}
.badge{display:inline-block;padding:.2rem .55rem;border-radius:4px;font:700 .68rem/1.4 "IBM Plex Mono",SFMono-Regular,Consolas,monospace;
  letter-spacing:.12em;text-transform:uppercase;background:var(--accent-soft);color:var(--accent);margin-bottom:.7rem}
.progress{height:4px;border-radius:2px;background:var(--border);overflow:hidden;margin:1rem 0 1.5rem}
.progress > i{display:block;height:100%;width:0;background:var(--accent);transition:width .2s cubic-bezier(.23,1,.32,1)}
.tabs{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:1rem;padding:.25rem;background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow)}
.tab{border:0;background:transparent;color:var(--muted);border-radius:4px;
  padding:.4rem .85rem;font:inherit;font-size:.85rem;font-weight:600;cursor:pointer;transition:background-color .16s,color .16s}
.tab[aria-selected="true"]{background:var(--accent);color:var(--on-accent)}
.tab:active,.copy:active{transform:scale(.97)}
.card{background:var(--raised);border-radius:var(--radius);box-shadow:var(--shadow);padding:1.1rem 1.2rem;margin-bottom:1rem}
.step{display:flex;gap:.9rem;align-items:flex-start}
.step-n{flex:0 0 1.75rem;height:1.75rem;border-radius:4px;background:var(--accent);color:var(--on-accent);
  display:grid;place-items:center;font:700 .8rem "IBM Plex Mono",SFMono-Regular,Consolas,monospace}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:.5rem 0}
.grid{display:grid;gap:.9rem;grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.check{display:flex;gap:.6rem;align-items:flex-start;padding:.5rem 0;cursor:pointer}
.check input{margin-top:.35rem;accent-color:var(--accent)}
pre{position:relative;background:var(--code);border-radius:var(--radius);box-shadow:var(--shadow);
  padding:.85rem 1rem;overflow-x:auto;font-size:.85rem;font-variant-numeric:tabular-nums}
code{font-family:"IBM Plex Mono",SFMono-Regular,Consolas,monospace}
.copy{position:absolute;top:.45rem;right:.45rem;border:0;background:var(--panel);box-shadow:var(--shadow);
  color:var(--muted);border-radius:4px;padding:.2rem .5rem;font:600 .68rem "IBM Plex Mono",SFMono-Regular,Consolas,monospace;
  letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:transform .1s,color .16s}
.copy:hover{color:var(--text)}
.ok{color:var(--ok)} .warn{color:var(--warn)} .danger{color:var(--danger)}
table{width:100%;border-collapse:collapse;font-size:.92rem;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--border);padding:.55rem .7rem;text-align:left;vertical-align:top}
th{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
a{color:var(--accent)} footer{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--border);color:var(--muted);font-size:.8rem}
@media (max-width:420px){.wrap{padding:1.25rem .85rem 3rem}.grid{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>

Requirements:
- It is a guide, not a wall of text: a hero (badge, title, one-line intro), then numbered steps in .card/.step, or .tabs switching between sections when the content is a comparison (for example two post-processor dialects, or two machine setups).
- Make it genuinely interactive with an inline <script>: tab switching, a copy button injected into every <pre>, checkboxes that drive the .progress bar, and smooth-scrolling anchors. Wire everything with addEventListener; keep all state in variables (no localStorage — it is blocked).
- Use colour with intent: the accent for actions and active state, .ok/.warn/.danger for safe/careful/destructive notes (a rapid move into stock, a missing work offset, a spindle left on are .danger). If you draw a <canvas> or <svg> diagram (a toolpath, a stock box, a dependency chain), use those same colour tokens, never black.
- Units are millimetres unless the documentation says otherwise. G-code words (G0, G1, G2/G3, G54, M3, M30) go in <code>.
- Every CSS and JS value must be complete and valid; never leave a number or colour channel empty.
- Sandboxed iframe: no network requests, no external fonts, scripts, or images.
- Responsive to 360px: wrap every <table> in <div class="scroll"> so wide content scrolls inside its own box, and keep code lines short. The page itself must never scroll sideways.
- Readable in light and dark, and factually faithful to the documentation given. Link back to docs pages with site-relative /docs/... URLs.`

function systemPrompt(context: string, currentPage?: Source) {
  const pages = docsIndex.map((entry) => `- ${entry.title} — ${entry.href}`).join("\n")

  return [
    "You are the CADCAMFUN documentation assistant, embedded in the CADCAMFUN docs.",
    "CADCAMFUN is a local-first native CAD/CAM desktop app: 2D drawing, 3D and B-rep modelling, toolpaths and machine-specific G-code, built with Bun, Effect v4, Drizzle on SQLite, Tauri v2 and SolidJS, with an AI assistant on the nikcli host.",
    "You help developers and users understand and use CADCAMFUN: the geometry kernel, CAM operations and posts, the sidecar API, the desktop app, the database, the AI tools and the repository workflow. You are support, not a code-writing agent.",
    "",
    "Rules:",
    "- Answer ONLY from the documentation excerpts below. They are the source of truth.",
    "- If the excerpts do not contain the answer, say so plainly and point to the closest documentation page.",
    "- Never invent commands, scripts, flags, config keys, API routes, package names, table names, tool names, G-code dialects or file paths.",
    "- Quote code, commands and identifiers exactly as they appear in the excerpts, in fenced blocks or `backticks`.",
    "- Never present generated G-code or toolpaths as safe to run on a machine; tell the user to verify and simulate first.",
    "- Be concise: a short answer first, then bullets or a fenced code block when there are commands to run.",
    "- Link the pages you used as Markdown links with site-relative paths, e.g. [CAM and G-code](/docs/cam).",
    "- Reply in the language the user wrote in.",
    "",
    ARTIFACT_INSTRUCTIONS,
    "",
    currentPage ? `The user is currently reading: ${currentPage.title} (${currentPage.href}).` : "",
    "",
    "Documentation table of contents (link to these paths only):",
    pages,
    "",
    "Documentation excerpts:",
    context,
  ]
    .filter(Boolean)
    .join("\n")
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "cadcamfun-guide"

const isLocalOrigin = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname.endsWith(".local") ||
  hostname.endsWith(".localhost")

/**
 * Wraps an answer stream in our SSE protocol: `meta`, `tool`, `sources`,
 * `reasoning`, `delta`/`text`, `status`, `artifact`, `notice`, `error`, `done`.
 */
function eventStream(input: {
  answer: AsyncGenerator<AnswerChunk>
  /** `append`: chunks are deltas. `replace`: each chunk is the full answer. */
  mode: "append" | "replace"
  sources: Source[]
  tools?: ToolCall[]
  backend: Backend
  sessionID?: string
  /** Publish a guide even when the model did not volunteer an artifact block. */
  forceArtifact?: boolean
  titleHint: string
  publish: (draft: ArtifactRequest) => Promise<unknown>
}) {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown) => controller.enqueue(encoder.encode(sse(event, data)))

      emit("meta", { backend: input.backend, sessionID: input.sessionID })
      for (const tool of input.tools ?? []) emit("tool", tool)
      emit("sources", input.sources)

      let answer = ""
      let sent = 0
      let announced = false
      try {
        for await (const chunk of input.answer) {
          if (chunk.kind === "reasoning") {
            emit("reasoning", { text: chunk.text })
            continue
          }

          answer = input.mode === "replace" ? chunk.text : answer + chunk.text

          if (!announced && answer.includes(ARTIFACT_MARKER)) {
            announced = true
            emit("status", { message: "Building a shareable guide…" })
          }

          // nikcli reports the whole message, so replace; Workers AI streams
          // tokens, so append. Either way an in-progress artifact fence is held
          // back until the block is complete and can be stripped.
          if (input.mode === "replace") {
            emit("text", { text: visibleAnswer(answer) })
            continue
          }

          const visible = withheldTail(visibleAnswer(answer))
          if (visible.length > sent) {
            emit("delta", { text: visible.slice(sent) })
            sent = visible.length
          }
        }

        if (!answer.trim()) {
          emit("error", { message: "The model returned an empty answer." })
        } else {
          const { text, artifact } = extractArtifact(answer)
          emit("text", { text })

          // Either the model asked for an artifact, or the question did: a
          // request to build something always ends with a published page.
          const draft =
            artifact ??
            (input.forceArtifact && text.trim().length > 200
              ? {
                  title: input.titleHint,
                  filename: `${slugify(input.titleHint)}.html`,
                  content: text,
                }
              : null)

          if (draft) {
            if (!announced) emit("status", { message: "Building your guide…" })
            try {
              const published = await input.publish(draft)
              if (published) emit("artifact", published)
              else emit("notice", { message: "Guides are not enabled on this deployment, so this answer stays in the chat." })
            } catch {
              emit("notice", {
                message: "The guide for this answer could not be published.",
              })
            }
          }
        }
      } catch (error) {
        emit("error", {
          message: error instanceof Error ? error.message : "The answer stream failed.",
        })
      } finally {
        emit("done", {})
        controller.close()
      }
    },
  })
}

export const POST: APIRoute = async ({ request, locals, url }) => {
  const env = locals.runtime?.env as CloudflareEnv | undefined
  const nikcli = env ? nikcliBackendConfig(env) : null
  if (!env?.AI && !nikcli) {
    return json(
      {
        error: "The docs assistant is not configured on this deployment (missing Workers AI binding).",
      },
      503,
    )
  }

  let body: { messages?: unknown; path?: unknown; sessionID?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: "Invalid JSON body." }, 400)
  }

  const messages = parseMessages(body.messages)
  const question = [...messages].reverse().find((message) => message.role === "user")?.content
  if (!question) return json({ error: "Ask a question first." }, 400)

  if (env && (await rateLimited(env, request))) {
    return json(
      {
        error: "Too many questions from this address in the last hour. Try again later, or read the docs directly.",
      },
      429,
    )
  }

  const currentPath = typeof body.path === "string" ? normalizeDocsPath(body.path, url.origin) : undefined

  // Retrieval: rank pages across the conversation, weighted to the latest
  // question, then ground on the top pages plus the page being read.
  const conversation = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join(" ")
  let picked = selectDocs({
    query: `${question} ${question} ${conversation}`,
    currentPath,
    limit: MAX_DOCS,
  })
  const tokens = tokenize(question)

  // Keywords find the obvious pages; a tool call catches the ones the user
  // described without naming. The model's picks lead, lexical results fill the
  // remaining slots, and either half alone is enough if the other fails.
  const tools: ToolCall[] = []
  if (env?.AI) {
    const planned = await planDocs({
      ai: env.AI,
      model: env.DOCS_ASSISTANT_MODEL || DEFAULT_MODEL,
      question,
      limit: MAX_DOCS,
    })
    if (planned.call) tools.push(planned.call)

    if (planned.paths.length > 0) {
      const order = [...(currentPath ? [currentPath] : []), ...planned.paths, ...picked.map((entry) => entry.href)]
      picked = [...new Set(order)].slice(0, MAX_DOCS).flatMap((path) => {
        const entry = docsIndex.find((item) => item.href === path)
        return entry ? [{ ...entry, score: 1 }] : []
      })
    }
  }

  const fetcher = docsFetcher(env)
  const loaded = await Promise.all(
    picked.map(async (entry) => {
      try {
        return {
          entry,
          markdown: condenseMarkdown(await loadDoc(entry.href, url.origin, fetcher), tokens, DOC_BUDGET),
        }
      } catch {
        return null
      }
    }),
  )

  const grounded = loaded.filter((item): item is NonNullable<typeof item> => item !== null)
  if (grounded.length === 0) {
    return json({ error: "Could not load the documentation right now. Try again." }, 502)
  }

  const context = grounded
    .map((item) => `<page title="${item.entry.title}" path="${item.entry.href}">\n${item.markdown}\n</page>`)
    .join("\n\n")

  const sources: Source[] = grounded.map((item) => ({
    title: item.entry.title,
    href: item.entry.href,
  }))
  const currentPage = currentPath ? sources.find((source) => source.href === currentPath) : undefined
  const system = systemPrompt(context, currentPage)

  const wantsGuide = wantsArtifact(question)
  const model = env?.DOCS_ASSISTANT_MODEL || DEFAULT_MODEL
  const artifactModel = env?.DOCS_ASSISTANT_ARTIFACT_MODEL || DEFAULT_ARTIFACT_MODEL

  /**
   * Renders the outline the chat model wrote into the published guide. The
   * design lives in HTML_BUILDER_PROMPT, so every artifact looks the same.
   */
  const renderArtifact = async (draft: ArtifactRequest) => {
    if (!env?.AI) return draft

    const builderMessages = [
      { role: "system", content: HTML_BUILDER_PROMPT },
      {
        role: "user",
        content: `The user asked: ${question}\n\nBuild the interactive guide "${draft.title}" from this outline:\n\n${draft.content}\n\nSupporting documentation (use it for accuracy, do not invent anything):\n${context}`,
      },
    ]

    try {
      // Streamed, not awaited as one response: reasoning models return an
      // empty message when asked for the whole page at once, but stream the
      // document fine — and the parser keeps reasoning out of the HTML.
      const upstream = (await env.AI.run(artifactModel, {
        stream: true,
        max_tokens: MAX_ARTIFACT_OUTPUT_TOKENS,
        temperature: 0.4,
        messages: builderMessages,
      })) as ReadableStream<Uint8Array>

      let text = ""
      for await (const chunk of workersAiDeltas(upstream)) {
        if (chunk.kind === "text") text += chunk.text
      }

      text = text
        .replace(/^\s*```[a-z]*\n?/i, "")
        .replace(/```\s*$/, "")
        .trim()

      // Anything shorter is a refusal or a stub — keep the outline instead,
      // which still publishes as a readable page.
      return text.length > 400 ? { ...draft, content: text } : draft
    } catch {
      return draft
    }
  }

  const publish = async (draft: ArtifactRequest) => {
    if (!env?.ARTIFACTS) return null
    return publishArtifact(env.ARTIFACTS, await renderArtifact(draft), {
      origin: url.origin,
      // Local and preview runs keep their own origin: the artifact lives in
      // that deployment's bucket, so a canonical-origin link would 404.
      publicOrigin: isLocalOrigin(url.hostname) ? undefined : env.ARTIFACT_PUBLIC_ORIGIN,
      sessionID: typeof body.sessionID === "string" ? body.sessionID : undefined,
    })
  }

  const streamHeaders = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  }

  // Preferred backend: a real nikcli session, when the deployment has one.
  if (nikcli) {
    try {
      const turn = await runNikcliTurn({
        config: nikcli,
        sessionID: typeof body.sessionID === "string" ? body.sessionID : undefined,
        prompt: `${system}\n\n---\n\nUser question: ${question}`,
        signal: request.signal,
      })

      return new Response(
        eventStream({
          answer: (async function* () {
            for await (const text of turn.stream) yield { kind: "text", text } as AnswerChunk
          })(),
          mode: "replace",
          sources,
          tools,
          backend: "nikcli",
          forceArtifact: wantsGuide,
          titleHint: guideTitle(question),
          sessionID: turn.sessionID,
          publish,
        }),
        { headers: streamHeaders },
      )
    } catch {
      // nikcli server unreachable — fall through to Workers AI.
    }
  }

  if (!env?.AI) {
    return json({ error: "The nikcli backend is unavailable right now." }, 502)
  }

  try {
    const upstream = (await env.AI.run(model, {
      stream: true,
      max_tokens: wantsGuide ? MAX_OUTLINE_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      messages: [{ role: "system", content: system }, ...messages],
    })) as ReadableStream<Uint8Array>

    return new Response(
      eventStream({
        answer: workersAiDeltas(upstream),
        mode: "append",
        sources,
        tools,
        backend: "workers-ai",
        forceArtifact: wantsGuide,
        titleHint: guideTitle(question),
        publish,
      }),
      { headers: streamHeaders },
    )
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? `Workers AI request failed: ${error.message}` : "Workers AI request failed.",
      },
      502,
    )
  }
}

export const GET: APIRoute = () => json({ error: "Use POST with { messages, path, sessionID }." }, 405)
