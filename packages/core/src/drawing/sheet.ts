/**
 * The drawing sheet: frame with zone grid, title block, notes, projection symbol, views at one scale, dimensions and hole callouts,
 * a section with its cutting-plane line, a detail with its circle, a flatness frame. The output is a core `Drawing` (millimetres, y up,
 * the sheet's lower-left corner at the origin) and a report of what it says, so a test or the assistant can read the dimension values and
 * callout strings without parsing graphics.
 *
 * Layout is by rule, not by search: the three principal views follow the projection angle (third angle: top above the front, right to the
 * right of it; first angle: top below, right to the left), extras (isometric, section, detail) stand in a column to their right, and the
 * largest standard scale at which everything fits is taken. Dimensions stack outwards from a view at fixed spacing; text that would overlap
 * other text is reported in `warnings`, not moved.
 */
import { emptyDrawing, type Drawing, type Entity } from "../cad/entities.ts"
import { rebuild, type History, type RebuildResult } from "../cad/history.ts"
import { rebuildExact } from "../cad/history-brep.ts"
import { drawingEdges } from "../cad/brep/drawing-edges.ts"
import { meshBounds, type Mesh } from "../cad/solid.ts"
import type { Vec2 } from "../cad/vec.ts"
import { fmt, planDimensions, type CircleNote, type DimensionPlan, type HoleGroup } from "./dimensions.ts"
import { edgesOf, projectView, viewFrame, type Edge3, type ProjectedView, type Seg2, type V3, type ViewName } from "./project.ts"
import { detailView, sectionView, type Axis, type SectionView } from "./section.ts"
import { drawingToSvg } from "./svg.ts"

export type SheetSize = "A4" | "A3" | "A2"
const SIZES: Readonly<Record<SheetSize, readonly [number, number]>> = { A4: [297, 210], A3: [420, 297], A2: [594, 420] }
const SCALES = [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02] as const

export interface SheetOptions {
  readonly size?: SheetSize
  readonly projection?: "first" | "third"
  readonly title?: string
  readonly drawingNumber?: string
  readonly material?: string
  readonly colour?: string
  readonly finish?: string
  readonly standard?: string
  readonly revision?: string
  readonly sheet?: string
  readonly date?: string
  readonly author?: string
  readonly notes?: ReadonlyArray<string>
  /** The principal views, default front, top and right. */
  readonly views?: ReadonlyArray<"front" | "top" | "right">
  readonly iso?: boolean
  /** Fixed scale (1 = 1:1, 2 = 2:1, 0.5 = 1:2); by default the largest standard scale that fits. */
  readonly scale?: number
  readonly section?: { readonly axis: Axis; readonly at: number; readonly from?: "+" | "-"; readonly letter?: string; readonly parent?: "front" | "top" | "right" }
  readonly detail?: { readonly view?: "front" | "top" | "right"; readonly centre: V3; readonly radius: number; readonly factor: number; readonly letter?: string }
  readonly flatness?: { readonly value: number; readonly view?: "front" | "top" | "right" }
  /** Draw the views from the exact B-rep edges when every body has an exact model (default true); otherwise from the mesh. */
  readonly exact?: boolean
}

export interface DimensionReport {
  readonly view: string
  readonly kind: "linear" | "radius" | "diameter" | "angular" | "callout"
  readonly text: string
  /** The measured value for linear, radius, diameter and angular dimensions. */
  readonly value: number | undefined
}
export interface ViewReport { readonly name: string; readonly label: string; readonly scale: number; readonly kind: "principal" | "iso" | "section" | "detail"; readonly bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } }

export interface DrawingSheet {
  readonly drawing: Drawing
  readonly svg: string
  readonly size: { readonly width: number; readonly height: number }
  readonly scale: number
  readonly views: ReadonlyArray<ViewReport>
  readonly dimensions: ReadonlyArray<DimensionReport>
  /** The hole and thread callouts, each as its lines joined by ` / `. */
  readonly callouts: ReadonlyArray<string>
  readonly section: { readonly loops: number; readonly hatchLines: number } | undefined
  readonly warnings: ReadonlyArray<string>
  /** Where the view edges came from: the exact B-rep (true curves, tangent edges hidden) or the mesh's dihedral angles. */
  readonly edgeSource: "exact" | "mesh"
}

export const scaleText = (s: number): string => (s >= 1 ? `${Number(s.toFixed(3))}:1` : `1:${Number((1 / s).toFixed(3))}`)

// ---------------------------------------------------------------- canvas

const LAYERS = [
  { id: "frame", name: "FRAME", color: "#000000", width: 0.7 },
  { id: "visible", name: "VISIBLE", color: "#000000", width: 0.5 },
  { id: "hidden", name: "HIDDEN", color: "#444444", width: 0.25 },
  { id: "centre", name: "CENTRE", color: "#b71c1c", width: 0.18 },
  { id: "dim", name: "DIM", color: "#000000", width: 0.18 },
  { id: "hatch", name: "HATCH", color: "#555555", width: 0.18 },
  { id: "text", name: "TEXT", color: "#000000", width: 0.18 },
  { id: "section", name: "SECTION", color: "#000000", width: 0.35 }
] as const
type LayerId = (typeof LAYERS)[number]["id"]
const WIDTH: Readonly<Record<LayerId, number>> = Object.fromEntries(LAYERS.map((l) => [l.id, l.width])) as Record<LayerId, number>
const COLOR: Readonly<Record<LayerId, string>> = Object.fromEntries(LAYERS.map((l) => [l.id, l.color])) as Record<LayerId, string>

interface TextBox { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly text: string }

