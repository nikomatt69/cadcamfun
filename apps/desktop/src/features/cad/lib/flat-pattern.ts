import { dimensionValue, flatPatternDrawing, type Developed, type Feature, type History, type LineEntity } from "@cadcamfun/core"
import { historyView } from "./history-view.ts"

/**
 * The flat pattern of a sheet-metal part as the canvas shows it: the unfolded blank (outline on layer CUT, one line across each bend on
 * layer BEND, the end notches of the bend reliefs) with its dimensions (developed length, width, every straight run and bend). The kernel
 * already develops each `sheet` feature of a replay (`RebuildResult.flatPatterns`) and writes it as a DXF drawing (`flatPatternDrawing`);
 * this module reads the same drawing, so what is shown is what a laser or a press brake receives. It follows the history: the view is
 * rebuilt from the replay of the history object, which is the one the solid is drawn from.
 */
export interface Seg { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }

/** A dimension line: measured between `from` and `to` (mm, the blank's own frame), drawn `offset` mm away on the `side`. */
export interface FlatDimension {
  readonly kind: "length" | "width" | "flat" | "bend"
  readonly from: { readonly x: number; readonly y: number }
  readonly to: { readonly x: number; readonly y: number }
  readonly side: "below" | "above" | "left"
  readonly text: string
}

export interface FlatPatternView {
  readonly featureId: string
  /** The strip's length before bending (the developed length), mm. */
  readonly length: number
  /** The flange width (the blank's other side), mm. */
  readonly width: number
  readonly bends: number
  readonly cut: ReadonlyArray<Seg>
  readonly bend: ReadonlyArray<Seg>
  readonly dimensions: ReadonlyArray<FlatDimension>
}

/** A number as a dimension reads: up to two decimals, no trailing zeros. */
export const formatMm = (value: number): string => String(Number(value.toFixed(2)))

const segmentOf = (entity: LineEntity): Seg => ({ x1: entity.start.x, y1: entity.start.y, x2: entity.end.x, y2: entity.end.y })

/** The view of one developed sheet. `width` is the flange width of the sheet feature. */
export const flatPatternView = (featureId: string, developed: Developed, width: number): FlatPatternView => {
  const drawing = flatPatternDrawing(developed, width, featureId)
  const lines = drawing.entities.filter((entity): entity is LineEntity => entity._tag === "Line")
  const dimensions: FlatDimension[] = [
    { kind: "length", from: { x: 0, y: 0 }, to: { x: developed.length, y: 0 }, side: "below", text: formatMm(developed.length) },
    { kind: "width", from: { x: 0, y: 0 }, to: { x: 0, y: width }, side: "left", text: formatMm(width) }
  ]
  for (const segment of developed.segments) {
    const run = segment.to - segment.from
    dimensions.push({
      kind: segment.kind, from: { x: segment.from, y: width }, to: { x: segment.to, y: width }, side: "above",
      text: segment.kind === "bend" ? `${formatMm(((segment.angle ?? 0) * 180) / Math.PI)}° · ${formatMm(run)}` : formatMm(run)
    })
  }
  return {
    featureId, length: developed.length, width, bends: developed.bends.length,
    cut: lines.filter((entity) => entity.layerId === "cut").map(segmentOf),
    bend: lines.filter((entity) => entity.layerId === "bend").map(segmentOf),
    dimensions
  }
}

/** Whether a feature is a sheet that takes part in the replay (a suppressed one develops nothing). */
const isLiveSheet = (feature: Feature): feature is Feature & { readonly type: "sheet" } => feature.type === "sheet" && feature.suppressed !== true

/** Cheap test, no replay: does the history hold a sheet feature that will be developed? (the toolbar button shows only then) */
export const hasSheetMetal = (history: unknown): boolean => {
  const features = (history as { features?: unknown } | null | undefined)?.features
  return Array.isArray(features) && features.some((feature) => (feature as Feature | null)?.type === "sheet" && (feature as Feature).suppressed !== true)
}

/**
 * The flat patterns of a history, one per developed sheet feature, from the (cached) replay. A sheet that failed to build has none;
 * one whose width does not resolve to a positive number is left out rather than drawn wrong.
 */
export const flatPatternViews = (history: History): ReadonlyArray<FlatPatternView> => {
  const result = historyView(history).result
  const views: FlatPatternView[] = []
  for (const feature of history.features) {
    if (!isLiveSheet(feature)) continue
    const developed = result.flatPatterns[feature.id]
    if (developed === undefined) continue
    let width = NaN
    try { width = dimensionValue(feature.width, result.parameters) } catch { /* unresolved: skipped below */ }
    if (!(width > 0) || !Number.isFinite(width) || !(developed.length > 0)) continue
    views.push(flatPatternView(feature.id, developed, width))
  }
  return views
}

