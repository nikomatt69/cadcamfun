/**
 * Shared helpers of the legacy generator: Z levels, origin offsets, tool offsets and the small
 * G-code snippets every geometry strategy repeats.
 */
import type { CadElement, GeometryInput, ToolpathSettings } from "./schema.ts"

export interface GenerateOptions {
  /** Injected into the header (`; Date: …`); omitted by default so output is deterministic. */
  readonly stamp?: string
}

export interface Point2 { x: number; y: number }
export type Pt = readonly [number, number]

export const f3 = (n: number): string => n.toFixed(3)

// -- generation budget --------------------------------------------------------------------------

/** Z levels one operation may have: a depth over a stepdown beyond this is a typo in a unit, not a tool path. */
export const MAX_LEVELS = 200_000
/** Moves one generator run may write, about 100 MB of text: past it a controller cannot load the program and the run cannot hold it. */
export const MAX_MOVES = 2_000_000

/** A request whose program would be larger than the generator can write: it names the quantity that is too large. */
export class GenerationBudgetError extends RangeError {
  override readonly name = "GenerationBudgetError"
}

let spent = 0

/** Starts the move budget of one generator run (the generator is synchronous: one run at a time). */
export const resetBudget = (): void => { spent = 0 }

/** Counts `moves` against the run's budget; throws `GenerationBudgetError` past `MAX_MOVES`. `what` names the quantity. */
export const spend = (moves: number, what: string): void => {
  spent += moves
  if (!(spent <= MAX_MOVES)) {
    throw new GenerationBudgetError(`${what} would take the program past ${MAX_MOVES.toLocaleString("en-US")} moves${Number.isFinite(spent) ? ` (${Math.round(spent).toLocaleString("en-US")} so far)` : ""}: raise the stepdown or the stepover, shorten the depth, or split the job`)
  }
}

/** Number of passes of `depth` in steps of `step`, refused when it passes `MAX_LEVELS`. */
export const passCount = (depth: number, step: number, what = "The depth at this stepdown"): number => {
  if (!Number.isFinite(depth) || !Number.isFinite(step) || depth <= 0 || step <= 0) return 0
  const count = Math.ceil(depth / step - 1e-9)
  if (count > MAX_LEVELS) throw new GenerationBudgetError(`${what} needs ${count.toLocaleString("en-US")} passes (the most is ${MAX_LEVELS.toLocaleString("en-US")}): raise the stepdown or shorten the depth`)
  spend(count, what)
  return count
}

/** Cut levels, negative, from `-stepdown` down to exactly `-depth`. */
export const cutLevels = (depth: number, stepdown: number): number[] => {
  const count = passCount(depth, stepdown)
  const levels: number[] = []
  for (let i = 1; i <= count; i++) levels.push(-Math.min(depth, i * stepdown))
  return levels
}

// -- origin ------------------------------------------------------------------------------------

export const applyOriginOffset = (
  settings: ToolpathSettings,
  geometry: GeometryInput,
  x: number,
  y: number,
  z = 0
): { x: number; y: number; z: number } => {
  const { geometryType, stock } = geometry
  const selectedElement = geometry.selectedElements[0]
  switch (settings.originType) {
    case "workpiece-center":
      return { x, y, z }
    case "workpiece-corner":
    case "workpiece-corner2": {
      if (geometryType === "rectangle") return { x: x + geometry.rectangleWidth / 2, y: y + geometry.rectangleHeight / 2, z }
      if (geometryType === "circle") return { x: x + geometry.circleRadius, y: y + geometry.circleRadius, z }
      if (geometryType === "polygon") return { x: x + geometry.polygonRadius, y: y + geometry.polygonRadius, z }
      if (geometryType === "selected" && selectedElement) {
        if (selectedElement.type === "rectangle") return { x: x + selectedElement.width / 2, y: y + selectedElement.height / 2, z }
        if (selectedElement.type === "circle") return { x: x + selectedElement.radius, y: y + selectedElement.radius, z }
      }
      return { x, y, z }
    }
    case "machine-zero":
      return { x: x + (stock?.width || 0), y: y + (stock?.height || 0), z: z + (stock?.depth || 0) }
    case "custom":
      return { x: x + settings.originX, y: y + settings.originY, z: z + settings.originZ }
    default:
      return { x, y, z }
  }
}

// -- shared geometry helpers ---------------------------------------------------------------------

/** Signed tool offset: positive grows the outline, negative shrinks it, `center` is zero. */
export const offsetDistance = (s: ToolpathSettings): number =>
  s.offset === "inside" ? -s.toolDiameter / 2 : s.offset === "outside" ? s.toolDiameter / 2 : 0

export const offsetRadius = (s: ToolpathSettings, radius: number): number => radius + offsetDistance(s)

export const circleWords = (s: ToolpathSettings): { code: "G2" | "G3"; label: string } =>
  s.direction === "climb"
    ? { code: "G3", label: "Counter-clockwise full circle" }
    : { code: "G2", label: "Clockwise full circle" }

/** Full circle starting at `(cx + r, cy)` (tool already there), centre at `I = -r`. */
export const fullCircleFrom = (s: ToolpathSettings, cx: number, cy: number, radius: number, label?: string): string => {
  const { code, label: text } = circleWords(s)
  return `${code} X${f3(cx + radius)} Y${f3(cy)} I${f3(-radius)} J0 F${s.feedrate} ; ${label ?? text}\n`
}

export const retractRapid = (zTop: number): string => `G0 Z${f3(zTop)} ; Retract\n`

/** Closed rectangle outline starting at `(x, y)`; reversed for conventional milling. */
export const rectangleCorners = (x: number, y: number, w: number, h: number, s: ToolpathSettings): Pt[] => {
  const corners: Pt[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]
  if (s.direction === "conventional") corners.reverse()
  return corners
}

export const cornerMoves = (corners: ReadonlyArray<Pt>, feedrate: number, label = "Corner"): string =>
  corners.map((c, i) => `G1 X${f3(c[0])} Y${f3(c[1])} F${feedrate} ; ${label} ${i + 1}\n`).join("")

export const pointMoves = (points: ReadonlyArray<Pt>, feedrate: number, label: string): string => {
  let out = ""
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!
    out += `G1 X${f3(p[0])} Y${f3(p[1])} F${feedrate} ; ${label} ${i}\n`
  }
  return out
}

export const ellipsePoints = (cx: number, cy: number, rx: number, ry: number, n: number, s: ToolpathSettings): Pt[] => {
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
  }
  if (s.direction === "conventional") pts.reverse()
  return pts
}

export const polygonPoints = (cx: number, cy: number, radius: number, sides: number, s: ToolpathSettings): Pt[] => {
  const pts: Pt[] = []
  for (let i = 0; i < sides; i++) {
    const a = i * ((2 * Math.PI) / sides)
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)])
  }
  pts.push(pts[0]!)
  if (s.direction === "conventional") pts.reverse()
  return pts
}


export const above = (x: number, y: number, z: number, label = "Move above start position"): string =>
  `G0 X${f3(x)} Y${f3(y)} Z${f3(z + 5)} ; ${label}\n`
export const plunge = (z: number, s: ToolpathSettings): string => `G1 Z${f3(z)} F${s.plungerate} ; Plunge to cutting depth\n`

/** Circle slice at a given height: used by sphere, cylinder, cone, hemisphere, extrude. */
export const circleSlice = (e: CadElement, s: ToolpathSettings, radius: number, z: number, move: string): string =>
  `${above(e.x + radius, e.y, z, move)}${plunge(z, s)}${fullCircleFrom(s, e.x, e.y, radius)}`
