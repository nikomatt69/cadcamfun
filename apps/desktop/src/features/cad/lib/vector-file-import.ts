/** Import 2D exchange drawings as editable CAD line segments, with explicit approximation diagnostics. */
import { parseSvg, readDxfShapes, segmentsFor, type Shape } from "@cadcamfun/core"

const PX_MM = 25.4 / 96
const TOLERANCE = 0.01
const numeric = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/
const lengths: Readonly<Record<string, number>> = { "": PX_MM, px: PX_MM, mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, q: 0.25 }

type VectorFile = Pick<File, "name" | "text">
type Point = { readonly x: number; readonly y: number }
type Mapping = { readonly xScale: number; readonly yScale: number; readonly xOffset: number; readonly yOffset: number }

const lengthMm = (raw: string | null, fallback: number): number => {
  if (raw === null) return fallback
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(px|mm|cm|in|pt|pc|q)?\s*$/i.exec(raw)
  if (!m) throw new Error(`SVG viewport length '${raw}' is not supported.`)
  const value = Number(m[1]) * lengths[(m[2] ?? "").toLowerCase()]!
  if (!Number.isFinite(value) || value <= 0) throw new Error("SVG viewport dimensions must be positive.")
  return value
}

/** The core SVG reader handles geometry; this establishes the physical root viewport and removes unsupported subtrees. */
const svgSource = (text: string): { readonly source: string; readonly mapping: Mapping; readonly warnings: string[] } => {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("SVG document type declarations are not supported.")
  const document = new DOMParser().parseFromString(text, "image/svg+xml")
  const root = document.documentElement
  if (!root || root.localName.toLowerCase() !== "svg" || document.querySelector("parsererror")) throw new Error("The SVG file is not well-formed XML.")
  if (root.hasAttribute("transform")) throw new Error("A transform on the SVG root is not supported.")
  if (["clip-path", "mask", "filter"].some((key) => root.hasAttribute(key)) || /(?:clip-path|mask|filter|transform|display|visibility)\s*:/i.test(root.getAttribute("style") ?? "")) throw new Error("SVG clipping, visibility rules, masks, filters and CSS transforms on the root are not supported.")
  if (root.getAttribute("display") === "none" || root.getAttribute("visibility") === "hidden") throw new Error("The SVG root is hidden.")
  const warnings: string[] = []
  let mapping: Mapping = { xScale: PX_MM, yScale: PX_MM, xOffset: 0, yOffset: 0 }
  const viewBox = root.getAttribute("viewBox")
  if (viewBox !== null) {
    const box = viewBox.trim().split(/[\s,]+/).map(Number)
    if (box.length !== 4 || box.some((v) => !Number.isFinite(v)) || !(box[2]! > 0) || !(box[3]! > 0)) throw new Error("The SVG viewBox is invalid.")
    const width = lengthMm(root.getAttribute("width"), 300 * PX_MM)
    const height = lengthMm(root.getAttribute("height"), 150 * PX_MM)
    if (!root.hasAttribute("width") || !root.hasAttribute("height")) warnings.push("SVG viewport dimensions are missing; the default 300 × 150 CSS pixels were used.")
    const aspect = (root.getAttribute("preserveAspectRatio") ?? "xMidYMid meet").trim().split(/\s+/)
    let sx = width / box[2]!, sy = height / box[3]!, padX = 0, padY = 0
    if (aspect[0] !== "none") {
      const match = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/.exec(aspect[0] ?? "")
      if (!match || (aspect[1] !== undefined && aspect[1] !== "meet" && aspect[1] !== "slice") || aspect.length > 2) throw new Error("The SVG preserveAspectRatio is not supported.")
      const scale = aspect[1] === "slice" ? Math.max(sx, sy) : Math.min(sx, sy)
      const align = (part: string | undefined) => part === "Min" ? 0 : part === "Max" ? 1 : 0.5
      padX = (width - box[2]! * scale) * align(match[1]); padY = (height - box[3]! * scale) * align(match[2]); sx = scale; sy = scale
      if (aspect[1] === "slice") warnings.push("SVG viewport clipping is not applied to geometry outside the viewBox.")
    } else if (aspect.length > 1) throw new Error("The SVG preserveAspectRatio is not supported.")
    mapping = { xScale: sx, yScale: sy, xOffset: padX - box[0]! * sx, yOffset: -padY + box[1]! * sy }
  } else {
    if (root.hasAttribute("width")) lengthMm(root.getAttribute("width"), 0)
    if (root.hasAttribute("height")) lengthMm(root.getAttribute("height"), 0)
    warnings.push("SVG coordinates were converted from CSS pixels at 96 dpi.")
  }
  const accepted = new Set(["g", "line", "rect", "circle", "ellipse", "polyline", "polygon", "path"])
  const numericAttributes: Readonly<Record<string, ReadonlyArray<string>>> = {
    line: ["x1", "y1", "x2", "y2"], rect: ["x", "y", "width", "height", "rx", "ry"], circle: ["cx", "cy", "r"], ellipse: ["cx", "cy", "rx", "ry"]
  }
  const skipped = new Map<string, number>()
  const clean = (parent: Element): void => {
    for (const child of Array.from(parent.children)) {
      const tag = child.localName.toLowerCase()
      if (!accepted.has(tag)) { skipped.set(tag, (skipped.get(tag) ?? 0) + 1); child.remove(); continue }
      if (child.getAttribute("display") === "none" || child.getAttribute("visibility") === "hidden" || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:;|$)/i.test(child.getAttribute("style") ?? "")) { skipped.set("hidden", (skipped.get("hidden") ?? 0) + 1); child.remove(); continue }
      if (["clip-path", "mask", "filter"].some((key) => child.hasAttribute(key)) || /(?:clip-path|mask|filter|transform)\s*:/i.test(child.getAttribute("style") ?? "")) throw new Error("SVG clipping, masks, filters and CSS transforms are not supported.")
      const transform = child.getAttribute("transform")
      if (transform !== null) {
        if (transform.replace(/(?:translate|rotate)\s*\([^)]*\)/gi, "").trim() !== "") throw new Error("SVG scale, matrix and skew transforms are not supported.")
        for (const match of transform.matchAll(/(translate|rotate)\s*\(([^)]*)\)/gi)) {
          const values = match[2]!.trim().split(/[\s,]+/)
          if (values.some((value) => !numeric.test(value)) || !(match[1]!.toLowerCase() === "translate" ? [1, 2] : [1, 3]).includes(values.length)) throw new Error("An SVG transform has invalid parameters.")
        }
      }
      for (const key of numericAttributes[tag] ?? []) {
        const value = child.getAttribute(key)
        if (value !== null && !numeric.test(value.trim())) throw new Error(`SVG ${tag} attribute '${key}' must be a unitless number.`)
      }
      if (tag === "rect" && (Number(child.getAttribute("rx") ?? 0) !== 0 || Number(child.getAttribute("ry") ?? 0) !== 0)) throw new Error("Rounded SVG rectangles are not supported; convert them to paths first.")
      if (tag === "path") {
        const d = child.getAttribute("d") ?? ""
        if (d.replace(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?|[\s,]/g, "") !== "") throw new Error("The SVG path contains an unsupported command or invalid data.")
      }
      clean(child)
    }
  }
  clean(root)
  if (skipped.size) warnings.push(`Skipped SVG content: ${[...skipped].map(([tag, n]) => `${tag} (${n})`).join(", ")}.`)
  warnings.push("SVG curves and styling may be approximated or omitted; imported geometry is a 2D outline.")
  return { source: root.outerHTML, mapping, warnings }
}

