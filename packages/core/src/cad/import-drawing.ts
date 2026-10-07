/**
 * Reading a 2D drawing (DXF, SVG) and building 3D from it.
 *
 *   text -> shapes (lines, arcs, circles, polylines) -> closed loops -> solids
 *
 * The loops are what a part's outline is: lines and arcs that meet end to end are chained into closed profiles (within a
 * gap tolerance), circles stand alone. Nesting decides what each is: a loop inside a loop is a hole, a loop inside a hole an
 * island again. `extrudeDrawing` turns that into editor elements: an `extrusion` per solid and a `boolean-subtract` that takes
 * its holes out. Everything is millimetres; DXF `$INSUNITS` and the SVG scale convert into it. Pure and deterministic.
 */
import { parseDxf } from "./dxf.ts"
import type { Drawing } from "./entities.ts"
import { segmentsFor } from "./tolerance.ts"

export interface P { readonly x: number; readonly y: number }
export type Shape =
  | { readonly kind: "line"; readonly a: P; readonly b: P; readonly layer: string }
  | { readonly kind: "circle"; readonly center: P; readonly radius: number; readonly layer: string }
  | { readonly kind: "arc"; readonly center: P; readonly radius: number; readonly start: number; readonly end: number; readonly layer: string }
  | { readonly kind: "polyline"; readonly points: ReadonlyArray<P>; readonly closed: boolean; readonly layer: string }

export interface ParsedDrawing {
  readonly shapes: ReadonlyArray<Shape>
  readonly warnings: ReadonlyArray<string>
  /** Millimetres per drawing unit that was applied. */
  readonly scale: number
}

// ---------------------------------------------------------------- DXF
//
// DXF parsing is `./dxf.ts` (millimetres, `$INSUNITS` honoured, layers); `shapesFromDrawing` reduces its entities to the shapes
// the loop finder works on.

/** Lines, arcs, circles and polylines of a parsed drawing (rectangles and ellipses become closed polylines). */
export const shapesFromDrawing = (drawing: Drawing, tolerance = 0.01): { readonly shapes: Shape[]; readonly warnings: string[] } => {
  const shapes: Shape[] = []
  const skipped = new Map<string, number>()
  const layerName = (id: string): string => drawing.layers.find((l) => l.id === id)?.name ?? "0"
  for (const e of drawing.entities) {
    if (!e.visible) continue
    const layer = layerName(e.layerId)
    switch (e._tag) {
      case "Line": shapes.push({ kind: "line", a: { ...e.start }, b: { ...e.end }, layer }); break
      case "Circle": shapes.push({ kind: "circle", center: { ...e.center }, radius: e.radius, layer }); break
      case "Arc":
        if (e.startAngle === e.endAngle) shapes.push({ kind: "circle", center: { ...e.center }, radius: e.radius, layer })
        else shapes.push({ kind: "arc", center: { ...e.center }, radius: e.radius, start: e.clockwise ? e.endAngle : e.startAngle, end: e.clockwise ? e.startAngle : e.endAngle, layer })
        break
      case "Polyline": {
        const pts: P[] = []
        const count = e.closed ? e.points.length : e.points.length - 1
        for (let i = 0; i < count; i++) {
          const a = e.points[i]!, b = e.points[(i + 1) % e.points.length]!
          pts.push({ ...a }, ...bulgePoints(a, b, e.bulge?.[i] ?? 0, tolerance))
        }
        if (!e.closed) pts.push({ ...e.points[e.points.length - 1]! })
        shapes.push({ kind: "polyline", points: pts, closed: e.closed, layer })
        break
      }
      case "Rectangle": {
        const { corner1: a, corner2: b } = e
        shapes.push({ kind: "polyline", points: [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }], closed: true, layer })
        break
      }
      case "Ellipse": {
        const n = segmentsFor(Math.max(e.radiusX, e.radiusY), tolerance, 2048)
        const c = Math.cos(e.rotation), s = Math.sin(e.rotation)
        shapes.push({
          kind: "polyline",
          closed: true,
          layer,
          points: Array.from({ length: n }, (_, k) => {
            const t = (2 * Math.PI * k) / n
            const x = e.radiusX * Math.cos(t), y = e.radiusY * Math.sin(t)
            return { x: e.center.x + x * c - y * s, y: e.center.y + x * s + y * c }
          })
        })
        break
      }
      default: skipped.set(e._tag, (skipped.get(e._tag) ?? 0) + 1)
    }
  }
  return { shapes, warnings: [...skipped].map(([tag, n]) => `${n} ${tag} entit${n === 1 ? "y" : "ies"} ignored (not an outline)`) }
}

