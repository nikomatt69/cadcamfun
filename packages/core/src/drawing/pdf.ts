/**
 * A vector PDF writer for drawings (spec 49 O2): the sheet is written as PDF paths and text, never as an image. Lines, circles, arcs,
 * ellipses, polylines (with bulges), splines (sampled within 0.005 mm), rectangles, hatches (solid, lines, cross, dots), dimensions and
 * blocks become path operators in millimetre user space (a single `cm` scales to points, y up like the drawing); text uses the
 * standard Helvetica font (one of the 14 standard fonts, so nothing is embedded and every viewer has it) with WinAnsi encoding and the
 * AFM advance widths, so alignment is exact. Line widths, colours, dash patterns and entity transforms are honoured.
 *
 * Honest limits: only Helvetica is used (the entity's font family is ignored); characters outside WinAnsi are substituted (the
 * diameter sign becomes the letter Oslash) and counted in the report; streams are not compressed (the file is plain, diffable ASCII).
 * The output is deterministic: no clock is read (pass `date` for a creation date).
 */
import type { Drawing, Entity } from "../cad/entities.ts"
import { bulgeToArc } from "../cad/arc-math.ts"
import { splinePolyline } from "../cad/spline.ts"
import { hatchLoops, insideLoops } from "./section.ts"
import type { DrawingSheet } from "./sheet.ts"

const PT_PER_MM = 72 / 25.4

export interface PdfPage {
  readonly drawing: Drawing
  /** Page size in millimetres (default A3 landscape). */
  readonly width?: number
  readonly height?: number
}

export interface PdfOptions {
  readonly title?: string
  readonly author?: string
  readonly subject?: string
  /** `YYYY-MM-DD` or an ISO timestamp; written as the PDF creation date. Omitted by default so the output is deterministic. */
  readonly date?: string
  /** Page background (default none: the paper). */
  readonly background?: string
}

export interface PdfReport {
  readonly bytes: Uint8Array
  readonly pages: number
  readonly objects: number
  /** Entities drawn, by tag. */
  readonly drawn: Readonly<Record<string, number>>
  /** Characters outside WinAnsi that were substituted. */
  readonly substituted: number
  /** Entities that were not drawn (invisible layer, unsupported). */
  readonly skipped: number
}

// ---------------------------------------------------------------- text

/** Helvetica advance widths (AFM, 1/1000 em) for the ASCII range 32..126. */
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
]
const HELV_LATIN1: Readonly<Record<number, number>> = {
  0xa0: 278, 0xb0: 400, 0xb1: 584, 0xb2: 333, 0xb3: 333, 0xb5: 556, 0xb7: 278, 0xd7: 584, 0xf7: 584, 0xd8: 778, 0xf8: 611, 0xc4: 667, 0xd6: 778, 0xdc: 722, 0xe4: 556, 0xf6: 556, 0xfc: 556,
  0xdf: 611, 0xe0: 556, 0xe1: 556, 0xe8: 556, 0xe9: 556, 0xec: 278, 0xf2: 556, 0xf9: 556, 0xe7: 500, 0xc7: 722, 0xe5: 556, 0xc5: 667, 0xe6: 889, 0xc6: 1000
}
/** Unicode characters WinAnsi holds in 0x80..0x9f. */
const WIN_ANSI_EXTRA: Readonly<Record<number, readonly [number, number]>> = {
  0x20ac: [0x80, 556], 0x2013: [0x96, 556], 0x2014: [0x97, 1000], 0x2018: [0x91, 222], 0x2019: [0x92, 222], 0x201c: [0x93, 333], 0x201d: [0x94, 333], 0x2022: [0x95, 350], 0x2026: [0x85, 1000]
}

interface Encoded { readonly codes: number[]; readonly width: number; readonly substituted: number }

