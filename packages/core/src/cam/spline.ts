/**
 * Spline output (spec 69 G3): planar Bezier segments in the IR (`Spline` move), their flattening, and the fit of runs of short
 * line moves to them within a chordal tolerance.
 *
 * A `Spline` is a quadratic (one control point, `G5.1`) or cubic (two control points, `G5`, `G6.2` NURBS) Bezier in the XY plane from the
 * current position to `to`; Z is constant (a run whose Z changes is not fitted). A control that cannot take splines receives the
 * flattening within the post tolerance, so the same IR is posted everywhere.
 */
import type { Vec2, Vec3 } from "../cad/vec.ts"
import type { Move } from "./ir.ts"

export interface SplineGeometry {
  readonly to: Vec3
  /** One control point (quadratic) or two (cubic), absolute XY. */
  readonly controls: ReadonlyArray<Vec2>
}

/** Point of the Bezier from `from` at parameter `t` in [0, 1]; Z is linear in `t`. */
export const splinePoint = (from: Vec3, s: SplineGeometry, t: number): Vec3 => {
  const u = 1 - t
  const [c1, c2] = s.controls
  let x: number
  let y: number
  if (c2 === undefined) {
    x = u * u * from.x + 2 * u * t * c1!.x + t * t * s.to.x
    y = u * u * from.y + 2 * u * t * c1!.y + t * t * s.to.y
  } else {
    x = u * u * u * from.x + 3 * u * u * t * c1!.x + 3 * u * t * t * c2.x + t * t * t * s.to.x
    y = u * u * u * from.y + 3 * u * u * t * c1!.y + 3 * u * t * t * c2.y + t * t * t * s.to.y
  }
  return { x, y, z: from.z + (s.to.z - from.z) * t }
}

/** Number of line segments that keep the chord of a Bezier within `tolerance` of the curve (bound from the second differences). */
export const splineSegments = (from: Vec3, s: SplineGeometry, tolerance: number): number => {
  const [c1, c2] = s.controls
  const d2 = (a: Vec2, b: Vec2, c: Vec2): number => Math.hypot(a.x - 2 * b.x + c.x, a.y - 2 * b.y + c.y)
  const p0 = { x: from.x, y: from.y }
  const p3 = { x: s.to.x, y: s.to.y }
  // |B''| <= 2 max|second difference| (quadratic), 6 max (cubic); chord error <= |B''| / (8 n²).
  const bound = c2 === undefined ? 2 * d2(p0, c1!, p3) : 6 * Math.max(d2(p0, c1!, c2), d2(c1!, c2, p3))
  return Math.max(2, Math.ceil(Math.sqrt(bound / (8 * Math.max(tolerance, 1e-9)))))
}

/** The points after `from` of the Bezier flattened within `tolerance`, ending exactly at `to`. */
export const flattenSpline = (from: Vec3, s: SplineGeometry, tolerance: number): Vec3[] => {
  const n = splineSegments(from, s, tolerance)
  const out: Vec3[] = []
  for (let i = 1; i < n; i++) out.push(splinePoint(from, s, i / n))
  out.push({ ...s.to })
  return out
}

/** Length of the curve (from its flattening at 1 micrometre). */
export const splineLength = (from: Vec3, s: SplineGeometry): number => {
  let at = from
  let total = 0
  for (const p of flattenSpline(from, s, 0.001)) {
    total += Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z)
    at = p
  }
  return total
}

// ---------------------------------------------------------------- fitting

const sub2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const dot2 = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
const len2 = (a: Vec2): number => Math.hypot(a.x, a.y)
const unit2 = (a: Vec2): Vec2 => {
  const l = len2(a)
  return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}

/** Distance from `p` to the polyline `poly` (segment by segment). */
const distToPolyline = (p: Vec2, poly: ReadonlyArray<Vec2>): number => {
  let best = Infinity
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!
    const b = poly[i]!
    const ab = sub2(b, a)
    const l2 = dot2(ab, ab)
    const t = l2 < 1e-18 ? 0 : Math.max(0, Math.min(1, dot2(sub2(p, a), ab) / l2))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * ab.x), p.y - (a.y + t * ab.y)))
  }
  return best
}

/** Largest two-sided distance between the curve (sampled) and the original polyline it replaces. */
const deviation = (pts: ReadonlyArray<Vec2>, curve: (t: number) => Vec2): number => {
  let worst = 0
  const samples = Math.max(16, pts.length * 4)
  const sampled: Vec2[] = []
  for (let i = 0; i <= samples; i++) sampled.push(curve(i / samples))
  for (const p of pts) worst = Math.max(worst, distToPolyline(p, sampled))
  for (const q of sampled) worst = Math.max(worst, distToPolyline(q, pts))
  return worst
}