/** The element whose flat pattern the overlay shows: the selected one when it holds a sheet, else the first parametric part that does. */
export const flatPatternSource = <T extends { readonly id: string; readonly type?: unknown; readonly history?: unknown }>(elements: ReadonlyArray<T>, selectedIds: ReadonlyArray<string>): T | undefined => {
  const holds = (element: T) => element.type === "parametric" && hasSheetMetal(element.history)
  for (const id of selectedIds) { const hit = elements.find((element) => element.id === id); if (hit !== undefined && holds(hit)) return hit }
  return elements.find(holds)
}

// --------------------------------------------------------------------------------------------------------- layout

export interface PlacedLine { readonly kind: "cut" | "bend" | "dimension" | "extension"; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
export interface PlacedText { readonly kind: FlatDimension["kind"]; readonly x: number; readonly y: number; readonly text: string; readonly anchor: "start" | "middle" | "end"; readonly rotate: boolean }
export interface FlatPatternLayout {
  readonly lines: ReadonlyArray<PlacedLine>
  readonly texts: ReadonlyArray<PlacedText>
  /** Pixels per millimetre. */
  readonly scale: number
}

/** A run narrower than this on screen gets no label (the label would overprint its neighbours). */
const MIN_LABEL_PIXELS = 34

/**
 * The view fitted into a `size` box (pixels, y down, margin `pad`): millimetres to pixels, y flipped, the dimension lines placed 14 px
 * outside the blank (length below, width on the left, runs and bends above) with extension lines to the part. Pure.
 */
export const layoutFlatPattern = (view: FlatPatternView, size: { readonly width: number; readonly height: number }, pad = 46): FlatPatternLayout => {
  const gap = 14
  const spanX = Math.max(view.length, 1e-6)
  const spanY = Math.max(view.width, 1e-6)
  const scale = Math.max(1e-6, Math.min((size.width - 2 * pad) / spanX, (size.height - 2 * pad) / spanY))
  // The blank is centred in the box.
  const left = (size.width - spanX * scale) / 2
  const top = (size.height - spanY * scale) / 2
  const X = (x: number) => left + x * scale
  const Y = (y: number) => top + (spanY - y) * scale
  const lines: PlacedLine[] = []
  const texts: PlacedText[] = []
  for (const s of view.cut) lines.push({ kind: "cut", x1: X(s.x1), y1: Y(s.y1), x2: X(s.x2), y2: Y(s.y2) })
  for (const s of view.bend) lines.push({ kind: "bend", x1: X(s.x1), y1: Y(s.y1), x2: X(s.x2), y2: Y(s.y2) })
  for (const d of view.dimensions) {
    const horizontal = d.side !== "left"
    const sign = d.side === "below" ? 1 : -1
    // `below` and `above` grow away from the blank; `left` is to the left of it.
    const a = { x: X(d.from.x), y: Y(d.from.y) }
    const b = { x: X(d.to.x), y: Y(d.to.y) }
    if (horizontal) {
      const y = a.y + sign * gap * (d.kind === "length" ? 2 : 1)
      const pixels = Math.abs(b.x - a.x)
      if (d.kind !== "length" && pixels < 1) continue
      lines.push({ kind: "dimension", x1: a.x, y1: y, x2: b.x, y2: y }, { kind: "extension", x1: a.x, y1: a.y, x2: a.x, y2: y }, { kind: "extension", x1: b.x, y1: b.y, x2: b.x, y2: y })
      if (d.kind === "length" || pixels >= MIN_LABEL_PIXELS) texts.push({ kind: d.kind, x: (a.x + b.x) / 2, y: y + sign * 3 + (sign > 0 ? 9 : 0), text: d.text, anchor: "middle", rotate: false })
    } else {
      const x = a.x - gap
      lines.push({ kind: "dimension", x1: x, y1: a.y, x2: x, y2: b.y }, { kind: "extension", x1: a.x, y1: a.y, x2: x, y2: a.y }, { kind: "extension", x1: b.x, y1: b.y, x2: x, y2: b.y })
      texts.push({ kind: d.kind, x: x - 4, y: (a.y + b.y) / 2, text: d.text, anchor: "middle", rotate: true })
    }
  }
  return { lines, texts, scale }
}
