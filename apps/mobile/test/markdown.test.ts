import { describe, expect, test } from "bun:test"
import { hasInteractiveContent, inlineText, parseInline, parseMarkdown, safeHref, speechText, type Block, type Inline } from "../lib/markdown"

const kinds = (blocks: readonly Block[]) => blocks.map((block) => block.t)
const text = (nodes: readonly Inline[]) => inlineText(nodes)

describe("blocks", () => {
  test("paragraphs, headings and rules", () => {
    const blocks = parseMarkdown("# Title\n\nFirst line\nsecond line\n\n---\n\n### Sub")
    expect(kinds(blocks)).toEqual(["h", "p", "hr", "h"])
    expect(blocks[0]).toMatchObject({ t: "h", level: 1 })
    expect(blocks[3]).toMatchObject({ t: "h", level: 3 })
    // A single newline inside a paragraph is a line break: the model uses it that way.
    expect(blocks[1]).toMatchObject({ t: "p", c: [{ t: "text", v: "First line" }, { t: "br" }, { t: "text", v: "second line" }] })
  })

  test("a hash without a space is text, not a heading", () => {
    expect(kinds(parseMarkdown("#hashtag and #1"))).toEqual(["p"])
  })

  test("fenced code keeps its text, language and indentation", () => {
    const [block] = parseMarkdown("```gcode\nG21\n  G1 X10\n```")
    expect(block).toMatchObject({ t: "code", lang: "gcode", v: "G21\n  G1 X10", closed: true })
  })

  test("an unclosed fence is a code block that is still open, and swallows the rest", () => {
    const blocks = parseMarkdown("Here:\n\n```json\n{\n  \"a\": 1")
    expect(kinds(blocks)).toEqual(["p", "code"])
    expect(blocks[1]).toMatchObject({ t: "code", lang: "json", closed: false, v: "{\n  \"a\": 1" })
  })

  test("a longer fence is not closed by a shorter one", () => {
    const [block] = parseMarkdown("````md\n```\ninner\n```\n````")
    expect(block).toMatchObject({ t: "code", closed: true, v: "```\ninner\n```" })
  })

  test("bullet, ordered and task lists, nested", () => {
    const [list] = parseMarkdown("1. Sketch\n   - on XY\n   - closed\n2. Extrude\n3. [x] Done")
    expect(list).toMatchObject({ t: "list", ordered: true, start: 1 })
    if (list?.t !== "list") throw new Error("not a list")
    expect(list.items).toHaveLength(3)
    expect(kinds(list.items[0]!.blocks)).toEqual(["p", "list"])
    const nested = list.items[0]!.blocks[1]
    expect(nested?.t === "list" ? nested.items.length : 0).toBe(2)
    expect(list.items[2]).toMatchObject({ checked: true })
  })

  test("a list that starts at another number keeps it, and a list interrupts a paragraph", () => {
    const blocks = parseMarkdown("Steps:\n3. third\n4. fourth")
    expect(kinds(blocks)).toEqual(["p", "list"])
    expect(blocks[1]).toMatchObject({ t: "list", start: 3 })
  })

  test("nested bullets indented by two spaces under an ordered item stay nested", () => {
    const [list] = parseMarkdown("1. Cut\n  - rough\n  - finish")
    if (list?.t !== "list") throw new Error("not a list")
    expect(list.items).toHaveLength(1)
    expect(kinds(list.items[0]!.blocks)).toEqual(["p", "list"])
  })

  test("block quotes parse their content", () => {
    const [quote] = parseMarkdown("> **Note**\n> keep the tool short")
    expect(quote?.t).toBe("quote")
    expect(quote?.t === "quote" ? kinds(quote.blocks) : []).toEqual(["p"])
  })

  test("tables with alignment, short rows padded", () => {
    const [table] = parseMarkdown("| Part | Qty |\n| :--- | ---: |\n| Bolt | 4 |\n| Nut |")
    if (table?.t !== "table") throw new Error("not a table")
    expect(table.align).toEqual(["left", "right"])
    expect(table.head.map(text)).toEqual(["Part", "Qty"])
    expect(table.rows.map((row) => row.map(text))).toEqual([["Bolt", "4"], ["Nut", ""]])
  })

  test("a lone rule-like line is not a table", () => {
    expect(kinds(parseMarkdown("a | b\n\nplain"))).toEqual(["p", "p"])
  })

  test("CRLF and tabs are normalized and empty input is empty", () => {
    expect(kinds(parseMarkdown("a\r\n\r\nb"))).toEqual(["p", "p"])
    expect(parseMarkdown("")).toEqual([])
    expect(parseMarkdown("\n\n  \n")).toEqual([])
  })
})