/** Reads DXF text into outline shapes (millimetres). */
export const readDxfShapes = (text: string, options: { readonly tolerance?: number } = {}): ParsedDrawing => {
  const parsed = parseDxf(text)
  const { shapes, warnings } = shapesFromDrawing(parsed.drawing, options.tolerance)
  return { shapes, warnings: [...parsed.warnings, ...warnings], scale: parsed.drawing.units === "inch" ? 25.4 : 1 }
}

/** Points of an arc between two end points with a DXF bulge (tan of a quarter of the included angle), end point excluded. */
const bulgePoints = (a: P, b: P, bulge: number, tolerance: number): P[] => {
  if (Math.abs(bulge) < 1e-12) return []
  const chord = Math.hypot(b.x - a.x, b.y - a.y)
  if (chord < 1e-12) return []
  const theta = 4 * Math.atan(Math.abs(bulge))
  const radius = chord / (2 * Math.sin(theta / 2))
  const steps = Math.max(2, Math.ceil(theta / ((2 * Math.PI) / segmentsFor(radius, tolerance, 720))))
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
  const distance = Math.sqrt(Math.max(0, radius * radius - (chord / 2) ** 2))
  const side = bulge > 0 ? 1 : -1
  const cx = mx - (side * distance * (b.y - a.y)) / chord * (theta > Math.PI ? -1 : 1)
  const cy = my + (side * distance * (b.x - a.x)) / chord * (theta > Math.PI ? -1 : 1)
  const a0 = Math.atan2(a.y - cy, a.x - cx)
  const out: P[] = []
  for (let i = 1; i < steps; i++) {
    const t = a0 + side * theta * (i / steps)
    out.push({ x: cx + radius * Math.cos(t), y: cy + radius * Math.sin(t) })
  }
  return out
}

// ---------------------------------------------------------------- SVG

type Matrix = readonly [number, number, number, number, number, number]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const apply = (m: Matrix, p: P): P => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] })
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
]

const transformOf = (text: string | undefined): Matrix => {
  let m = IDENTITY
  if (!text) return m
  for (const part of text.matchAll(/(translate|scale|rotate|matrix)\s*\(([^)]*)\)/g)) {
    const v = part[2]!.split(/[\s,]+/).filter(Boolean).map(Number)
    if (part[1] === "translate") m = multiply(m, [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0])
    else if (part[1] === "scale") m = multiply(m, [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0])
    else if (part[1] === "rotate") {
      const t = ((v[0] ?? 0) * Math.PI) / 180
      const r: Matrix = [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]
      m = v.length >= 3 ? multiply(multiply(multiply(m, [1, 0, 0, 1, v[1]!, v[2]!]), r), [1, 0, 0, 1, -v[1]!, -v[2]!]) : multiply(m, r)
    } else if (v.length === 6) m = multiply(m, v as unknown as Matrix)
  }
  return m
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`(?:^|[\\s"'])${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag)?.[2] ?? new RegExp(`(?:^|[\\s"'])${name}\\s*=\\s*'([^']*)'`).exec(tag)?.[1]
const n = (tag: string, name: string, fallback = 0): number => { const v = attr(tag, name); const x = v === undefined ? NaN : parseFloat(v); return Number.isFinite(x) ? x : fallback }

const sampleArc = (center: P, rx: number, ry: number, rotation: number, t0: number, dt: number, tolerance: number): P[] => {
  const steps = Math.max(2, Math.ceil(Math.abs(dt) / ((2 * Math.PI) / segmentsFor(Math.max(rx, ry), tolerance, 720))))
  const out: P[] = []
  for (let k = 0; k <= steps; k++) {
    const t = t0 + (dt * k) / steps
    const x = rx * Math.cos(t), y = ry * Math.sin(t)
    out.push({ x: center.x + x * Math.cos(rotation) - y * Math.sin(rotation), y: center.y + x * Math.sin(rotation) + y * Math.cos(rotation) })
  }
  return out
}

/** SVG endpoint arc to points (the standard conversion, SVG 1.1 implementation notes F.6). */
const svgArc = (from: P, rx0: number, ry0: number, phiDeg: number, large: boolean, sweep: boolean, to: P, tolerance: number): P[] => {
  if (rx0 === 0 || ry0 === 0 || (from.x === to.x && from.y === to.y)) return [to]
  const phi = (phiDeg * Math.PI) / 180
  const dx = (from.x - to.x) / 2, dy = (from.y - to.y) / 2
  const x1 = Math.cos(phi) * dx + Math.sin(phi) * dy, y1 = -Math.sin(phi) * dx + Math.cos(phi) * dy
  let rx = Math.abs(rx0), ry = Math.abs(ry0)
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda) }
  const sign = large === sweep ? -1 : 1
  const numer = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const coef = sign * Math.sqrt(Math.max(0, numer / (rx * rx * y1 * y1 + ry * ry * x1 * x1)))
  const cxp = (coef * rx * y1) / ry, cyp = (-coef * ry * x1) / rx
  const cx = Math.cos(phi) * cxp - Math.sin(phi) * cyp + (from.x + to.x) / 2
  const cy = Math.sin(phi) * cxp + Math.cos(phi) * cyp + (from.y + to.y) / 2
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const t0 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry)
  let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  if (sweep && dt < 0) dt += 2 * Math.PI
  return sampleArc({ x: cx, y: cy }, rx, ry, phi, t0, dt, tolerance).slice(1)
}

