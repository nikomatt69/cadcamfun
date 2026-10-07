/**
 * The motion a verification replays: G-code text or a Toolpath IR program, reduced to straight and
 * circular segments with the source line, then sampled along the path.
 */
import { arcSweepBetween, expandMoves, moveTarget, type Program } from "../ir.ts"
import { interpretGcode, type P3 } from "../testing/gcode-interpreter.ts"

export interface PathSegment {
  readonly rapid: boolean
  readonly from: P3
  readonly to: P3
  /** Present for arcs. */
  readonly center?: { readonly x: number; readonly y: number }
  readonly clockwise?: boolean
  /** G-code line (1-based) or move index (0-based) in the program. */
  readonly line: number
}

export interface ReplayedPath {
  readonly segments: ReadonlyArray<PathSegment>
  readonly warnings: ReadonlyArray<string>
}

export const pathFromGcode = (gcode: string, start?: P3): ReplayedPath => {
  const result = interpretGcode(gcode, start !== undefined ? { start } : {})
  const segments: PathSegment[] = []
  for (const s of result.segments) {
    if (s.kind === "dwell") continue
    segments.push(s.kind === "arc"
      ? { rapid: false, from: s.from, to: s.to, center: s.center, clockwise: s.clockwise, line: s.line }
      : { rapid: s.kind === "rapid", from: s.from, to: s.to, line: s.line })
  }
  return { segments, warnings: result.errors }
}

export const pathFromProgram = (program: Program, start?: P3): ReplayedPath => {
  const segments: PathSegment[] = []
  const warnings: string[] = []
  let at: P3 | undefined = start
  for (const toolpath of program.toolpaths) {
    at ??= (() => {
      for (const move of toolpath.moves) {
        const target = moveTarget(move)
        if (target !== undefined) return { ...target }
      }
      return { x: 0, y: 0, z: 0 }
    })()
    let index = 0
    for (const move of expandMoves(toolpath.moves, at)) {
      const to = moveTarget(move)
      if (to === undefined || move._tag === "Dwell" || move._tag === "Comment" || move._tag === "Cycle") {
        index++
        continue
      }
      if (move._tag === "Arc") {
        segments.push({ rapid: false, from: at, to: move.to, center: move.center, clockwise: move.clockwise, line: index })
      } else {
        segments.push({ rapid: move._tag === "Rapid", from: at, to: move.to, line: index })
      }
      at = { ...move.to }
      index++
    }
  }
  return { segments, warnings }
}

const xyLength = (s: PathSegment): number => {
  if (s.center === undefined) return Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y)
  const r = Math.hypot(s.from.x - s.center.x, s.from.y - s.center.y)
  const rEnd = Math.hypot(s.to.x - s.center.x, s.to.y - s.center.y)
  return ((r + rEnd) / 2) * arcSweepBetween(s.from, s.to, s.center, s.clockwise === true)
}

/**
 * Number of samples `forEachSample` produces for a segment at `step` mm (at least 1): one per `step`
 * of horizontal travel and one per `4 * step` of vertical travel, so steep ramps and plunges are not
 * stepped over.
 */
export const sampleCount = (segment: PathSegment, step: number): number =>
  Math.max(1, Math.ceil(xyLength(segment) / step), Math.ceil(Math.abs(segment.to.z - segment.from.z) / (4 * step)))

/**
 * Calls `visit` at `sampleCount` points along the segment, the last one being its end. Straight
 * segments interpolate linearly, arcs follow the circle (radius and Z interpolate linearly, so a
 * helix and an arc with a small endpoint mismatch both come out right).
 */
export const forEachSample = (
  segment: PathSegment,
  step: number,
  visit: (x: number, y: number, z: number) => void
): void => {
  const n = sampleCount(segment, step)
  const { from, to, center } = segment
  if (center === undefined) {
    for (let k = 1; k <= n; k++) {
      const t = k / n
      visit(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t)
    }
    return
  }
  const r0 = Math.hypot(from.x - center.x, from.y - center.y)
  const r1 = Math.hypot(to.x - center.x, to.y - center.y)
  const a0 = Math.atan2(from.y - center.y, from.x - center.x)
  const sweep = arcSweepBetween(from, to, center, segment.clockwise === true)
  const dir = segment.clockwise === true ? -1 : 1
  for (let k = 1; k <= n; k++) {
    const t = k / n
    const a = a0 + dir * sweep * t
    const r = r0 + (r1 - r0) * t
    visit(center.x + r * Math.cos(a), center.y + r * Math.sin(a), from.z + (to.z - from.z) * t)
  }
}
