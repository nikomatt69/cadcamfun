import { describe, expect, test } from "bun:test"
import { baseEntity, emptyDrawing, makeArc, type Drawing, type Entity } from "../cad/entities.ts"
import { model } from "../cad/script.ts"
import { drawingToPdf, drawingsToPdf, sheetToPdf } from "./pdf.ts"
import { generateSheet } from "./sheet.ts"

const text = (b: Uint8Array): string => Array.from(b, (c) => String.fromCharCode(c)).join("")

/** A minimal independent reader: validates the cross-reference table byte offsets and stream lengths, returns the objects. */
const parsePdf = (bytes: Uint8Array): { objects: Map<number, string>; trailer: string } => {
  const s = text(bytes)
  expect(s.startsWith("%PDF-1.4\n")).toBe(true)
  expect(s.endsWith("%%EOF\n")).toBe(true)
  const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(s)![1])
  expect(s.slice(start, start + 4)).toBe("xref")
  const m = /xref\n0 (\d+)\n([\s\S]*?)trailer\n(<<[\s\S]*?>>)\nstartxref/.exec(s.slice(start))!
  const count = Number(m[1])
  const rows = m[2]!.split("\n").filter((r) => r !== "")
  expect(rows).toHaveLength(count)
  expect(rows[0]).toBe("0000000000 65535 f ")
  const objects = new Map<number, string>()
  rows.slice(1).forEach((row, i) => {
    expect(row).toMatch(/^\d{10} 00000 n $/)
    const at = Number(row.slice(0, 10))
    expect(s.slice(at, at + `${i + 1} 0 obj\n`.length)).toBe(`${i + 1} 0 obj\n`)
    const end = s.indexOf("endobj", at)
    const body = s.slice(at + `${i + 1} 0 obj\n`.length, end - 1)
    const len = /\/Length (\d+) >>\nstream\n/.exec(body)
    if (len !== null) {
      const from = body.indexOf("stream\n") + 7
      expect(body.slice(from + Number(len[1]), from + Number(len[1]) + 9)).toBe("endstream")
    }
    objects.set(i + 1, body)
  })
  return { objects, trailer: m[3]! }
}
const contentOf = (objects: Map<number, string>): string => [...objects.values()].filter((b) => b.includes("stream\n")).map((b) => b.slice(b.indexOf("stream\n") + 7, b.lastIndexOf("endstream"))).join("\n")

const withEntities = (entities: Entity[], layers = emptyDrawing("d", "demo").layers): Drawing => ({ ...emptyDrawing("d", "demo"), layers, entities })
const line = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<Entity> = {}): Entity => ({ ...baseEntity(id), _tag: "Line", start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, ...extra }) as Entity

describe("PDF structure", () => {
  test("a valid file: header, byte-exact xref, stream lengths, page size in points, no image", () => {
    const r = drawingToPdf(withEntities([line("a", 0, 0, 100, 50)]), { width: 297, height: 210 })
    const { objects, trailer } = parsePdf(r.bytes)
    expect(trailer).toContain("/Root 1 0 R")
    expect(objects.get(1)).toBe("<< /Type /Catalog /Pages 2 0 R >>")
    expect(objects.get(2)).toBe("<< /Type /Pages /Kids [5 0 R] /Count 1 >>")
    expect(objects.get(5)).toContain(`/MediaBox [0 0 ${Math.round((297 * 72 / 25.4) * 1e4) / 1e4} ${Math.round((210 * 72 / 25.4) * 1e4) / 1e4}]`)
    const all = text(r.bytes)
    expect(all).not.toContain("/Image")
    expect(all).not.toContain("DCTDecode")
    expect(objects.get(3)).toContain("/BaseFont /Helvetica")
    expect(r.pages).toBe(1)
    expect(r.objects).toBe(6)
  })

  test("deterministic output, metadata and multiple pages", () => {
    const d = withEntities([line("a", 0, 0, 10, 10)])
    const one = drawingsToPdf([{ drawing: d, width: 100, height: 100 }, { drawing: d, width: 50, height: 80 }], { title: "Set (A)", author: "Niko", date: "2026-10-31" })
    const two = drawingsToPdf([{ drawing: d, width: 100, height: 100 }, { drawing: d, width: 50, height: 80 }], { title: "Set (A)", author: "Niko", date: "2026-10-31" })
    expect(text(one.bytes)).toBe(text(two.bytes))
    const { objects } = parsePdf(one.bytes)
    expect(objects.get(4)).toContain("/Title (Set \\(A\\))")
    expect(objects.get(4)).toContain("/CreationDate (D:20261031000000Z)")
    expect(objects.get(2)).toContain("/Count 2")
    expect(() => drawingsToPdf([])).toThrow(/at least one page/)
    expect(() => drawingsToPdf([{ drawing: d, width: 0, height: 10 }])).toThrow(/positive/)
  })
})