const bezier = (p: ReadonlyArray<P>, tolerance: number): P[] => {
  const span = Math.hypot(p[p.length - 1]!.x - p[0]!.x, p[p.length - 1]!.y - p[0]!.y) + 1e-9
  const steps = Math.max(4, Math.min(256, Math.ceil(Math.sqrt(span / Math.max(tolerance, 1e-4)) * 2)))
  const out: P[] = []
  for (let k = 1; k <= steps; k++) {
    const t = k / steps
    const level = p.map((q) => ({ ...q }))
    for (let r = level.length - 1; r > 0; r--) for (let q = 0; q < r; q++) level[q] = { x: level[q]!.x * (1 - t) + level[q + 1]!.x * t, y: level[q]!.y * (1 - t) + level[q + 1]!.y * t }
    out.push(level[0]!)
  }
  return out
}

const pathShapes = (d: string, m: Matrix, layer: string, tolerance: number): Shape[] => {
  const tokens = [...d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi)].map((t) => t[1] ?? Number(t[2]))
  const shapes: Shape[] = []
  let cur: P = { x: 0, y: 0 }, startPoint: P = cur, points: P[] = [], command = "", last: P | undefined
  const flush = (closed: boolean) => { if (points.length >= 2) shapes.push({ kind: "polyline", points: points.map((p) => apply(m, p)), closed, layer }); points = [] }
  let i = 0
  const next = (): number => Number(tokens[i++])
  while (i < tokens.length) {
    if (typeof tokens[i] === "string") command = tokens[i++] as string
    const rel = command === command.toLowerCase()
    const abs = (p: P): P => (rel ? { x: cur.x + p.x, y: cur.y + p.y } : p)
    switch (command.toUpperCase()) {
      case "M": { cur = abs({ x: next(), y: next() }); startPoint = cur; flush(false); points = [cur]; command = rel ? "l" : "L"; last = undefined; break }
      case "L": { cur = abs({ x: next(), y: next() }); points.push(cur); last = undefined; break }
      case "H": { cur = { x: rel ? cur.x + next() : next(), y: cur.y }; points.push(cur); break }
      case "V": { cur = { x: cur.x, y: rel ? cur.y + next() : next() }; points.push(cur); break }
      case "C": { const a = abs({ x: next(), y: next() }), b = abs({ x: next(), y: next() }), e = abs({ x: next(), y: next() }); points.push(...bezier([cur, a, b, e], tolerance)); last = b; cur = e; break }
      case "S": { const a = last ? { x: 2 * cur.x - last.x, y: 2 * cur.y - last.y } : cur, b = abs({ x: next(), y: next() }), e = abs({ x: next(), y: next() }); points.push(...bezier([cur, a, b, e], tolerance)); last = b; cur = e; break }
      case "Q": { const a = abs({ x: next(), y: next() }), e = abs({ x: next(), y: next() }); points.push(...bezier([cur, a, e], tolerance)); last = a; cur = e; break }
      case "T": { const a = last ? { x: 2 * cur.x - last.x, y: 2 * cur.y - last.y } : cur, e = abs({ x: next(), y: next() }); points.push(...bezier([cur, a, e], tolerance)); last = a; cur = e; break }
      case "A": { const rx = next(), ry = next(), phi = next(), large = next() !== 0, sweep = next() !== 0, e = abs({ x: next(), y: next() }); points.push(...svgArc(cur, rx, ry, phi, large, sweep, e, tolerance)); cur = e; break }
      case "Z": { flush(true); cur = startPoint; points = [cur]; command = ""; break }
      default: i++
    }
  }
  flush(false)
  return shapes
}

