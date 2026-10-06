import { Show, createEffect, type JSX } from "solid-js"
import { cam } from "@cadcamfun/core"
import type { CadElement } from "../../lib/job.ts"
import type { PrinterExtras, ToolpathSettings } from "../../store/generatorStore.ts"

type Ctx = CanvasRenderingContext2D
const FILL = "rgba(79, 131, 237, 0.2)"
const FILL_TOP = "rgba(79, 131, 237, 0.3)"

const dashed = (ctx: Ctx, draw: () => void): void => { ctx.setLineDash([2, 2]); draw(); ctx.setLineDash([]) }
const stroke = (ctx: Ctx, fill: string): void => { ctx.stroke(); ctx.fillStyle = fill; ctx.fill() }

const drawCube = (ctx: Ctx, e: CadElement, s: number): void => {
  const w = e["width"] * s, h = e["height"] * s, d = e["depth"] * s
  ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); stroke(ctx, FILL)
  dashed(ctx, () => {
    ctx.beginPath()
    ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(-w / 2 - d / 4, -h / 2 - d / 4)
    ctx.moveTo(w / 2, -h / 2); ctx.lineTo(w / 2 + d / 4, -h / 2 - d / 4)
    ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2 + d / 4, h / 2 - d / 4)
    ctx.moveTo(-w / 2, h / 2); ctx.lineTo(-w / 2 - d / 4, h / 2 - d / 4)
    ctx.stroke()
  })
  ctx.beginPath()
  ctx.moveTo(-w / 2 - d / 4, -h / 2 - d / 4); ctx.lineTo(w / 2 + d / 4, -h / 2 - d / 4); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(-w / 2, -h / 2)
  ctx.closePath(); stroke(ctx, FILL_TOP)
}

const drawSphere = (ctx: Ctx, e: CadElement, s: number): void => {
  const r = e["radius"] * s
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); stroke(ctx, FILL)
  ctx.beginPath(); ctx.ellipse(0, -r * 0.1, r * 0.8, r * 0.3, 0, 0, Math.PI * 2); stroke(ctx, FILL_TOP)
}

const drawCylinder = (ctx: Ctx, e: CadElement, s: number): void => {
  const r = e["radius"] * s, h = e["height"] * s
  ctx.beginPath(); ctx.rect(-r, -h / 2, r * 2, h); stroke(ctx, FILL)
  ctx.beginPath(); ctx.ellipse(0, -h / 2, r, r * 0.3, 0, 0, Math.PI * 2); stroke(ctx, FILL_TOP)
  ctx.beginPath(); ctx.ellipse(0, h / 2, r, r * 0.3, 0, 0, Math.PI * 2); stroke(ctx, "rgba(79, 131, 237, 0.25)")
}

const drawCone = (ctx: Ctx, e: CadElement, s: number): void => {
  const r = e["radius"] * s, h = e["height"] * s
  ctx.beginPath(); ctx.moveTo(-r, h / 2); ctx.lineTo(r, h / 2); ctx.lineTo(0, -h / 2); ctx.closePath(); stroke(ctx, FILL)
  ctx.beginPath(); ctx.ellipse(0, h / 2, r, r * 0.3, 0, 0, Math.PI * 2); stroke(ctx, FILL_TOP)
}

const drawRectangle = (ctx: Ctx, e: CadElement, s: number): void => {
  const w = e["width"] * s, h = e["height"] * s, d = 10 * s
  ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); stroke(ctx, FILL)
  dashed(ctx, () => {
    ctx.beginPath()
    ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(-w / 2, -h / 2 - d / 2)
    ctx.moveTo(w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2 - d / 2)
    ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2, h / 2 - d / 2)
    ctx.moveTo(-w / 2, h / 2); ctx.lineTo(-w / 2, h / 2 - d / 2)
    ctx.stroke()
  })
  ctx.beginPath()
  ctx.moveTo(-w / 2, -h / 2 - d / 2); ctx.lineTo(w / 2, -h / 2 - d / 2); ctx.lineTo(w / 2, -h / 2); ctx.lineTo(-w / 2, -h / 2)
  ctx.closePath(); stroke(ctx, FILL_TOP)
}