describe("PDF content", () => {
  test("paths: coordinates in millimetres under a single scale to points, colour, width and dash from the layer and line style", () => {
    const d = withEntities([
      line("a", 10, 20, 30, 40),
      line("b", 0, 0, 5, 5, { lineStyle: { color: { r: 255, g: 0, b: 0 }, width: 0.5, type: "dashed" } } as Partial<Entity>)
    ])
    const content = contentOf(parsePdf(drawingToPdf(d).bytes).objects)
    expect(content).toContain("2.8346 0 0 2.8346 0 0 cm")
    expect(content).toContain("10 20 m 30 40 l S")
    expect(content).toContain("1 0 0 RG 0.5 w [3 1.5] 0 d")
    expect(content).toContain("0.1176 0.5333 0.898 RG") // layer-0 colour #1e88e5
  })

  test("a circle is four Beziers that stay on the circle; an arc ends at its end point", () => {
    const r = 12.5
    const d = withEntities([{ ...baseEntity("c"), _tag: "Circle", center: { x: 50, y: 40 }, radius: r } as Entity, makeArc("a", { x: 0, y: 0 }, 10, 0, Math.PI / 2)])
    const content = contentOf(parsePdf(drawingToPdf(d).bytes).objects)
    const circle = content.split("\n").find((l) => l.endsWith(" h S") && l.startsWith("62.5 40 m"))!
    const nums = circle.replace(/[a-zA-Z]/g, " ").trim().split(/\s+/).map(Number)
    // Every on-curve point (each third pair after the start) lies at distance r from the centre.
    for (let i = 0; i < 4; i++) {
      const x = nums[2 + i * 6 + 4]!, y = nums[2 + i * 6 + 5]!
      expect(Math.hypot(x - 50, y - 40)).toBeCloseTo(r, 3)
    }
    expect((circle.match(/ c/g) ?? []).length).toBe(4)
    const arc = content.split("\n").find((l) => l.startsWith("10 0 m"))!
    expect(arc.trim().endsWith("0 10 c S")).toBe(true)
  })

  test("text: Helvetica, WinAnsi escapes, exact alignment from AFM widths, rotation; substitutions are counted", () => {
    const t = (id: string, s: string, extra: object = {}): Entity => ({ ...baseEntity(id), _tag: "Text", position: { x: 100, y: 50 }, text: s, fontSize: 10, fontFamily: "Arial", rotation: 0, alignment: "left", baseline: "bottom", ...extra }) as Entity
    const r = drawingToPdf(withEntities([t("1", "Ø12 ±0.1 (A\\B)"), t("2", "Hi", { alignment: "right" }), t("3", "Hi", { rotation: Math.PI / 2 }), t("4", "⌀8 → x")]))
    const content = contentOf(parsePdf(r.bytes).objects)
    expect(content).toContain("(\\33012 \\2610.1 \\(A\\\\B\\)) Tj")
    // "Hi" = H 722 + i 222 = 944/1000 * 10 = 9.44: right-aligned text starts that far left of the anchor.
    expect(content).toContain("1 0 0 1 90.56 50 Tm (Hi) Tj")
    expect(content).toContain("0 1 -1 0 100 50 Tm (Hi) Tj")
    expect(r.substituted).toBe(2) // the diameter sign (-> Oslash) and the arrow (-> ?)
    expect(content).toContain("(\\3308 ? x) Tj")
  })

  test("polyline with a bulge becomes a Bezier arc; filled polylines (arrow heads) are filled; hatches fill or draw clipped lines", () => {
    const poly = { ...baseEntity("p"), _tag: "Polyline", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: false, bulge: [Math.tan(Math.PI / 8), 0, 0] } as Entity
    const arrow = { ...baseEntity("f"), _tag: "Polyline", points: [{ x: 0, y: 0 }, { x: 3, y: 1 }, { x: 3, y: -1 }], closed: true, userData: { fill: true } } as Entity
    const hatch = { ...baseEntity("h"), _tag: "Hatch", boundary: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], pattern: "lines", scale: 2, angle: 0 } as Entity
    const solid = { ...baseEntity("s"), _tag: "Hatch", boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }], pattern: "solid", scale: 1, angle: 0, fillColor: "#00ff00" } as Entity
    const r = drawingToPdf(withEntities([poly, arrow, hatch, solid]))
    const content = contentOf(parsePdf(r.bytes).objects)
    expect(content).toMatch(/0 0 m [\d. -]+ c 10 10 l S/) // the bulged first segment is a Bezier, the second a line
    expect(content).toMatch(/0 0 m 3 1 l 3 -1 l h B/)
    // Hatch lines every 2 mm over a 10 mm square: 4 or 5 horizontal lines.
    const hatchLines = content.split("\n").filter((l) => /^0(\.\d+)? \d+(\.\d+)? m 10(\.\d+)? \d+(\.\d+)? l S$/.test(l))
    expect(hatchLines.length).toBeGreaterThanOrEqual(4)
    expect(content).toContain("0 1 0 rg 0 0 m 4 0 l 4 4 l h f")
  })

  test("hidden entities and entities on hidden layers are not drawn and are counted; entity transforms and blocks nest", () => {
    const layers = [{ id: "layer-0", name: "0", visible: true, locked: false, color: "#000000" }, { id: "off", name: "off", visible: false, locked: false, color: "#000000" }]
    const block = { ...baseEntity("b"), _tag: "Block", name: "blk", basePoint: { x: 100, y: 100 }, entities: [line("in", 0, 0, 1, 1)] } as Entity
    const moved = line("m", 0, 0, 1, 0, { transform: { translation: { x: 5, y: 6 }, rotation: Math.PI / 2, scale: { x: 2, y: 2 } } } as Partial<Entity>)
    const r = drawingToPdf(withEntities([line("hidden", 0, 0, 1, 1, { visible: false } as Partial<Entity>), line("off", 0, 0, 2, 2, { layerId: "off" }), block, moved], layers))
    const content = contentOf(parsePdf(r.bytes).objects)
    expect(r.skipped).toBe(2)
    expect(content).not.toContain("2 2 l")
    expect(content).toContain("q\n1 0 0 1 100 100 cm")
    expect(content).toContain("q\n0 2 -2 0 5 6 cm")
    expect(r.drawn).toMatchObject({ Block: 1, Line: 2 })
  })
})