const encodeText = (text: string): Encoded => {
  const codes: number[] = []
  let width = 0, substituted = 0
  for (const ch of text) {
    let cp = ch.codePointAt(0)!
    if (cp === 0x2300) { cp = 0xd8; substituted++ } // diameter sign -> Oslash
    if (cp === 0x2212) cp = 0x2d // minus sign -> hyphen
    let code: number, w: number
    const extra = WIN_ANSI_EXTRA[cp]
    if (cp >= 32 && cp <= 126) { code = cp; w = HELV[cp - 32]! } else if (extra !== undefined) [code, w] = extra
    else if (cp >= 0xa0 && cp <= 0xff) { code = cp; w = HELV_LATIN1[cp] ?? 556 } else { code = 0x3f; w = 556; substituted++ }
    codes.push(code)
    width += w
  }
  return { codes, width, substituted }
}

const pdfString = (codes: ReadonlyArray<number>): string => {
  let s = "("
  for (const c of codes) {
    if (c === 0x28 || c === 0x29 || c === 0x5c) s += `\\${String.fromCharCode(c)}`
    else if (c >= 32 && c <= 126) s += String.fromCharCode(c)
    else s += `\\${c.toString(8).padStart(3, "0")}`
  }
  return `${s})`
}

const num = (v: number): string => {
  if (!Number.isFinite(v)) throw new RangeError("Non-finite coordinate in drawing")
  const r = Math.round(v * 1e4) / 1e4
  return Object.is(r, -0) || r === 0 ? "0" : String(r)
}

// ---------------------------------------------------------------- colours and styles

const parseColour = (c: string | { readonly r: number; readonly g: number; readonly b: number } | undefined): [number, number, number] => {
  if (c === undefined) return [0, 0, 0]
  if (typeof c !== "string") return [c.r / 255, c.g / 255, c.b / 255]
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim())
  if (hex !== null) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((x) => x + x).join("") : hex[1]!
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c.trim())
  if (rgb !== null) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255]
  return [0, 0, 0]
}
const rgbOp = (c: [number, number, number], stroke: boolean): string => `${num(c[0])} ${num(c[1])} ${num(c[2])} ${stroke ? "RG" : "rg"}`

const DASH: Readonly<Record<string, string>> = { continuous: "[] 0 d", dashed: "[3 1.5] 0 d", dotted: "[0.6 1.2] 0 d", center: "[8 1.5 1.5 1.5] 0 d", phantom: "[8 1.5 1.5 1.5 1.5 1.5] 0 d" }

// ---------------------------------------------------------------- paths

/** Cubic Bezier segments approximating an arc (at most 90 degrees each). `sweep` is signed. */
const arcBeziers = (cx: number, cy: number, rx: number, ry: number, rot: number, a0: number, sweep: number): string[] => {
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9))
  const step = sweep / n
  const k = (4 / 3) * Math.tan(step / 4)
  const c = Math.cos(rot), s = Math.sin(rot)
  const at = (x: number, y: number): string => `${num(cx + x * c - y * s)} ${num(cy + x * s + y * c)}`
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const t0 = a0 + i * step, t1 = t0 + step
    const x0 = Math.cos(t0), y0 = Math.sin(t0), x1 = Math.cos(t1), y1 = Math.sin(t1)
    out.push(`${at(rx * (x0 - k * y0), ry * (y0 + k * x0))} ${at(rx * (x1 + k * y1), ry * (y1 - k * x1))} ${at(rx * x1, ry * y1)} c`)
  }
  return out
}

const ellipsePath = (cx: number, cy: number, rx: number, ry: number, rot: number): string =>
  `${num(cx + rx * Math.cos(rot))} ${num(cy + rx * Math.sin(rot))} m ${arcBeziers(cx, cy, rx, ry, rot, 0, 2 * Math.PI).join(" ")} h`

/** Path operators for a polyline with optional bulges. */
const polylinePath = (pts: ReadonlyArray<{ x: number; y: number }>, closed: boolean, bulge?: ReadonlyArray<number>): string => {
  const ops: string[] = [`${num(pts[0]!.x)} ${num(pts[0]!.y)} m`]
  const count = closed ? pts.length : pts.length - 1
  for (let i = 0; i < count; i++) {
    const p0 = pts[i]!, p1 = pts[(i + 1) % pts.length]!
    const b = bulge?.[i] ?? 0
    const arc = b === 0 ? undefined : bulgeToArc(p0, p1, b)
    if (arc === undefined) { if (!(closed && i === count - 1)) ops.push(`${num(p1.x)} ${num(p1.y)} l`) }
    else ops.push(...arcBeziers(arc.center.x, arc.center.y, arc.radius, arc.radius, 0, arc.startAngle, arc.sweep))
  }
  if (closed) ops.push("h")
  return ops.join(" ")
}