class Canvas {
  readonly entities: Entity[] = []
  readonly texts: TextBox[] = []
  private n = 0
  private base(layer: LayerId, type: "continuous" | "dashed" | "center" | "phantom", width?: number) {
    return { id: `e${++this.n}`, layerId: layer, visible: true, locked: false, lineStyle: { color: hexToColor(COLOR[layer]), width: width ?? WIDTH[layer], type } }
  }
  line(layer: LayerId, a: Vec2, b: Vec2, type: "continuous" | "dashed" | "center" | "phantom" = "continuous", width?: number): void {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) return
    this.entities.push({ _tag: "Line", ...this.base(layer, type, width), start: a, end: b })
  }
  circle(layer: LayerId, c: Vec2, r: number, type: "continuous" | "dashed" | "center" | "phantom" = "continuous", width?: number): void {
    this.entities.push({ _tag: "Circle", ...this.base(layer, type, width), center: c, radius: r })
  }
  arc(layer: LayerId, c: Vec2, r: number, a0: number, a1: number, type: "continuous" | "center" = "continuous"): void {
    const TAU = 2 * Math.PI
    const norm = (a: number): number => { let x = a % TAU; if (x < 0) x += TAU; return x >= TAU ? 0 : x }
    this.entities.push({ _tag: "Arc", ...this.base(layer, type), center: c, radius: r, startAngle: norm(a0), endAngle: norm(a1), clockwise: false })
  }
  poly(layer: LayerId, points: ReadonlyArray<Vec2>, closed: boolean, fill = false): void {
    this.entities.push({ _tag: "Polyline", ...this.base(layer, "continuous"), points, closed, ...(fill ? { userData: { fill: true } } : {}) })
  }
  rect(layer: LayerId, x0: number, y0: number, x1: number, y1: number, width?: number): void {
    this.entities.push({ _tag: "Polyline", ...this.base(layer, "continuous", width), points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true })
  }
  text(at: Vec2, text: string, size = 3.5, o: { align?: "left" | "center" | "right"; baseline?: "top" | "middle" | "bottom"; rotation?: number; track?: boolean } = {}): void {
    const align = o.align ?? "left", baseline = o.baseline ?? "bottom", rotation = o.rotation ?? 0
    this.entities.push({ _tag: "Text", ...this.base("text", "continuous"), position: at, text, fontSize: size, fontFamily: "Arial, Helvetica, sans-serif", rotation, alignment: align === "center" ? "center" : align, baseline })
    if (o.track !== false) {
      const w = text.length * size * 0.58
      const x0 = align === "left" ? 0 : align === "center" ? -w / 2 : -w, y0 = baseline === "bottom" ? 0 : baseline === "middle" ? -size / 2 : -size
      const c = Math.cos((rotation * Math.PI) / 180), s = Math.sin((rotation * Math.PI) / 180)
      const pts = [[x0, y0], [x0 + w, y0 + size]].map(([x, y]) => ({ x: at.x + x! * c - y! * s, y: at.y + x! * s + y! * c }))
      this.texts.push({ x0: Math.min(pts[0]!.x, pts[1]!.x), y0: Math.min(pts[0]!.y, pts[1]!.y), x1: Math.max(pts[0]!.x, pts[1]!.x), y1: Math.max(pts[0]!.y, pts[1]!.y), text })
    }
  }
  arrow(tip: Vec2, dir: Vec2, size = 2.5): void {
    const l = Math.hypot(dir.x, dir.y)
    const ux = dir.x / l, uy = dir.y / l
    const bx = tip.x - ux * size, by = tip.y - uy * size
    this.poly("dim", [tip, { x: bx - uy * size * 0.18, y: by + ux * size * 0.18 }, { x: bx + uy * size * 0.18, y: by - ux * size * 0.18 }], true, true)
  }
}

const hexToColor = (hex: string): { r: number; g: number; b: number } => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) })

// ---------------------------------------------------------------- view placement

type PrincipalName = "front" | "top" | "right"

interface Placed {
  readonly name: string
  readonly kind: ViewReport["kind"]
  readonly label: string
  readonly view: ProjectedView
  readonly scale: number
  /** Sheet position of the view's own origin (view coordinates are multiplied by the scale and added to it). */
  ox: number
  oy: number
  readonly width: number
  readonly height: number
  readonly section?: SectionView
}
const place = (p: Placed, v: Vec2): Vec2 => ({ x: p.ox + v.x * p.scale, y: p.oy + v.y * p.scale })

const MARGIN = 26 // room for two stacked dimensions on every side of a view, mm on the sheet

// ---------------------------------------------------------------- the generator

