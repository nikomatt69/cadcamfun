/**
 * The CAM program sheet: the program on screen drawn as an image.
 *
 * The CAM editor opens on the G-code, not on the 3D preview, so the assistant's visual tool has
 * nothing to look at while the user reads (or writes) the program. The sheet is what the CAM
 * offers instead: the toolpath the program cuts, the G-code that says it, the machine it is for
 * and the toolpaths it holds — the sheet a programmer would print.
 *
 * The layout is pure (it is the part worth testing); the drawing is a thin canvas pass over it.
 */
import { cam } from "@cadcamfun/core"
import { t } from "../../../i18n/index.ts"

/** A point of the toolpath, in the program's own millimetres. */
export interface ProgramSheetPoint {
  readonly x: number
  readonly y: number
}

/** A run of moves of one kind: a cut, or a rapid over the part. */
export interface ProgramSheetSegment {
  readonly rapid: boolean
  readonly points: ReadonlyArray<ProgramSheetPoint>
}

/** One toolpath, as the sheet draws it. */
export interface ProgramSheetPath {
  readonly name: string
  readonly toolId: string
  readonly segments: ReadonlyArray<ProgramSheetSegment>
}

/** What the sheet says about the program besides its text. */
export interface ProgramSheetSummary {
  /** The machine the program is for (`mill`, `lathe`, `3dprinter`). */
  readonly machine?: string
  /** The program's name, when it has one. */
  readonly name?: string
  /** The toolpaths the program contains. */
  readonly toolpaths?: ReadonlyArray<{ readonly id: string; readonly name: string; readonly toolId: string; readonly moves: number }>
  /** The program's total moves. */
  readonly moves?: number
  /** The program's estimated duration, in seconds. */
  readonly durationSeconds?: number
  /** The toolpaths as the sheet draws them. */
  readonly paths?: ReadonlyArray<ProgramSheetPath>
}

/** One line of the listing. */
export interface ProgramSheetLine {
  readonly number: number
  readonly text: string
}

/** The box the toolpath is drawn in, in sheet pixels. */
export interface ProgramSheetView {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
}

/** The sheet, before it is drawn. */
export interface ProgramSheetLayout {
  readonly width: number
  readonly height: number
  readonly title: string
  readonly header: ReadonlyArray<string>
  readonly lines: ReadonlyArray<ProgramSheetLine>
  /** How many lines the program has, drawn or not. */
  readonly totalLines: number
  /** How many lines the sheet leaves out. */
  readonly omitted: number
  readonly paths: ReadonlyArray<ProgramSheetPath>
  /** The box the toolpath is drawn in, when the program has one. */
  readonly view: ProgramSheetView | undefined
  readonly fontSize: number
  readonly lineHeight: number
}

/** The part of a 2D context the sheet draws with; a test can pass its own. */
export interface SheetContext {
  fillStyle: string
  strokeStyle: string
  font: string
  textAlign: string
  textBaseline: string
  lineWidth: number
  fillRect(x: number, y: number, width: number, height: number): void
  fillText(text: string, x: number, y: number): void
  measureText(text: string): { readonly width: number }
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  stroke(): void
  strokeRect?(x: number, y: number, width: number, height: number): void
}

/** The sheet's own size: the toolpath on the left, the listing on the right. */
export const SHEET_WIDTH = 1240
export const SHEET_FONT_SIZE = 15
export const SHEET_LINE_HEIGHT = 20
export const SHEET_HEADER_HEIGHT = 190
export const SHEET_MAX_LINES = 56
export const SHEET_PICTURE_WIDTH = 470
export const SHEET_PICTURE_HEIGHT = 470
/** The listing's own column; a program line longer than this is cut. */
export const SHEET_LISTING_X = 520
export const SHEET_MAX_LINE_CHARS = 70

/**
 * The toolpaths of a program as the sheet draws them: the cutting plane of the machine (XY for a
 * mill, the profile plane XZ for a lathe), rapids apart from cuts.
 */
