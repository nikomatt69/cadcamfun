/**
 * Geometry input handling for the CAM operations: normalising CAD entities and
 * raw point lists into contours, plus a few planar helpers (containment, ring
 * distance, ordering). Pure and allocation-light; no Schema, no Effect.
 */
import type { Entity } from "../cad/entities.ts"
import { tessellate } from "../cad/tessellate.ts"
import { IDENTITY_AFFINE, applyTransform } from "../cad/transform.ts"
import { signedArea } from "../cad/shapes.ts"
import { distance, type Vec2 } from "../cad/vec.ts"

/** A planar chain of points. A closed contour does not repeat its first point. */
export interface Contour {
  readonly points: ReadonlyArray<Vec2>
  readonly closed: boolean
}

/**
 * What an operation accepts as geometry: a CAD entity, a contour, a raw closed
 * ring (`Vec2[]`), or a list of entities/contours.
 */
export type GeometryInput = Entity | Contour | ReadonlyArray<Vec2> | ReadonlyArray<Entity | Contour>

/** Source curve with its exact definition, so circular geometry can stay circular. */
export type Source =
  | { readonly kind: "circle"; readonly center: Vec2; readonly radius: number }
  | {
      readonly kind: "arc"
      readonly center: Vec2
      readonly radius: number
      readonly startAngle: number
      readonly endAngle: number
      readonly clockwise: boolean
    }
  | { readonly kind: "contour"; readonly contour: Contour }

const isEntity = (g: unknown): g is Entity => typeof g === "object" && g !== null && "_tag" in g
const isContour = (g: unknown): g is Contour => typeof g === "object" && g !== null && "points" in g && "closed" in g
const isVec2 = (g: unknown): g is Vec2 => typeof g === "object" && g !== null && "x" in g && "y" in g && !("_tag" in g)

/** Removes consecutive duplicates (and a repeated closing point). */
export const cleanPoints = (points: ReadonlyArray<Vec2>, closed: boolean, eps = 1e-9): Vec2[] => {
  const out: Vec2[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last === undefined || distance(last, p) > eps) out.push({ x: p.x, y: p.y })
  }
  if (closed && out.length > 1 && distance(out[0]!, out[out.length - 1]!) <= eps) out.pop()
  return out
}

const contourSource = (points: ReadonlyArray<Vec2>, closed: boolean): Source[] => {
  const cleaned = cleanPoints(points, closed)
  if (cleaned.length < (closed ? 3 : 2)) return []
  return [{ kind: "contour", contour: { points: cleaned, closed } }]
}

const entitySources = (entity: Entity, tolerance: number, offset: Vec2 = { x: 0, y: 0 }): Source[] => {
  const e = entity.transform === undefined ? entity : applyTransform(entity, IDENTITY_AFFINE)
  const shift = (p: Vec2): Vec2 => ({ x: p.x + offset.x, y: p.y + offset.y })
  switch (e._tag) {
    case "Circle":
      return [{ kind: "circle", center: shift(e.center), radius: e.radius }]
    case "Arc":
      return [
        {
          kind: "arc",
          center: shift(e.center),
          radius: e.radius,
          startAngle: e.startAngle,
          endAngle: e.endAngle,
          clockwise: e.clockwise
        }
      ]
    case "Block": {
      const base = { x: offset.x + e.basePoint.x, y: offset.y + e.basePoint.y }
      return e.entities.flatMap((child) => entitySources(child, tolerance, base))
    }
    case "Text":
    case "Dimension":
      return []
    case "Line":
    case "Polyline":
    case "Rectangle":
    case "Ellipse":
    case "Spline":
    case "Hatch": {
      const closed = e._tag === "Line" ? false : e._tag === "Polyline" || e._tag === "Spline" ? e.closed : true
      return tessellate(e, tolerance).flatMap((ring) => contourSource(ring.map(shift), closed))
    }
  }
}

/** Normalises any accepted geometry input to exact sources. */
export const sourcesOf = (geometry: GeometryInput, tolerance = 0.01): Source[] => {
  if (isEntity(geometry)) return entitySources(geometry, tolerance)
  if (isContour(geometry)) return contourSource(geometry.points, geometry.closed)
  const list = geometry as ReadonlyArray<unknown>
  if (list.length === 0) return []
  if (isVec2(list[0])) return contourSource(list as ReadonlyArray<Vec2>, true)
  return list.flatMap((item) =>
    isEntity(item) ? entitySources(item, tolerance) : isContour(item) ? contourSource(item.points, item.closed) : []
  )
}

/** Tessellates a source into a contour (circles/arcs within `tolerance`). */
export const sourceToContour = (source: Source, tolerance: number): Contour => {
  switch (source.kind) {
    case "contour":
      return source.contour
    case "circle": {
      const n = Math.max(8, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - tolerance / source.radius))))
      const pts: Vec2[] = []
      for (let i = 0; i < n; i++) {
        const a = (i * 2 * Math.PI) / n
        pts.push({ x: source.center.x + source.radius * Math.cos(a), y: source.center.y + source.radius * Math.sin(a) })
      }
      return { points: pts, closed: true }
    }
    case "arc": {
      let sweep = source.clockwise ? source.startAngle - source.endAngle : source.endAngle - source.startAngle
      sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      if (sweep === 0) sweep = 2 * Math.PI
      const step = 2 * Math.acos(Math.max(0, 1 - tolerance / source.radius))
      const n = Math.max(1, Math.ceil(sweep / Math.max(step, 1e-6)))
      const pts: Vec2[] = []
      const dir = source.clockwise ? -1 : 1
      for (let i = 0; i <= n; i++) {
        const a = source.startAngle + (dir * sweep * i) / n
        pts.push({ x: source.center.x + source.radius * Math.cos(a), y: source.center.y + source.radius * Math.sin(a) })
      }
      return { points: pts, closed: false }
    }
  }
}

