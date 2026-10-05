/**
 * Cursor snapping. Types and priority order mirror the legacy editor so muscle
 * memory carries over; the curve geometry comes from `intersect.ts` primitives.
 *
 * `perpendicular` and `tangent` need the point the user is drawing *from*
 * (`SnapSettings.referencePoint`); without it those types find nothing.
 */
import { distance, dot, sub, type Vec2 } from "./vec.ts"
import { angleInArc, normalizeAngle, pointOnCircle } from "./arc-math.ts"
import { type Entity } from "./entities.ts"
import { boundingBox } from "./bounds.ts"
import { type ArcPrim, curvePrimitives, intersect, onArc } from "./intersect.ts"
import { evaluateSpline } from "./spline.ts"

export const SNAP_TYPES = [
  "endpoint",
  "midpoint",
  "center",
  "intersection",
  "perpendicular",
  "tangent",
  "nearest",
  "quadrant"
] as const

export type SnapType = (typeof SNAP_TYPES)[number]

/** Snapping is disabled with `enabled: false`; `tolerance` is a screen-independent mm radius. */
export interface SnapSettings {
  readonly enabled: boolean
  /** Enabled snap types, highest priority first. */
  readonly types: ReadonlyArray<SnapType>
  readonly tolerance: number
  /** Snap to the grid when no object snap applies. */
  readonly gridEnabled: boolean
  readonly gridSpacing: number
  /** The point being drawn from; required by `perpendicular` and `tangent`. */
  readonly referencePoint?: Vec2
}

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  enabled: true,
  types: [...SNAP_TYPES],
  tolerance: 10,
  gridEnabled: false,
  gridSpacing: 10
}

export interface Snap {
  readonly type: SnapType
  readonly point: Vec2
  /** Entity the snap came from; absent for grid snaps. */
  readonly entityId?: string
  /** The snapped entity, for perpendicular and tangent markers. */
  readonly target?: Entity
}

interface Candidate {
  readonly type: SnapType
  readonly point: Vec2
  readonly entityId: string
  readonly target: Entity
}

// ---------------------------------------------------------------- helpers

const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/** Foot of the perpendicular from `p` on the segment, clamped to it; also the distance. */
const closestOnSegment = (p: Vec2, a: Vec2, b: Vec2): { point: Vec2; distance: number } => {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  const t = l2 < 1e-24 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
  const point = { x: a.x + ab.x * t, y: a.y + ab.y * t }
  return { point, distance: distance(p, point) }
}

const arcSweepOf = (arc: ArcPrim): number => {
  const raw = arc.clockwise ? normalizeAngle(arc.startAngle - arc.endAngle) : normalizeAngle(arc.endAngle - arc.startAngle)
  return raw < 1e-12 ? 2 * Math.PI : raw
}

const arcPoint = (arc: ArcPrim, fraction: number): Vec2 => {
  const dir = arc.clockwise ? -1 : 1
  return pointOnCircle(arc.center, arc.radius, arc.startAngle + dir * arcSweepOf(arc) * fraction)
}

/** Closest point on a circle (or arc) to `p`, honouring the arc's sweep. */
const closestOnArc = (p: Vec2, arc: ArcPrim | undefined, center: Vec2, radius: number): { point: Vec2; distance: number } | undefined => {
  const dx = p.x - center.x
  const dy = p.y - center.y
  const d = Math.hypot(dx, dy)
  const candidate = d < 1e-12 ? undefined : { x: center.x + (dx / d) * radius, y: center.y + (dy / d) * radius }
  if (candidate !== undefined && (arc === undefined || onArc(arc, candidate))) {
    return { point: candidate, distance: Math.abs(d - radius) }
  }
  if (arc === undefined) return undefined
  // Off the sweep: the nearest end of the arc.
  const ends = [arcPoint(arc, 0), arcPoint(arc, 1)]
  const best = ends.reduce((a, b) => (distance(p, a) <= distance(p, b) ? a : b))
  return { point: best, distance: distance(p, best) }
}

const tangentPointsFrom = (p: Vec2, center: Vec2, radius: number): Vec2[] => {
  const d = distance(p, center)
  if (d <= radius * (1 + 1e-12)) return []
  const base = Math.atan2(p.y - center.y, p.x - center.x)
  const offset = Math.acos(radius / d)
  return [pointOnCircle(center, radius, base + offset), pointOnCircle(center, radius, base - offset)]
}

const quadrantAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]

// ---------------------------------------------------------------- public helpers

