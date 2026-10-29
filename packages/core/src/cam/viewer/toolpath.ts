/**
 * G-code -> toolpath points for the 3D visualizer (legacy `ToolpathVisualizer2.parseGCode` plus the fixed-cycle
 * expansion of `fixedCyclesParser`), and the timing helpers its playback bar uses.
 *
 * Differences from the legacy parser, all of them fixes:
 *  - commands are matched as words (`G02` is an arc, not a rapid; `G17`, `G12`, `G10` are not linear moves);
 *  - the custom shape codes `G13.1` / `G13.2` / `G13.3` are matched before `G13` (the legacy `includes("G13")`
 *    swallowed them, so they were never reached);
 *  - motion is modal (`X10 Y5` after `G1` is a move) and `G91` keeps the position of the previous block;
 *  - an arc with a negative `R` takes the major arc, and an arc without a centre is drawn as a line to its end;
 *  - fixed cycles are expanded in place (flagged `isFixedCycle`) instead of replacing the whole toolpath.
 */
import { hasG, lastOf, tokenize, valuesOf, type GBlock } from "./words.ts"
import { findToolChanges, type ToolChange } from "../testing/tool-words.ts"

export type ShapeType = "circle" | "sphere" | "cone" | "extrude"

export interface ToolpathPoint {
  x: number
  y: number
  z: number
  feedrate?: number
  type?: string
  isRapid?: boolean
  i?: number
  j?: number
  k?: number
  r?: number
  isArc?: boolean
  arcCenter?: { x: number; y: number; z?: number }
  arcRadius?: number
  isClockwise?: boolean
  isShape?: boolean
  shapeType?: ShapeType
  shapeParams?: Record<string, number>
  isFixedCycle?: boolean
  cycleType?: string
  cycleParams?: Record<string, number>
  /** 1-based source line the point came from (the editor highlights it while the tool plays). */
  line?: number
}

export type { ToolChange } from "../testing/tool-words.ts"


export interface ParsedToolpath {
  readonly points: ToolpathPoint[]
  readonly toolChanges: ReadonlyArray<ToolChange>
}

const CYCLE_CODES: Readonly<Record<number, string>> = {
  74: "left_tapping",
  81: "drilling",
  82: "drilling_dwell",
  83: "peck_drilling",
  84: "right_tapping",
  85: "boring",
  86: "boring_dwell",
  87: "back_boring",
  88: "custom",
  89: "boring_retract"
}

const cyclePoints = (type: string, x: number, y: number, z: number, r: number, f: number | undefined, p: number | undefined, q: number | undefined): ToolpathPoint[] => {
  const base = { isFixedCycle: true, cycleType: type }
  const rapid = (pz: number): ToolpathPoint => ({ x, y, z: pz, type: "rapid", isRapid: true, ...base })
  const feed = (pz: number): ToolpathPoint => ({ x, y, z: pz, type: "linear", ...(f !== undefined ? { feedrate: f } : {}), ...base })
  const dwell = (seconds: number): ToolpathPoint => ({ x, y, z, type: "dwell", cycleParams: { dwell: seconds }, ...base })
  switch (type) {
    case "drilling_dwell":
      return [rapid(r), feed(z), dwell(p ?? 0), rapid(r)]
    case "peck_drilling": {
      const step = q !== undefined && q > 0 ? q : 5
      const points: ToolpathPoint[] = [rapid(r)]
      let depth = r - step
      while (depth > z) {
        points.push(feed(depth), rapid(r), rapid(depth))
        depth -= step
      }
      points.push(feed(z), rapid(r))
      return points
    }
    case "right_tapping":
      return [rapid(r), feed(z), dwell(0.1), feed(r)]
    default:
      return [rapid(r), feed(z), rapid(r)]
  }
}

const fixedCycleOf = (code: number): string | undefined => CYCLE_CODES[code]