// ---------------------------------------------------------------- content stream

interface Pen { colour: [number, number, number]; width: number; dash: string }

class Content {
  readonly ops: string[] = []
  drawn: Record<string, number> = {}
  substituted = 0
  skipped = 0
  constructor(private readonly drawing: Drawing) {}

  private layer(e: Entity): { visible: boolean; colour?: string } {
    const l = this.drawing.layers.find((x) => x.id === e.layerId)
    return l === undefined ? { visible: true } : { visible: l.visible, colour: l.color }
  }

  private pen(e: Entity, fallbackWidth = 0.25): Pen {
    const layer = this.layer(e)
    return { colour: parseColour(e.lineStyle?.color ?? layer.colour), width: e.lineStyle?.width ?? fallbackWidth, dash: DASH[e.lineStyle?.type ?? "continuous"]! }
  }

  private stroke(p: Pen): void { this.ops.push(`${rgbOp(p.colour, true)} ${num(p.width)} w ${p.dash}`) }

  entity(e: Entity): void {
    if (!e.visible || !this.layer(e).visible) { this.skipped++; return }
    const t = e.transform
    if (t !== undefined) {
      const c = Math.cos(t.rotation), s = Math.sin(t.rotation)
      this.ops.push("q", `${num(t.scale.x * c)} ${num(t.scale.x * s)} ${num(-t.scale.y * s)} ${num(t.scale.y * c)} ${num(t.translation.x)} ${num(t.translation.y)} cm`)
    }
    this.draw(e)
    if (t !== undefined) this.ops.push("Q")
  }

  private count(tag: string): void { this.drawn[tag] = (this.drawn[tag] ?? 0) + 1 }