const chordParams = (pts: ReadonlyArray<Vec2>): number[] => {
  const u = [0]
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1]! + len2(sub2(pts[i]!, pts[i - 1]!)))
  const total = u[u.length - 1]!
  return u.map((v) => (total < 1e-12 ? 0 : v / total))
}

/** Least squares quadratic Bezier through the end points: the control that best reproduces the interior points. */
const fitQuadratic = (pts: ReadonlyArray<Vec2>): { readonly controls: Vec2[]; readonly error: number } | undefined => {
  const u = chordParams(pts)
  const p0 = pts[0]!
  const p2 = pts[pts.length - 1]!
  let nx = 0
  let ny = 0
  let den = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const t = u[i]!
    const b1 = 2 * t * (1 - t)
    nx += b1 * (pts[i]!.x - (1 - t) * (1 - t) * p0.x - t * t * p2.x)
    ny += b1 * (pts[i]!.y - (1 - t) * (1 - t) * p0.y - t * t * p2.y)
    den += b1 * b1
  }
  if (den < 1e-18) return undefined
  const c: Vec2 = { x: nx / den, y: ny / den }
  const from: Vec3 = { x: p0.x, y: p0.y, z: 0 }
  const to: Vec3 = { x: p2.x, y: p2.y, z: 0 }
  const error = deviation(pts, (t) => splinePoint(from, { to, controls: [c] }, t))
  return { controls: [c], error }
}

/** Least squares cubic Bezier with the end tangents fixed (Schneider): the two handle lengths solve a 2x2 system. */
const fitCubic = (pts: ReadonlyArray<Vec2>, t0: Vec2, t3: Vec2): { readonly controls: Vec2[]; readonly error: number } | undefined => {
  const u = chordParams(pts)
  const p0 = pts[0]!
  const p3 = pts[pts.length - 1]!
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0
  for (let i = 0; i < pts.length; i++) {
    const t = u[i]!
    const m = 1 - t
    const b0 = m * m * m, b1 = 3 * m * m * t, b2 = 3 * m * t * t, b3 = t * t * t
    const a1 = { x: t0.x * b1, y: t0.y * b1 }
    const a2 = { x: -t3.x * b2, y: -t3.y * b2 }
    c00 += dot2(a1, a1)
    c01 += dot2(a1, a2)
    c11 += dot2(a2, a2)
    const tmp = { x: pts[i]!.x - (p0.x * (b0 + b1) + p3.x * (b2 + b3)), y: pts[i]!.y - (p0.y * (b0 + b1) + p3.y * (b2 + b3)) }
    x0 += dot2(a1, tmp)
    x1 += dot2(a2, tmp)
  }
  const det = c00 * c11 - c01 * c01
  const chord = len2(sub2(p3, p0))
  let al = 0, ar = 0
  if (Math.abs(det) > 1e-12) {
    al = (x0 * c11 - x1 * c01) / det
    ar = (c00 * x1 - c01 * x0) / det
  }
  // Degenerate or crossed handles: the Wu/Barsky fallback of a third of the chord.
  if (!(al > 1e-6 * chord) || !(ar > 1e-6 * chord) || al > 2 * chord || ar > 2 * chord) {
    al = chord / 3
    ar = chord / 3
  }
  const c1: Vec2 = { x: p0.x + t0.x * al, y: p0.y + t0.y * al }
  const c2: Vec2 = { x: p3.x - t3.x * ar, y: p3.y - t3.y * ar }
  const from: Vec3 = { x: p0.x, y: p0.y, z: 0 }
  const to: Vec3 = { x: p3.x, y: p3.y, z: 0 }
  const error = deviation(pts, (t) => splinePoint(from, { to, controls: [c1, c2] }, t))
  return { controls: [c1, c2], error }
}

export interface SplineFitOptions {
  /** Chordal tolerance, mm: the fitted curve and the polyline stay this close in both directions. */
  readonly tolerance: number
  /** 2 = quadratic (`G5.1`), 3 = cubic (`G5`, `G6.2`). Default 3. */
  readonly degree?: 2 | 3
  /** Turning angle (degrees) at a vertex above which the polyline is a corner and the spline stops (default 30). */
  readonly cornerAngle?: number
  /** Fewest line segments a spline must replace (default 4); shorter runs stay lines. */
  readonly minSegments?: number
}

export interface FittedSpline {
  readonly to: Vec3
  readonly controls: ReadonlyArray<Vec2>
  /** Index of the last polyline point the spline replaces. */
  readonly end: number
  readonly error: number
}