/** `arcResolution`: the longest chord, in mm, an arc or shape is split into. */
export const parseToolpath = (gcode: string, arcResolution = 10): ParsedToolpath => {
  const points: ToolpathPoint[] = []
  let x = 0
  let y = 0
  let z = 0
  let feed = 0
  let absolute = true
  let motion: number | undefined
  let cycle: { type: string; r: number; z: number; q?: number; p?: number } | undefined

  const lines = gcode.split("\n")
  lines.forEach((raw, index) => {
    const block: GBlock = tokenize(raw)
    if (block.words.length === 0) return
    const line = index + 1
    const at = points.length

    if (hasG(block, 90)) absolute = true
    if (hasG(block, 91)) absolute = false

    const f = lastOf(block, "F")
    if (f !== undefined) feed = f

    const gs = valuesOf(block, "G")
    const explicit = gs.find((g) => g === 0 || g === 1 || g === 2 || g === 3 || g === 12 || g === 13 || g === 13.1 || g === 13.2 || g === 13.3 || g in CYCLE_CODES)
    if (gs.includes(80)) cycle = undefined
    const hasCoordinate = block.words.some((word) => word.letter === "X" || word.letter === "Y" || word.letter === "Z")
    const modal = explicit === undefined && gs.length === 0 && hasCoordinate ? motion : undefined
    const code = explicit ?? modal
    if (code === undefined) return
    if (code === 0 || code === 1 || code === 2 || code === 3 || fixedCycleOf(code) !== undefined) motion = code
    // The 01 modal group: an explicit G0..G3 cancels the active canned cycle (a bare `X.. Y..` then moves).
    if (code === 0 || code === 1 || code === 2 || code === 3) cycle = undefined
    const xw = lastOf(block, "X")
    const yw = lastOf(block, "Y")
    const zw = lastOf(block, "Z")
    const nx = xw === undefined ? x : absolute ? xw : x + xw
    const ny = yw === undefined ? y : absolute ? yw : y + yw
    const nz = zw === undefined ? z : absolute ? zw : z + zw

    const cycleType = fixedCycleOf(code)
    if (cycleType !== undefined) {
      const r = lastOf(block, "R") ?? cycle?.r ?? z + 5
      const depth = zw ?? cycle?.z ?? 0
      const q = lastOf(block, "Q") ?? cycle?.q
      const p = lastOf(block, "P") ?? cycle?.p
      cycle = { type: cycleType, r, z: depth, ...(q !== undefined ? { q } : {}), ...(p !== undefined ? { p } : {}) }
      for (const point of cyclePoints(cycleType, nx, ny, depth, r, feed || undefined, p, q)) points.push({ ...point, cycleParams: { ...point.cycleParams, x: nx, y: ny, z: depth, r, ...(q !== undefined ? { q } : {}), ...(p !== undefined ? { p } : {}) } })
      x = nx
      y = ny
      z = r
    } else if (code === 0 || code === 1) {
      points.push({ x: nx, y: ny, z: nz, feedrate: feed, type: code === 0 ? "G0" : "G1", isRapid: code === 0 })
      x = nx
      y = ny
      z = nz
    } else if (code === 2 || code === 3) {
      const clockwise = code === 2
      const i = lastOf(block, "I")
      const j = lastOf(block, "J")
      const k = lastOf(block, "K")
      const rWord = lastOf(block, "R")
      let cx: number | undefined
      let cy: number | undefined
      let cz = z
      let radius = 0
      if (i !== undefined || j !== undefined || k !== undefined) {
        cx = x + (i ?? 0)
        cy = y + (j ?? 0)
        cz = z + (k ?? 0)
        radius = Math.hypot(i ?? 0, j ?? 0)
      } else if (rWord !== undefined) {
        radius = Math.abs(rWord)
        const dx = nx - x
        const dy = ny - y
        const dist = Math.hypot(dx, dy)
        if (dist > 0) {
          if (dist > 2 * radius) radius = dist / 2 + 0.001
          const h = Math.sqrt(Math.max(0, radius * radius - (dist * dist) / 4))
          const side = (clockwise ? -1 : 1) * (rWord < 0 ? -1 : 1)
          cx = x + dx / 2 - side * h * (dy / dist)
          cy = y + dy / 2 + side * h * (dx / dist)
        }
      }
      if (cx === undefined || cy === undefined || radius === 0) {
        points.push({ x: nx, y: ny, z: nz, feedrate: feed, type: code === 2 ? "G2" : "G3", isRapid: false })
      } else {
        points.push({
          x, y, z, feedrate: feed, type: clockwise ? "G2" : "G3", isArc: true,
          arcCenter: { x: cx, y: cy, z: cz }, arcRadius: radius, isClockwise: clockwise,
          ...(i !== undefined ? { i } : {}), ...(j !== undefined ? { j } : {}), ...(k !== undefined ? { k } : {}), ...(rWord !== undefined ? { r: rWord } : {})
        })
        const startAngle = Math.atan2(y - cy, x - cx)
        let endAngle = Math.atan2(ny - cy, nx - cx)
        if (Math.abs(startAngle - endAngle) < 0.01 && (i !== undefined || j !== undefined)) endAngle = startAngle + (clockwise ? -2 * Math.PI : 2 * Math.PI)
        else if (clockwise && endAngle > startAngle) endAngle -= 2 * Math.PI
        else if (!clockwise && startAngle > endAngle) endAngle += 2 * Math.PI
        const arcLength = radius * Math.abs(endAngle - startAngle)
        const segments = Math.max(4, Math.ceil(arcLength / arcResolution))
        for (let s = 1; s <= segments; s++) {
          const fraction = s / segments
          const angle = startAngle + (endAngle - startAngle) * fraction
          points.push({
            x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), z: z + (nz - z) * fraction,
            feedrate: feed, type: clockwise ? "G2" : "G3", isArc: true
          })
        }
      }
      x = nx
      y = ny
      z = nz
    } else if (code === 12 || code === 13) {
      const diameter = lastOf(block, "D")
      if (diameter !== undefined) {
        const clockwise = code === 12
        const radius = diameter / 2
        const passes = Math.max(1, Math.round(lastOf(block, "P") ?? 1))
        points.push({ x, y, z, feedrate: feed, type: clockwise ? "G12" : "G13", isShape: true, shapeType: "circle", shapeParams: { diameter, radius, passes } })
        const segments = Math.max(16, Math.ceil((2 * Math.PI * radius) / arcResolution))
        const step = (2 * Math.PI) / segments
        for (let pass = 0; pass < passes; pass++) {
          const passRadius = radius * (1 - pass / passes)
          for (let s = 0; s <= segments; s++) {
            const angle = clockwise ? -s * step : s * step
            points.push({ x: x + passRadius * Math.cos(angle), y: y + passRadius * Math.sin(angle), z, feedrate: feed, type: clockwise ? "G12" : "G13", isShape: true })
          }
        }
      }
    } else if (code === 13.1) {
      const diameter = lastOf(block, "D")
      if (diameter !== undefined) {
        const radius = diameter / 2
        const height = lastOf(block, "H") ?? radius
        points.push({ x, y, z, feedrate: feed, type: "G13.1", isShape: true, shapeType: "sphere", shapeParams: { diameter, radius, height } })
        const latitudes = Math.ceil(height / (arcResolution / 2))
        const longitudes = Math.max(16, Math.ceil((2 * Math.PI * radius) / arcResolution))
        for (let lat = 0; lat < latitudes; lat++) {
          const phi = (lat / latitudes) * Math.PI * 0.5
          const circleRadius = radius * Math.cos(phi)
          const level = z - radius + radius * Math.sin(phi)
          if (level < z - height) continue
          for (let lon = 0; lon <= longitudes; lon++) {
            const theta = (lon / longitudes) * 2 * Math.PI
            points.push({ x: x + circleRadius * Math.cos(theta), y: y + circleRadius * Math.sin(theta), z: level, feedrate: feed, type: "G13.1", isShape: true })
          }
        }
      }
    } else if (code === 13.2) {
      const baseDiameter = lastOf(block, "D")
      if (baseDiameter !== undefined) {
        const baseRadius = baseDiameter / 2
        const hWord = lastOf(block, "H")
        const aWord = lastOf(block, "A")
        const height = hWord ?? (aWord !== undefined ? baseRadius / Math.tan((aWord * Math.PI) / 180) : baseRadius)
        points.push({ x, y, z, feedrate: feed, type: "G13.2", isShape: true, shapeType: "cone", shapeParams: { baseDiameter, baseRadius, height } })
        const layers = Math.max(4, Math.ceil(height / (arcResolution / 2)))
        for (let layer = 0; layer <= layers; layer++) {
          const layerZ = z - layer * (height / layers)
          const layerRadius = baseRadius * (1 - layer / layers)
          const segments = Math.max(16, Math.ceil((2 * Math.PI * layerRadius) / arcResolution))
          for (let s = 0; s <= segments; s++) {
            const angle = (s / segments) * 2 * Math.PI
            points.push({ x: x + layerRadius * Math.cos(angle), y: y + layerRadius * Math.sin(angle), z: layerZ, feedrate: feed, type: "G13.2", isShape: true })
          }
        }
      }
    } else if (code === 13.3) {
      const width = lastOf(block, "W")
      const height = lastOf(block, "H")
      if (width !== undefined && height !== undefined && xw !== undefined && yw !== undefined) {
        const length = lastOf(block, "L") ?? Math.hypot(nx - x, ny - y)
        points.push({ x, y, z, feedrate: feed, type: "G13.3", isShape: true, shapeType: "extrude", shapeParams: { width, height, length } })
        const dx = nx - x
        const dy = ny - y
        const distance = Math.hypot(dx, dy)
        if (distance > 0) {
          const px = -dy / distance
          const py = dx / distance
          const corners = [
            { x: x + (px * width) / 2, y: y + (py * width) / 2, z },
            { x: x - (px * width) / 2, y: y - (py * width) / 2, z },
            { x: nx - (px * width) / 2, y: ny - (py * width) / 2, z: nz },
            { x: nx + (px * width) / 2, y: ny + (py * width) / 2, z: nz }
          ]
          for (const corner of [...corners, corners[0]!]) points.push({ ...corner, feedrate: feed, type: "G13.3", isShape: true })
        }
      }
      x = nx
      y = ny
      z = nz
    }

    for (let p = at; p < points.length; p++) points[p]!.line = line
  })

  return { points, toolChanges: findToolChanges(gcode) }
}