export const contoursOf = (geometry: GeometryInput, tolerance = 0.01): Contour[] =>
  sourcesOf(geometry, tolerance).map((s) => sourceToContour(s, tolerance))

// ---------------------------------------------------------------- region (pocket) input

/** Closed boundary with islands, as a pocket sees its geometry. */
export interface Region {
  readonly boundary: ReadonlyArray<Vec2>
  readonly islands: ReadonlyArray<ReadonlyArray<Vec2>>
}

export type RegionInput = GeometryInput | { readonly boundary: GeometryInput; readonly islands?: ReadonlyArray<GeometryInput> }

/** Even-odd point-in-ring test. */
export const pointInRing = (p: Vec2, ring: ReadonlyArray<Vec2>): boolean => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside
  }
  return inside
}

/** Shortest distance from `p` to the boundary of a ring (or to an open chain). */
export const distanceToChain = (p: Vec2, points: ReadonlyArray<Vec2>, closed: boolean): number => {
  let best = Infinity
  const n = points.length
  const count = closed ? n : n - 1
  for (let i = 0; i < count; i++) {
    const a = points[i]!
    const b = points[(i + 1) % n]!
    const abx = b.x - a.x
    const aby = b.y - a.y
    const len2 = abx * abx + aby * aby
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2))
    const d = Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t))
    if (d < best) best = d
  }
  return best
}

/** Boundary and islands of a pocket input. Plain contour lists use the largest ring as the boundary. */
export const regionOf = (input: RegionInput, tolerance = 0.01): Region | undefined => {
  if (typeof input === "object" && input !== null && "boundary" in input && !isEntity(input)) {
    const boundaryRings = contoursOf(input.boundary, tolerance).filter((c) => c.closed)
    const boundary = boundaryRings[0]
    if (boundary === undefined) return undefined
    const islands = (input.islands ?? [])
      .flatMap((g) => contoursOf(g, tolerance))
      .filter((c) => c.closed)
      .map((c) => c.points)
    return { boundary: boundary.points, islands }
  }
  const rings = contoursOf(input as GeometryInput, tolerance).filter((c) => c.closed)
  if (rings.length === 0) return undefined
  let outer = rings[0]!
  for (const r of rings) if (Math.abs(signedArea(r.points)) > Math.abs(signedArea(outer.points))) outer = r
  const islands = rings.filter((r) => r !== outer && pointInRing(r.points[0]!, outer.points)).map((r) => r.points)
  return { boundary: outer.points, islands }
}

// ---------------------------------------------------------------- ordering

/**
 * Nearest-neighbour ordering of points: keeps rapids short. Deterministic: ties
 * resolve to the earlier input index.
 */
export const nearestNeighbourOrder = (points: ReadonlyArray<Vec2>, from: Vec2 = { x: 0, y: 0 }): Vec2[] => {
  const remaining = points.map((p) => ({ x: p.x, y: p.y }))
  const out: Vec2[] = []
  let current = from
  while (remaining.length > 0) {
    let bestIndex = 0
    let bestDistance = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = distance(current, remaining[i]!)
      if (d < bestDistance - 1e-12) {
        bestDistance = d
        bestIndex = i
      }
    }
    const [next] = remaining.splice(bestIndex, 1)
    out.push(next!)
    current = next!
  }
  return out
}

/**
 * Nearest-neighbour order improved by 2-opt: reversing a span of the visit order whenever that shortens the total
 * rapid travel from `from`, until no reversal helps. Deterministic (the first improving reversal, scanned in
 * order, wins each pass) and never longer than the nearest-neighbour order it starts from.
 */
export const optimizedOrder = (points: ReadonlyArray<Vec2>, from: Vec2 = { x: 0, y: 0 }): Vec2[] => {
  const order = nearestNeighbourOrder(points, from)
  const n = order.length
  if (n < 3) return order
  const at = (i: number): Vec2 => (i < 0 ? from : order[i]!)
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < n - 1 && !improved; i++) {
      for (let j = i + 1; j < n; j++) {
        const before = distance(at(i - 1), at(i)) + (j + 1 < n ? distance(at(j), at(j + 1)) : 0)
        const after = distance(at(i - 1), at(j)) + (j + 1 < n ? distance(at(i), at(j + 1)) : 0)
        if (after < before - 1e-9) {
          for (let a = i, b = j; a < b; a++, b--) { const held = order[a]!; order[a] = order[b]!; order[b] = held }
          improved = true
          break
        }
      }
    }
  }
  return order
}

/** Whether `p` lies within the axis-aligned box. */
export const insideBox = (p: Vec2, minX: number, minY: number, maxX: number, maxY: number, margin = 0): boolean =>
  p.x >= minX - margin && p.x <= maxX + margin && p.y >= minY - margin && p.y <= maxY + margin