export const programSheetPaths = (program: cam.Program, machine?: string): ReadonlyArray<ProgramSheetPath> => {
  const lathe = machine === "lathe"
  return program.toolpaths.map((toolpath) => {
    const segments: ProgramSheetSegment[] = []
    let points: ProgramSheetPoint[] = []
    let rapid = false
    let current: ProgramSheetPoint = { x: 0, y: 0 }
    const flush = (): void => {
      if (points.length > 1) segments.push({ rapid, points })
      points = []
    }
    /** A point twice in a row is the same point; the polyline says it once. */
    const push = (point: ProgramSheetPoint): void => {
      const last = points[points.length - 1]
      if (last !== undefined && last.x === point.x && last.y === point.y) return
      points.push(point)
    }
    for (const move of toolpath.moves) {
      // A canned cycle ends at the hole bottom, not at the retract plane the move target names.
      const target = move._tag === "Cycle" ? move.to : cam.moveTarget(move)
      if (target === undefined) continue
      const isRapid = move._tag === "Rapid"
      if (isRapid !== rapid) { flush(); rapid = isRapid }
      const next = lathe ? { x: target.x, y: target.z } : { x: target.x, y: target.y }
      push(current)
      push(next)
      current = next
    }
    flush()
    return { name: toolpath.name || toolpath.toolId, toolId: toolpath.toolId, segments }
  })
}

/** The sheet of a program: its header, its toolpath, its listing and what it leaves out. */
export const programSheetLayout = (gcode: string, summary: ProgramSheetSummary = {}): ProgramSheetLayout => {
  const all = gcode.replace(/\r\n/g, "\n").split("\n")
  while (all.length > 0 && all[all.length - 1]!.trim() === "") all.pop()
  const shown = all.slice(0, SHEET_MAX_LINES)
  const omitted = Math.max(0, all.length - shown.length)
  const toolpaths = summary.toolpaths ?? []
  const moves = summary.moves ?? toolpaths.reduce((sum, path) => sum + path.moves, 0)
  const paths = summary.paths ?? []
  const header = [
    t("cam.programSheet.machine", { name: summary.machine ?? t("cam.programSheet.unknown") }),
    t("cam.programSheet.program", { name: summary.name ?? t("cam.programSheet.unnamed") }),
    t("cam.programSheet.toolpaths", {
      list: `${toolpaths.length} ${toolpaths.length === 1 ? t("cam.programSheet.toolpath") : t("cam.programSheet.toolpathsWord")}${toolpaths.length > 0 ? ` (${toolpaths.map((path) => `${path.name || path.id} [${path.toolId}]`).join(", ")})` : ""}`
    }),
    t("cam.programSheet.moves", { count: moves, extra: summary.durationSeconds !== undefined ? t("cam.programSheet.estimated", { seconds: Math.round(summary.durationSeconds) }) : "" }),
    t("cam.programSheet.lines", { count: all.length, extra: omitted > 0 ? t("cam.programSheet.omitted", { count: omitted }) : "" })
  ]
  const pictureHeight = paths.length > 0 ? SHEET_PICTURE_HEIGHT : 0
  const listingHeight = Math.max(1, shown.length) * SHEET_LINE_HEIGHT
  return {
    width: SHEET_WIDTH,
    height: SHEET_HEADER_HEIGHT + Math.max(pictureHeight, listingHeight) + 28,
    title: t("cam.programSheet.title"),
    header,
    lines: shown.map((text, index) => ({ number: index + 1, text: text.length > SHEET_MAX_LINE_CHARS ? `${text.slice(0, SHEET_MAX_LINE_CHARS - 1)}…` : text })),
    totalLines: all.length,
    omitted,
    paths,
    view: paths.length > 0 ? viewOf(paths) : undefined,
    fontSize: SHEET_FONT_SIZE,
    lineHeight: SHEET_LINE_HEIGHT
  }
}

/** The toolpath's own box: the points' extent, in the picture's coordinates. */
const viewOf = (paths: ReadonlyArray<ProgramSheetPath>): ProgramSheetView => {
  let minX = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY
  for (const path of paths) {
    for (const segment of path.segments) {
      for (const point of segment.points) {
        minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x)
        minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y)
      }
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { x: 24, y: SHEET_HEADER_HEIGHT, width: SHEET_PICTURE_WIDTH, height: SHEET_PICTURE_HEIGHT, minX: 0, maxX: 0, minY: 0, maxY: 0 }
  }
  // A path that is a single point still deserves a box.
  if (maxX - minX < 1) { minX -= 0.5; maxX += 0.5 }
  if (maxY - minY < 1) { minY -= 0.5; maxY += 0.5 }
  return { x: 24, y: SHEET_HEADER_HEIGHT, width: SHEET_PICTURE_WIDTH, height: SHEET_PICTURE_HEIGHT, minX, maxX, minY, maxY }
}

