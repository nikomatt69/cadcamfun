import { docsIndex } from "../data/docsIndex"
import { docsPaths } from "./docsMarkdown"

/**
 * Tool-calling retrieval planner.
 *
 * Lexical scoring handles most questions, but people describe CAD/CAM
 * problems without naming the page ("the arcs come out wrong on my Fanuc" →
 * CAM and G-code). The assistant asks the model which pages to open — a real
 * function call against the same Workers AI model. Any failure falls back to
 * lexical ranking, so the planner is always optional.
 */

export type ToolCall = {
  name: string
  arguments: Record<string, unknown>
  result: string
}

export type PlannedDocs = {
  paths: string[]
  call: ToolCall | null
}

/** Workers AI proxies vLLM's OpenAI endpoint, which requires this shape. */
const OPEN_DOCS_TOOL = {
  type: "function",
  function: {
    name: "open_docs",
    description:
      "Open the CADCAMFUN documentation pages needed to answer the question. Choose up to 3 paths from the table of contents.",
    parameters: {
      type: "object",
      properties: {
        pages: {
          type: "string",
          description: "Comma-separated documentation paths, e.g. /docs/cam,/docs/setups",
        },
        reason: {
          type: "string",
          description: "One short sentence explaining the choice.",
        },
      },
      required: ["pages"],
    },
  },
}

type RawToolCall = {
  name?: unknown
  arguments?: unknown
  function?: { name?: unknown; arguments?: unknown }
}

export function parseToolCalls(response: unknown) {
  const data = response as {
    tool_calls?: RawToolCall[]
    choices?: Array<{ message?: { tool_calls?: RawToolCall[] } }>
  }
  const raw = Array.isArray(data?.tool_calls) ? data.tool_calls : (data?.choices?.[0]?.message?.tool_calls ?? [])

  return raw.flatMap((entry) => {
    // Responses come back either flat or wrapped in `function`.
    const call = {
      name: entry.function?.name ?? entry.name,
      arguments: entry.function?.arguments ?? entry.arguments,
    }
    if (typeof call.name !== "string") return []
    let args: Record<string, unknown> = {}
    if (typeof call.arguments === "string") {
      try {
        args = JSON.parse(call.arguments) as Record<string, unknown>
      } catch {
        args = { pages: call.arguments }
      }
    } else if (call.arguments && typeof call.arguments === "object") {
      args = call.arguments as Record<string, unknown>
    }
    return [{ name: call.name, arguments: args }]
  })
}

/**
 * Asks the model which documentation pages to open. Returns validated paths;
 * an empty list means the caller should keep its lexical selection.
 */
export async function planDocs(input: {
  ai: NonNullable<CloudflareEnv["AI"]>
  model: string
  question: string
  limit: number
}): Promise<PlannedDocs> {
  const toc = docsIndex.map((entry) => `${entry.href} — ${entry.title}: ${entry.summary}`).join("\n")

  try {
    const response = await input.ai.run(input.model, {
      max_tokens: 200,
      temperature: 0,
      tools: [OPEN_DOCS_TOOL],
      messages: [
        {
          role: "system",
          content: `You route questions about CADCAMFUN, a local-first native CAD/CAM desktop app (sketches, 3D modelling, B-rep, toolpaths, G-code posts, Bun sidecar, Tauri desktop, nikcli-based AI), to its documentation. Call open_docs with the paths that answer the question. Table of contents:\n${toc}`,
        },
        { role: "user", content: input.question },
      ],
    })

    const call = parseToolCalls(response).find((item) => item.name === "open_docs")
    if (!call) return { paths: [], call: null }

    const raw = call.arguments.pages
    const paths = (typeof raw === "string" ? raw.split(/[,\s]+/) : Array.isArray(raw) ? raw.map(String) : [])
      .map((path) => path.trim().replace(/["'`]/g, "").replace(/\/$/, ""))
      .filter((path) => docsPaths.has(path))
      .slice(0, input.limit)

    return {
      paths,
      call: {
        name: "open_docs",
        arguments: { pages: paths },
        result: paths.length ? `opened ${paths.length} page${paths.length === 1 ? "" : "s"}` : "no match",
      },
    }
  } catch {
    return { paths: [], call: null }
  }
}
