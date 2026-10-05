/**
 * B-spline evaluation. Open splines use the supplied knot vector or a clamped
 * uniform one; closed splines are uniform periodic and ignore `knots`.
 */
import { type Vec2 } from "./vec.ts"

/** Clamped uniform knot vector for `pointCount` control points of the given degree. */
export const clampedUniformKnots = (pointCount: number, degree: number): number[] => {
  const interior = Math.max(0, pointCount - degree - 1)
  const knots: number[] = []
  for (let i = 0; i <= degree; i++) knots.push(0)
  for (let i = 1; i <= interior; i++) knots.push(i / (interior + 1))
  for (let i = 0; i <= degree; i++) knots.push(1)
  return knots
}

/**
 * Periodic uniform knot vector `u[i] = (i - degree) / pointCount`, extended
 * `degree` steps on both sides (so `pointCount + 2 * degree + 1` entries). The
 * extension is what makes the domain `[0, 1]` cover exactly `pointCount` spans,
 * i.e. one full turn of the closed curve.
 */
export const periodicUniformKnots = (pointCount: number, degree: number): number[] => {
  const total = pointCount + degree * 2 + 1
  const knots: number[] = []
  for (let i = 0; i < total; i++) knots.push((i - degree) / pointCount)
  return knots
}

/**
 * Validates a caller-supplied knot vector: non-decreasing, starts at 0, ends at
 * 1, and has `pointCount + degree + 1` entries.
 */
export const isValidKnots = (knots: ReadonlyArray<number>, pointCount: number, degree: number): boolean => {
  if (knots.length !== pointCount + degree + 1) return false
  if (knots[0] !== 0) return false
  if (knots[knots.length - 1] !== 1) return false
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i]!
    const b = knots[i - 1]!
    if (!Number.isFinite(a) || a < b) return false
  }
  return true
}

/**
 * Span index `k` for parameter `t`: the largest index with `knots[k] <= t`
 * inside the base interval `[knots[spanLo], knots[spanHi + 1]]`, searched
 * linearly. De Boor needs `knots[k + degree]`, so `k` is clamped to the
 * requested span range: `degree … pointCount - 1` for a clamped vector,
 * `degree … degree + pointCount` for a periodic one.
 */
const spanAt = (knots: ReadonlyArray<number>, degree: number, spanHi: number, t: number): number => {
  const lo = degree
  if (t <= knots[lo]!) return lo
  let k = lo
  while (k < spanHi && knots[k + 1]! <= t) k++
  return k
}

/**
 * De Boor's algorithm over an unrolled copy of the control points, so the same
 * code path serves clamped and periodic splines (periodic ones wrap with modulo).
 */
const deBoor = (
  points: ReadonlyArray<Vec2>,
  degree: number,
  knots: ReadonlyArray<number>,
  spanHi: number,
  t: number
): Vec2 => {
  const count = points.length
  const k = spanAt(knots, degree, spanHi, t)
  const unrolled: Vec2[] = []
  for (let i = 0; i <= k + degree; i++) unrolled.push({ ...points[((i % count) + count) % count]! })
  const d: Vec2[] = []
  for (let j = 0; j <= degree; j++) d.push(unrolled[k - degree + j]!)
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = k - degree + j
      const denom = knots[i + degree - r + 1]! - knots[i]!
      const alpha = denom === 0 ? 0 : (t - knots[i]!) / denom
      d[j] = {
        x: (1 - alpha) * d[j - 1]!.x + alpha * d[j]!.x,
        y: (1 - alpha) * d[j - 1]!.y + alpha * d[j]!.y
      }
    }
  }
  return d[degree]!
}

/** Knot vector for a spline description; invalid input falls back to a uniform one. */
export const resolveKnots = (
  controlPoints: ReadonlyArray<Vec2>,
  degree: number,
  closed: boolean,
  knots?: ReadonlyArray<number>
): number[] => {
  if (knots !== undefined && isValidKnots(knots, controlPoints.length, degree)) return [...knots]
  return closed
    ? periodicUniformKnots(controlPoints.length, degree)
    : clampedUniformKnots(controlPoints.length, degree)
}

