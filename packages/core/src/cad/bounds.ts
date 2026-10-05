/**
 * Exact axis-aligned bounding boxes for every entity. Arcs and rotated ellipses
 * include their analytic axis extrema; splines use the convex hull of the
 * control points (an over-estimate, which the spec documents as acceptable).
 */
import { type Vec2 } from "./vec.ts"
import { arcSweep, bulgeToArc, normalizeAngle } from "./arc-math.ts"
import { rectCorners } from "./shapes.ts"
import type { Bounds2D } from "./box.ts"
import { boundsOfPoints, emptyBounds, unionBox } from "./box.ts"
import type { Entity } from "./entities.ts"

/** Analytic bounds of a circular arc: axis extrema that lie inside the sweep. */
export const arcBounds = (
  center: Vec2,
  radius: number,
  startAngle: number,
  endAngle: number,
  clockwise: boolean
): Bounds2D => {
  const sweep = arcSweep(startAngle, endAngle, clockwise)
  // The sweep, walked in its own direction, always starts at `startAngle`.
  const endAngleWalked = clockwise ? normalizeAngle(startAngle - sweep) : normalizeAngle(startAngle + sweep)
  const candidates: Array<number> = [startAngle, endAngleWalked]
  const rel = (a: number): number => (clockwise ? normalizeAngle(startAngle - a) : normalizeAngle(a - startAngle))
  for (const a of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    if (rel(a) <= sweep + 1e-12) candidates.push(a)
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const a of candidates) {
    const x = center.x + radius * Math.cos(a)
    const y = center.y + radius * Math.sin(a)
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/** Analytic bounds of a rotated ellipse: `|R·e|` per axis. */
export const ellipseBounds = (
  center: Vec2,
  radiusX: number,
  radiusY: number,
  rotation: number
): Bounds2D => {
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  const dx = Math.hypot(radiusX * c, radiusY * s)
  const dy = Math.hypot(radiusX * s, radiusY * c)
  return { minX: center.x - dx, minY: center.y - dy, maxX: center.x + dx, maxY: center.y + dy }
}

/** Bounding box of a single entity, in the entity's own coordinate space. */
export const boundingBox = (entity: Entity): Bounds2D => {
  switch (entity._tag) {
    case "Line":
      return boundsOfPoints([entity.start, entity.end])
    case "Circle":
      return {
        minX: entity.center.x - entity.radius,
        minY: entity.center.y - entity.radius,
        maxX: entity.center.x + entity.radius,
        maxY: entity.center.y + entity.radius
      }
    case "Arc":
      return arcBounds(entity.center, entity.radius, entity.startAngle, entity.endAngle, entity.clockwise)
    case "Rectangle":
      return boundsOfPoints(rectCorners(entity.corner1, entity.corner2))
    case "Ellipse":
      return ellipseBounds(entity.center, entity.radiusX, entity.radiusY, entity.rotation)
    case "Polyline": {
      // Bulged segments bow outwards: add the extrema of every arc segment.
      let box = boundsOfPoints(entity.points)
      const n = entity.points.length
      const count = entity.closed ? n : n - 1
      for (let i = 0; i < count; i++) {
        const arc = bulgeToArc(entity.points[i]!, entity.points[(i + 1) % n]!, entity.bulge?.[i] ?? 0)
        if (arc === undefined) continue
        box = unionBox(
          box,
          arcBounds(arc.center, arc.radius, arc.startAngle, normalizeAngle(arc.startAngle + arc.sweep), arc.sweep < 0)
        )
      }
      return box
    }
    case "Spline":
      return boundsOfPoints(entity.controlPoints)
    case "Text": {
      // Glyph metrics belong to the renderer, so the box is deliberately generous:
      // one font size tall and 0.6 em per character wide.
      const w = entity.text.length * entity.fontSize * 0.6
      const h = entity.fontSize
      const x0 = entity.alignment === "left"
        ? entity.position.x
        : entity.alignment === "right"
        ? entity.position.x - w
        : entity.position.x - w / 2
      const y0 = entity.baseline === "top"
        ? entity.position.y - h
        : entity.baseline === "bottom"
        ? entity.position.y
        : entity.position.y - h / 2
      return { minX: x0, minY: y0, maxX: x0 + w, maxY: y0 + h }
    }
    case "Dimension":
      return boundsOfPoints([entity.start, entity.end, entity.textPosition])
    case "Hatch":
      return boundsOfPoints(entity.boundary)
    case "Block": {
      const at = (b: Bounds2D): Bounds2D => ({
        minX: b.minX + entity.basePoint.x,
        minY: b.minY + entity.basePoint.y,
        maxX: b.maxX + entity.basePoint.x,
        maxY: b.maxY + entity.basePoint.y
      })
      if (entity.entities.length === 0) return at(boundsOfPoints([entity.basePoint]))
      let acc = at(boundingBox(entity.entities[0]!))
      for (let i = 1; i < entity.entities.length; i++) acc = unionBox(acc, at(boundingBox(entity.entities[i]!)))
      return acc
    }
  }
}

/** Union of many boxes; empty input yields an inverted (empty) box. */
export const unionBounds = (boxes: ReadonlyArray<Bounds2D>): Bounds2D => {
  let acc = emptyBounds()
  for (const b of boxes) acc = unionBox(acc, b)
  return acc
}

/** Bounding box of a whole drawing, including nested block children. */
export const boundsOfDrawing = (entities: ReadonlyArray<Entity>): Bounds2D =>
  unionBounds(entities.map(boundingBox))