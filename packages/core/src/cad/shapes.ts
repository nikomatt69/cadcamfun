/**
 * Constructors and modifiers used by the editor tools and by the CAM
 * operations. Everything returns plain immutable data; nothing mutates input.
 */
import {
  add,
  angleOf,
  cross2,
  distance,
  fromPolar,
  length,
  lerp,
  normalize,
  perp,
  rotate,
  scale,
  sub,
  TAU,
  type Vec2,
  type Vec3
} from "./vec.ts"
import { normalizeAngle } from "./arc-math.ts"
import {
  baseEntity,
  type EllipseEntity,
  type LineEntity,
  type PolylineEntity,
  type RectangleEntity
} from "./entities.ts"

// ---------------------------------------------------------------- rectangles

/** The four corners of a rectangle, in counter-clockwise order from the minimum corner. */
export const rectCorners = (c1: Vec2, c2: Vec2): ReadonlyArray<Vec2> => {
  const x0 = Math.min(c1.x, c2.x)
  const y0 = Math.min(c1.y, c2.y)
  const x1 = Math.max(c1.x, c2.x)
  const y1 = Math.max(c1.y, c2.y)
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 }
  ]
}

export const makeRectangle = (
  id: string,
  corner1: Vec2,
  corner2: Vec2,
  layerId = "layer-0"
): RectangleEntity => ({
  ...baseEntity(id, layerId),
  _tag: "Rectangle",
  corner1: { ...corner1 },
  corner2: { ...corner2 }
})

/** Rectangle as a closed polyline (no duplicated closing point). */
export const rectangleToPolyline = (corner1: Vec2, corner2: Vec2): Vec2[] => [...rectCorners(corner1, corner2)]

// ---------------------------------------------------------------- primitives

export const makeLine = (
  id: string,
  start: Vec2,
  end: Vec2,
  layerId = "layer-0"
): LineEntity => ({
  ...baseEntity(id, layerId),
  _tag: "Line",
  start: { ...start },
  end: { ...end }
})

export const makePolyline = (
  id: string,
  points: ReadonlyArray<Vec2>,
  closed: boolean,
  layerId = "layer-0"
): PolylineEntity => ({
  ...baseEntity(id, layerId),
  _tag: "Polyline",
  points: points.map((p) => ({ ...p })),
  closed
})

export const makeEllipse = (
  id: string,
  center: Vec2,
  radiusX: number,
  radiusY: number,
  rotation = 0,
  layerId = "layer-0"
): EllipseEntity => ({
  ...baseEntity(id, layerId),
  _tag: "Ellipse",
  center: { ...center },
  radiusX,
  radiusY,
  rotation: normalizeAngle(rotation)
})

// ---------------------------------------------------------------- polygons

/** Regular `sides`-gon inscribed in a circle. Starts at `startAngle`. */
export const regularPolygon = (
  center: Vec2,
  radius: number,
  sides: number,
  startAngle = Math.PI / 2
): Vec2[] => {
  const n = Math.max(3, Math.floor(sides))
  const pts: Vec2[] = []
  for (let i = 0; i < n; i++) pts.push(fromPolar(radius, normalizeAngle(startAngle + (i * TAU) / n)))
  // Centre translation is applied separately so the polygon starts at angle 0
  // in local space, which keeps the CAM tessellation cache-friendly.
  return pts.map((p) => add(p, center))
}

/**
 * Rounded slot: the Minkowski sum of the segment `a`–`b` with a disc of the
 * given radius, i.e. a stadium — two semicircular caps centred on `a` and `b`
 * joined by straight flanks. The returned ring is closed, counter-clockwise and
 * carries no duplicated point; every point lies exactly `radius` away from one
 * of the two centres (apart from the flanks, which are tangent to both).
 */
export const slot = (a: Vec2, b: Vec2, radius: number): Vec2[] => {
  if (!(radius > 0)) return []
  const dir = normalize(sub(b, a))
  if (dir.x === 0 && dir.y === 0) return []
  const n = perp(dir)
  // `n` is the left normal, so the cap at `b` sweeps from the right flank to the
  // left one and the cap at `a` closes the ring.
  const capStart = Math.atan2(n.y, n.x)
  const steps = Math.max(8, Math.ceil(radius * 2))
  const pts: Vec2[] = []
  const cap = (center: Vec2, from: number, to: number): void => {
    for (let i = 0; i <= steps; i++) pts.push(add(center, fromPolar(radius, from + ((to - from) * i) / steps)))
  }
  cap(b, capStart - Math.PI / 2, capStart + Math.PI / 2)
  cap(a, capStart + Math.PI / 2, capStart + (3 * Math.PI) / 2)
  // Both caps share their flank tangent points; the ring closes implicitly.
  return dedupePoints(pts).slice(0, -1)
}