/** Closest point on a polyline to `p`. */
export const closestOnPolyline = (
  points: ReadonlyArray<Vec2>,
  p: Vec2,
  closed: boolean
): { point: Vec2; distance: number; edgeIndex: number } | undefined => {
  let best: { point: Vec2; distance: number; edgeIndex: number } | undefined
  const n = closed ? points.length : points.length - 1
  for (let i = 0; i < n; i++) {
    const c = closestOnSegment(p, points[i]!, points[(i + 1) % points.length]!)
    if (best === undefined || c.distance < best.distance) best = { ...c, edgeIndex: i }
  }
  return best
}

/** Foot of the perpendicular from `p` onto the segment `a`–`b`; `undefined` when it falls outside the segment. */
export const perpendicularFoot = (p: Vec2, a: Vec2, b: Vec2): Vec2 | undefined => {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < 1e-24) return undefined
  const t = dot(sub(p, a), ab) / l2
  if (t < 0 || t > 1) return undefined
  return { x: a.x + ab.x * t, y: a.y + ab.y * t }
}

/** Both tangent points from an external point `p` to a circle (empty when `p` is inside). */
export const tangentPoints = (p: Vec2, center: Vec2, radius: number): Vec2[] => tangentPointsFrom(p, center, radius)

/** The nearer tangent point from `p` to a circle, when one exists. */
export const tangentPoint = (p: Vec2, center: Vec2, radius: number): Vec2 | undefined =>
  tangentPointsFrom(p, center, radius).sort((x, y) => distance(p, x) - distance(p, y))[0]

/** Quadrant points (0, 90, 180, 270 degrees) of a circle. */
export const quadrantPoints = (center: Vec2, radius: number): Vec2[] => quadrantAngles.map((a) => pointOnCircle(center, radius, a))

// ---------------------------------------------------------------- candidates

const entityCandidates = (entity: Entity, cursor: Vec2, reference: Vec2 | undefined): Candidate[] => {
  const out: Candidate[] = []
  const push = (type: SnapType, point: Vec2): void => {
    out.push({ type, point, entityId: entity.id, target: entity })
  }
  const prims = curvePrimitives(entity)

  // The vertices of the *source* entity, not of its tessellation, are the endpoints.
  switch (entity._tag) {
    case "Line":
      push("endpoint", entity.start)
      push("endpoint", entity.end)
      break
    case "Polyline":
      for (const p of entity.points) push("endpoint", p)
      break
    case "Rectangle":
      for (const p of [entity.corner1, { x: entity.corner2.x, y: entity.corner1.y }, entity.corner2, { x: entity.corner1.x, y: entity.corner2.y }]) push("endpoint", p)
      break
    case "Arc":
      for (const prim of prims) if (prim.kind === "arc") { push("endpoint", arcPoint(prim.value, 0)); push("endpoint", arcPoint(prim.value, 1)) }
      break
    case "Spline":
      if (!entity.closed) {
        push("endpoint", evaluateSpline(entity.controlPoints, entity.degree, false, 0, entity.knots))
        push("endpoint", evaluateSpline(entity.controlPoints, entity.degree, false, 1, entity.knots))
      }
      break
    default:
      break
  }
  if (entity._tag === "Circle" || entity._tag === "Arc" || entity._tag === "Ellipse") push("center", entity.center)
  if (entity._tag === "Rectangle") push("center", mid(entity.corner1, entity.corner2))

  for (const prim of prims) {
    switch (prim.kind) {
      case "segment": {
        if (entity._tag !== "Ellipse" && entity._tag !== "Spline") push("midpoint", mid(prim.value.a, prim.value.b))
        if (reference !== undefined && entity._tag !== "Ellipse" && entity._tag !== "Spline") {
          const foot = perpendicularFoot(reference, prim.value.a, prim.value.b)
          if (foot !== undefined) push("perpendicular", foot)
        }
        break
      }
      case "arc": {
        if (entity._tag === "Arc" || entity._tag === "Polyline") push("midpoint", arcPoint(prim.value, 0.5))
        for (const a of quadrantAngles) {
          if (entity._tag === "Arc" && angleInArc(a, prim.value.startAngle, prim.value.endAngle, prim.value.clockwise, 1e-9)) {
            push("quadrant", pointOnCircle(prim.value.center, prim.value.radius, a))
          }
        }
        if (reference !== undefined) {
          const c = prim.value.center
          const dx = reference.x - c.x
          const dy = reference.y - c.y
          if (Math.hypot(dx, dy) > 1e-12) {
            const base = Math.atan2(dy, dx)
            for (const a of [base, base + Math.PI]) {
              const p = pointOnCircle(c, prim.value.radius, a)
              if (onArc(prim.value, p)) push("perpendicular", p)
            }
          }
          for (const p of tangentPointsFrom(reference, c, prim.value.radius)) if (onArc(prim.value, p)) push("tangent", p)
        }
        break
      }
      case "circle": {
        if (entity._tag === "Circle") {
          for (const p of quadrantPoints(prim.value.center, prim.value.radius)) push("quadrant", p)
        }
        if (reference !== undefined) {
          const c = prim.value.center
          const dx = reference.x - c.x
          const dy = reference.y - c.y
          if (Math.hypot(dx, dy) > 1e-12) {
            const base = Math.atan2(dy, dx)
            for (const a of [base, base + Math.PI]) push("perpendicular", pointOnCircle(c, prim.value.radius, a))
          }
          for (const p of tangentPointsFrom(reference, c, prim.value.radius)) push("tangent", p)
        }
        break
      }
    }
  }
  if (entity._tag === "Ellipse") {
    const c = Math.cos(entity.rotation)
    const s = Math.sin(entity.rotation)
    const ax = { x: entity.radiusX * c, y: entity.radiusX * s }
    const ay = { x: -entity.radiusY * s, y: entity.radiusY * c }
    for (const p of [
      { x: entity.center.x + ax.x, y: entity.center.y + ax.y },
      { x: entity.center.x - ax.x, y: entity.center.y - ax.y },
      { x: entity.center.x + ay.x, y: entity.center.y + ay.y },
      { x: entity.center.x - ay.x, y: entity.center.y - ay.y }
    ]) push("quadrant", p)
  }

  // Nearest point on the curve to the cursor.
  let best: { point: Vec2; distance: number } | undefined
  for (const prim of prims) {
    const hit =
      prim.kind === "segment"
        ? closestOnSegment(cursor, prim.value.a, prim.value.b)
        : prim.kind === "circle"
          ? closestOnArc(cursor, undefined, prim.value.center, prim.value.radius)
          : closestOnArc(cursor, prim.value, prim.value.center, prim.value.radius)
    if (hit !== undefined && (best === undefined || hit.distance < best.distance)) best = hit
  }
  if (best !== undefined) push("nearest", best.point)
  return out
}