/**
 * SVG to shapes. SVG's y axis points down, so it is flipped (the drawing's y points up). `scale` is millimetres per SVG user unit
 * (default 1; use 25.4 / 96 for CSS pixels). Supports rect, circle, ellipse, line, polyline, polygon and path (with curves and
 * arcs) and `transform`; text, images, gradients, clipping are ignored.
 */
export const parseSvg = (text: string, options: { readonly scale?: number; readonly tolerance?: number } = {}): ParsedDrawing => {
  const scale = options.scale ?? 1
  const tolerance = (options.tolerance ?? 0.01) / scale
  const warnings: string[] = []
  const shapes: Shape[] = []
  const tags = [...text.matchAll(/<\s*(\/?)(g|rect|circle|ellipse|line|polyline|polygon|path)\b([^>]*?)(\/?)\s*>/gi)]
  if (tags.length === 0 && !/<svg\b/i.test(text)) return { shapes, warnings: ["No SVG elements found: is this an SVG?"], scale }
  const stack: Matrix[] = [IDENTITY]
  const flipScale: Matrix = [scale, 0, 0, -scale, 0, 0]
  const layerStack: string[] = ["0"]
  for (const tag of tags) {
    const closing = tag[1] === "/"
    const name = tag[2]!.toLowerCase()
    const body = tag[3]!
    const selfClosing = tag[4] === "/"
    if (name === "g") {
      if (closing) { stack.pop(); layerStack.pop() } else if (!selfClosing) { stack.push(multiply(stack[stack.length - 1]!, transformOf(attr(body, "transform")))); layerStack.push(attr(body, "id") ?? layerStack[layerStack.length - 1]!) }
      continue
    }
    if (closing) continue
    const m = multiply(flipScale, multiply(stack[stack.length - 1]!, transformOf(attr(body, "transform"))))
    const layer = layerStack[layerStack.length - 1]!
    if (name === "rect") {
      const x = n(body, "x"), y = n(body, "y"), w = n(body, "width"), h = n(body, "height")
      shapes.push({ kind: "polyline", points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map((p) => apply(m, p)), closed: true, layer })
    } else if (name === "circle") {
      const c = apply(m, { x: n(body, "cx"), y: n(body, "cy") })
      shapes.push({ kind: "circle", center: c, radius: n(body, "r") * Math.hypot(m[0], m[1]), layer })
    } else if (name === "ellipse") {
      const pts = sampleArc({ x: n(body, "cx"), y: n(body, "cy") }, n(body, "rx"), n(body, "ry"), 0, 0, 2 * Math.PI, tolerance).slice(0, -1).map((p) => apply(m, p))
      shapes.push({ kind: "polyline", points: pts, closed: true, layer })
    } else if (name === "line") {
      shapes.push({ kind: "line", a: apply(m, { x: n(body, "x1"), y: n(body, "y1") }), b: apply(m, { x: n(body, "x2"), y: n(body, "y2") }), layer })
    } else if (name === "polyline" || name === "polygon") {
      const v = (attr(body, "points") ?? "").split(/[\s,]+/).filter(Boolean).map(Number)
      const pts: P[] = []
      for (let k = 0; k + 1 < v.length; k += 2) pts.push(apply(m, { x: v[k]!, y: v[k + 1]! }))
      if (pts.length >= 2) shapes.push({ kind: "polyline", points: pts, closed: name === "polygon", layer })
    } else if (name === "path") {
      shapes.push(...pathShapes(attr(body, "d") ?? "", m, layer, tolerance))
    }
  }
  if (shapes.length === 0) warnings.push("No drawable shapes were found")
  return { shapes, warnings, scale }
}

