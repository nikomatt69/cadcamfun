/**
 * Pairwise intersections between entities. Every hit is filtered against the
 * extent of the curve it came from: a segment never reports a point beyond its
 * ends and an arc never reports a point outside its sweep. Tangent contacts
 * (within `INTERSECT_EPS`) report exactly one point; collinear overlaps report
 * none (they are a boolean query, not a point query).
 *
 * Lines, polylines (including bulge arcs), rectangles, circles and arcs are
 * exact. Ellipses and splines are intersected through a fine tessellation
 * (0.0001 mm chord error), so their hits are accurate to about that. Blocks are
 * flattened; text, dimensions and hatches have no outline and never intersect.
 */
import { distance, sub, type Vec2 } from "./vec.ts"
import { angleInArc, bulgeToArc, normalizeAngle } from "./arc-math.ts"
import type { Entity } from "./entities.ts"
import { rectCorners } from "./shapes.ts"
import { tessellate } from "./tessellate.ts"

/** Tolerance for tangency and endpoint contact, in mm. */
export const INTERSECT_EPS = 1e-9

/** A line segment, as used by the intersection kernels. */
export interface Segment {
  readonly a: Vec2
  readonly b: Vec2
}

export const segment = (a: Vec2, b: Vec2): Segment => ({ a, b })

/**
 * Segment–segment intersection. Parallel and collinear segments report no point.
 */
export const intersectSegments = (s1: Segment, s2: Segment, eps = INTERSECT_EPS): Vec2[] => {
  const r = sub(s1.b, s1.a)
  const s = sub(s2.b, s2.a)
  const denom = r.x * s.y - r.y * s.x
  if (Math.abs(denom) < 1e-18) return []
  const qp = sub(s2.a, s1.a)
  const t = (qp.x * s.y - qp.y * s.x) / denom
  const u = (qp.x * r.y - qp.y * r.x) / denom
  const tTol = eps / Math.max(Math.hypot(r.x, r.y), 1e-300)
  const uTol = eps / Math.max(Math.hypot(s.x, s.y), 1e-300)
  if (t < -tTol || t > 1 + tTol || u < -uTol || u > 1 + uTol) return []
  const tc = Math.min(1, Math.max(0, t))
  return [{ x: s1.a.x + r.x * tc, y: s1.a.y + r.y * tc }]
}

/** Parameters `t` along `a + t (b - a)` where the infinite line meets the circle (0, 1 or 2 values, ascending). */
const lineCircleParameters = (a: Vec2, b: Vec2, center: Vec2, radius: number): number[] => {
  const d = sub(b, a)
  const len2 = d.x * d.x + d.y * d.y
  if (len2 < 1e-24) return []
  const f = sub(a, center)
  const tClosest = -(f.x * d.x + f.y * d.y) / len2
  const px = f.x + d.x * tClosest
  const py = f.y + d.y * tClosest
  const dist = Math.hypot(px, py)
  const eps = INTERSECT_EPS * Math.max(1, radius)
  if (dist > radius + eps) return []
  if (dist >= radius - eps) return [tClosest]
  const half = Math.sqrt(Math.max(0, radius * radius - dist * dist) / len2)
  return [tClosest - half, tClosest + half]
}

/** Infinite line through `a`, `b` × circle: 0 (miss), 1 (tangent) or 2 (secant) points. */
export const intersectLineCircle = (a: Vec2, b: Vec2, center: Vec2, radius: number): Vec2[] =>
  lineCircleParameters(a, b, center, radius).map((t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }))

/** Segment `a`–`b` × circle: only hits within the segment, 0, 1 or 2 points. */
export const intersectSegmentCircle = (a: Vec2, b: Vec2, center: Vec2, radius: number): Vec2[] => {
  const len = distance(a, b)
  const tol = len === 0 ? 0 : INTERSECT_EPS / len
  const out: Vec2[] = []
  for (const t of lineCircleParameters(a, b, center, radius)) {
    if (t < -tol || t > 1 + tol) continue
    const tc = Math.min(1, Math.max(0, t))
    out.push({ x: a.x + (b.x - a.x) * tc, y: a.y + (b.y - a.y) * tc })
  }
  return out
}

/** Circle–circle: 0 (miss), 1 (tangent) or 2 (secant) points; concentric circles report none. */
export const intersectCircles = (c1: Vec2, r1: number, c2: Vec2, r2: number): Vec2[] => {
  const d = distance(c1, c2)
  if (d < 1e-12) return []
  const eps = INTERSECT_EPS * Math.max(1, r1, r2)
  if (d > r1 + r2 + eps || d < Math.abs(r1 - r2) - eps) return []
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
  const h2 = r1 * r1 - a * a
  const h = h2 > 0 ? Math.sqrt(h2) : 0
  const p2 = { x: c1.x + (a * (c2.x - c1.x)) / d, y: c1.y + (a * (c2.y - c1.y)) / d }
  // Tangent: external (d = r1 + r2) or internal (d = |r1 - r2|).
  if (h < eps || Math.abs(d - (r1 + r2)) <= eps || Math.abs(d - Math.abs(r1 - r2)) <= eps) return [p2]
  const rx = -(c2.y - c1.y) * (h / d)
  const ry = (c2.x - c1.x) * (h / d)
  return [
    { x: p2.x + rx, y: p2.y + ry },
    { x: p2.x - rx, y: p2.y - ry }
  ]
}