/** Generates the sheet for a history (its body and its features) or for a bare mesh (no feature-driven dimensions). */
export const generateSheet = (source: History | { readonly mesh: Mesh }, options: SheetOptions = {}): DrawingSheet => {
  validateSheetOptions(options)
  const warnings: string[] = []
  let result: RebuildResult | undefined
  let plan: DimensionPlan
  let mesh: Mesh
  if ("mesh" in source) {
    mesh = source.mesh
    const b = meshBounds(mesh)
    plan = { holes: [], radii: [], circles: [], bounds: { min: { x: b.minX, y: b.minY, z: b.minZ }, max: { x: b.maxX, y: b.maxY, z: b.maxZ } }, notes: ["A bare mesh has no features: only overall sizes are dimensioned"] }
  } else {
    result = rebuild(source)
    const errors = result.issues.filter((i) => i.severity === "error")
    if (errors.length > 0) throw new RangeError(`The part failed to rebuild: ${errors.map((e) => `${e.feature}: ${e.message}`).join("; ")}`)
    if (result.bodies.length === 0) throw new RangeError(`The history builds no body to draw${errors.length > 0 ? `: ${errors[0]!.message}` : ""}`)
    mesh = result.bodies.length === 1 ? result.bodies[0]!.mesh : mergeBodies(result.bodies.map((b) => b.mesh))
    plan = planDimensions(source, result)
  }
  warnings.push(...plan.notes)
  const [W, H] = SIZES[options.size ?? "A3"]
  const projection = options.projection ?? "first"
  // The views: from the exact solid when every body has one (its edges are the true feature edges, a fillet's tangent
  // boundaries are not drawn), else from the mesh. The exact tessellation is also the occluder, so edges and faces agree.
  let viewMesh = mesh
  let edges: ReadonlyArray<Edge3> | undefined
  if (result !== undefined && options.exact !== false) {
    const ex = rebuildExact(source as History, result)
    const missing = ex.bodies.find((b) => b.brep === undefined)
    if (missing === undefined) {
      const parts = ex.bodies.map((b) => drawingEdges(b.brep!))
      viewMesh = parts.length === 1 ? parts[0]!.mesh : mergeBodies(parts.map((p) => p.mesh))
      edges = parts.flatMap((p) => p.edges)
    } else warnings.push(`Views drawn from the mesh: body '${missing.id}' has no exact model (${missing.reason ?? "unknown"})`)
  }
  const edgeSource = edges === undefined ? "mesh" : "exact"
  edges ??= edgesOf(mesh)
  const names = options.views ?? ["front", "top", "right"]
  const principal = new Map<PrincipalName, ProjectedView>()
  for (const n of names) principal.set(n, projectView(viewMesh, n, { edges }))
  const iso = options.iso === false ? undefined : projectView(viewMesh, "iso", { edges, hidden: false })

  // The area the views may use: inside the frame, above the title block and notes.
  const area = { x0: 20, y0: 58, x1: W - 20, y1: H - 20 }
  // The groups of holes each principal view dimensions, and the room their callouts need to the right of the view.
  const principalNames = [...principal.keys()]
  const groupsFor = (name: string): HoleGroup[] => plan.holes.filter((g) => {
    const seen = principalNames.some((v) => viewFrame(v).toViewer[g.axis] > 0.99)
    const f = viewFrame(name as ViewName)
    return seen ? f.toViewer[g.axis] > 0.99 : Math.abs(f.toViewer[g.axis]) > 0.99 && f.toViewer[g.axis] < 0
  })
  const calloutRoom = Math.max(0, ...principalNames.flatMap((n) => groupsFor(n).flatMap((g) => g.lines.map((l) => l.length * TEXT * 0.58 + 18 - MARGIN))))
  /** Room a view takes: the dimension margin all round and the callouts to its right for principal views, a label's worth for the rest. */
  const sizeOf = (v: ProjectedView, s: number, kind: Placed["kind"] = "principal") => {
    const m = kind === "principal" ? MARGIN : kind === "iso" ? 9 : 13
    return { w: (v.bounds.maxX - v.bounds.minX) * s + 2 * m + (kind === "principal" ? calloutRoom : 0), h: (v.bounds.maxY - v.bounds.minY) * s + 2 * m }
  }

  interface Layout { readonly scale: number; readonly fits: boolean; readonly placed: Placed[] }
  const layout = (s: number): Layout => {
    const placed: Placed[] = []
    const front = principal.get("front"), top = principal.get("top"), right = principal.get("right")
    const dims = (v: ProjectedView | undefined) => (v === undefined ? { w: 0, h: 0 } : sizeOf(v, s, "principal"))
    const f = dims(front), t = dims(top), r = dims(right)
    // Grid cells: rows (top of the sheet first) and columns.
    const third = projection === "third"
    const colA = third ? Math.max(f.w, t.w) : r.w          // first column
    const colB = third ? r.w : Math.max(f.w, t.w)          // second column
    const rowTop = third ? t.h : Math.max(f.h, r.h)
    const rowBottom = third ? Math.max(f.h, r.h) : t.h
    const blockW = colA + colB, blockH = rowTop + rowBottom
    const cellOf = (col: 0 | 1, row: 0 | 1) => ({ x: area.x0 + (col === 0 ? 0 : colA), y: area.y1 - (row === 0 ? rowTop : rowTop + rowBottom), w: col === 0 ? colA : colB, h: row === 0 ? rowTop : rowBottom })
    const put = (name: string, v: ProjectedView | undefined, col: 0 | 1, row: 0 | 1, align?: { ox?: number; oy?: number }): void => {
      if (v === undefined) return
      const c = cellOf(col, row)
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2
      const p: Placed = { name, kind: "principal", label: name, view: v, scale: s, ox: align?.ox ?? cx - ((v.bounds.minX + v.bounds.maxX) / 2) * s - calloutRoom / 2, oy: align?.oy ?? cy - ((v.bounds.minY + v.bounds.maxY) / 2) * s, width: (v.bounds.maxX - v.bounds.minX) * s, height: (v.bounds.maxY - v.bounds.minY) * s }
      placed.push(p)
    }
    // Front is the reference: top shares its x, right shares its y.
    if (third) { put("front", front, 0, 1); put("top", top, 0, 0); put("right", right, 1, 1) } else { put("front", front, 1, 0); put("top", top, 1, 1); put("right", right, 0, 0) }
    const fp = placed.find((p) => p.name === "front")
    if (fp !== undefined) for (const p of placed) { if (p.name === "top") p.ox = fp.ox; if (p.name === "right") p.oy = fp.oy }
    // Extras stand in a column to the right of the block.
    const extras: Array<{ kind: Placed["kind"]; name: string; label: string; view: ProjectedView; scale: number; w: number; h: number; section?: SectionView }> = []
    if (iso !== undefined) { const d = sizeOf(iso, s, "iso"); extras.push({ kind: "iso", name: "iso", label: `Isometric View (${scaleText(s)})`, view: iso, scale: s, w: d.w, h: d.h }) }
    return { scale: s, fits: false, placed: [] as Placed[], ...{ _block: { blockW, blockH, placed, extras } } } as Layout & { _block: unknown }
  }
  void layout
  // The layout above computes the principal block; the full arrangement (extras, section, detail) is assembled by `arrange`.
  const arrange = (s: number) => {
    const block = layout(s) as unknown as { _block: { blockW: number; blockH: number; placed: Placed[]; extras: Array<{ kind: Placed["kind"]; name: string; label: string; view: ProjectedView; scale: number; w: number; h: number; section?: SectionView }> } }
    const { blockW, blockH, placed, extras } = block._block
    const all = [...placed]
    // Section and detail panels.
    let section: SectionView | undefined
    if (options.section !== undefined) {
      section = sectionView(mesh, { axis: options.section.axis, at: options.section.at, ...(options.section.from !== undefined ? { from: options.section.from } : {}), spacing: 3 / Math.max(s, 1e-9) })
      const letter = options.section.letter ?? "B"
      const d = sizeOf(section.view, s, "section")
      extras.push({ kind: "section", name: "section", label: `${letter}-${letter} (${scaleText(s)})`, view: section.view, scale: s, w: d.w, h: d.h, section })
    }
    if (options.detail !== undefined) {
      const parent = principal.get(options.detail.view ?? "top") ?? [...principal.values()][0]!
      const c2 = parent.toView(options.detail.centre)
      const dv = detailView(parent, c2, options.detail.radius, options.detail.factor)
      const dim = options.detail.radius * options.detail.factor * s * 2 + 2 * 24
      const letter = options.detail.letter ?? "A"
      const shell: ProjectedView = { name: "detail", frame: parent.frame, visible: dv.visible, hidden: dv.hidden, bounds: { minX: -options.detail.radius * options.detail.factor, minY: -options.detail.radius * options.detail.factor, maxX: options.detail.radius * options.detail.factor, maxY: options.detail.radius * options.detail.factor }, toView: parent.toView }
      extras.push({ kind: "detail", name: "detail", label: `${letter} (${scaleText(s * options.detail.factor)})`, view: shell, scale: s, w: dim, h: dim })
    }
    // Shelf-pack the extras: a column at the right of the block, then further columns.
    let colX = area.x0 + blockW + 4, y = area.y1, colW = 0
    let fits = blockW <= area.x1 - area.x0 + 1e-6 && blockH <= area.y1 - area.y0 + 1e-6
    for (const e of extras) {
      if (y - e.h < area.y0) { colX += colW + 4; y = area.y1; colW = 0 }
      const cx = colX + e.w / 2, cy = y - e.h / 2
      const v = e.view
      all.push({ name: e.name, kind: e.kind, label: e.label, view: v, scale: e.scale, ox: cx - ((v.bounds.minX + v.bounds.maxX) / 2) * e.scale, oy: cy - ((v.bounds.minY + v.bounds.maxY) / 2) * e.scale, width: (v.bounds.maxX - v.bounds.minX) * e.scale, height: (v.bounds.maxY - v.bounds.minY) * e.scale, ...(e.section !== undefined ? { section: e.section } : {}) })
      colW = Math.max(colW, e.w); y -= e.h + 2
      if (colX + e.w > area.x1 + 1e-6) fits = false
    }
    return { fits, placed: all, section }
  }
  let scale = options.scale ?? SCALES.find((s) => arrange(s).fits) ?? SCALES[SCALES.length - 1]!
  let arranged = arrange(scale)
  if (options.scale !== undefined && !arranged.fits) warnings.push(`The views do not fit the ${options.size ?? "A3"} sheet at ${scaleText(options.scale)}`)
  if (!arranged.fits && options.scale === undefined) { scale = SCALES[SCALES.length - 1]!; arranged = arrange(scale); warnings.push("The views do not fit the sheet at the smallest standard scale") }

  // ------------------------------------------------------------ draw
  const cv = new Canvas()
  const dimensions: DimensionReport[] = []
  const callouts: string[] = []
  drawFrame(cv, W, H)
  drawTitleBlock(cv, W, options, projection, scale)
  drawNotes(cv, options.notes)

  for (const p of arranged.placed) {
    for (const s of p.view.visible) cv.line("visible", place(p, s.a), place(p, s.b))
    for (const s of p.view.hidden) cv.line("hidden", place(p, s.a), place(p, s.b), "dashed")
    if (p.section !== undefined) for (const h of p.section.hatch) cv.line("hatch", place(p, h.a), place(p, h.b))
    if (p.kind === "detail") {
      const r = options.detail!.radius * options.detail!.factor * p.scale
      cv.circle("section", { x: p.ox, y: p.oy }, r, "continuous", 0.25)
    }
    const top = p.oy + p.view.bounds.maxY * p.scale
    cv.text({ x: p.ox + ((p.view.bounds.minX + p.view.bounds.maxX) / 2) * p.scale, y: p.kind === "detail" ? p.oy + options.detail!.radius * options.detail!.factor * p.scale + 3 : top + (p.kind === "principal" ? MARGIN - 4 : 6) }, p.kind === "principal" ? labelOf(p.name) : p.label, p.kind === "principal" ? 3 : 5, { align: "center", track: p.kind !== "principal" })
  }
  const reports: ViewReport[] = arranged.placed.map((p) => ({ name: p.name, label: p.label, scale: p.scale, kind: p.kind, bounds: p.view.bounds }))

  // Dimensions on the principal views.
  const placedPrincipal = arranged.placed.filter((p) => p.kind === "principal")
  const detail = options.detail
  const detailPanel = arranged.placed.find((p) => p.kind === "detail")
  const detailCircle = detail === undefined ? undefined : plan.circles.find((c) =>
    c.axis === AXIS_OF_VIEW[detail.view ?? "top"] &&
    Math.hypot(c.centre.x - detail.centre.x, c.centre.y - detail.centre.y) + c.diameter / 2 <= detail.radius)
  // A representative detail dimensions equal patterns once; their locations remain in the principal chains.
  const principalPlan = detailCircle === undefined ? plan : { ...plan, circles: plan.circles.filter((c) =>
    c.diameter !== detailCircle.diameter || c.angle !== detailCircle.angle || c.count !== detailCircle.count) }
  for (const p of placedPrincipal) drawViewDimensions(cv, p, groupsFor(p.name), principalPlan, dimensions, callouts, warnings, scale)
  if (detail !== undefined && detailPanel !== undefined && detailCircle !== undefined) {
    const parent = principal.get(detail.view ?? "top")!
    const c = parent.toView(detailCircle.centre), origin = parent.toView(detail.centre)
    const ctr = place(detailPanel, { x: (c.x - origin.x) * detail.factor, y: (c.y - origin.y) * detail.factor })
    drawCircleDimensions(cv, detailPanel, detailCircle, ctr, scale * detail.factor, dimensions, detail.radius * scale * detail.factor + 4)
  }
  if (options.flatness !== undefined) {
    const target = placedPrincipal.find((p) => p.name === (options.flatness!.view ?? "right")) ?? placedPrincipal[0]
    if (target !== undefined) drawFlatness(cv, target, options.flatness.value, dimensions)
  }
  // Cutting-plane line and detail circle on the parent views.
  if (options.section !== undefined && arranged.section !== undefined) {
    const parent = placedPrincipal.find((p) => p.name === (options.section!.parent ?? (options.section!.axis === "z" ? "front" : "top")))
    if (parent !== undefined) drawCuttingPlane(cv, parent, options.section, plan)
  }
  if (options.detail !== undefined) {
    const parent = placedPrincipal.find((p) => p.name === (options.detail!.view ?? "top"))
    if (parent !== undefined) {
      const c = place(parent, parent.view.toView(options.detail.centre))
      cv.circle("section", c, options.detail.radius * parent.scale, "continuous", 0.25)
      cv.text({ x: c.x + options.detail.radius * parent.scale * 0.72, y: c.y + options.detail.radius * parent.scale * 0.72 + 1 }, options.detail.letter ?? "A", 4, { track: false })
    }
  }
  // Text that overlaps other text is reported, not moved.
  const boxes = cv.texts
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!
    if (a.x0 < b.x1 - 0.2 && b.x0 < a.x1 - 0.2 && a.y0 < b.y1 - 0.2 && b.y0 < a.y1 - 0.2) warnings.push(`Text overlaps: '${a.text}' and '${b.text}'`)
  }
  const base = emptyDrawing("sheet", options.title ?? "Drawing", "mm")
  const drawing: Drawing = { ...base, layers: LAYERS.map((l) => ({ id: l.id, name: l.name, visible: true, locked: false, color: l.color })), entities: cv.entities }
  return {
    drawing, svg: drawingToSvg(drawing, { width: W, height: H }), size: { width: W, height: H }, scale, views: reports, dimensions, callouts,
    section: arranged.section === undefined ? undefined : { loops: arranged.section.loops.length, hatchLines: arranged.section.hatch.length }, warnings, edgeSource
  }
}

