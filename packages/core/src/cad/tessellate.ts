/**
 * Converts entities into polylines within a chord-height tolerance (in mm).
 * The result is what the CAM layer offsets and what the viewport renders.
 *
 * A closed shape returns a ring whose first and last points differ; the closing
 * segment is implicit and reported by the caller, never duplicated here.
 */
import { TAU, type Vec2 } from "./vec.ts"
import { arcSegmentCount, arcSweep, bulgeToArc, pointOnCircle, signedSweep } from "./arc-math.ts"
import type { Entity, SplineEntity } from "./entities.ts"
import { rectCorners } from "./shapes.ts"
import { splinePolyline } from "./spline.ts"

/** Guard so a zero tolerance cannot produce an unbounded segment count. */
const MIN_TOLERANCE = 1e-6
/** Hard cap on generated segments per entity; keeps a pathological tolerance bounded. */
export const MAX_SEGMENTS = 65536

const segmentsFor = (sweep: number, radius: number, tolerance: number): number =>
  Math.min(MAX_SEGMENTS, arcSegmentCount(radius, sweep, tolerance, 1))

/** Number of segments an ellipse of the given radii needs within `tolerance`. */
export const ellipseSegmentCount = (radiusX: number, radiusY: number, tolerance: number): number => {
  const a = Math.max(radiusX, radiusY)
  if (Math.abs(radiusX - radiusY) <= 1e-12 * a) return segmentsFor(TAU, a, tolerance)
  // Uniform parameter steps `h`: the chord deviates at most `h^2 / 8 * max|C''|` and
  // `|C''| <= a` on an ellipse, so `h = sqrt(8 tol / a)` is safe even for very flat
  // ellipses, whose tips are much sharper than a circle of radius `a`.
  const h = Math.sqrt((8 * Math.max(MIN_TOLERANCE, tolerance)) / a)
  return Math.min(MAX_SEGMENTS, Math.max(8, Math.ceil(TAU / h)))
}

/** Points on an ellipse (closed ring, no duplicated closing point). */
export const ellipsePoints = (
  center: Vec2,
  radiusX: number,
  radiusY: number,
  rotation: number,
  segments: number
): Vec2[] => {
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  const pts: Vec2[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i * TAU) / segments
    const x = radiusX * Math.cos(a)
    const y = radiusY * Math.sin(a)
    pts.push({ x: center.x + x * c - y * s, y: center.y + x * s + y * c })
  }
  return pts
}

/**
 * Points along a circular arc, including both endpoints (never closed).
 */
export const arcPoints = (
  center: Vec2,
  radius: number,
  startAngle: number,
  endAngle: number,
  clockwise: boolean,
  tolerance: number
): Vec2[] => {
  const sweep = signedSweep(startAngle, endAngle, clockwise)
  const n = segmentsFor(sweep, radius, tolerance)
  const pts: Vec2[] = []
  for (let i = 0; i <= n; i++) {
    pts.push(pointOnCircle(center, radius, startAngle + (sweep * i) / n))
  }
  return pts
}

/** Splits a polyline with DXF bulges into a point list including the arcs. */
export const bulgedPolylinePoints = (
  points: ReadonlyArray<Vec2>,
  closed: boolean,
  bulge: ReadonlyArray<number> | undefined,
  tolerance: number
): Vec2[] => {
  const out: Vec2[] = [{ ...points[0]! }]
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) {
    const p0 = points[i]!
    const p1 = points[(i + 1) % points.length]!
    const b = bulge?.[i] ?? 0
    const arc = bulgeToArc(p0, p1, b)
    if (arc === undefined) {
      out.push({ ...p1 })
      continue
    }
    const n = segmentsFor(arc.sweep, arc.radius, tolerance)
    const endAngle = arc.startAngle + arc.sweep
    for (let k = 1; k <= n; k++) {
      out.push(pointOnCircle(arc.center, arc.radius, arc.startAngle + (arc.sweep * k) / n))
    }
    void endAngle
  }
  return out
}

/** Number of segments a spline needs to stay within `tolerance` (analytic bound, see `splinePolyline`). */
export const splineSegmentCount = (spline: SplineEntity, tolerance: number): number => {
  const pts = splinePolyline(spline.controlPoints, spline.degree, spline.closed, tolerance, spline.knots)
  return spline.closed ? pts.length : Math.max(1, pts.length - 1)
}

/**
 * Tessellates an entity into polylines within `tolerance` (chord height, mm).
 * `Text` and `Dimension` have no outline geometry and return an empty list.
 */
export const tessellate = (entity: Entity, tolerance: number): Vec2[][] => {
  const tol = Math.max(MIN_TOLERANCE, Math.abs(tolerance))
  switch (entity._tag) {
    case "Line":
      return [[{ ...entity.start }, { ...entity.end }]]
    case "Circle": {
      const n = segmentsFor(TAU, entity.radius, tol)
      const pts: Vec2[] = []
      for (let i = 0; i < n; i++) {
        pts.push(pointOnCircle(entity.center, entity.radius, (i * TAU) / n))
      }
      return [pts]
    }
    case "Arc":
      return [
        arcPoints(
          entity.center,
          entity.radius,
          entity.startAngle,
          entity.endAngle,
          entity.clockwise,
          tol
        )
      ]
    case "Rectangle":
      return [[...rectCorners(entity.corner1, entity.corner2)]]
    case "Ellipse":
      return [
        ellipsePoints(
          entity.center,
          entity.radiusX,
          entity.radiusY,
          entity.rotation,
          ellipseSegmentCount(entity.radiusX, entity.radiusY, tol)
        )
      ]
    case "Polyline": {
      const pts = bulgedPolylinePoints(entity.points, entity.closed, entity.bulge, tol)
      return [entity.closed && pts.length > 1 ? dropClosingDuplicate(pts) : pts]
    }
    case "Spline":
      return [splinePolyline(entity.controlPoints, entity.degree, entity.closed, tol, entity.knots)]
    case "Hatch":
      return [[...entity.boundary]]
    case "Block":
      // Blocks contribute their children's rings, each translated by the base
      // point so a block is transparent to everything downstream.
      return entity.entities.flatMap((child) =>
        tessellate(child, tol).map((ring) => ring.map((p) => ({ x: p.x + entity.basePoint.x, y: p.y + entity.basePoint.y })))
      )
    case "Text":
    case "Dimension":
      return []
  }
}

/** Removes the duplicated closing point, keeping the ring's `closed` flag on the entity. */
export const dropClosingDuplicate = (points: ReadonlyArray<Vec2>): Vec2[] => {
  if (points.length < 2) return [...points]
  const first = points[0]!
  const last = points[points.length - 1]!
  return first.x === last.x && first.y === last.y ? points.slice(0, -1) : [...points]
}

/** Whether a point list is a closed ring (first and last points differ). */
export const isRing = (points: ReadonlyArray<Vec2>): boolean => {
  if (points.length < 3) return false
  const first = points[0]!
  const last = points[points.length - 1]!
  return first.x !== last.x || first.y !== last.y
}

/** Appends the first point to close a ring, for consumers that need it explicit. */
export const closeRing = (points: ReadonlyArray<Vec2>): Vec2[] => (isRing(points) ? [...points, { ...points[0]! }] : [...points])

/** Total point count a tessellation will produce, without building the geometry. */
export const tessellateSize = (entity: Entity, tolerance: number): number =>
  tessellate(entity, tolerance).reduce((n, ring) => n + ring.length, 0)

export { arcSweep }