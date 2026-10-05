/**
 * Planar toolpath curves made of straight lines and circular arcs. Operations
 * build `Path`s (offset contours, circles, lead-ins) and turn them into IR moves
 * at the right Z; keeping a path separate from Z is what lets ramps, helical
 * descents and tabs be applied uniformly to lines and arcs.
 */
import { arcSegmentCount } from "../cad/arc-math.ts"
import { distance, type Vec2 } from "../cad/vec.ts"
import { arcSweepBetween } from "./ir.ts"

export type Seg =
  | { readonly kind: "Line"; readonly to: Vec2 }
  | { readonly kind: "Arc"; readonly to: Vec2; readonly center: Vec2; readonly clockwise: boolean }

export interface Path {
  readonly start: Vec2
  readonly segs: ReadonlyArray<Seg>
  /** When closed, the last segment ends at `start`. */
  readonly closed: boolean
}

/** XY length of a segment starting at `from`. */
export const segLength = (from: Vec2, seg: Seg): number =>
  seg.kind === "Line"
    ? distance(from, seg.to)
    : Math.hypot(from.x - seg.center.x, from.y - seg.center.y) *
      arcSweepBetween(from, seg.to, seg.center, seg.clockwise)

/** Start points of every segment (same length as `path.segs`). */
export const segStarts = (path: Path): Vec2[] => {
  const out: Vec2[] = []
  let at = path.start
  for (const seg of path.segs) {
    out.push(at)
    at = seg.to
  }
  return out
}

export const pathLength = (path: Path): number => {
  let at = path.start
  let total = 0
  for (const seg of path.segs) {
    total += segLength(at, seg)
    at = seg.to
  }
  return total
}

/** Straight-line path through `points`; a closed path gets an explicit closing segment. */
export const pathFromPoints = (points: ReadonlyArray<Vec2>, closed: boolean): Path => {
  const start = points[0]!
  const segs: Seg[] = []
  for (let i = 1; i < points.length; i++) segs.push({ kind: "Line", to: points[i]! })
  if (closed) segs.push({ kind: "Line", to: start })
  return { start, segs, closed }
}

/** Full circle starting at `start` angle `startAngle` and running in the given direction. */
export const circlePath = (center: Vec2, radius: number, clockwise: boolean, startAngle = 0): Path => {
  const start = { x: center.x + radius * Math.cos(startAngle), y: center.y + radius * Math.sin(startAngle) }
  return { start, segs: [{ kind: "Arc", to: start, center, clockwise }], closed: true }
}

/** Polyline vertices of a path (arcs sampled within `tolerance`), for analysis and tests. */
export const pathPolyline = (path: Path, tolerance = 0.01): Vec2[] => {
  const out: Vec2[] = [path.start]
  let at = path.start
  for (const seg of path.segs) {
    if (seg.kind === "Line") {
      out.push(seg.to)
    } else {
      const r = Math.hypot(at.x - seg.center.x, at.y - seg.center.y)
      const sweep = arcSweepBetween(at, seg.to, seg.center, seg.clockwise)
      const n = arcSegmentCount(r, sweep, tolerance, 2)
      const a0 = Math.atan2(at.y - seg.center.y, at.x - seg.center.x)
      const dir = seg.clockwise ? -1 : 1
      for (let i = 1; i < n; i++) {
        const a = a0 + (dir * sweep * i) / n
        out.push({ x: seg.center.x + r * Math.cos(a), y: seg.center.y + r * Math.sin(a) })
      }
      out.push(seg.to)
    }
    at = seg.to
  }
  return out
}

/** Reverses a path (arcs flip direction). A closed path keeps its start point. */
export const reversePath = (path: Path): Path => {
  const starts = segStarts(path)
  const segs: Seg[] = []
  for (let i = path.segs.length - 1; i >= 0; i--) {
    const seg = path.segs[i]!
    const from = starts[i]!
    segs.push(
      seg.kind === "Line"
        ? { kind: "Line", to: from }
        : { kind: "Arc", to: from, center: seg.center, clockwise: !seg.clockwise }
    )
  }
  const lastTo = path.segs[path.segs.length - 1]?.to ?? path.start
  return { start: lastTo, segs, closed: path.closed }
}