/**
 * Fit a polyline (`points[0]` is the start) with consecutive Bezier segments. Returns, for each run it could replace, the spline and the
 * index range; runs it did not fit are left to the caller as lines. Corners (turning angle over `cornerAngle`) and changes of Z end a run.
 */
export const fitPolyline = (points: ReadonlyArray<Vec3>, options: SplineFitOptions): ReadonlyArray<FittedSpline & { readonly start: number }> => {
  const tol = options.tolerance
  if (!(tol > 0)) throw new RangeError("Spline tolerance must be positive")
  const degree = options.degree ?? 3
  const corner = ((options.cornerAngle ?? 30) * Math.PI) / 180
  const minSeg = options.minSegments ?? 4
  const out: Array<FittedSpline & { start: number }> = []
  const n = points.length
  const xy = points.map((p) => ({ x: p.x, y: p.y }))
  const turn = (i: number): number => {
    if (i <= 0 || i >= n - 1) return Math.PI
    const a = unit2(sub2(xy[i]!, xy[i - 1]!))
    const b = unit2(sub2(xy[i + 1]!, xy[i]!))
    return Math.acos(Math.max(-1, Math.min(1, dot2(a, b))))
  }
  const tangentAt = (i: number): Vec2 => {
    const a = xy[Math.max(0, i - 1)]!
    const b = xy[Math.min(n - 1, i + 1)]!
    return unit2(sub2(b, a))
  }
  let i = 0
  while (i < n - 1) {
    // The longest run from i with constant Z and no corner inside.
    let limit = i + 1
    while (limit < n - 1 && Math.abs(points[limit + 1]!.z - points[i]!.z) < 1e-9 && turn(limit) <= corner) limit++
    if (Math.abs(points[i + 1]!.z - points[i]!.z) > 1e-9) { i++; continue }
    // Largest j in [i + minSeg, limit] whose fit stays within the tolerance (binary search keeps it O(n log n) per run).
    const attempt = (j: number): { controls: Vec2[]; error: number } | undefined => {
      const run = xy.slice(i, j + 1)
      return degree === 2 ? fitQuadratic(run) : fitCubic(run, tangentAt(i), tangentAt(j))
    }
    let best: { j: number; fit: { controls: Vec2[]; error: number } } | undefined
    let lo = i + minSeg
    let hi = limit
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const fit = attempt(mid)
      if (fit !== undefined && fit.error <= tol) {
        best = { j: mid, fit }
        lo = mid + 1
      } else hi = mid - 1
    }
    if (best === undefined) { i++; continue }
    out.push({ start: i, end: best.j, to: { ...points[best.j]! }, controls: best.fit.controls, error: best.fit.error })
    i = best.j
  }
  return out
}

/**
 * Replace runs of consecutive `Linear` moves of one feed by `Spline` moves within the tolerance; everything else is kept in order.
 * `start` is the position before the first move. The result starts and ends at the same points, so a program built from it cuts
 * within `tolerance` of the original and has fewer blocks.
 */
export const fitSplineMoves = (moves: ReadonlyArray<Move>, start: Vec3, options: SplineFitOptions): Move[] => {
  const out: Move[] = []
  let at = start
  let i = 0
  while (i < moves.length) {
    const m = moves[i]!
    if (m._tag !== "Linear" || m.rotary !== undefined || m.expr !== undefined || m.comp !== undefined) {
      out.push(m)
      const t = m._tag === "Rapid" || m._tag === "Linear" || m._tag === "Arc" || m._tag === "Spline" ? m.to : m._tag === "Cycle" ? { x: m.to.x, y: m.to.y, z: m.retractHeight } : undefined
      if (t !== undefined) at = t
      i++
      continue
    }
    let j = i
    while (j + 1 < moves.length) {
      const n = moves[j + 1]!
      if (n._tag !== "Linear" || n.feed !== m.feed || n.rotary !== undefined || n.expr !== undefined || n.comp !== undefined) break
      j++
    }
    const pts: Vec3[] = [at]
    for (let k = i; k <= j; k++) pts.push((moves[k] as Extract<Move, { _tag: "Linear" }>).to)
    const fits = fitPolyline(pts, options)
    let cursor = 0
    for (const f of fits) {
      for (let k = cursor + 1; k <= f.start; k++) out.push({ _tag: "Linear", to: pts[k]!, feed: m.feed })
      out.push({ _tag: "Spline", to: f.to, controls: f.controls, feed: m.feed })
      cursor = f.end
    }
    for (let k = cursor + 1; k < pts.length; k++) out.push({ _tag: "Linear", to: pts[k]!, feed: m.feed })
    at = pts[pts.length - 1]!
    i = j + 1
  }
  return out
}