/**
 * Finds the highest-priority snap within `settings.tolerance` of `cursor`.
 * Priority is the order of `settings.types`; a type that is not listed is never
 * returned. Invisible entities are skipped, locked ones still snap. Grid
 * snapping is the last resort.
 */
export const findSnap = (
  entities: ReadonlyArray<Entity>,
  cursor: Vec2,
  settings: SnapSettings = DEFAULT_SNAP_SETTINGS
): Snap | undefined => {
  if (!settings.enabled) return gridSnap(cursor, settings)
  const visible = entities.filter((e) => e.visible)
  const byType = new Map<SnapType, Candidate[]>()
  const add = (c: Candidate): void => {
    if (distance(c.point, cursor) > settings.tolerance) return
    const list = byType.get(c.type)
    if (list === undefined) byType.set(c.type, [c])
    else list.push(c)
  }
  for (const entity of visible) for (const c of entityCandidates(entity, cursor, settings.referencePoint)) add(c)

  if (settings.types.includes("intersection")) {
    // Both curves must pass within the tolerance of the cursor for a hit to qualify.
    const near = visible.filter((e) => {
      if (e._tag === "Text" || e._tag === "Dimension" || e._tag === "Hatch") return false
      const b = boundingBox(e)
      return (
        cursor.x >= b.minX - settings.tolerance && cursor.x <= b.maxX + settings.tolerance &&
        cursor.y >= b.minY - settings.tolerance && cursor.y <= b.maxY + settings.tolerance
      )
    })
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        for (const p of intersect(near[i]!, near[j]!)) add({ type: "intersection", point: p, entityId: near[i]!.id, target: near[i]! })
      }
    }
  }

  for (const type of settings.types) {
    const list = byType.get(type)
    if (list === undefined || list.length === 0) continue
    let best: Candidate | undefined
    for (const c of list) if (best === undefined || distance(c.point, cursor) < distance(best.point, cursor)) best = c
    if (best !== undefined) return { type: best.type, point: best.point, entityId: best.entityId, target: best.target }
  }
  return gridSnap(cursor, settings)
}

const gridSnap = (cursor: Vec2, settings: SnapSettings): Snap | undefined => {
  if (!settings.gridEnabled || !(settings.gridSpacing > 0)) return undefined
  const s = settings.gridSpacing
  return { type: "nearest", point: { x: Math.round(cursor.x / s) * s, y: Math.round(cursor.y / s) * s } }
}

/** Outline points of an entity (tessellated at 0.05 mm), for hit-testing in the viewport. */
export const entityPoints = (entity: Entity): ReadonlyArray<Vec2> =>
  curvePrimitives(entity).flatMap((p) =>
    p.kind === "segment" ? [p.value.a, p.value.b] : p.kind === "circle" ? quadrantPoints(p.value.center, p.value.radius) : [arcPoint(p.value, 0), arcPoint(p.value, 1)]
  )