const labelOf = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1)

const mergeBodies = (meshes: ReadonlyArray<Mesh>): Mesh => {
  const positions: number[] = [], indices: number[] = []
  for (const m of meshes) { const base = positions.length / 3; for (const v of m.positions) positions.push(v); for (const i of m.indices) indices.push(base + i) }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
}

// ---------------------------------------------------------------- frame, title block, notes

const drawFrame = (cv: Canvas, W: number, H: number): void => {
  cv.rect("frame", 5, 5, W - 5, H - 5, 0.25)
  cv.rect("frame", 10, 10, W - 10, H - 10, 0.7)
  const cols = 12, rows = 8
  for (let i = 0; i < cols; i++) {
    const x0 = 10 + ((W - 20) * i) / cols, x1 = 10 + ((W - 20) * (i + 1)) / cols
    if (i > 0) { cv.line("frame", { x: x0, y: 5 }, { x: x0, y: 10 }, "continuous", 0.25); cv.line("frame", { x: x0, y: H - 10 }, { x: x0, y: H - 5 }, "continuous", 0.25) }
    cv.text({ x: (x0 + x1) / 2, y: 6.2 }, String(i + 1), 2.5, { align: "center", track: false })
    cv.text({ x: (x0 + x1) / 2, y: H - 8.8 }, String(i + 1), 2.5, { align: "center", track: false })
  }
  for (let j = 0; j < rows; j++) {
    const y0 = 10 + ((H - 20) * j) / rows, y1 = 10 + ((H - 20) * (j + 1)) / rows
    if (j > 0) { cv.line("frame", { x: 5, y: y0 }, { x: 10, y: y0 }, "continuous", 0.25); cv.line("frame", { x: W - 10, y: y0 }, { x: W - 5, y: y0 }, "continuous", 0.25) }
    const letter = String.fromCharCode(65 + rows - 1 - j)
    cv.text({ x: 7.5, y: (y0 + y1) / 2 }, letter, 2.5, { align: "center", baseline: "middle", track: false })
    cv.text({ x: W - 7.5, y: (y0 + y1) / 2 }, letter, 2.5, { align: "center", baseline: "middle", track: false })
  }
}