// ---------------------------------------------------------------- primitives

export interface ArcPrim {
  readonly center: Vec2
  readonly radius: number
  readonly startAngle: number
  readonly endAngle: number
  readonly clockwise: boolean
}

export type CurvePrimitive =
  | { readonly kind: "segment"; readonly value: Segment }
  | { readonly kind: "circle"; readonly value: { readonly center: Vec2; readonly radius: number } }
  | { readonly kind: "arc"; readonly value: ArcPrim }

const shift = (p: Vec2, offset: Vec2): Vec2 => ({ x: p.x + offset.x, y: p.y + offset.y })

/** Splits an entity into segment, circle and arc primitives (ellipses and splines are tessellated). */
export const curvePrimitives = (entity: Entity, offset: Vec2 = { x: 0, y: 0 }): ReadonlyArray<CurvePrimitive> => {
  const segs = (points: ReadonlyArray<Vec2>, closed: boolean): CurvePrimitive[] => {
    const out: CurvePrimitive[] = []
    const n = closed ? points.length : points.length - 1
    for (let i = 0; i < n; i++) {
      out.push({ kind: "segment", value: segment(shift(points[i]!, offset), shift(points[(i + 1) % points.length]!, offset)) })
    }
    return out
  }
  switch (entity._tag) {
    case "Line":
      return segs([entity.start, entity.end], false)
    case "Polyline": {
      const n = entity.closed ? entity.points.length : entity.points.length - 1
      const out: CurvePrimitive[] = []
      for (let i = 0; i < n; i++) {
        const p0 = entity.points[i]!
        const p1 = entity.points[(i + 1) % entity.points.length]!
        const arc = bulgeToArc(p0, p1, entity.bulge?.[i] ?? 0)
        if (arc === undefined) {
          out.push({ kind: "segment", value: segment(shift(p0, offset), shift(p1, offset)) })
        } else {
          out.push({
            kind: "arc",
            value: {
              center: shift(arc.center, offset),
              radius: arc.radius,
              startAngle: arc.startAngle,
              endAngle: normalizeAngle(arc.startAngle + arc.sweep),
              clockwise: arc.sweep < 0
            }
          })
        }
      }
      return out
    }
    case "Rectangle":
      return segs(rectCorners(entity.corner1, entity.corner2), true)
    case "Circle":
      return [{ kind: "circle", value: { center: shift(entity.center, offset), radius: entity.radius } }]
    case "Arc":
      return [
        {
          kind: "arc",
          value: {
            center: shift(entity.center, offset),
            radius: entity.radius,
            startAngle: entity.startAngle,
            endAngle: entity.endAngle,
            clockwise: entity.clockwise
          }
        }
      ]
    case "Ellipse":
    case "Spline":
      return tessellate(entity, 1e-4).flatMap((ring) => segs(ring, entity._tag === "Ellipse" || entity.closed))
    case "Block": {
      const base = shift(entity.basePoint, offset)
      return entity.entities.flatMap((child) => curvePrimitives(child, base))
    }
    case "Text":
    case "Dimension":
    case "Hatch":
      return []
  }
}

export const onArc = (arc: ArcPrim, p: Vec2): boolean =>
  angleInArc(Math.atan2(p.y - arc.center.y, p.x - arc.center.x), arc.startAngle, arc.endAngle, arc.clockwise, 1e-9)

const circleOf = (p: CurvePrimitive & { kind: "arc" | "circle" }): { center: Vec2; radius: number } => ({
  center: p.value.center,
  radius: p.value.radius
})

const pair = (p: CurvePrimitive, q: CurvePrimitive): Vec2[] => {
  if (p.kind === "segment" && q.kind === "segment") return intersectSegments(p.value, q.value)
  if (p.kind === "segment") {
    const c = circleOf(q as CurvePrimitive & { kind: "arc" | "circle" })
    const hits = intersectSegmentCircle(p.value.a, p.value.b, c.center, c.radius)
    return q.kind === "arc" ? hits.filter((h) => onArc(q.value, h)) : hits
  }
  if (q.kind === "segment") return pair(q, p)
  const a = circleOf(p)
  const b = circleOf(q)
  return intersectCircles(a.center, a.radius, b.center, b.radius).filter(
    (h) => (p.kind === "circle" || onArc(p.value, h)) && (q.kind === "circle" || onArc(q.value, h))
  )
}

/** All intersection points between two entities (see the module comment for what is exact). */
export const intersect = (a: Entity, b: Entity): Vec2[] => {
  const left = curvePrimitives(a)
  const right = curvePrimitives(b)
  const out: Vec2[] = []
  for (const p of left) for (const q of right) out.push(...pair(p, q))
  return dedupeHits(out)
}

/** Removes duplicate hits within `eps`, preserving order. */
export const dedupeHits = (points: ReadonlyArray<Vec2>, eps = 1e-7): Vec2[] => {
  const out: Vec2[] = []
  for (const p of points) {
    if (out.every((q) => distance(q, p) > eps)) out.push(p)
  }
  return out
}