const drawCircle = (ctx: Ctx, e: CadElement, s: number): void => {
  const r = e["radius"] * s, d = 10 * s
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); stroke(ctx, FILL)
  ctx.beginPath(); ctx.ellipse(0, -d / 2, r, r * 0.3, 0, 0, Math.PI * 2); stroke(ctx, FILL_TOP)
  dashed(ctx, () => { ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(-r, -d / 2); ctx.moveTo(r, 0); ctx.lineTo(r, -d / 2); ctx.stroke() })
}

const drawPolygon = (ctx: Ctx, e: CadElement, s: number): void => {
  const r = e["radius"] * s, sides = e["sides"] || 6, d = 10 * s
  const ring = (scale: number, dy: number): void => {
    ctx.beginPath()
    for (let i = 0; i < sides; i++) {
      const a = i * ((2 * Math.PI) / sides)
      const x = r * scale * Math.cos(a), y = r * scale * Math.sin(a) + dy
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }
  ring(1, 0); stroke(ctx, FILL)
  ring(0.8, -d / 2); stroke(ctx, FILL_TOP)
  dashed(ctx, () => {
    for (let i = 0; i < 3; i++) {
      const a = i * ((2 * Math.PI) / 3)
      const x = r * Math.cos(a), y = r * Math.sin(a)
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x * 0.8, y - d / 2); ctx.stroke()
    }
  })
}

const drawInfill = (ctx: Ctx, x: number, y: number, width: number, height: number, pattern: PrinterExtras["infillPattern"], density: number): void => {
  const spacing = Math.max(5, 30 - density / 4)
  ctx.strokeStyle = "rgba(255, 120, 0, 0.5)"
  ctx.lineWidth = 0.5
  const hlines = (): void => { for (let py = y; py < y + height; py += spacing) { ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + width, py); ctx.stroke() } }
  switch (pattern) {
    case "grid":
      hlines()
      for (let px = x; px < x + width; px += spacing) { ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + height); ctx.stroke() }
      break
    case "lines": hlines(); break
    case "triangles": {
      const tri = (spacing * Math.sqrt(3)) / 2
      let offset = 0
      for (let py = y; py < y + height; py += tri) {
        offset = offset === 0 ? spacing / 2 : 0
        for (let px = x + offset; px < x + width; px += spacing) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - spacing / 2, py + tri); ctx.lineTo(px + spacing / 2, py + tri); ctx.closePath(); ctx.stroke()
        }
      }
      break
    }
    case "honeycomb": {
      const size = spacing / 1.5, hw = size * 2, hh = size * Math.sqrt(3)
      for (let row = 0; row * hh * 0.75 < height; row++) {
        const startX = row % 2 === 1 ? x + hw / 2 : x
        for (let col = 0; startX + col * hw < x + width; col++) {
          const cx = startX + col * hw, cy = y + row * hh * 0.75
          ctx.beginPath()
          for (let i = 0; i < 6; i++) {
            const a = ((i * 60 - 30) * Math.PI) / 180
            if (i === 0) ctx.moveTo(cx + size * Math.cos(a), cy + size * Math.sin(a))
            else ctx.lineTo(cx + size * Math.cos(a), cy + size * Math.sin(a))
          }
          ctx.closePath(); ctx.stroke()
        }
      }
    }
  }
}

const drawSupports = (ctx: Ctx, e: CadElement, s: number, type: PrinterExtras["supportType"]): void => {
  if (type === "none") return
  ctx.strokeStyle = "rgba(100, 200, 100, 0.6)"
  ctx.lineWidth = 1
  const { width, height } = cam.generator.extractElementDimensions(e)
  const w = width * s, h = height * s
  let points: Array<[number, number]> = []
  const ring = (r: number, y?: number): Array<[number, number]> => {
    const out: Array<[number, number]> = []
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) out.push([r * Math.cos(a), y ?? r * Math.sin(a)])
    return out
  }
  switch (e["type"]) {
    case "cube": case "rectangle": points = [[-w / 2, h / 2], [w / 2, h / 2], [-w / 2, -h / 2], [w / 2, -h / 2], [0, 0]]; break
    case "sphere": case "circle": points = ring(e["radius"] * s); break
    case "cylinder": case "cone": points = ring(e["radius"] * s, (e["height"] * s) / 2); break
    default: points = [[-w / 4, h / 4], [w / 4, h / 4], [-w / 4, -h / 4], [w / 4, -h / 4]]
  }
  for (const [x, y] of points) {
    if (y < 0) continue
    dashed(ctx, () => { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 40); ctx.stroke() })
    if (type === "full") for (let cy = y + 6; cy < y + 40; cy += 6) { ctx.beginPath(); ctx.moveTo(x - 3, cy); ctx.lineTo(x + 3, cy); ctx.stroke() }
  }
}