const drawTitleBlock = (cv: Canvas, W: number, o: SheetOptions, projection: "first" | "third", scale: number): void => {
  const x1 = W - 10, x0 = x1 - 180, y0 = 10, y1 = 50
  cv.rect("frame", x0, y0, x1, y1, 0.5)
  // Left block: material, colour, finish, standard.
  const left = [["Material:", o.material ?? "N.A."], ["Color:", o.colour ?? "N.A."], ["Finish:", o.finish ?? "As-machined"], ["Drawing & Tolerancing Standard:", o.standard ?? "ISO 2768-1"]] as const
  const split = x0 + 66
  cv.line("frame", { x: split, y: y0 }, { x: split, y: y1 }, "continuous", 0.35)
  cv.line("frame", { x: x0 + 40, y: y0 + 10 }, { x: x0 + 40, y: y1 }, "continuous", 0.18)
  left.forEach(([label, value], i) => {
    const yy = y1 - i * 10
    if (i > 0) cv.line("frame", { x: x0, y: yy }, { x: split, y: yy }, "continuous", 0.18)
    if (i < 3) cv.text({ x: x0 + 38, y: yy - 6 }, label, 2.6, { align: "right", track: false })
    else cv.text({ x: x0 + 38, y: yy - 4.2 }, "Drawing & Tolerancing", 2.2, { align: "right", track: false })
    if (i === 3) cv.text({ x: x0 + 38, y: yy - 7.4 }, "Standard:", 2.2, { align: "right", track: false })
    cv.text({ x: x0 + 53, y: yy - 6 }, value, 2.8, { align: "center", track: false })
  })
  // Right block: author/date, title, projection symbol, drawing number, revision, sheet.
  cv.line("frame", { x: split, y: y1 - 10 }, { x: x1, y: y1 - 10 }, "continuous", 0.18)
  cv.line("frame", { x: split, y: y0 + 12 }, { x: x1, y: y0 + 12 }, "continuous", 0.18)
  cv.text({ x: split + 2, y: y1 - 4 }, `Created by ${o.author ?? ""}`, 2.4, { track: false })
  cv.text({ x: split + 60, y: y1 - 4 }, o.date ?? "", 2.4, { track: false })
  cv.text({ x: split + 2, y: y1 - 14 }, "Title", 2, { track: false })
  cv.text({ x: split + 4, y: y1 - 22 }, o.title ?? "Untitled", 5, { track: false })
  cv.text({ x: split + 74, y: y1 - 14 }, "DWG No.", 2, { track: false })
  cv.text({ x: split + 80, y: y1 - 22 }, o.drawingNumber ?? "1", 4, { track: false })
  cv.line("frame", { x: split + 36, y: y0 }, { x: split + 36, y: y0 + 12 }, "continuous", 0.18)
  cv.text({ x: split + 2, y: y0 + 1.6 }, `Rev. ${o.revision ?? "A"}`, 2.4, { track: false })
  cv.text({ x: x1 - 24, y: y0 + 1.6 }, `Sheet ${o.sheet ?? "1/1"}`, 2.4, { track: false })
  // Projection symbol: a truncated cone seen from the side and from its large end.
  const sx = split + 70, sy = y0 + 6
  const side = (cx: number): void => cv.poly("frame", [{ x: cx - 6, y: sy - 4 }, { x: cx + 3, y: sy - 2 }, { x: cx + 3, y: sy + 2 }, { x: cx - 6, y: sy + 4 }], true)
  const end = (cx: number): void => { cv.circle("frame", { x: cx, y: sy }, 4, "continuous", 0.25); cv.circle("frame", { x: cx, y: sy }, 2, "continuous", 0.25) }
  if (projection === "first") { side(sx - 9); end(sx + 9) } else { end(sx - 9); side(sx + 9) }
  cv.text({ x: sx, y: y0 + 1 }, projection === "first" ? "1st Angle Proj." : "3rd Angle Proj.", 2.2, { align: "center", track: false })
  cv.text({ x: x1, y: y1 + 3 }, `Scale ${scaleText(scale)}`, 3.5, { align: "right", track: false })
}