describe("inline", () => {
  test("strong, emphasis, strike and code", () => {
    expect(parseInline("a **b** *c* ~~d~~ `e`")).toEqual([
      { t: "text", v: "a " }, { t: "strong", c: [{ t: "text", v: "b" }] }, { t: "text", v: " " },
      { t: "em", c: [{ t: "text", v: "c" }] }, { t: "text", v: " " }, { t: "del", c: [{ t: "text", v: "d" }] },
      { t: "text", v: " " }, { t: "code", v: "e" },
    ])
  })

  test("tool and parameter names are never turned into emphasis", () => {
    for (const source of ["call cad_extrude_profile then cam_post_gcode", "cut *.nc files", "2 * 3 * 4", "snake_case and __init__x", "a_b_c"]) {
      expect(parseInline(source).every((node) => node.t === "text")).toBe(true)
    }
  })

  test("code spans protect their content", () => {
    expect(parseInline("`**not bold**` and ``a ` b``")).toEqual([{ t: "code", v: "**not bold**" }, { t: "text", v: " and " }, { t: "code", v: "a ` b" }])
  })

  test("an unclosed marker stays literal while the answer streams", () => {
    expect(parseInline("this is **bold")).toEqual([{ t: "text", v: "this is **bold" }])
    expect(parseInline("a `code")).toEqual([{ t: "text", v: "a `code" }])
    // The half-written destination is a bare address for now; the finished link replaces it.
    expect(parseInline("[link](https://exa")).toEqual([{ t: "text", v: "[link](" }, { t: "link", href: "https://exa", c: [{ t: "text", v: "https://exa" }] }])
  })

  test("bold italic, nesting and escapes", () => {
    expect(parseInline("***both***")).toEqual([{ t: "strong", c: [{ t: "em", c: [{ t: "text", v: "both" }] }] }])
    expect(parseInline("**a *b* c**")).toEqual([{ t: "strong", c: [{ t: "text", v: "a " }, { t: "em", c: [{ t: "text", v: "b" }] }, { t: "text", v: " c" }] }])
    expect(parseInline("\\*not em\\*")).toEqual([{ t: "text", v: "*not em*" }])
  })

  test("links, bare URLs and autolinks open only http(s), mail and phone", () => {
    expect(parseInline("[docs](https://example.com/a_b)")).toEqual([{ t: "link", href: "https://example.com/a_b", c: [{ t: "text", v: "docs" }] }])
    expect(parseInline("see https://example.com/x_y_z.")).toEqual([{ t: "text", v: "see " }, { t: "link", href: "https://example.com/x_y_z", c: [{ t: "text", v: "https://example.com/x_y_z" }] }, { t: "text", v: "." }])
    expect(parseInline("(https://example.com/a)")).toEqual([{ t: "text", v: "(" }, { t: "link", href: "https://example.com/a", c: [{ t: "text", v: "https://example.com/a" }] }, { t: "text", v: ")" }])
    expect(parseInline("<https://example.com>")[0]).toMatchObject({ t: "link", href: "https://example.com" })
    // A link the phone must not follow keeps its words and loses its destination.
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ t: "text", v: "x" }])
    expect(parseInline("[file](./notes.md)")).toEqual([{ t: "text", v: "file" }])
    expect(safeHref("javascript:alert(1)")).toBeNull()
    expect(safeHref("https://a b")).toBeNull()
    expect(safeHref("mailto:a@b.co")).toBe("mailto:a@b.co")
  })

  test("images become links to their address and never fetch anything", () => {
    expect(parseInline("![cam view](https://example.com/p.png)")).toEqual([{ t: "link", href: "https://example.com/p.png", c: [{ t: "text", v: "cam view" }] }])
  })

  test("a hard break by two trailing spaces", () => {
    expect(parseInline("a  \nb")).toEqual([{ t: "text", v: "a" }, { t: "br" }, { t: "text", v: "b" }])
  })

  test("pathological input terminates and keeps every character", () => {
    const noise = "*_`[(~".repeat(400)
    expect(text(parseInline(noise)).length).toBeGreaterThan(0)
    const deep = "*".repeat(3) + "x".repeat(50) + "_".repeat(2000)
    expect(() => parseInline(deep)).not.toThrow()
  })
})

describe("queries", () => {
  test("speech replaces code with its size", () => {
    const blocks = parseMarkdown("Here is the program:\n\n```gcode\nG0 X0\nG1 X5\n```\n\n- one\n- two")
    expect(speechText(blocks)).toBe("Here is the program:\ngcode code block, 2 lines\n• one\n• two")
  })

  test("only code and links need the answer split into separate accessibility elements", () => {
    expect(hasInteractiveContent(parseMarkdown("Plain **bold** answer\n\n- a\n- b"))).toBe(false)
    expect(hasInteractiveContent(parseMarkdown("```\ncode\n```"))).toBe(true)
    expect(hasInteractiveContent(parseMarkdown("- see [docs](https://example.com)"))).toBe(true)
    expect(hasInteractiveContent(parseMarkdown("> https://example.com"))).toBe(true)
  })

  test("parsing the same text twice returns the same blocks", () => {
    expect(parseMarkdown("same **text**")).toBe(parseMarkdown("same **text**"))
  })

  test("while an answer grows, the blocks before the last one keep their source", () => {
    const before = parseMarkdown("# Plan\n\nFirst paragraph.\n\nSecond par")
    const after = parseMarkdown("# Plan\n\nFirst paragraph.\n\nSecond paragraph, now longer.")
    expect(after.slice(0, 2).map((block) => block.raw)).toEqual(before.slice(0, 2).map((block) => block.raw))
    expect(after[2]?.raw).not.toBe(before[2]?.raw)
  })
})