const draw = (canvas: HTMLCanvasElement, e: CadElement, settings: ToolpathSettings, extras: PrinterExtras): void => {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const { width, height, depth } = cam.generator.extractElementDimensions(e)
  const max = Math.max(width, height, depth)
  const scale = max > 0 ? (Math.min(canvas.width, canvas.height) * 0.8) / max : 1
  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.fillStyle = "rgba(200, 200, 200, 0.3)"; ctx.fillRect(-canvas.width / 2, -10, canvas.width, 10)
  ctx.strokeStyle = "rgba(100, 100, 100, 0.5)"; ctx.strokeRect(-canvas.width / 2, -10, canvas.width, 10)
  ctx.lineWidth = 2
  ctx.strokeStyle = "#4F83ED"
  switch (e["type"]) {
    case "cube": drawCube(ctx, e, scale); break
    case "sphere": drawSphere(ctx, e, scale); break
    case "cylinder": drawCylinder(ctx, e, scale); break
    case "cone": drawCone(ctx, e, scale); break
    case "rectangle": drawRectangle(ctx, e, scale); break
    case "circle": drawCircle(ctx, e, scale); break
    case "polygon": drawPolygon(ctx, e, scale); break
    default:
      ctx.strokeRect((-width * scale) / 2, (-height * scale) / 2, width * scale, height * scale)
      ctx.fillStyle = FILL
      ctx.fillRect((-width * scale) / 2, (-height * scale) / 2, width * scale, height * scale)
  }
  // Print settings overlay: infill on the middle layer, shells, supports.
  const sw = width * scale, sh = height * scale
  const layer = Math.max(2, settings.layerHeight * scale * 5)
  drawInfill(ctx, -sw / 2, -layer / 2, sw, layer, extras.infillPattern, extras.infillDensity)
  if (e["type"] === "rectangle" || e["type"] === "cube") {
    for (let i = 0; i < extras.shellCount; i++) {
      const inset = i * 2
      ctx.strokeStyle = "rgba(79, 131, 237, 0.8)"; ctx.lineWidth = 1
      ctx.strokeRect(-sw / 2 + inset, -sh / 2 + inset, sw - inset * 2, sh - inset * 2)
    }
  } else if (e["type"] === "circle" || e["type"] === "sphere" || e["type"] === "cylinder") {
    for (let i = 0; i < extras.shellCount; i++) {
      const r = e["radius"] * scale - i * 2
      if (r <= 0) continue
      ctx.strokeStyle = "rgba(79, 131, 237, 0.8)"; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
    }
  }
  drawSupports(ctx, e, scale, extras.supportType)
  ctx.restore()
}

/** "3D Print Preview": the element, its shells, infill pattern and supports on a 2D canvas. */
export function PrinterPreview(props: { readonly element: CadElement | undefined; readonly settings: ToolpathSettings; readonly printer: PrinterExtras }): JSX.Element {
  let canvas: HTMLCanvasElement | undefined
  createEffect(() => {
    const element = props.element
    const settings = props.settings
    const printer = props.printer
    if (!element || !canvas) return
    try { draw(canvas, element, settings, printer) } catch { /* no 2D context (test DOM): the canvas stays blank */ }
  })
  return (
    <Show
      when={props.element}
      fallback={<div class="flex items-center justify-center h-full bg-gray-100 rounded-md"><p class="text-gray-500 text-sm">Select an element to preview</p></div>}
    >
      <div class="flex flex-col items-center p-2 bg-white rounded-md border border-gray-200">
        <h3 class="text-sm font-medium text-gray-700 mb-2">3D Print Preview</h3>
        <canvas ref={canvas} width={300} height={300} class="w-full h-full bg-white" />
        <div class="mt-2 text-xs text-gray-500 w-full text-center">{props.element && `Element: ${String(props.element["type"])}`}</div>
      </div>
    </Show>
  )
}