// ---------------------------------------------------------------- loops and solids

export interface Loop { readonly points: ReadonlyArray<P>; readonly area: number }

const signedArea = (pts: ReadonlyArray<P>): number => {
  let a = 0
  for (let i = 0; i < pts.length; i++) { const p = pts[i]!, q = pts[(i + 1) % pts.length]!; a += p.x * q.y - q.x * p.y }
  return a / 2
}

const inside = (p: P, poly: ReadonlyArray<P>): boolean => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

/** Polyline of an arc (counter-clockwise from `start` to `end`, radians) meeting the tolerance. */
const arcPoints = (center: P, radius: number, start: number, end: number, tolerance: number): P[] => {
  let sweep = end - start
  while (sweep <= 0) sweep += 2 * Math.PI
  const full = segmentsFor(radius, tolerance, 2048)
  const steps = Math.max(2, Math.ceil((sweep / (2 * Math.PI)) * full))
  return Array.from({ length: steps + 1 }, (_, k) => ({ x: center.x + radius * Math.cos(start + (sweep * k) / steps), y: center.y + radius * Math.sin(start + (sweep * k) / steps) }))
}

export const circlePoints = (center: P, radius: number, tolerance: number): P[] => {
  const n = segmentsFor(radius, tolerance, 2048)
  return Array.from({ length: n }, (_, k) => ({ x: center.x + radius * Math.cos((2 * Math.PI * k) / n), y: center.y + radius * Math.sin((2 * Math.PI * k) / n) }))
}

export interface Loops {
  readonly loops: ReadonlyArray<Loop>
  /** Circles kept as circles (so a hole stays a true cylinder). */
  readonly circles: ReadonlyArray<{ readonly center: P; readonly radius: number }>
  readonly open: number
}

/**
 * Closed profiles of a drawing. Closed polylines are loops; lines, arcs and open polylines are chained end to end (ends closer than
 * `gap` meet). What cannot be closed is counted in `open`, never guessed.
 */
export const closedLoops = (shapes: ReadonlyArray<Shape>, options: { readonly gap?: number; readonly tolerance?: number } = {}): Loops => {
  const gap = options.gap ?? 0.01
  const tolerance = options.tolerance ?? 0.01
  const loops: Loop[] = []
  const circles: Array<{ center: P; radius: number }> = []
  const chains: P[][] = []
  for (const s of shapes) {
    if (s.kind === "circle") circles.push({ center: s.center, radius: s.radius })
    else if (s.kind === "polyline" && s.closed) loops.push({ points: s.points, area: Math.abs(signedArea(s.points)) })
    else if (s.kind === "polyline") chains.push([...s.points])
    else if (s.kind === "line") chains.push([s.a, s.b])
    else chains.push(arcPoints(s.center, s.radius, s.start, s.end, tolerance))
  }
  const near = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y) <= gap
  let open = 0
  while (chains.length > 0) {
    let current = chains.pop()!
    let progressed = true
    while (progressed && !near(current[0]!, current[current.length - 1]!)) {
      progressed = false
      for (let k = 0; k < chains.length; k++) {
        const c = chains[k]!
        const head = current[0]!, tail = current[current.length - 1]!
        if (near(tail, c[0]!)) current = [...current, ...c.slice(1)]
        else if (near(tail, c[c.length - 1]!)) current = [...current, ...[...c].reverse().slice(1)]
        else if (near(head, c[c.length - 1]!)) current = [...c, ...current.slice(1)]
        else if (near(head, c[0]!)) current = [...[...c].reverse(), ...current.slice(1)]
        else continue
        chains.splice(k, 1)
        progressed = true
        break
      }
    }
    if (current.length >= 4 && near(current[0]!, current[current.length - 1]!)) {
      const pts = current.slice(0, -1)
      loops.push({ points: pts, area: Math.abs(signedArea(pts)) })
    } else open++
  }
  return { loops, circles, open }
}

// ---------------------------------------------------------------- 3D

export interface ExtrudeOptions {
  /** Thickness, mm (required: a drawing has no height). */
  readonly depth: number
  /** Gap closing loops, mm (default 0.01). */
  readonly gap?: number
  readonly tolerance?: number
  readonly name?: string
  readonly color?: string
  readonly layer?: string
  /** Z of the bottom of the part, mm (default 0). */
  readonly baseZ?: number
}