// ---------------------------------------------------------------------------------------------------------------
// Playback timing (legacy constants of ToolpathVisualizer2)

export const DEFAULT_CUTTING_FEEDRATE_MM_MIN = 500
export const RAPID_FEEDRATE_MM_MIN = 1000
export const MIN_SEGMENT_DURATION_MS = 10
export const SIMULATION_SPEED_MULTIPLIER = 0.1

const distanceBetween = (a: ToolpathPoint, b: ToolpathPoint): number => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)

/** Seconds a segment takes at its real feed (rapids at {@link RAPID_FEEDRATE_MM_MIN}). */
export const segmentDuration = (a: ToolpathPoint, b: ToolpathPoint): number => {
  const distance = distanceBetween(a, b)
  if (distance === 0) return 0
  const rapid = b.isRapid === true || b.type === "G0"
  const feed = rapid ? RAPID_FEEDRATE_MM_MIN : b.feedrate || a.feedrate || DEFAULT_CUTTING_FEEDRATE_MM_MIN
  return feed > 0 ? distance / (feed / 60) : 0.1
}

/** Milliseconds the animation spends on a segment at `playbackSpeed` (clamped to 300 ms..2 s, as the legacy). */
export const animationDurationMs = (a: ToolpathPoint, b: ToolpathPoint, playbackSpeed: number): number => {
  const distance = distanceBetween(a, b)
  let seconds = 0
  if (distance > 0) {
    const rapid = b.isRapid === true || b.type === "G0"
    const feed = rapid ? RAPID_FEEDRATE_MM_MIN : Math.min(RAPID_FEEDRATE_MM_MIN * 0.5, DEFAULT_CUTTING_FEEDRATE_MM_MIN)
    seconds = distance / (feed / 60)
  }
  let ms = (seconds * 1000) / (playbackSpeed * SIMULATION_SPEED_MULTIPLIER)
  ms = Math.max(ms, MIN_SEGMENT_DURATION_MS)
  ms = Math.max(ms, 300)
  return Math.min(ms, 2000)
}

