import { beforeEach, describe, expect, test } from "bun:test"
import { MAX_ATTACHMENTS, MAX_IMAGE_BYTES, clearAttachments, getAttachment, kindOf, prepareAttachments } from "../src/attachments.ts"
import { buildTools } from "../src/tools/catalogue.ts"

beforeEach(() => clearAttachments())

const png = Buffer.from("fake-png").toString("base64")

describe("chat attachments", () => {
  test("images become file parts, text files are kept for the tools", () => {
    const out = prepareAttachments("p", [
      { name: "sketch.png", mime: "image/png", data: png, encoding: "base64" },
      { name: "plate.dxf", data: "0\nSECTION\n" },
      { name: "notes.txt", data: "stock is 6061" }
    ])
    expect(out.parts).toEqual([{ type: "file", mime: "image/png", filename: "sketch.png", url: `data:image/png;base64,${png}` }])
    expect(out.stored).toEqual(["plate.dxf", "notes.txt"])
    expect(getAttachment("p", "PLATE.DXF")).toBe("0\nSECTION\n")
    expect(getAttachment("other", "plate.dxf")).toBeUndefined()
    expect(out.note).toContain('cad_edit action import with attachment "plate.dxf"')
    expect(out.note).toContain("stock is 6061")
    expect(out.note).not.toContain("SECTION")
  })

  test("what cannot be read is reported, never dropped silently", () => {
    const big = "A".repeat(Math.ceil(((MAX_IMAGE_BYTES + 10) * 4) / 3))
    const files = [
      { name: "a.exe", data: "x" }, { name: "huge.png", mime: "image/png", data: big },
      ...Array.from({ length: MAX_ATTACHMENTS }, (_, i) => ({ name: `f${i}.txt`, data: "x" }))
    ]
    const out = prepareAttachments("p", files)
    expect(out.rejected.map((r) => r.name)).toEqual(["a.exe", "huge.png", "f3.txt", "f4.txt"])
    expect(out.note).toContain("a.exe: NOT read")
    expect(kindOf({ name: "photo.JPG" })).toBe("image")
    expect(kindOf({ name: "x.iges" })).toBe("unsupported")
    expect(kindOf({ name: "part.PDF" })).toBe("pdf")
    expect(kindOf({ name: "x", mime: "application/pdf" })).toBe("pdf")
  })

  test("cad_edit import reads an attached DXF by name and says what is attached when it is not found", async () => {
    const added: unknown[] = []
    const handlers = new Proxy({} as never, { get: () => async (_p: string, e: unknown) => { added.push(e); return { ok: true, ids: [], elements: [], drawingId: "d", projectId: "p" } } })
    const tool = buildTools(handlers, "p").find((t) => t.id === "cad_edit")!
    const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
    const square = (s: number) => [[0, 0, s, 0], [s, 0, s, s], [s, s, 0, s], [0, s, 0, 0]].map(([a, b, c, d]) => `0\nLINE\n8\n0\n10\n${a}\n20\n${b}\n11\n${c}\n21\n${d}\n`).join("")
    prepareAttachments("p", [{ name: "sq.dxf", data: `0\nSECTION\n2\nENTITIES\n${square(20)}0\nENDSEC\n0\nEOF\n` }])
    const ok = JSON.parse(await tool.execute({ action: "import", attachment: "sq.dxf", depth: 5 }, ctx)) as { ok: boolean; stats: { solids: number } }
    expect(ok.ok).toBe(true)
    expect(ok.stats.solids).toBe(1)
    const missing = JSON.parse(await tool.execute({ action: "import", attachment: "nope.dxf", depth: 5 }, ctx)) as { ok: boolean; error: string }
    expect(missing.ok).toBe(false)
    expect(missing.error).toContain("Attached: sq.dxf")
    const neither = JSON.parse(await tool.execute({ action: "import", depth: 5 }, ctx)) as { ok: boolean }
    expect(neither.ok).toBe(false)
  })

  test("cad_edit import reads a STEP attachment with its own height and reports what a prism cannot say", async () => {
    const added: Array<Array<Record<string, unknown>>> = []
    const handlers = new Proxy({} as never, { get: () => async (_p: string, e: Array<Record<string, unknown>>) => { added.push(e); return { ok: true, ids: [], elements: [], drawingId: "d", projectId: "p" } } })
    const tool = buildTools(handlers, "p").find((t) => t.id === "cad_edit")!
    const ctx = { sessionId: "s", projectId: "p", signal: new AbortController().signal }
    const pt = (id: number, x: number, y: number, z: number) => `#${id}=CARTESIAN_POINT('',(${x}.,${y}.,${z}.));\n`
    const step = `ISO-10303-21;\nDATA;\n#900=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));\n` +
      [pt(1, 0, 0, 0), pt(2, 30, 0, 0), pt(3, 30, 20, 0), pt(4, 0, 20, 0), pt(5, 0, 0, 6)].join("") +
      [1, 2, 3, 4, 5].map((i) => `#1${i}=VERTEX_POINT('',#${i});\n`).join("") + "#20=LINE('',#1,#1);\n" +
      "#30=EDGE_CURVE('',#11,#12,#20,.T.);\n#31=EDGE_CURVE('',#12,#13,#20,.T.);\n#32=EDGE_CURVE('',#13,#14,#20,.T.);\n#33=EDGE_CURVE('',#14,#11,#20,.T.);\n" +
      "#42=DIRECTION('',(0.,0.,1.));\n#43=DIRECTION('',(1.,0.,0.));\n" +
      "#50=ORIENTED_EDGE('',*,*,#33,.F.);\n#51=ORIENTED_EDGE('',*,*,#32,.F.);\n#52=ORIENTED_EDGE('',*,*,#31,.F.);\n#53=ORIENTED_EDGE('',*,*,#30,.F.);\n" +
      "#60=EDGE_LOOP('',(#50,#51,#52,#53));\n#62=FACE_OUTER_BOUND('',#60,.T.);\n#70=ADVANCED_FACE('',(#62),#71,.F.);\n#71=PLANE('',#72);\n#72=AXIS2_PLACEMENT_3D('',#1,#42,#43);\nENDSEC;\nEND-ISO-10303-21;\n"
    prepareAttachments("p", [{ name: "block.STEP", data: step }])
    const out = JSON.parse(await tool.execute({ action: "import", attachment: "block.STEP" }, ctx)) as { ok: boolean; stats: { solids: number } }
    expect(out.ok).toBe(true)
    expect(out.stats.solids).toBe(1)
    expect(added[0]![0]).toMatchObject({ type: "extrusion", depth: 6 })
    const noDepth = JSON.parse(await tool.execute({ action: "import", content: "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n", format: "dxf" }, ctx)) as { ok: boolean }
    expect(noDepth.ok).toBe(false)
  })

  test("a PDF becomes a file part the model reads, with its own size limit", () => {
    const pdf = Buffer.from("%PDF-1.4 test").toString("base64")
    const out = prepareAttachments("p-pdf", [{ name: "drawing.pdf", mime: "application/pdf", data: pdf, encoding: "base64" }])
    expect(out.parts).toEqual([{ type: "file", mime: "application/pdf", filename: "drawing.pdf", url: `data:application/pdf;base64,${pdf}` }])
    expect(out.note).toContain("PDF document")
    const tooBig = "A".repeat(14 * 1024 * 1024)
    const refused = prepareAttachments("p-pdf", [{ name: "huge.pdf", data: tooBig, encoding: "base64" }])
    expect(refused.parts).toEqual([])
    expect(refused.rejected[0]?.reason).toContain("PDF larger than 10 MB")
  })
})
