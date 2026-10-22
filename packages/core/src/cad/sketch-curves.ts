/** Nominal profile curves shared by the sketch's display sampler and exact B-rep adapter. */
import { clampedUniformKnots, periodicUniformKnots } from "./spline.ts"
import { curveDomain, nurbsCurveDerivs, type NurbsCurveData } from "./brep/nurbs.ts"
import type { Vec2 } from "./vec.ts"

/** Generated construction edges retain their historical ids/constraints but do not replace the nominal curve. */
export interface NominalSketchCurve {
  readonly id: string
  readonly replaces: ReadonlyArray<string>
  readonly segments: ReadonlyArray<NurbsCurveData>
  readonly closed: boolean
  readonly start: string
  readonly end: string
}

const bezier = (points: ReadonlyArray<ReadonlyArray<number>>, weights?: ReadonlyArray<number>): NurbsCurveData => {
  const degree = points.length - 1
  const knots = [...new Array<number>(degree + 1).fill(0), ...new Array<number>(degree + 1).fill(1)]
  return { degree, knots, points, ...(weights === undefined ? {} : { weights }) }
}

/** Four rational quadratic Bezier spans preserve an ellipse without a polygon approximation. */
export const ellipseCurves = (center: Vec2, rx: number, ry: number, rotation = 0): ReadonlyArray<NurbsCurveData> => {
  if (![center.x, center.y, rx, ry, rotation].every(Number.isFinite) || !(rx > 0 && ry > 0)) throw new RangeError("ellipse needs finite positive semi-axes")
  const cs = Math.cos(rotation), sn = Math.sin(rotation)
  const point = (x: number, y: number): number[] => [center.x + rx * x * cs - ry * y * sn, center.y + rx * x * sn + ry * y * cs]
  const corners = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 0]] as const
  return corners.slice(0, 4).map(([x, y], i) => {
    const [u, v] = corners[i + 1]!
    return bezier([point(x, y), point(x + u, y + v), point(u, v)], [1, Math.SQRT1_2, 1])
  })
}

/** The same uniform Catmull-Rom law used by the sketcher, represented by exact cubic Bezier spans. */
export const catmullRomCurves = (points: ReadonlyArray<Vec2>, closed: boolean): ReadonlyArray<NurbsCurveData> => {
  if (points.length < 2) throw new RangeError("a spline needs at least two points")
  const at = (i: number): Vec2 => points[closed ? (i + points.length) % points.length : Math.max(0, Math.min(points.length - 1, i))]!
  return Array.from({ length: closed ? points.length : points.length - 1 }, (_, i) => {
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2)
    return bezier([[b.x, b.y], [b.x + (c.x - a.x) / 6, b.y + (c.y - a.y) / 6], [c.x - (d.x - b.x) / 6, c.y - (d.y - b.y) / 6], [c.x, c.y]])
  })
}

/** Restrict a polynomial B-spline to each knot span and convert its Taylor coefficients to Bernstein coefficients. */
const polynomialSpans = (curve: NurbsCurveData): ReadonlyArray<NurbsCurveData> => {
  const [lo, hi] = curveDomain(curve)
  const breaks = [...new Set(curve.knots.filter((k) => k >= lo && k <= hi))]
  return breaks.slice(0, -1).map((a, index) => {
    const h = breaks[index + 1]! - a
    const derivatives = nurbsCurveDerivs(curve, a, curve.degree)
    const points = Array.from({ length: curve.degree + 1 }, (_, i) => {
      const p = [...derivatives[0]!]
      let factor = 1
      for (let k = 1; k <= i; k++) {
        factor *= ((i - k + 1) * h) / (k * (curve.degree - k + 1))
        for (let axis = 0; axis < p.length; axis++) p[axis] = p[axis]! + derivatives[k]![axis]! * factor
      }
      return p
    })
    return bezier(points)
  })
}

export const controlledCurves = (kind: "spline" | "bezier" | "nurbs", points: ReadonlyArray<Vec2>, closed: boolean, degree: number): ReadonlyArray<NurbsCurveData> => {
  if (points.length < 2 || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new RangeError("a curve needs finite control points")
  if (kind === "spline") return catmullRomCurves(points, closed)
  if (kind === "bezier") return [bezier(points.map((p) => [p.x, p.y]))]
  const d = Math.min(Math.max(1, degree), points.length - 1)
  const controls = closed ? [...points, ...points.slice(0, d)] : points
  return polynomialSpans({ degree: d, knots: closed ? periodicUniformKnots(points.length, d) : clampedUniformKnots(points.length, d), points: controls.map((p) => [p.x, p.y]) })
}

/**
 * Positive-weight rational Bezier curves stay in their control hull. Accept a chord only when the whole hull lies within
 * its tolerance capsule; subdivision in homogeneous coordinates preserves the exact curve. No midpoint-only flatness test.
 */
export const sampleNominalCurves = (curves: ReadonlyArray<NurbsCurveData>, tolerance: number): Vec2[] => {
  if (!(tolerance > 0) || !Number.isFinite(tolerance)) throw new RangeError("curve sampling needs a finite positive tolerance")
  const out: Vec2[] = []
  const project = (p: ReadonlyArray<number>): Vec2 => ({ x: p[0]! / p[2]!, y: p[1]! / p[2]! })
  const append = (p: Vec2): void => {
    if (![p.x, p.y].every(Number.isFinite)) throw new RangeError("curve sampling produced a non-finite point")
    if (out.length >= 65536) throw new RangeError("curve sampling exceeds the 65536-segment budget")
    out.push(p)
  }
  const recurse = (controls: ReadonlyArray<ReadonlyArray<number>>, depth: number): void => {
    const a = project(controls[0]!), b = project(controls[controls.length - 1]!)
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy
    const flat = controls.every((raw) => {
      const p = project(raw)
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) <= tolerance
    })
    if (flat) { append(b); return }
    if (depth >= 32) throw new RangeError("curve sampling cannot meet the tolerance within its subdivision budget")
    let level = controls.map((p) => [...p])
    const left = [level[0]!], right = [level[level.length - 1]!]
    while (level.length > 1) {
      level = level.slice(1).map((p, i) => p.map((v, axis) => (v + level[i]![axis]!) / 2))
      left.push(level[0]!); right.push(level[level.length - 1]!)
    }
    recurse(left, depth + 1); recurse(right.reverse(), depth + 1)
  }
  for (const curve of curves) {
    if (curve.points.length !== curve.degree + 1 || curve.points.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v)))) throw new RangeError("nominal curve spans must be finite planar Bezier curves")
    const controls = curve.points.map((p, i) => {
      const w = curve.weights?.[i] ?? 1
      if (!(w > 0) || !Number.isFinite(w)) throw new RangeError("nominal curve weights must be finite and positive")
      return [p[0]! * w, p[1]! * w, w]
    })
    if (out.length === 0) append(project(controls[0]!))
    recurse(controls, 0)
  }
  return out
}
