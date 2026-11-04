/**
 * Tip-error gate of tool-centre-point output (spec 69 B6, EG-07): how far the tool tip the NC makes (the replay, carried back to machine
 * coordinates) strays from the tip the program planned.
 *
 *   planned   the machine-axis moves of the `Program` (what the toolpaths asked for)
 *   replayed  the interpreter's reading of the emitted NC after `carryTipControl` (what the control would do with the tip words)
 *
 * Every point the replay visits (the end of each piece, and the middle of a piece, where a chord strays most from the curve it follows)
 * is measured against the planned polyline; the figure is the largest distance. It contains the post's splitting of turning moves, the
 * rounding of the written angles acting on the lever from the pivot, and any error of the inverse kinematics the post applied. It is
 * a measurement of the emitted program, not a bound taken from the options: the caller compares it with a declared limit. Rapids are
 * left out (nothing is cut), except for a control that writes them as feed moves (`rapidsAsFeed`, Haas G234).
 *
 * The planned path is searched with a cursor (the replay follows the plan in order) and falls back to a full scan when the cursor loses
 * the path, so a lost cursor can only over-report, never hide an error.
 *
 * Pure: the same moves give the same figure.
 */
import type { Vec3 } from "../../cad/vec.ts"
import type { GSegment } from "../testing/gcode-interpreter.ts"
import type { PathSegment } from "../verify/path.ts"

export interface TipError {
  /** Largest distance of a replayed tip point from the planned path, mm. */
  readonly max: number
  /** Mean of the per-piece largest distances, mm. */
  readonly mean: number
  /** Points measured. */
  readonly samples: number
  /** NC line of the worst point. */
  readonly line?: number
  /** The worst point, machine coordinates. */
  readonly at?: Vec3
}

const distanceToSegment = (p: Vec3, a: Vec3, b: Vec3): number => {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z
  const len2 = abx * abx + aby * aby + abz * abz
  const u = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2)) : 0
  return Math.hypot(p.x - (a.x + abx * u), p.y - (a.y + aby * u), p.z - (a.z + abz * u))
}

/** Planned moves that stand on the path (a segment with no extent is a point and still counts for its end). */
const usable = (planned: ReadonlyArray<PathSegment>, rapids: boolean): ReadonlyArray<PathSegment> => planned.filter((s) => s.center === undefined && (rapids || !s.rapid))

/** The largest deviation of the replayed linear motions from the planned linear moves. Rapids, arcs and dwells are not measured: a rapid that turns the table follows the tip path under a tip-control word and the machine-axis line without it, and no material is cut on either. */
export const tipError = (planned: ReadonlyArray<PathSegment>, replayed: ReadonlyArray<GSegment>, options: { readonly rapidsAsFeed?: boolean } = {}): TipError => {
  const rapids = options.rapidsAsFeed === true
  const path = usable(planned, rapids)
  if (path.length === 0) return { max: 0, mean: 0, samples: 0 }
  let cursor = 0, max = 0, sum = 0, pieces = 0, samples = 0
  let line: number | undefined, at: Vec3 | undefined
  const nearest = (p: Vec3): number => {
    let best = Infinity, bestAt = cursor
    const lo = Math.max(0, cursor - 2), hi = Math.min(path.length - 1, cursor + 12)
    for (let i = lo; i <= hi; i++) {
      const d = distanceToSegment(p, path[i]!.from, path[i]!.to)
      if (d < best) { best = d; bestAt = i }
    }
    if (best > 1e-3) {
      for (let i = 0; i < path.length; i++) {
        const d = distanceToSegment(p, path[i]!.from, path[i]!.to)
        if (d < best) { best = d; bestAt = i }
      }
    }
    cursor = bestAt
    return best
  }
  for (const s of replayed) {
    if (s.kind === "dwell" || s.kind === "arc" || (s.kind === "rapid" && !rapids)) continue
    const mid = { x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2, z: (s.from.z + s.to.z) / 2 }
    let worst = 0
    for (const p of [s.to, mid]) {
      const d = nearest(p)
      samples++
      if (d > worst) worst = d
      if (d > max) { max = d; line = s.line; at = p }
    }
    sum += worst
    pieces++
  }
  return { max, mean: pieces === 0 ? 0 : sum / pieces, samples, ...(line !== undefined ? { line } : {}), ...(at !== undefined ? { at } : {}) }
}