const validPoint = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y)
const endpoints = (shape: Shape, maxScale: number): { readonly points: ReadonlyArray<Point>; readonly closed: boolean; readonly curved: boolean } => {
  if (shape.kind === "line") return { points: [shape.a, shape.b], closed: false, curved: false }
  if (shape.kind === "polyline") return { points: shape.points, closed: shape.closed, curved: false }
  if (!Number.isFinite(shape.radius) || shape.radius <= 0 || !validPoint(shape.center)) throw new Error("The drawing contains an invalid curve.")
  const full = shape.kind === "circle"
  const start = full ? 0 : shape.start
  let sweep = full ? 2 * Math.PI : shape.end - start
  if (!Number.isFinite(start) || !Number.isFinite(sweep) || Math.abs(sweep) > 2 * Math.PI + 1e-9) throw new Error("The drawing contains an invalid arc.")
  if (sweep <= 0) sweep += 2 * Math.PI
  const n = Math.max(full ? 8 : 2, Math.ceil(segmentsFor(shape.radius * maxScale, TOLERANCE, 2048) * sweep / (2 * Math.PI)))
  const count = full ? n : n + 1
  return { points: Array.from({ length: count }, (_, i) => ({ x: shape.center.x + shape.radius * Math.cos(start + sweep * i / n), y: shape.center.y + shape.radius * Math.sin(start + sweep * i / n) })), closed: full, curved: true }
}