export const formatClock = (seconds: number): string => {
  const total = Math.max(0, seconds)
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${Math.floor(total % 60).toString().padStart(2, "0")}`
}

export const totalCycleTime = (points: ReadonlyArray<ToolpathPoint>): string => {
  let seconds = 0
  for (let i = 0; i < points.length - 1; i++) seconds += segmentDuration(points[i]!, points[i + 1]!)
  return formatClock(seconds)
}

/** "Remaining" shown in the playback bar: the rest of the program at the slowed-down simulation speed. */
export const remainingTime = (points: ReadonlyArray<ToolpathPoint>, fromIndex: number): string => {
  if (points.length <= 1 || fromIndex >= points.length - 1) return "00:00"
  let seconds = 0
  for (let i = fromIndex; i < points.length - 1; i++) seconds += segmentDuration(points[i]!, points[i + 1]!)
  return formatClock(seconds / SIMULATION_SPEED_MULTIPLIER)
}

export interface ToolpathStatistics {
  readonly totalPoints: number
  readonly rapidMoves: number
  readonly cuttingMoves: number
  readonly totalEstimatedTime: string
}

export const toolpathStatistics = (points: ReadonlyArray<ToolpathPoint>): ToolpathStatistics => {
  let rapidMoves = 0
  let cuttingMoves = 0
  for (const point of points) {
    if (point.isRapid === true || point.type === "G0") rapidMoves++
    else if (point.type !== undefined) cuttingMoves++
  }
  return { totalPoints: points.length, rapidMoves, cuttingMoves, totalEstimatedTime: totalCycleTime(points) }
}

/** Height the tool is lifted above the programmed Z so the whole cutter stays visible (legacy `getToolHeightOffset`). */
export const toolHeightOffset = (tool: { readonly type?: string; readonly diameter?: number } | undefined): number => {
  if (tool === undefined) return 0
  const diameter = tool.diameter ?? 0
  switch (tool.type) {
    case "endmill": return diameter * 2 + 10
    case "ballendmill": return diameter * 1.5 + 8
    case "drill": return diameter + 5
    default: return 0
  }
}
