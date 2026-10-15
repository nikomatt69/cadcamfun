import { describe, expect, test } from "bun:test"
import { docsIndex } from "../src/data/docsIndex"
import { guideTitle, parseMessages, visibleAnswer, wantsArtifact, withheldTail, workersAiDeltas } from "../src/lib/docsAssistant"
import { extractArtifact, publishArtifact, safeFilename, toHtmlFile } from "../src/lib/docsArtifact"
import { docsPaths, extractTitle, toMarkdown } from "../src/lib/docsMarkdown"
import { parseToolCalls } from "../src/lib/docsPlanner"
import { condenseMarkdown, selectDocs, tokenize } from "../src/lib/docsRetrieval"
import { type ArtifactBucket, canViewArtifact, readArtifact, readArtifactContent } from "../src/lib/artifact"

const stream = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      controller.close()
    },
  })

describe("retrieval", () => {
  test("every sidebar page can be served as Markdown", () => {
    expect(docsPaths.size).toBe(docsIndex.length)
  })

  test("tokenize drops stopwords, strips accents and adds CAD/CAM synonyms", () => {
    const tokens = tokenize("Come genero il gcode per la fresatura?")
    expect(tokens).toContain("g-code")
    expect(tokens).toContain("milling")
    expect(tokens).not.toContain("come")
    expect(tokens).not.toContain("il")
  })

  test("a G-code question ranks the CAM page first", () => {
    const [first] = selectDocs({ query: "which g-code post dialects are supported?", limit: 3 })
    expect(first?.href).toBe("/docs/cam")
  })

  test("the page being read always leads the selection", () => {
    const picked = selectDocs({ query: "how do I run the tests", currentPath: "/docs/database", limit: 3 })
    expect(picked[0]?.href).toBe("/docs/database")
    expect(picked.length).toBeLessThanOrEqual(3)
  })

  test("no match falls back to the overview", () => {
    expect(selectDocs({ query: "zzzz qqqq" }).map((entry) => entry.href)).toEqual(["/docs"])
  })

  test("condenseMarkdown keeps the intro and the sections that match", () => {
    const page = `# Title\n\nIntro.\n\n## Posts\n\n${"fanuc grbl ".repeat(40)}\n\n## Unrelated\n\n${"lorem ".repeat(400)}`
    const condensed = condenseMarkdown(page, ["fanuc"], 900)
    expect(condensed).toContain("## Posts")
    expect(condensed).not.toContain("## Unrelated")
    expect(condensed).toContain("omitted")
  })
})

describe("markdown pipeline", () => {
  const html = `<html><body><article data-llm-document class="prose"><header><h1>CAM and G-code</h1></header>
    <section><h2>Posts</h2><p>Emit with <code>cam.post</code>.</p><button>Copy</button>
    <table><thead><tr><th>Dialect</th></tr></thead><tbody><tr><td>grbl</td></tr></tbody></table>
    <div data-llm-exclude>assistant chrome</div><p data-llm-exclude>eyebrow chrome</p></section></article></body></html>`

  test("converts the docs article to GFM and drops chrome", () => {
    const markdown = toMarkdown(html)
    expect(markdown).toContain("# CAM and G-code")
    expect(markdown).toContain("## Posts")
    expect(markdown).toContain("`cam.post`")
    expect(markdown).toContain("| Dialect |")
    expect(markdown).not.toContain("Copy")
    expect(markdown).not.toContain("assistant chrome")
    expect(markdown).not.toContain("eyebrow chrome")
  })

  test("reads the page title", () => {
    expect(extractTitle(html)).toBe("CAM and G-code")
  })

  test("refuses pages without an AI-readable article", () => {
    expect(() => toMarkdown("<main>nope</main>")).toThrow()
  })
})