  private draw(e: Entity): void {
    switch (e._tag) {
      case "Line": this.stroke(this.pen(e)); this.ops.push(`${num(e.start.x)} ${num(e.start.y)} m ${num(e.end.x)} ${num(e.end.y)} l S`); break
      case "Circle": this.stroke(this.pen(e)); this.ops.push(`${ellipsePath(e.center.x, e.center.y, e.radius, e.radius, 0)} S`); break
      case "Arc": {
        this.stroke(this.pen(e))
        let sweep = e.clockwise ? e.startAngle - e.endAngle : e.endAngle - e.startAngle
        while (sweep <= 0) sweep += 2 * Math.PI
        if (e.startAngle === e.endAngle) sweep = 2 * Math.PI
        const signed = e.clockwise ? -sweep : sweep
        this.ops.push(`${num(e.center.x + e.radius * Math.cos(e.startAngle))} ${num(e.center.y + e.radius * Math.sin(e.startAngle))} m ${arcBeziers(e.center.x, e.center.y, e.radius, e.radius, 0, e.startAngle, signed).join(" ")} S`)
        break
      }
      case "Polyline": {
        const pen = this.pen(e)
        const filled = e.userData?.["fill"] === true
        if (filled) this.ops.push(`${rgbOp(pen.colour, false)} ${rgbOp(pen.colour, true)} 0.1 w [] 0 d`)
        else this.stroke(pen)
        this.ops.push(`${polylinePath(e.points, e.closed, e.bulge)} ${filled ? "B" : "S"}`)
        break
      }
      case "Rectangle": {
        this.stroke(this.pen(e))
        const x = Math.min(e.corner1.x, e.corner2.x), y = Math.min(e.corner1.y, e.corner2.y)
        this.ops.push(`${num(x)} ${num(y)} ${num(Math.abs(e.corner2.x - e.corner1.x))} ${num(Math.abs(e.corner2.y - e.corner1.y))} re S`)
        break
      }
      case "Ellipse": this.stroke(this.pen(e)); this.ops.push(`${ellipsePath(e.center.x, e.center.y, e.radiusX, e.radiusY, e.rotation)} S`); break
      case "Spline": {
        this.stroke(this.pen(e))
        const pts = splinePolyline(e.controlPoints, e.degree, e.closed, 0.005, e.knots)
        if (pts.length < 2) { this.skipped++; return }
        this.ops.push(`${polylinePath(pts, e.closed)} S`)
        break
      }
      case "Text": {
        const pen = this.pen(e)
        const enc = encodeText(e.text)
        this.substituted += enc.substituted
        const w = (enc.width / 1000) * e.fontSize
        const dx = e.alignment === "center" ? -w / 2 : e.alignment === "right" ? -w : 0
        const dy = e.baseline === "top" ? -0.718 * e.fontSize : e.baseline === "middle" ? -0.359 * e.fontSize : 0
        const c = Math.cos(e.rotation), s = Math.sin(e.rotation)
        const x = e.position.x + dx * c - dy * s, y = e.position.y + dx * s + dy * c
        this.ops.push(`BT ${rgbOp(pen.colour, false)} /F1 ${num(e.fontSize)} Tf ${num(c)} ${num(s)} ${num(-s)} ${num(c)} ${num(x)} ${num(y)} Tm ${pdfString(enc.codes)} Tj ET`)
        break
      }
      case "Dimension": {
        const pen = this.pen(e)
        this.stroke(pen)
        this.ops.push(`${num(e.start.x)} ${num(e.start.y)} m ${num(e.end.x)} ${num(e.end.y)} l S`)
        // Arrow heads at both ends of the dimension line.
        const len = Math.hypot(e.end.x - e.start.x, e.end.y - e.start.y)
        if (len > 1e-9 && e.arrowSize > 0) {
          const ux = (e.end.x - e.start.x) / len, uy = (e.end.y - e.start.y) / len, a = e.arrowSize, hw = a / 6
          const head = (px: number, py: number, d: number): string =>
            `${num(px)} ${num(py)} m ${num(px + d * ux * a - uy * hw)} ${num(py + d * uy * a + ux * hw)} l ${num(px + d * ux * a + uy * hw)} ${num(py + d * uy * a - ux * hw)} l h`
          this.ops.push(`${rgbOp(pen.colour, false)} ${head(e.start.x, e.start.y, 1)} f ${head(e.end.x, e.end.y, -1)} f`)
        }
        const enc = encodeText(e.text)
        this.substituted += enc.substituted
        const w = (enc.width / 1000) * e.textSize
        this.ops.push(`BT ${rgbOp(pen.colour, false)} /F1 ${num(e.textSize)} Tf 1 0 0 1 ${num(e.textPosition.x - w / 2)} ${num(e.textPosition.y - 0.359 * e.textSize)} Tm ${pdfString(enc.codes)} Tj ET`)
        break
      }
      case "Hatch": {
        const pen = this.pen(e)
        const loops = [e.boundary as ReadonlyArray<{ x: number; y: number }>]
        if (e.pattern === "solid") {
          this.ops.push(`${rgbOp(e.fillColor !== undefined ? parseColour(e.fillColor) : pen.colour, false)} ${polylinePath(e.boundary, true)} f`)
        } else if (e.pattern === "dots") {
          const sp = Math.max(e.scale, 0.2)
          let lo = { x: Infinity, y: Infinity }, hi = { x: -Infinity, y: -Infinity }
          for (const p of e.boundary) { lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y) }; hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y) } }
          this.ops.push(rgbOp(pen.colour, false))
          for (let x = lo.x + sp / 2; x < hi.x; x += sp) for (let y = lo.y + sp / 2; y < hi.y; y += sp) {
            if (insideLoops(x, y, loops)) this.ops.push(`${ellipsePath(x, y, 0.12, 0.12, 0)} f`)
          }
        } else {
          this.stroke({ ...pen, width: Math.min(pen.width, 0.18) })
          const angles = e.pattern === "cross" ? [e.angle, e.angle + 90] : [e.angle]
          for (const a of angles) for (const seg of hatchLoops(loops, Math.max(e.scale, 0.2), a)) this.ops.push(`${num(seg.a.x)} ${num(seg.a.y)} m ${num(seg.b.x)} ${num(seg.b.y)} l S`)
        }
        break
      }
      case "Block": {
        this.ops.push("q", `1 0 0 1 ${num(e.basePoint.x)} ${num(e.basePoint.y)} cm`)
        for (const child of e.entities) this.entity(child)
        this.ops.push("Q")
        break
      }
    }
    this.count(e._tag)
  }
}

