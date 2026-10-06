/**
 * Line-level G-code analysis for the editor (statistics, line highlight) and the 2D preview (path, bounds, fit).
 * Pure functions; the Solid components only draw what these return.
 */
import { hasG, tokenize, valuesOf, type GBlock } from "./words.ts"

export type LineKind = "rapid" | "linear" | "circular" | "machine" | "other"

/** Tailwind classes the editor highlights a played line with (legacy `parseCurrentLine`). */
export const LINE_HIGHLIGHT: Readonly<Record<Exclude<LineKind, "other">, string>> = {
  rapid: "bg-blue-100",
  linear: "bg-green-100",
  circular: "bg-purple-100",
  machine: "bg-yellow-100"
}

const motionOf = (block: GBlock): LineKind | undefined => {
  const gs = valuesOf(block, "G")
  for (let i = gs.length - 1; i >= 0; i--) {
    const g = gs[i]!
    if (g === 0) return "rapid"
    if (g === 1) return "linear"
    if (g === 2 || g === 3) return "circular"
  }
  return undefined
}

/** What a single block does. A block with a motion word is a move even if it also holds an `M` word. */
export const classifyLine = (line: string): LineKind => {
  const block = tokenize(line)
  const motion = motionOf(block)
  if (motion !== undefined) return motion
  return valuesOf(block, "M").length > 0 ? "machine" : "other"
}

export interface LineStats {
  readonly rapidMoves: number
  readonly linearMoves: number
  readonly circularMoves: number
  readonly machineFunctions: number
}

/** Counts per kind. A block counts once per kind it holds (`G1 X1 M8` is a linear move and a machine function). */
export const lineStats = (lines: ReadonlyArray<string>): LineStats => {
  let rapidMoves = 0
  let linearMoves = 0
  let circularMoves = 0
  let machineFunctions = 0
  for (const line of lines) {
    const block = tokenize(line)
    const motion = motionOf(block)
    if (motion === "rapid") rapidMoves++
    else if (motion === "linear") linearMoves++
    else if (motion === "circular") circularMoves++
    if (valuesOf(block, "M").length > 0) machineFunctions++
  }
  return { rapidMoves, linearMoves, circularMoves, machineFunctions }
}

/** Legacy `isFanucGCode`: a program marker, an `O` program number, `N` line numbers or `M30`. */
export const isFanucProgram = (lines: ReadonlyArray<string>): boolean =>
  lines.some((line) => line.includes("%") || line.includes("O") || /N\d+/.test(line) || line.includes("M30"))

/** The non-blank lines of a program, as the editor lists them. */
export const programLines = (gcode: string): string[] => gcode.split("\n").filter((line) => line.trim().length > 0)

export interface PathPoint {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Bounds {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly minZ: number
  readonly maxZ: number
}

export interface PreviewPath extends LineStats {
  readonly totalLines: number
  readonly points: ReadonlyArray<PathPoint>
  readonly boundaries: Bounds
}

const EMPTY_BOUNDS: Bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 }

/**
 * The path of the 2D preview: one point per motion block (arcs are drawn chord to chord), the bounds of those
 * points and the counts shown in the footer. Motion is modal, so `X10 Y5` after a `G1` is a move too.
 */
export const previewPath = (gcode: string): PreviewPath => {
  const lines = gcode.split("\n")
  const points: PathPoint[] = []
  let rapidMoves = 0
  let linearMoves = 0
  let circularMoves = 0
  let machineFunctions = 0
  let motion: LineKind | undefined
  let absolute = true
  let x = 0
  let y = 0
  let z = 0
  let bounds: Bounds | undefined

  for (const line of lines) {
    const block = tokenize(line)
    if (block.words.length === 0) continue
    if (hasG(block, 90)) absolute = true
    if (hasG(block, 91)) absolute = false
    if (valuesOf(block, "M").length > 0) machineFunctions++

    const explicit = motionOf(block)
    if (explicit !== undefined) motion = explicit
    const hasCoordinate = block.words.some((word) => word.letter === "X" || word.letter === "Y" || word.letter === "Z")
    if (motion === undefined || (explicit === undefined && !hasCoordinate)) continue
    if (explicit === undefined && valuesOf(block, "G").length > 0) continue

    for (const word of block.words) {
      if (word.letter === "X") x = absolute ? word.value : x + word.value
      else if (word.letter === "Y") y = absolute ? word.value : y + word.value
      else if (word.letter === "Z") z = absolute ? word.value : z + word.value
    }
    if (motion === "rapid") rapidMoves++
    else if (motion === "linear") linearMoves++
    else if (motion === "circular") circularMoves++

    bounds = bounds === undefined
      ? { minX: x, maxX: x, minY: y, maxY: y, minZ: z, maxZ: z }
      : {
          minX: Math.min(bounds.minX, x),
          maxX: Math.max(bounds.maxX, x),
          minY: Math.min(bounds.minY, y),
          maxY: Math.max(bounds.maxY, y),
          minZ: Math.min(bounds.minZ, z),
          maxZ: Math.max(bounds.maxZ, z)
        }
    points.push({ x, y, z })
  }

  return { totalLines: lines.length, rapidMoves, linearMoves, circularMoves, machineFunctions, points, boundaries: bounds ?? EMPTY_BOUNDS }
}

export interface ViewFit {
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
}

/**
 * Scale and offset that centre `bounds` in a `width` x `height` canvas with a 20 px margin (legacy `resetView`).
 * A path that is a single line (one axis has no extent) is fitted on the other axis instead of staying unscaled.
 */
export const fitView = (bounds: Bounds, width: number, height: number): ViewFit | undefined => {
  const rangeX = bounds.maxX - bounds.minX
  const rangeY = bounds.maxY - bounds.minY
  if (rangeX <= 0 && rangeY <= 0) return undefined
  const scaleX = rangeX > 0 ? (width - 40) / rangeX : Number.POSITIVE_INFINITY
  const scaleY = rangeY > 0 ? (height - 40) / rangeY : Number.POSITIVE_INFINITY
  const scale = Math.min(scaleX, scaleY)
  return {
    scale,
    offsetX: width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
    offsetY: height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale
  }
}