const drawNotes = (cv: Canvas, notes: ReadonlyArray<string> | undefined): void => {
  const lines = notes ?? ["ALL UNITS ARE IN MM", "BREAK ALL SHARP EDGES", "SURFACE ROUGHNESS Ra 1.6 µm OR BETTER"]
  cv.text({ x: 20, y: 14 + lines.length * 5 + 6 }, "NOTES, UNLESS SPECIFIED OTHERWISE", 3.2, { track: false })
  lines.forEach((t, i) => cv.text({ x: 20, y: 14 + (lines.length - 1 - i) * 5 + 1 }, `${i + 1}.   ${t}`, 3.2, { track: false }))
}

// ---------------------------------------------------------------- dimensions

const TEXT = 3.2
const AXIS_OF_VIEW: Readonly<Record<string, "x" | "y" | "z">> = { front: "y", back: "y", top: "z", bottom: "z", right: "x", left: "x" }

/** A horizontal dimension between x1 and x2 (sheet mm), the dimension line at `yLine`, extension lines from `yFeature`. */
const hdim = (cv: Canvas, x1: number, x2: number, yLine: number, yFeature: number, text: string): void => {
  const dir = yLine >= yFeature ? 1 : -1
  for (const x of [x1, x2]) cv.line("dim", { x, y: yFeature + dir * 1 }, { x, y: yLine + dir * 1.5 })
  const [a, b] = x1 <= x2 ? [x1, x2] : [x2, x1]
  cv.line("dim", { x: a, y: yLine }, { x: b, y: yLine })
  const fits = b - a > text.length * TEXT * 0.58 + 5
  cv.arrow({ x: a, y: yLine }, { x: fits ? -1 : 1, y: 0 })
  cv.arrow({ x: b, y: yLine }, { x: fits ? 1 : -1, y: 0 })
  // Short dimensions keep their text above their own span, so they cannot run into the next label in a chain.
  cv.text({ x: (a + b) / 2, y: yLine + (fits ? 1 : 5) }, text, TEXT, { align: "center" })
}
const vdim = (cv: Canvas, y1: number, y2: number, xLine: number, xFeature: number, text: string): void => {
  const dir = xLine >= xFeature ? 1 : -1
  for (const y of [y1, y2]) cv.line("dim", { x: xFeature + dir * 1, y }, { x: xLine + dir * 1.5, y })
  const [a, b] = y1 <= y2 ? [y1, y2] : [y2, y1]
  cv.line("dim", { x: xLine, y: a }, { x: xLine, y: b })
  if (b - a > 6) { cv.arrow({ x: xLine, y: a }, { x: 0, y: -1 }); cv.arrow({ x: xLine, y: b }, { x: 0, y: 1 }) }
  else { cv.arrow({ x: xLine, y: a }, { x: 0, y: 1 }); cv.arrow({ x: xLine, y: b }, { x: 0, y: -1 }) }
  cv.text({ x: xLine - 1, y: (a + b) / 2 }, text, TEXT, { align: "center", rotation: 90 })
}