/** DXF in declared units, SVG in CSS pixels or its physical viewBox; curves are converted to line segments. */
export const vectorFileElements = async (file: VectorFile): Promise<{ readonly elements: ReadonlyArray<Record<string, unknown>>; readonly warnings: ReadonlyArray<string> }> => {
  const text = await file.text(), extension = file.name.split(".").at(-1)?.toLowerCase()
  let shapes: ReadonlyArray<Shape>, warnings: string[], map: Mapping
  if (extension === "dxf") {
    const pairs = text.split(/\r\n|\r|\n/)
    if (pairs.length % 2 === 1 && pairs.at(-1)?.trim() === "") pairs.pop()
    if (pairs.length % 2 !== 0 || !pairs.every((value, index) => index % 2 !== 0 || /^\s*\d+\s*$/.test(value))) throw new Error("The DXF has incomplete or invalid code/value pairs.")
    const records = Array.from({ length: pairs.length / 2 }, (_, i) => ({ code: Number(pairs[i * 2]!.trim()), value: pairs[i * 2 + 1]!.trim().toUpperCase() }))
    const start = records.findIndex((item, i) => item.code === 0 && item.value === "SECTION" && records[i + 1]?.code === 2 && records[i + 1]?.value === "ENTITIES")
    if (start < 0 || !records.slice(start + 2).some((item) => item.code === 0 && item.value === "ENDSEC") || records.at(-1)?.code !== 0 || records.at(-1)?.value !== "EOF") throw new Error("The DXF has an incomplete ENTITIES section or is missing EOF.")
    const parsed = readDxfShapes(text, { tolerance: TOLERANCE })
    if (parsed.warnings.some((warning) => warning.startsWith("Unsupported $INSUNITS"))) throw new Error(parsed.warnings.find((warning) => warning.startsWith("Unsupported $INSUNITS"))!)
    shapes = parsed.shapes; warnings = [...parsed.warnings]; map = { xScale: 1, yScale: 1, xOffset: 0, yOffset: 0 }
    if (!/\$INSUNITS\s*\r?\n\s*70\s*\r?\n\s*(?:1|4|5|6)\s*(?:\r?\n|$)/i.test(text)) warnings.push("DXF units are unspecified; coordinates are assumed to be millimetres.")
    warnings.push("DXF geometry is imported as a 2D XY outline; elevation and extrusion directions are not preserved.")
  } else if (extension === "svg") {
    const prepared = svgSource(text)
    const parsed = parseSvg(prepared.source, { scale: 1, tolerance: TOLERANCE / Math.max(prepared.mapping.xScale, prepared.mapping.yScale) })
    shapes = parsed.shapes; warnings = [...prepared.warnings, ...parsed.warnings]; map = prepared.mapping
  } else throw new Error("Unsupported vector format.")
  const elements: Record<string, unknown>[] = []
  let curves = false
  for (const shape of shapes) {
    const path = endpoints(shape, Math.max(map.xScale, map.yScale))
    curves ||= path.curved
    if (path.points.length < 2 || path.points.some((point) => !validPoint(point))) throw new Error("The drawing contains invalid or incomplete geometry.")
    const points = path.points.map((p) => ({ x: p.x * map.xScale + map.xOffset, y: p.y * map.yScale + map.yOffset }))
    if (points.some((point) => !validPoint(point))) throw new Error("The drawing coordinates exceed the supported range.")
    const count = path.closed ? points.length : points.length - 1
    for (let i = 0; i < count; i++) {
      const a = points[i]!, b = points[(i + 1) % points.length]!
      if (a.x === b.x && a.y === b.y) continue
      elements.push({ type: "line", name: `${file.name} · ${shape.layer}`, sourceLayer: shape.layer, x1: a.x, y1: a.y, z1: 0, x2: b.x, y2: b.y, z2: 0, color: "#60a5fa" })
    }
  }
  if (elements.length === 0) throw new Error(`The drawing contains no supported geometry.${warnings.length ? ` ${warnings.join(" ")}` : ""}`)
  if (curves || extension === "dxf" && /\n(?:ELLIPSE|LWPOLYLINE)\s*\r?\n/i.test(text)) warnings.push("Curved outlines are imported as line segments; they are not exact curves.")
  warnings.push("Source layers are recorded per element; imported elements are added to the active CAD layer.")
  return { elements, warnings }
}