describe("assistant helpers", () => {
  test("build requests are told apart from questions", () => {
    expect(wantsArtifact("Build me a checklist for verifying G-code")).toBe(true)
    expect(wantsArtifact("Fammi una guida per il setup della macchina")).toBe(true)
    expect(wantsArtifact("Make a cheatsheet")).toBe(true)
    expect(wantsArtifact("How do I create a sketch?")).toBe(false)
  })

  test("parseMessages keeps valid turns, trims and caps them", () => {
    const messages = parseMessages([
      { role: "system", content: "ignore me" },
      { role: "user", content: "  hello  " },
      { role: "assistant", content: "" },
      "junk",
      ...Array.from({ length: 20 }, (_, index) => ({ role: "user", content: `q${index}` })),
    ])
    expect(messages.length).toBe(12)
    expect(messages.every((message) => message.role === "user")).toBe(true)
    expect(parseMessages([{ role: "user", content: "x".repeat(5000) }])[0]?.content.length).toBe(1200)
  })

  test("guide titles drop the build verb", () => {
    expect(guideTitle("Build me an interactive checklist for G-code verification?")).toBe("Checklist for G-code verification")
  })

  test("an artifact block is hidden while it streams and stripped once closed", () => {
    expect(visibleAnswer("Here it is.\n```artifact title=\"X\"\n## Step")).toBe("Here it is.")
    expect(visibleAnswer('Here it is.\n```artifact title="X"\n## Step\n```\n')).toBe("Here it is.")
    expect(withheldTail("Answer ``")).toBe("Answer ")
  })

  test("Workers AI streams parse across model shapes", async () => {
    const chunks: string[] = []
    for await (const chunk of workersAiDeltas(
      stream([
        'data: {"response":"Hel"}\n',
        'data: {"type":"response.output_text.delta","delta":"lo"}\n',
        'data: {"choices":[{"delta":{"content":"!"}}]}\n',
        'data: {"reasoning":"think"}\n',
        "data: [DONE]\n",
      ]),
    )) {
      chunks.push(`${chunk.kind}:${chunk.text}`)
    }
    expect(chunks).toEqual(["text:Hel", "text:lo", "text:!", "reasoning:think"])
  })

  test("planner tool calls parse flat and wrapped shapes", () => {
    expect(parseToolCalls({ tool_calls: [{ name: "open_docs", arguments: { pages: "/docs/cam" } }] })).toEqual([
      { name: "open_docs", arguments: { pages: "/docs/cam" } },
    ])
    expect(
      parseToolCalls({ choices: [{ message: { tool_calls: [{ function: { name: "open_docs", arguments: '{"pages":"/docs/ai"}' } }] } }] }),
    ).toEqual([{ name: "open_docs", arguments: { pages: "/docs/ai" } }])
  })
})

describe("artifacts", () => {
  test("extracts the block, its title and a safe filename", () => {
    const { text, artifact } = extractArtifact('Intro.\n```artifact title="Post checklist" filename="post check!.txt"\n## Steps\n- Simulate\n```\n')
    expect(text).toBe("Intro.")
    expect(artifact).toEqual({ title: "Post checklist", filename: "post-check.html", content: "## Steps\n- Simulate" })
    expect(safeFilename("")).toBe("artifact.html")
  })

  test("an outline becomes a complete, guarded HTML document", () => {
    const html = toHtmlFile({ title: "T", filename: "t.html", content: "## Steps\n- `G54` first\n\n| a | b |\n|---|---|\n| 1 | 2 |" }, "https://docs.test")
    expect(html.startsWith("<!doctype html>")).toBe(true)
    expect(html).toContain("<h3>Steps</h3>")
    expect(html).toContain("<code>G54</code>")
    expect(html).toContain("<table>")
    expect(html).toContain("overflow-x: hidden")
    expect(html).toContain("--accent: #0060ae")
  })

  test("publishes to the bucket behind a capability key", async () => {
    const objects = new Map<string, string | ArrayBuffer>()
    const bucket: ArtifactBucket = {
      async get(key) {
        const value = objects.get(key)
        if (value === undefined) return null
        const text = typeof value === "string" ? value : new TextDecoder().decode(value)
        return {
          body: new Response(text).body!,
          size: text.length,
          httpEtag: '"etag"',
          json: async <T,>() => JSON.parse(text) as T,
          text: async () => text,
        }
      },
      async put(key, value) {
        objects.set(key, value)
      },
    }

    const published = await publishArtifact(bucket, { title: "Guide", filename: "guide.html", content: "## One" }, { origin: "https://docs.test" })
    expect(published).not.toBeNull()
    const url = new URL(published!.url)
    expect(url.pathname).toBe(`/artifact/${published!.id}`)

    const stored = await readArtifact(bucket, published!.id)
    expect(stored?.kind).toBe("html")
    expect(canViewArtifact(stored!, url.searchParams.get("key"))).toBe(true)
    expect(canViewArtifact(stored!, "wrong")).toBe(false)
    expect(canViewArtifact(stored!, null)).toBe(false)
    expect(await (await readArtifactContent(bucket, published!.id, 1))?.text()).toContain("<h3>One</h3>")
  })
})