const drawViewDimensions = (cv: Canvas, p: Placed, groups: ReadonlyArray<HoleGroup>, plan: DimensionPlan, report: DimensionReport[], callouts: string[], warnings: string[], scale: number): void => {
  const b = p.view.bounds
  const lo = place(p, { x: b.minX, y: b.minY }), hi = place(p, { x: b.maxX, y: b.maxY })
  const axis = AXIS_OF_VIEW[p.name]!
  const frame = p.view.frame
  const level = (k: number): number => 10 + k * 8

  // Centre lines and the hole chain (positions along x, then along y, of every hole whose circle is seen in this view).
  const spots: Array<{ c: Vec2; r: number }> = []
  for (const g of groups) for (const q of g.positions) spots.push({ c: p.view.toView(q), r: Math.max(g.diameter, g.headDiameter ?? 0) / 2 })
  const anchors = groups.flatMap((g) => g.anchors.map((q) => p.view.toView(q)))
  for (const s of spots) {
    const c = place(p, s.c), r = s.r * scale + 2.5
    cv.line("centre", { x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }, "center")
    cv.line("centre", { x: c.x, y: c.y - r }, { x: c.x, y: c.y + r }, "center")
  }
  const uniq = (vals: number[]): number[] => [...new Set(vals.map((v) => Math.round(v * 1e4) / 1e4))].sort((a, c) => a - c)
  const chain = (vals: number[], from: number): number[] => uniq([from, ...vals])
  const xs = chain(anchors.map((q) => q.x), b.minX), ys = chain(anchors.map((q) => q.y), b.minY)
  const small = (v: number[]): boolean => v.length <= 7
  if (anchors.length > 0 && !small(xs)) warnings.push(`View '${p.name}': ${xs.length} distinct hole columns, the chain is not drawn`)
  let topLevel = 1, leftLevel = 1
  if (anchors.length > 0 && small(xs) && xs.length > 1) {
    for (let i = 0; i + 1 < xs.length; i++) {
      const v = xs[i + 1]! - xs[i]!
      if (v < 0.05) continue
      hdim(cv, place(p, { x: xs[i]!, y: 0 }).x, place(p, { x: xs[i + 1]!, y: 0 }).x, hi.y + level(topLevel), hi.y, fmt(v))
      report.push({ view: p.name, kind: "linear", text: fmt(v), value: v })
    }
    topLevel++
  }
  if (anchors.length > 0 && small(ys) && ys.length > 1) {
    for (let i = 0; i + 1 < ys.length; i++) {
      const v = ys[i + 1]! - ys[i]!
      if (v < 0.05) continue
      vdim(cv, place(p, { x: 0, y: ys[i]! }).y, place(p, { x: 0, y: ys[i + 1]! }).y, lo.x - level(leftLevel), lo.x, fmt(v))
      report.push({ view: p.name, kind: "linear", text: fmt(v), value: v })
    }
    leftLevel++
  }
  // Overall sizes.
  const w = b.maxX - b.minX, h = b.maxY - b.minY
  hdim(cv, lo.x, hi.x, hi.y + level(topLevel), hi.y, fmt(w))
  report.push({ view: p.name, kind: "linear", text: fmt(w), value: w })
  vdim(cv, lo.y, hi.y, lo.x - level(leftLevel), lo.x, fmt(h))
  report.push({ view: p.name, kind: "linear", text: fmt(h), value: h })

  // Callouts to the right of the view, one per hole group, at the height of the hole they point to.
  let used = hi.y
  groups.forEach((g) => {
    const first = place(p, p.view.toView(g.positions[0]!))
    const r = (g.kind === "simple" ? g.diameter : Math.max(g.diameter, g.headDiameter ?? g.diameter)) / 2 * scale
    const anchor = { x: first.x + r * Math.SQRT1_2, y: first.y + r * Math.SQRT1_2 }
    const ty = Math.min(used - 3, anchor.y + 6)
    used = ty - g.lines.length * 4.6
    const tx = hi.x + 12
    cv.line("dim", anchor, { x: tx - 1, y: ty })
    cv.line("dim", { x: tx - 1, y: ty }, { x: tx + 1, y: ty })
    cv.arrow(anchor, { x: anchor.x - tx, y: anchor.y - ty })
    g.lines.forEach((line, i) => cv.text({ x: tx + 2, y: ty - 1.5 - i * 4.6 }, line, TEXT, {}))
    callouts.push(g.lines.join(" / "))
    report.push({ view: p.name, kind: "callout", text: g.lines.join(" / "), value: g.diameter })
  })
  // Corner radii: in the view that looks along Z.
  if (axis === "z") for (const rad of plan.radii) {
    const corner = place(p, { x: b.maxX - rad.radius * (1 - Math.SQRT1_2), y: b.minY + rad.radius * (1 - Math.SQRT1_2) })
    const text = { x: hi.x + 8, y: lo.y - 8 }
    cv.line("dim", corner, text)
    cv.arrow(corner, { x: corner.x - text.x, y: corner.y - text.y })
    cv.text({ x: text.x + 1, y: text.y - 1.5 }, rad.text, TEXT, {})
    report.push({ view: p.name, kind: "radius", text: rad.text, value: rad.radius })
  }
  if (axis === "z") for (const c of plan.circles) drawCircleDimensions(cv, p, c, place(p, p.view.toView(c.centre)), scale, report)
}