/** Draws the sheet on a 2D context. */
export const drawProgramSheet = (layout: ProgramSheetLayout, ctx: SheetContext): void => {
  ctx.fillStyle = "#0f172a"
  ctx.fillRect(0, 0, layout.width, layout.height)
  ctx.fillStyle = "#e2e8f0"
  ctx.font = `bold ${layout.fontSize + 4}px ui-monospace, SFMono-Regular, Menlo, monospace`
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.fillText(layout.title, 24, 40)
  ctx.font = `${layout.fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
  layout.header.forEach((line, index) => {
    ctx.fillStyle = index === 0 ? "#7dd3fc" : "#94a3b8"
    ctx.fillText(line, 24, 70 + index * (layout.fontSize + 6))
  })
  ctx.fillStyle = "#334155"
  ctx.fillRect(24, SHEET_HEADER_HEIGHT - 16, layout.width - 48, 1)

  // The toolpath, in the machine's own cutting plane.
  const view = layout.view
  if (view !== undefined) {
    ctx.fillStyle = "#0b1220"
    ctx.fillRect(view.x, view.y, view.width, view.height)
    ctx.strokeStyle = "#1e293b"
    ctx.lineWidth = 1
    ctx.strokeRect?.(view.x, view.y, view.width, view.height)
    const spanX = view.maxX - view.minX
    const spanY = view.maxY - view.minY
    const innerWidth = view.width - 40
    const innerHeight = view.height - 40
    const scale = Math.min(innerWidth / spanX, innerHeight / spanY)
    const left = view.x + 20 + (innerWidth - spanX * scale) / 2
    const bottom = view.y + view.height - 20 - (innerHeight - spanY * scale) / 2
    const at = (point: ProgramSheetPoint): [number, number] => [
      left + (point.x - view.minX) * scale,
      bottom - (point.y - view.minY) * scale
    ]
    ctx.lineWidth = 1.5
    for (const path of layout.paths) {
      for (const segment of path.segments) {
        if (segment.points.length < 2) continue
        ctx.strokeStyle = segment.rapid ? "#475569" : "#38bdf8"
        ctx.beginPath()
        segment.points.forEach((point, index) => {
          const [x, y] = at(point)
          if (index === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        ctx.stroke()
      }
    }
    ctx.fillStyle = "#64748b"
    ctx.font = `${layout.fontSize - 3}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.fillText(`${view.minX.toFixed(1)} … ${view.maxX.toFixed(1)} mm`, view.x + 8, view.y + view.height - 10)
  }

  // The listing.
  const gutter = ctx.measureText("0000").width + 18
  layout.lines.forEach((line, index) => {
    const y = SHEET_HEADER_HEIGHT + index * layout.lineHeight + layout.fontSize
    ctx.font = `${layout.fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.fillStyle = "#475569"
    ctx.textAlign = "right"
    ctx.fillText(String(line.number), SHEET_LISTING_X + gutter - 12, y)
    ctx.textAlign = "left"
    ctx.fillStyle = line.text.trim() === "" ? "#64748b" : "#e2e8f0"
    ctx.fillText(line.text, SHEET_LISTING_X + gutter, y)
  })
  if (layout.lines.length === 0) {
    ctx.font = `${layout.fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.fillStyle = "#64748b"
    ctx.fillText("No program on screen.", SHEET_LISTING_X + gutter, SHEET_HEADER_HEIGHT + layout.fontSize)
  }
  ctx.textAlign = "left"
}

/** The sheet as a canvas, ready to be captured. */
export const renderProgramSheet = (gcode: string, summary: ProgramSheetSummary = {}): HTMLCanvasElement => {
  const layout = programSheetLayout(gcode, summary)
  const canvas = document.createElement("canvas")
  canvas.width = layout.width
  canvas.height = layout.height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("The program sheet could not create an image buffer.")
  drawProgramSheet(layout, ctx as unknown as SheetContext)
  return canvas
}