describe("a real sheet", () => {
  const bracket = (width: number) => {
    const m = model()
    m.param("w", width)
    m.extrude(m.sketch("XY").rectangle([0, 0], "w", 25), { depth: 10 })
    m.hole({ plane: "XY", offset: 10, at: [10, 12.5], diameter: 6, depth: 10 })
    return m.build()
  }

  test("the production sheet is written as vector paths and text, with the dimension values from the model", () => {
    const sheet = generateSheet(bracket(40), { size: "A3", views: ["front", "top"], iso: true, title: "Bracket", drawingNumber: "BR-1" })
    const r = sheetToPdf(sheet, { title: "Bracket" })
    const { objects } = parsePdf(r.bytes)
    const content = contentOf(objects)
    expect(text(r.bytes)).not.toContain("/Image")
    expect(content.split("\n").filter((l) => / l S$| c S$| h S$/.test(l)).length).toBeGreaterThan(40)
    expect(content).toContain("(BR-1)")
    for (const dim of sheet.dimensions.filter((d) => d.kind === "linear")) expect(content).toContain(`(${dim.text.replace(/[\\()]/g, "\\$&")})`)
    expect(r.substituted).toBe(0)
    expect(objects.get(5)).toContain(`/MediaBox [0 0 ${Math.round(420 * 72 / 25.4 * 1e4) / 1e4}`)
  })

  test("associativity: editing the model parameter regenerates the views and the PDF dimension follows", () => {
    const at40 = text(sheetToPdf(generateSheet(bracket(40), { views: ["front"] })).bytes)
    const at55 = text(sheetToPdf(generateSheet(bracket(55), { views: ["front"] })).bytes)
    expect(at40).toContain("(40.0)")
    expect(at40).not.toContain("(55.0)")
    expect(at55).toContain("(55.0)")
    expect(at55).not.toContain("(40.0)")
  })
})