/** Evaluates the spline at `t` in `[0, 1]`. */
export const evaluateSpline = (
  controlPoints: ReadonlyArray<Vec2>,
  degree: number,
  closed: boolean,
  t: number,
  knots?: ReadonlyArray<number>
): Vec2 => {
  if (controlPoints.length === 0) return { x: 0, y: 0 }
  if (controlPoints.length === 1) return { ...controlPoints[0]! }
  const count = controlPoints.length
  const d = Math.min(Math.max(1, degree), count - 1)
  const tc = Math.min(1, Math.max(0, t))
  if (!closed) {
    const resolved = knots !== undefined && isValidKnots(knots, count, d)
      ? [...knots]
      : clampedUniformKnots(count, d)
    return deBoor(controlPoints, d, resolved, count - 1, tc)
  }
  const resolved = periodicUniformKnots(count, d)
  // The periodic vector is laid out so that `t ∈ [0, 1]` already covers the
  // whole curve: `[0, 1] === [knots[degree], knots[degree + pointCount]]`.
  return deBoor(controlPoints, d, resolved, d + count, tc)
}

/** Samples the spline uniformly in `t` (not in arc length). */
export const sampleSpline = (
  controlPoints: ReadonlyArray<Vec2>,
  degree: number,
  closed: boolean,
  segments: number,
  knots?: ReadonlyArray<number>
): Vec2[] => {
  const n = Math.max(2, Math.floor(segments))
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) out.push(evaluateSpline(controlPoints, degree, closed, i / n, knots))
  if (closed) out.push({ ...out[0]! })
  return out
}
/** Hard cap on the segments of one spline, so absurd tolerances cannot exhaust memory. */
const MAX_SPLINE_SEGMENTS = 65536

/**
 * Tessellates a spline so that the curve stays within `tolerance` of the polyline
 * (chord height). The bound is analytic, not sampled: within one knot span the
 * curve is a polynomial, and a chord over a parameter step `h` deviates at most
 * `h² / 8 · max|C''|`, where `max|C''|` is bounded by the second-derivative
 * B-spline control points of that span. Each span is subdivided uniformly so
 * its own bound holds. A closed spline returns its ring without the repeated
 * closing point; an open one ends on the last curve point.
 */
export const splinePolyline = (
  controlPoints: ReadonlyArray<Vec2>,
  degree: number,
  closed: boolean,
  tolerance: number,
  knots?: ReadonlyArray<number>
): Vec2[] => {
  const n = controlPoints.length
  if (n === 0) return []
  if (n === 1) return [{ ...controlPoints[0]! }]
  const d = Math.min(Math.max(1, degree), n - 1)
  const tol = Math.max(1e-9, tolerance)
  const m = closed ? n + d : n
  const u =
    !closed && knots !== undefined && isValidKnots(knots, n, d)
      ? [...knots]
      : closed
        ? periodicUniformKnots(n, d)
        : clampedUniformKnots(n, d)
  const at = (i: number): Vec2 => controlPoints[((i % n) + n) % n]!

  // First-derivative control points (indexed from 0 over the unrolled points).
  const q1: Vec2[] = []
  for (let j = 0; j + 1 < m; j++) {
    const denom = u[j + d + 1]! - u[j + 1]!
    const p = at(j)
    const q = at(j + 1)
    q1.push(denom <= 0 ? { x: 0, y: 0 } : { x: (d * (q.x - p.x)) / denom, y: (d * (q.y - p.y)) / denom })
  }
  const q2Max = (span: number): number => {
    if (d < 2) return 0
    let best = 0
    for (let j = span - d; j <= span - 2; j++) {
      const a = q1[j]
      const b = q1[j + 1]
      if (a === undefined || b === undefined) continue
      const denom = u[j + d + 1]! - u[j + 2]!
      if (denom <= 0) continue
      best = Math.max(best, ((d - 1) * Math.hypot(b.x - a.x, b.y - a.y)) / denom)
    }
    return best
  }

  const out: Vec2[] = []
  let budget = MAX_SPLINE_SEGMENTS
  for (let span = d; span < m; span++) {
    const a = u[span]!
    const b = u[span + 1]!
    if (b - a <= 1e-15) continue
    const bound = q2Max(span)
    const step = bound <= 1e-12 ? Infinity : Math.sqrt((8 * tol) / bound)
    const segs = Math.max(1, Math.min(budget, Math.ceil((b - a) / step - 1e-12)))
    budget = Math.max(1, budget - segs)
    for (let i = 0; i < segs; i++) out.push(evaluateSpline(controlPoints, degree, closed, a + ((b - a) * i) / segs, knots))
  }
  if (!closed) out.push(evaluateSpline(controlPoints, degree, closed, 1, knots))
  return out
}