/** Point at XY length `s` along a segment that starts at `from`. */
export const pointOnSeg = (from: Vec2, seg: Seg, s: number): Vec2 => {
  const len = segLength(from, seg)
  const t = len === 0 ? 0 : Math.min(1, Math.max(0, s / len))
  if (seg.kind === "Line") return { x: from.x + (seg.to.x - from.x) * t, y: from.y + (seg.to.y - from.y) * t }
  const r = Math.hypot(from.x - seg.center.x, from.y - seg.center.y)
  const sweep = arcSweepBetween(from, seg.to, seg.center, seg.clockwise)
  const a0 = Math.atan2(from.y - seg.center.y, from.x - seg.center.x)
  const a = a0 + (seg.clockwise ? -1 : 1) * sweep * t
  return { x: seg.center.x + r * Math.cos(a), y: seg.center.y + r * Math.sin(a) }
}

/** Sub-segment of `seg` from XY length `s0` to `s1`, returned as a segment starting at `pointOnSeg(from, seg, s0)`. */
export const sliceSeg = (from: Vec2, seg: Seg, s0: number, s1: number): Seg => {
  const end = pointOnSeg(from, seg, s1)
  return seg.kind === "Line" ? { kind: "Line", to: end } : { kind: "Arc", to: end, center: seg.center, clockwise: seg.clockwise }
}

/** Unit tangent of a path at its start. */
export const startTangent = (path: Path): Vec2 => {
  const seg = path.segs[0]
  if (seg === undefined) return { x: 1, y: 0 }
  if (seg.kind === "Line") {
    const d = distance(path.start, seg.to)
    return d === 0 ? { x: 1, y: 0 } : { x: (seg.to.x - path.start.x) / d, y: (seg.to.y - path.start.y) / d }
  }
  const rx = path.start.x - seg.center.x
  const ry = path.start.y - seg.center.y
  const r = Math.hypot(rx, ry)
  // Counter-clockwise tangent is the radius rotated +90 degrees.
  const tx = -ry / r
  const ty = rx / r
  return seg.clockwise ? { x: -tx, y: -ty } : { x: tx, y: ty }
}

/** Unit tangent of a path at its end (direction of travel when arriving). */
export const endTangent = (path: Path): Vec2 => {
  const starts = segStarts(path)
  const seg = path.segs[path.segs.length - 1]
  if (seg === undefined) return { x: 1, y: 0 }
  const from = starts[starts.length - 1]!
  if (seg.kind === "Line") {
    const d = distance(from, seg.to)
    return d === 0 ? { x: 1, y: 0 } : { x: (seg.to.x - from.x) / d, y: (seg.to.y - from.y) / d }
  }
  const rx = seg.to.x - seg.center.x
  const ry = seg.to.y - seg.center.y
  const r = Math.hypot(rx, ry)
  const tx = -ry / r
  const ty = rx / r
  return seg.clockwise ? { x: -tx, y: -ty } : { x: tx, y: ty }
}

/**
 * Rotates a closed path so that it starts `s` mm into segment `segIndex`; that
 * segment is split. Used to start loops mid-segment instead of at a corner.
 */
export const rotateClosedPath = (path: Path, segIndex: number, s: number): Path => {
  if (!path.closed) return path
  const n = path.segs.length
  const from = segStarts(path)[segIndex]!
  const seg = path.segs[segIndex]!
  const len = segLength(from, seg)
  const atStart = s <= 1e-9
  const atEnd = s >= len - 1e-9
  const cut = atStart ? from : atEnd ? seg.to : pointOnSeg(from, seg, s)
  const segs: Seg[] = []
  // The tail of the split segment keeps the original `to` (and centre).
  if (!atEnd) segs.push(seg)
  for (let i = 1; i < n; i++) segs.push(path.segs[(segIndex + i) % n]!)
  if (atEnd) segs.push(seg)
  else if (!atStart) segs.push(sliceSeg(from, seg, 0, s))
  return { start: cut, segs, closed: true }
}

/** Index and in-segment offset of the midpoint of the longest segment. */
export const longestSegmentMidpoint = (path: Path): { readonly index: number; readonly s: number } => {
  const starts = segStarts(path)
  let best = 0
  let bestLen = -1
  path.segs.forEach((seg, i) => {
    const len = segLength(starts[i]!, seg)
    if (len > bestLen) {
      bestLen = len
      best = i
    }
  })
  return { index: best, s: bestLen / 2 }
}