// ---------------------------------------------------------------- fillet / chamfer

export interface CornerResult {
  readonly a: Vec2
  readonly b: Vec2
  readonly corner: Vec2
}

const cornerNormals = (p: Vec2, a: Vec2, b: Vec2): { readonly uA: Vec2; readonly uB: Vec2; readonly angle: number } => {
  const uA = normalize(sub(a, p))
  const uB = normalize(sub(b, p))
  const dot = Math.min(1, Math.max(-1, uA.x * uB.x + uA.y * uB.y))
  return { uA, uB, angle: Math.acos(dot) }
}

/**
 * Fillet between two segments meeting at `corner`. Returns the two tangent
 * points and the corner itself; `radius` must be positive and small enough for
 * the segments to reach the tangent points (`undefined` otherwise).
 */
export const fillet = (
  corner: Vec2,
  a: Vec2,
  b: Vec2,
  radius: number
): CornerResult | undefined => {
  if (!(radius > 0)) return undefined
  const { uA, uB, angle } = cornerNormals(corner, a, b)
  if (angle < 1e-9) return undefined
  // Distance from the corner to each tangent point: r / tan(angle / 2).
  const tangentDistance = radius / Math.tan(angle / 2)
  const lenA = distance(corner, a)
  const lenB = distance(corner, b)
  if (tangentDistance > lenA || tangentDistance > lenB) return undefined
  return {
    a: add(corner, scale(uA, tangentDistance)),
    b: add(corner, scale(uB, tangentDistance)),
    corner: { ...corner }
  }
}

/** Chamfer between two segments meeting at `corner`, cutting `distance` along each. */
export const chamfer = (corner: Vec2, a: Vec2, b: Vec2, chamferDistance: number): CornerResult | undefined => {
  const { uA, uB } = cornerNormals(corner, a, b)
  if (!(chamferDistance > 0)) return undefined
  const lenA = distance(corner, a)
  const lenB = distance(corner, b)
  const d = Math.min(chamferDistance, lenA, lenB)
  return { a: add(corner, scale(uA, d)), b: add(corner, scale(uB, d)), corner: { ...corner } }
}

// ---------------------------------------------------------------- blocks

/** Perimeter length of a closed polyline ring (sum of segment lengths). */
export const ringLength = (points: ReadonlyArray<Vec2>): number => {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 0; i < points.length; i++) total += distance(points[i]!, points[(i + 1) % points.length]!)
  return total
}

/** Signed area of a ring; positive when wound counter-clockwise. */
export const signedArea = (points: ReadonlyArray<Vec2>): number => {
  let a = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    const q = points[(i + 1) % points.length]!
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

/** Winding direction of a ring: `1` counter-clockwise, `-1` clockwise. */
export const winding = (points: ReadonlyArray<Vec2>): 1 | -1 => (signedArea(points) >= 0 ? 1 : -1)

/** Reverses the winding of a ring, keeping the first point. */
export const reverseRing = (points: ReadonlyArray<Vec2>): Vec2[] => [points[0]!, ...points.slice(1).reverse()]

/** Drops consecutive duplicate points (within `eps`). Always keeps >= 1 point. */
export const dedupePoints = (points: ReadonlyArray<Vec2>, eps = 1e-9): Vec2[] => {
  const out: Vec2[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last === undefined || distance(last, p) > eps) out.push(p)
  }
  return out
}

/** Intersection point of two infinite lines, or `undefined` when parallel. */
export const lineLineIntersection = (
  p1: Vec2,
  p2: Vec2,
  p3: Vec2,
  p4: Vec2,
  eps = 1e-12
): Vec2 | undefined => {
  const r = sub(p2, p1)
  const s = sub(p4, p3)
  const denom = cross2(r, s)
  if (Math.abs(denom) < eps) return undefined
  const t = cross2(sub(p3, p1), s) / denom
  return add(p1, scale(r, t))
}

/** Point at `t` along the segment `a`–`b` (`t` is clamped to `[0, 1]`). */
export const pointAlong = (a: Vec2, b: Vec2, t: number): Vec2 => lerp(a, b, Math.min(1, Math.max(0, t)))

/** Direction of a segment, in radians. */
export const segmentAngle = (a: Vec2, b: Vec2): number => angleOf(sub(b, a))

/** Rotates `p` around `origin` by `angle`, exported for the tool modifiers. */
export const rotateAround = (p: Vec2, origin: Vec2, angle: number): Vec2 => rotate(p, angle, origin)

/** Convenience for building a 3D position from a 2D point plus a Z. */
export const vec3Of = (p: Vec2, z: number): Vec3 => ({ x: p.x, y: p.y, z })