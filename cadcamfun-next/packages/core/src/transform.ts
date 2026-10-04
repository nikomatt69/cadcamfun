import { Schema } from "effect"
import type { Element } from "./element"
import { toPaths } from "./element"
import * as G from "./geometry"

/** A 2D transform applied in the XY plane (Z is untouched). */
export const Transform = Schema.Union([
  Schema.TaggedStruct("Translate", { dx: Schema.Finite, dy: Schema.Finite }),
  /** Rotation in degrees, counter-clockwise, around `origin`. */
  Schema.TaggedStruct("Rotate", { angle: Schema.Finite, origin: G.Vec2 }),
  Schema.TaggedStruct("Scale", { sx: G.Positive, sy: G.Positive, origin: G.Vec2 }),
])
export type Transform = typeof Transform.Type

const mapPoint =
  (t: Transform) =>
  (p: G.Vec2): G.Vec2 => {
    switch (t._tag) {
      case "Translate":
        return { x: p.x + t.dx, y: p.y + t.dy }
      case "Rotate":
        return G.rotate(p, G.degToRad(t.angle), t.origin)
      case "Scale":
        return { x: t.origin.x + (p.x - t.origin.x) * t.sx, y: t.origin.y + (p.y - t.origin.y) * t.sy }
    }
  }

const map3 = (t: Transform, p: G.Vec3): G.Vec3 => ({ ...mapPoint(t)({ x: p.x, y: p.y }), z: p.z })

/** Rotations by multiples of 90° keep axis-aligned shapes axis-aligned. */
const axisAligned = (t: Transform): boolean => {
  if (t._tag !== "Rotate") return true
  const r = ((t.angle % 90) + 90) % 90
  return r < 1e-9 || 90 - r < 1e-9
}

/** Convert any element into an equivalent closed/open polyline (used when a transform breaks its shape class). */
const asPolyline = (e: Element): Element => {
  const path = toPaths(e)[0]!
  return {
    _tag: "Polyline",
    id: e.id,
    layerId: e.layerId,
    name: e.name,
    color: e.color,
    points: path.points,
    closed: path.closed,
  }
}

/**
 * Apply a transform to an element. Shape class is preserved when the result is still representable
 * (e.g. a circle stays a circle under uniform scale); otherwise the element becomes a polyline.
 */
export const apply = (element: Element, t: Transform): Element => {
  const f = mapPoint(t)
  const uniform = t._tag !== "Scale" || Math.abs(t.sx - t.sy) < G.EPSILON
  const k = t._tag === "Scale" ? t.sx : 1
  switch (element._tag) {
    case "Line":
      return { ...element, start: f(element.start), end: f(element.end) }
    case "Polyline":
      return { ...element, points: element.points.map(f) }
    case "Point":
      return { ...element, position: f(element.position) }
    case "Circle":
      return uniform
        ? { ...element, center: f(element.center), radius: element.radius * k }
        : apply(asPolyline(element), t)
    case "Arc": {
      if (!uniform) return apply(asPolyline(element), t)
      const da = t._tag === "Rotate" ? t.angle : 0
      return {
        ...element,
        center: f(element.center),
        radius: element.radius * k,
        startAngle: element.startAngle + da,
        endAngle: element.endAngle + da,
      }
    }
    case "Rectangle": {
      if (!axisAligned(t)) return apply(asPolyline(element), t)
      const a = f(element.origin)
      const b = f({ x: element.origin.x + element.width, y: element.origin.y + element.height })
      return {
        ...element,
        origin: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
      }
    }
    case "Box": {
      if (!axisAligned(t)) return apply(asPolyline(element), t)
      const a = f(element.origin)
      const b = f({ x: element.origin.x + element.size.x, y: element.origin.y + element.size.y })
      return {
        ...element,
        origin: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: element.origin.z },
        size: { x: Math.abs(b.x - a.x), y: Math.abs(b.y - a.y), z: element.size.z },
      }
    }
    case "Cylinder":
      return uniform
        ? { ...element, base: map3(t, element.base), radius: element.radius * k }
        : apply(asPolyline(element), t)
    case "Sphere":
      return uniform
        ? { ...element, center: map3(t, element.center), radius: element.radius * k }
        : apply(asPolyline(element), t)
  }
}

export const translate = (dx: number, dy: number): Transform => ({ _tag: "Translate", dx, dy })
export const rotate = (angle: number, origin: G.Vec2 = { x: 0, y: 0 }): Transform => ({ _tag: "Rotate", angle, origin })
export const scale = (sx: number, sy: number = sx, origin: G.Vec2 = { x: 0, y: 0 }): Transform => ({
  _tag: "Scale",
  sx,
  sy,
  origin,
})
