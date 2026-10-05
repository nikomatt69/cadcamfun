/**
 * Arc fitting (spec 04-core-cam.md §5, legacy bugs 1 and 2).
 *
 *  1. The centre of an arc is the **circumcentre** of three points on it, never
 *     the midpoint of the chord (`circumcentre`).
 *  2. "Three points are not collinear" proves nothing — any three points lie on
 *     *some* circle. `fitArcs` only replaces a run of points by an arc when the
 *     whole run stays within `tolerance` of one circle **and** every chord stays
 *     within `tolerance` of the arc (so a polygon corner is never rounded), and
 *     callers only invoke it when the source geometry was circular or arc fitting
 *     was explicitly requested.
 */
import { cross2, distance, sub, type Vec2 } from "../cad/vec.ts"
import type { Seg } from "./path.ts"

const COLLINEAR_EPS = 1e-12

/**
 * Circumcentre of the circle through `a`, `b`, `c`, or `undefined` when the
 * points are (nearly) collinear and no circle of finite radius exists.
 */
export const circumcentre = (a: Vec2, b: Vec2, c: Vec2): Vec2 | undefined => {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  const scale = Math.max(1, Math.abs(a.x) + Math.abs(a.y) + Math.abs(b.x) + Math.abs(b.y) + Math.abs(c.x) + Math.abs(c.y))
  if (Math.abs(d) < COLLINEAR_EPS * scale * scale) return undefined
  const aSq = a.x * a.x + a.y * a.y
  const bSq = b.x * b.x + b.y * b.y
  const cSq = c.x * c.x + c.y * c.y
  return {
    x: (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) / d,
    y: (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) / d
  }
}

/** Largest `| |p - centre| - radius |` over `points`. */
export const radialResidual = (points: ReadonlyArray<Vec2>, center: Vec2, radius: number): number => {
  let worst = 0
  for (const p of points) {
    const residual = Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - radius)
    if (residual > worst) worst = residual
  }
  return worst
}

export interface ArcFitOptions {
  /** Maximum deviation (radial residual and chord sag), mm. */
  readonly tolerance: number
  /** Minimum points in an arc run. Default 3. */
  readonly minPoints?: number
}

export interface ArcFitResult {
  readonly segs: ReadonlyArray<Seg>
  /** Number of arcs produced; `0` means the polyline stayed straight. */
  readonly arcs: number
}

const chordSag = (chord: number, radius: number): number => {
  const half = chord / 2
  return half >= radius ? radius : radius - Math.sqrt(radius * radius - half * half)
}

/** Whether `points[i..j]` is a valid arc run; returns its circle when it is. */
const tryRun = (
  points: ReadonlyArray<Vec2>,
  i: number,
  j: number,
  tolerance: number
): { readonly center: Vec2; readonly clockwise: boolean } | undefined => {
  const mid = (i + j) >> 1
  const center = circumcentre(points[i]!, points[mid]!, points[j]!)
  if (center === undefined) return undefined
  const radius = distance(points[i]!, center)
  if (radius > 1e6) return undefined
  const run = points.slice(i, j + 1)
  if (radialResidual(run, center, radius) > tolerance) return undefined
  let sign = 0
  let sweep = 0
  for (let k = i; k < j; k++) {
    const chord = distance(points[k]!, points[k + 1]!)
    if (chord > 2 * radius * 0.999999) return undefined
    if (chordSag(chord, radius) > tolerance) return undefined
    sweep += 2 * Math.asin(Math.min(1, chord / (2 * radius)))
    if (k > i) {
      const turn = cross2(sub(points[k]!, points[k - 1]!), sub(points[k + 1]!, points[k]!))
      const s = Math.sign(turn)
      if (s === 0) return undefined
      if (sign !== 0 && s !== sign) return undefined
      sign = s
    }
  }
  if (sign === 0 || sweep > Math.PI * 2 - 0.05) return undefined
  return { center, clockwise: sign < 0 }
}

/**
 * Splits a polyline into line and arc segments. Greedy: from each point it
 * extends the longest valid arc run; anything else stays a straight segment.
 */
export const fitArcs = (points: ReadonlyArray<Vec2>, options: ArcFitOptions): ArcFitResult => {
  const minPoints = Math.max(3, Math.floor(options.minPoints ?? 3))
  const segs: Seg[] = []
  let arcs = 0
  let i = 0
  while (i < points.length - 1) {
    let bestEnd = -1
    let best: { readonly center: Vec2; readonly clockwise: boolean } | undefined
    for (let j = i + minPoints - 1; j < points.length; j++) {
      const run = tryRun(points, i, j, options.tolerance)
      if (run === undefined) {
        // Validity is close to monotone: once a run broke, longer ones rarely recover.
        if (best !== undefined || j > i + minPoints + 1) break
        continue
      }
      best = run
      bestEnd = j
    }
    if (best !== undefined && bestEnd >= i + minPoints - 1) {
      segs.push({ kind: "Arc", to: points[bestEnd]!, center: best.center, clockwise: best.clockwise })
      arcs += 1
      i = bestEnd
    } else {
      segs.push({ kind: "Line", to: points[i + 1]! })
      i += 1
    }
  }
  return { segs, arcs }
}
