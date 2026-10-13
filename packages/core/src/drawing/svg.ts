/**
 * A `Drawing` as SVG text. Drawing coordinates have y up and millimetres as units; the SVG has a millimetre viewBox with y flipped, so
 * it prints at true size. Layer colours and entity line styles are honoured (dashed, centre, phantom -> stroke-dasharray); a closed
 * polyline whose `userData.fill` is true is filled (arrow heads).
 */
import type { Drawing, Entity } from "../cad/entities.ts"

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const n = (v: number): string => (Math.abs(v) < 5e-7 ? "0" : String(Number(v.toFixed(4))))

const DASH: Readonly<Record<string, string>> = { dashed: "3 1.5", dotted: "0.6 1.2", center: "8 1.5 1.5 1.5", phantom: "8 1.5 1.5 1.5 1.5 1.5" }

export interface SvgOptions {
  /** Sheet size in mm; by default the extent of the drawing. */
  readonly width?: number
  readonly height?: number
  readonly background?: string
  /** Write width and height in pixels at this density instead of in millimetres (a preview that any viewer sizes the same way). */
  readonly pixelsPerMm?: number
}

export const drawingToSvg = (drawing: Drawing, options: SvgOptions = {}): string => {
  const width = options.width ?? 420, height = options.height ?? 297
  const css = (c: string | { readonly r: number; readonly g: number; readonly b: number; readonly a?: number }): string =>
    typeof c === "string" ? c : `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`
  const colour = (e: Entity): string => css(e.lineStyle?.color ?? drawing.layers.find((l) => l.id === e.layerId)?.color ?? "#000000")
  const stroke = (e: Entity, fallback = 0.25): string => {
    const w = e.lineStyle?.width ?? fallback
    const dash = e.lineStyle === undefined ? undefined : DASH[e.lineStyle.type]
    return `stroke="${esc(colour(e))}" stroke-width="${n(w)}"${dash === undefined ? "" : ` stroke-dasharray="${dash}"`} fill="none"`
  }
  const out: string[] = []
  const y = (v: number): number => height - v
  for (const e of drawing.entities) {
    if (!e.visible) continue
    switch (e._tag) {
      case "Line": out.push(`<line x1="${n(e.start.x)}" y1="${n(y(e.start.y))}" x2="${n(e.end.x)}" y2="${n(y(e.end.y))}" ${stroke(e)}/>`); break
      case "Circle": out.push(`<circle cx="${n(e.center.x)}" cy="${n(y(e.center.y))}" r="${n(e.radius)}" ${stroke(e)}/>`); break
      case "Arc": {
        const a0 = e.startAngle, a1 = e.endAngle
        const sx = e.center.x + e.radius * Math.cos(a0), sy = e.center.y + e.radius * Math.sin(a0)
        const ex = e.center.x + e.radius * Math.cos(a1), ey = e.center.y + e.radius * Math.sin(a1)
        let sweep = e.clockwise ? a0 - a1 : a1 - a0
        while (sweep < 0) sweep += 2 * Math.PI
        // y is flipped: counter-clockwise in the drawing is clockwise on screen (sweep flag 0).
        out.push(`<path d="M ${n(sx)} ${n(y(sy))} A ${n(e.radius)} ${n(e.radius)} 0 ${sweep > Math.PI ? 1 : 0} ${e.clockwise ? 1 : 0} ${n(ex)} ${n(y(ey))}" ${stroke(e)}/>`)
        break
      }
      case "Polyline": {
        const pts = e.points.map((p) => `${n(p.x)},${n(y(p.y))}`).join(" ")
        const filled = e.userData?.["fill"] === true
        out.push(`<${e.closed ? "polygon" : "polyline"} points="${pts}" ${filled ? `fill="${esc(colour(e))}" stroke="${esc(colour(e))}" stroke-width="0.1"` : stroke(e)}/>`)
        break
      }
      case "Text": {
        const anchor = e.alignment === "center" ? "middle" : e.alignment === "right" ? "end" : "start"
        const base = e.baseline === "middle" ? "central" : e.baseline === "top" ? "hanging" : "alphabetic"
        const transform = e.rotation === 0 ? "" : ` transform="rotate(${n(-e.rotation)} ${n(e.position.x)} ${n(y(e.position.y))})"`
        out.push(`<text x="${n(e.position.x)}" y="${n(y(e.position.y))}" font-size="${n(e.fontSize)}" font-family="${esc(e.fontFamily)}" text-anchor="${anchor}" dominant-baseline="${base}" fill="${esc(colour(e))}"${transform}>${esc(e.text)}</text>`)
        break
      }
      default: break
    }
  }
  const unit = options.pixelsPerMm === undefined ? { w: `${n(width)}mm`, h: `${n(height)}mm` } : { w: `${n(width * options.pixelsPerMm)}`, h: `${n(height * options.pixelsPerMm)}` }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${unit.w}" height="${unit.h}" viewBox="0 0 ${n(width)} ${n(height)}">\n<rect width="${n(width)}" height="${n(height)}" fill="${esc(options.background ?? "#ffffff")}"/>\n${out.join("\n")}\n</svg>\n`
}
