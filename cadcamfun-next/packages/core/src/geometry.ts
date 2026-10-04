import { Schema } from "effect"

/** A finite 2D point / vector, in document units. */
export const Vec2 = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
export type Vec2 = typeof Vec2.Type

/** A finite 3D point / vector, in document units. */
export const Vec3 = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })
export type Vec3 = typeof Vec3.Type

export const Positive = Schema.Finite.check(Schema.isGreaterThan(0))
export const NonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))

export const EPSILON = 1e-9

export const vec2 = (x: number, y: number): Vec2 => ({ x, y })
export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z })

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k })
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
export const length = (a: Vec2): number => Math.hypot(a.x, a.y)
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const normalize = (a: Vec2): Vec2 => {
  const l = length(a)
  return l < EPSILON ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}
/** Left-hand perpendicular (rotated +90°). */
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x })
export const rotate = (p: Vec2, angleRad: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 => {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c }
}
export const equals = (a: Vec2, b: Vec2, eps = 1e-6): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps

export const degToRad = (deg: number): number => (deg * Math.PI) / 180
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI

/** Signed area of a polygon (positive = counter-clockwise). */
export const signedArea = (points: ReadonlyArray<Vec2>): number => {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

export const polylineLength = (points: ReadonlyArray<Vec2>, closed = false): number => {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1]!, points[i]!)
  if (closed && points.length > 2) total += distance(points[points.length - 1]!, points[0]!)
  return total
}

/** Even-odd point-in-polygon test. */
export const pointInPolygon = (p: Vec2, polygon: ReadonlyArray<Vec2>): boolean => {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Axis-aligned bounding box. */
export const Bounds = Schema.Struct({ min: Vec2, max: Vec2 })
export type Bounds = typeof Bounds.Type

export const boundsOf = (points: ReadonlyArray<Vec2>): Bounds | undefined => {
  if (points.length === 0) return undefined
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
}

export const unionBounds = (a: Bounds | undefined, b: Bounds | undefined): Bounds | undefined => {
  if (!a) return b
  if (!b) return a
  return {
    min: { x: Math.min(a.min.x, b.min.x), y: Math.min(a.min.y, b.min.y) },
    max: { x: Math.max(a.max.x, b.max.x), y: Math.max(a.max.y, b.max.y) },
  }
}

export const boundsSize = (b: Bounds): Vec2 => ({ x: b.max.x - b.min.x, y: b.max.y - b.min.y })
export const boundsCenter = (b: Bounds): Vec2 => ({ x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 })

/** Sample a circular arc (angles in radians, CCW from start to end) into points. */
export const sampleArc = (
  center: Vec2,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments?: number,
): Array<Vec2> => {
  let sweep = endAngle - startAngle
  while (sweep <= 0) sweep += Math.PI * 2
  const n = segments ?? Math.max(8, Math.ceil((sweep / (Math.PI * 2)) * 64))
  const out: Array<Vec2> = []
  for (let i = 0; i <= n; i++) {
    const a = startAngle + (sweep * i) / n
    out.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) })
  }
  return out
}