export interface ExtrudeResult {
  /** Editor elements; `operands` are indexes into this list (the assistant tool resolves them to ids). */
  readonly elements: ReadonlyArray<Record<string, unknown>>
  readonly warnings: ReadonlyArray<string>
  readonly stats: { readonly solids: number; readonly holes: number; readonly open: number }
}

/**
 * 3D from a drawing: every outer loop is extruded `depth` along +Z from Z0; loops and circles inside it are holes taken out with a
 * boolean-subtract (a hole inside a hole is an island again); circles that are not inside anything become cylinders.
 */
export const extrudeDrawing = (shapes: ReadonlyArray<Shape>, options: ExtrudeOptions): ExtrudeResult => {
  const tolerance = options.tolerance ?? 0.01
  const { loops, circles, open } = closedLoops(shapes, { ...(options.gap !== undefined ? { gap: options.gap } : {}), tolerance })
  const warnings: string[] = []
  if (open > 0) warnings.push(`${open} open outline${open === 1 ? "" : "s"} could not be closed (gap over ${options.gap ?? 0.01} mm) and ${open === 1 ? "was" : "were"} left out`)
  if (!(options.depth > 0)) return { elements: [], warnings: [...warnings, "depth must be positive"], stats: { solids: 0, holes: 0, open } }
  type Region = { readonly points: ReadonlyArray<P>; readonly circle?: { center: P; radius: number }; readonly area: number }
  const regions: Region[] = [
    ...loops.map((l) => ({ points: l.points, area: l.area })),
    ...circles.map((c) => ({ points: circlePoints(c.center, c.radius, tolerance), circle: c, area: Math.PI * c.radius * c.radius }))
  ]
  // Depth of nesting: how many other regions contain this one's first point.
  const depthOf = regions.map((r, i) => regions.filter((o, j) => j !== i && o.area > r.area && inside(r.points[0]!, o.points)).length)
  const parentOf = regions.map((r, i) => {
    let best = -1
    regions.forEach((o, j) => { if (j !== i && o.area > r.area && depthOf[j]! === depthOf[i]! - 1 && inside(r.points[0]!, o.points) && (best < 0 || o.area < regions[best]!.area)) best = j })
    return best
  })
  const elements: Array<Record<string, unknown>> = []
  const common = { ...(options.color !== undefined ? { color: options.color } : {}), ...(options.layer !== undefined ? { layer: options.layer } : {}) }
  const over = Math.max(1, options.depth * 0.1)
  const solidIndex = new Map<number, number>()
  let holes = 0
  const base = options.baseZ ?? 0
  const make = (r: Region, z: number, depth: number, name: string): number => {
    elements.push(r.circle !== undefined
      ? { type: "cylinder", name, x: r.circle.center.x, y: r.circle.center.y, z: z + depth / 2, radius: r.circle.radius, height: depth, tolerance, ...common }
      : { type: "extrusion", name, shape: "profile", profile: r.points.map((p) => ({ x: p.x, y: p.y })), depth, x: 0, y: 0, z, ...common })
    return elements.length - 1
  }
  regions.forEach((r, i) => { if (depthOf[i]! % 2 === 0) solidIndex.set(i, make(r, base, options.depth, `${options.name ?? "Part"} ${solidIndex.size + 1}`)) })
  const subtract = new Map<number, number[]>()
  regions.forEach((r, i) => {
    if (depthOf[i]! % 2 === 0) return
    const owner = parentOf[i]!
    if (!solidIndex.has(owner)) return
    holes++
    const tool = make(r, base - over, options.depth + 2 * over, `Hole ${holes}`)
    subtract.set(owner, [...(subtract.get(owner) ?? []), tool])
  })
  // Each solid with holes becomes one boolean-subtract of the solid and its tools.
  for (const [owner, tools] of subtract) {
    elements.push({ type: "boolean-subtract", name: `${String(elements[solidIndex.get(owner)!]!["name"])} (with holes)`, operands: [solidIndex.get(owner)!, ...tools], x: 0, y: 0, z: 0, ...common })
  }
  return { elements, warnings, stats: { solids: solidIndex.size, holes, open } }
}