// ---------------------------------------------------------------- file

const A3: readonly [number, number] = [420, 297]

/** Writes the pages as one PDF. See the module comment for what is drawn and what is not. */
export const drawingsToPdf = (pages: ReadonlyArray<PdfPage>, options: PdfOptions = {}): PdfReport => {
  if (pages.length === 0) throw new RangeError("A PDF needs at least one page")
  const objects: string[] = []
  const add = (body: string): number => { objects.push(body); return objects.length }
  const drawn: Record<string, number> = {}
  let substituted = 0, skipped = 0
  // Object numbers: 1 catalog, 2 page tree, 3 font, 4 info, then a (page, content) pair per page.
  add("<< /Type /Catalog /Pages 2 0 R >>")
  add("")
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
  const info = [`/Producer ${pdfString(encodeText("cadcamfun").codes)}`, `/Creator ${pdfString(encodeText("cadcamfun drawing writer").codes)}`]
  if (options.title !== undefined) info.push(`/Title ${pdfString(encodeText(options.title).codes)}`)
  if (options.author !== undefined) info.push(`/Author ${pdfString(encodeText(options.author).codes)}`)
  if (options.subject !== undefined) info.push(`/Subject ${pdfString(encodeText(options.subject).codes)}`)
  const date = options.date !== undefined ? /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/.exec(options.date) : null
  if (date !== null) info.push(`/CreationDate (D:${date[1]}${date[2]}${date[3]}${date[4] ?? "00"}${date[5] ?? "00"}${date[6] ?? "00"}Z)`)
  add(`<< ${info.join(" ")} >>`)
  const pageRefs: number[] = []
  for (const page of pages) {
    const w = page.width ?? A3[0], h = page.height ?? A3[1]
    if (!(w > 0 && h > 0)) throw new RangeError(`Page size must be positive, got ${w} x ${h}`)
    const content = new Content(page.drawing)
    if (options.background !== undefined) content.ops.push(`${rgbOp(parseColour(options.background), false)} 0 0 ${num(w)} ${num(h)} re f`)
    for (const e of page.drawing.entities) content.entity(e)
    for (const [k, v] of Object.entries(content.drawn)) drawn[k] = (drawn[k] ?? 0) + v
    substituted += content.substituted; skipped += content.skipped
    const stream = `${num(PT_PER_MM)} 0 0 ${num(PT_PER_MM)} 0 0 cm\n1 J 1 j\n${content.ops.join("\n")}\n`
    const pageNo = objects.length + 1
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(w * PT_PER_MM)} ${num(h * PT_PER_MM)}] /Resources << /Font << /F1 3 0 R >> /ProcSet [/PDF /Text] >> /Contents ${pageNo + 1} 0 R >>`)
    add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`)
    pageRefs.push(pageNo)
  }
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`
  let out = "%PDF-1.4\n%âãÏÓ\n"
  const offsets: number[] = []
  objects.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  // The binary comment bytes are Latin-1, the rest ASCII: one byte per character.
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
  return { bytes, pages: pages.length, objects: objects.length, drawn, substituted, skipped }
}

/** One drawing as a one-page PDF of the given size in millimetres. */
export const drawingToPdf = (drawing: Drawing, size: { readonly width: number; readonly height: number } = { width: A3[0], height: A3[1] }, options: PdfOptions = {}): PdfReport =>
  drawingsToPdf([{ drawing, ...size }], { title: drawing.name, ...options })

/** A generated sheet as a vector PDF at its sheet size. */
export const sheetToPdf = (sheet: DrawingSheet, options: PdfOptions = {}): PdfReport => drawingToPdf(sheet.drawing, sheet.size, options)