const drawCircleDimensions = (cv: Canvas, p: Placed, c: CircleNote, ctr: Vec2, scale: number, report: DimensionReport[], arcRadius?: number): void => {
  const r = c.diameter / 2 * scale
  cv.circle("centre", ctr, r, "center")
  const leaderEnd = { x: ctr.x - r * Math.SQRT1_2, y: ctr.y - r * Math.SQRT1_2 }
  const outer = arcRadius ?? r + 4
  const tx = { x: ctr.x - outer - 3, y: ctr.y - outer - 3 }
  cv.line("dim", leaderEnd, tx)
  cv.arrow(leaderEnd, { x: leaderEnd.x - tx.x, y: leaderEnd.y - tx.y })
  cv.text({ x: tx.x - 1, y: tx.y - 4 }, `Ø${fmt(c.diameter)}`, TEXT, { align: "right" })
  report.push({ view: p.name, kind: "diameter", text: `Ø${fmt(c.diameter)}`, value: c.diameter })
  const a0 = 0, a1 = c.angle * Math.PI / 180
  cv.arc("dim", ctr, outer, a0, a1)
  for (const a of [a0, a1]) cv.line("dim", { x: ctr.x + r * Math.cos(a), y: ctr.y + r * Math.sin(a) }, { x: ctr.x + (outer + 1) * Math.cos(a), y: ctr.y + (outer + 1) * Math.sin(a) })
  const mid = a1 / 2
  cv.text({ x: ctr.x + (outer + 4) * Math.cos(mid), y: ctr.y + (outer + 4) * Math.sin(mid) }, `${fmt(c.angle)}°`, TEXT, { align: "left" })
  report.push({ view: p.name, kind: "angular", text: `${fmt(c.angle)}°`, value: c.angle })
}

const drawFlatness = (cv: Canvas, p: Placed, value: number, report: DimensionReport[]): void => {
  const hi = place(p, { x: p.view.bounds.maxX, y: p.view.bounds.maxY })
  const x = hi.x + 4, y = hi.y + MARGIN - 8
  cv.rect("dim", x, y, x + 22, y + 6, 0.25)
  cv.line("dim", { x: x + 7, y }, { x: x + 7, y: y + 6 })
  cv.poly("dim", [{ x: x + 1.5, y: y + 1.5 }, { x: x + 5, y: y + 1.5 }, { x: x + 5.5, y: y + 4.5 }, { x: x + 2, y: y + 4.5 }], true)
  cv.text({ x: x + 14.5, y: y + 3 }, fmt2(value), TEXT, { align: "center", baseline: "middle" })
  report.push({ view: p.name, kind: "linear", text: `flatness ${fmt2(value)}`, value })
}
const fmt2 = (v: number): string => (v < 0.1 ? v.toFixed(2) : v.toFixed(1))

const drawCuttingPlane = (cv: Canvas, p: Placed, s: NonNullable<SheetOptions["section"]>, plan: DimensionPlan): void => {
  const letter = s.letter ?? "B"
  const world = (t: number): V3 => (s.axis === "x" ? { x: s.at, y: t, z: 0 } : s.axis === "y" ? { x: t, y: s.at, z: 0 } : { x: t, y: 0, z: s.at })
  const lo = s.axis === "x" ? plan.bounds.min.y : plan.bounds.min.x, hi = s.axis === "x" ? plan.bounds.max.y : plan.bounds.max.x
  const a = place(p, p.view.toView(world(lo))), b = place(p, p.view.toView(world(hi)))
  // The line sticks out of the view by 6 mm each side; the arrows point to the side the viewer stands on.
  const d = { x: b.x - a.x, y: b.y - a.y }, l = Math.hypot(d.x, d.y)
  if (l < 1e-9) return
  const u = { x: d.x / l, y: d.y / l }
  const a2 = { x: a.x - u.x * 6, y: a.y - u.y * 6 }, b2 = { x: b.x + u.x * 6, y: b.y + u.y * 6 }
  cv.line("section", a2, b2, "phantom", 0.35)
  const toward = (() => { const f = viewFrame("top"); void f; const v = p.view.frame; const from = s.from ?? "+"; const dirWorld: V3 = s.axis === "x" ? { x: from === "+" ? 1 : -1, y: 0, z: 0 } : s.axis === "y" ? { x: 0, y: from === "+" ? 1 : -1, z: 0 } : { x: 0, y: 0, z: from === "+" ? 1 : -1 }; return { x: dirWorld.x * v.right.x + dirWorld.y * v.right.y + dirWorld.z * v.right.z, y: dirWorld.x * v.up.x + dirWorld.y * v.up.y + dirWorld.z * v.up.z } })()
  for (const end of [a2, b2]) {
    const tip = { x: end.x + toward.x * 7, y: end.y + toward.y * 7 }
    cv.line("section", end, tip, "continuous", 0.5)
    cv.arrow(tip, toward, 3)
    cv.text({ x: tip.x + toward.x * 3 - 1.4, y: tip.y + toward.y * 3 - 1.8 }, letter, 4, { track: false })
  }
}

/** Validate direct callers as well as the host; non-finite dimensions cannot enter layout or SVG. */
export const validateSheetOptions = (o: SheetOptions): void => {
  const positive = (n: number | undefined, name: string): void => {
    if (n !== undefined && (!Number.isFinite(n) || n <= 0)) throw new RangeError(`${name} must be positive and finite`)
  }
  if (o.size !== undefined && !Object.hasOwn(SIZES, o.size)) throw new RangeError("Unsupported sheet size")
  if (o.projection !== undefined && o.projection !== "first" && o.projection !== "third") throw new RangeError("Unsupported projection")
  if (o.views !== undefined && (o.views.length === 0 || o.views.some((v) => !["front", "top", "right"].includes(v)) || new Set(o.views).size !== o.views.length)) throw new RangeError("Choose unique principal views")
  positive(o.scale, "Scale")
  positive(o.flatness?.value, "Flatness")
  if (o.section !== undefined && (!Number.isFinite(o.section.at) || !["x", "y", "z"].includes(o.section.axis))) throw new RangeError("Invalid section plane")
  if (o.detail !== undefined) {
    positive(o.detail.radius, "Detail radius")
    positive(o.detail.factor, "Detail factor")
    if (!Object.values(o.detail.centre).every(Number.isFinite)) throw new RangeError("Invalid detail centre")
    if (!(o.views ?? ["front", "top", "right"]).includes(o.detail.view ?? "top")) throw new RangeError("The detail parent must be a principal view on the sheet")
  }
}
