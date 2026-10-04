import { Match, Schema } from "effect"
import * as G from "./geometry"
import { ElementId, LayerId } from "./ids"

const meta = {
  name: Schema.optional(Schema.String),
  color: Schema.optional(Schema.String),
}
const base = { id: ElementId, layerId: LayerId, ...meta }
/** Inputs omit identity: ids are assigned on insert, layer defaults to the active one. */
const inputBase = { layerId: Schema.optional(LayerId), ...meta }

const shapes = {
  Line: { start: G.Vec2, end: G.Vec2 },
  Circle: { center: G.Vec2, radius: G.Positive },
  /** Arc from `startAngle` to `endAngle`, in degrees, counter-clockwise. */
  Arc: { center: G.Vec2, radius: G.Positive, startAngle: Schema.Finite, endAngle: Schema.Finite },
  /** Axis-aligned rectangle; `origin` is the lower-left corner. */
  Rectangle: { origin: G.Vec2, width: G.Positive, height: G.Positive },
  Polyline: { points: Schema.Array(G.Vec2).check(Schema.isMinLength(2)), closed: Schema.Boolean },
  /** A single location, typically a drill position. */
  Point: { position: G.Vec2 },
  /** 3D solids, used for stock/fixtures and 3D preview. Their 2D profile is their XY footprint. */
  Box: { origin: G.Vec3, size: G.Vec3 },
  Cylinder: { base: G.Vec3, radius: G.Positive, height: G.Positive },
  Sphere: { center: G.Vec3, radius: G.Positive },
} as const

export const Line = Schema.TaggedStruct("Line", { ...base, ...shapes.Line })
export const Circle = Schema.TaggedStruct("Circle", { ...base, ...shapes.Circle })
export const Arc = Schema.TaggedStruct("Arc", { ...base, ...shapes.Arc })
export const Rectangle = Schema.TaggedStruct("Rectangle", { ...base, ...shapes.Rectangle })
export const Polyline = Schema.TaggedStruct("Polyline", { ...base, ...shapes.Polyline })
export const Point = Schema.TaggedStruct("Point", { ...base, ...shapes.Point })
export const Box = Schema.TaggedStruct("Box", { ...base, ...shapes.Box })
export const Cylinder = Schema.TaggedStruct("Cylinder", { ...base, ...shapes.Cylinder })
export const Sphere = Schema.TaggedStruct("Sphere", { ...base, ...shapes.Sphere })

export const Element = Schema.Union([Line, Circle, Arc, Rectangle, Polyline, Point, Box, Cylinder, Sphere])

/** Element payload without identity: what users and the AI agent provide to create shapes. */
export const ElementInput = Schema.Union([
  Schema.TaggedStruct("Line", { ...inputBase, ...shapes.Line }),
  Schema.TaggedStruct("Circle", { ...inputBase, ...shapes.Circle }),
  Schema.TaggedStruct("Arc", { ...inputBase, ...shapes.Arc }),
  Schema.TaggedStruct("Rectangle", { ...inputBase, ...shapes.Rectangle }),
  Schema.TaggedStruct("Polyline", { ...inputBase, ...shapes.Polyline }),
  Schema.TaggedStruct("Point", { ...inputBase, ...shapes.Point }),
  Schema.TaggedStruct("Box", { ...inputBase, ...shapes.Box }),
  Schema.TaggedStruct("Cylinder", { ...inputBase, ...shapes.Cylinder }),
  Schema.TaggedStruct("Sphere", { ...inputBase, ...shapes.Sphere }),
])
export type ElementInput = typeof ElementInput.Type
export type Element = typeof Element.Type
export type ElementTag = Element["_tag"]

export type Line = typeof Line.Type
export type Circle = typeof Circle.Type
export type Arc = typeof Arc.Type
export type Rectangle = typeof Rectangle.Type
export type Polyline = typeof Polyline.Type
export type Point = typeof Point.Type
export type Box = typeof Box.Type
export type Cylinder = typeof Cylinder.Type
export type Sphere = typeof Sphere.Type

export const elementTags: ReadonlyArray<ElementTag> = [
  "Line",
  "Circle",
  "Arc",
  "Rectangle",
  "Polyline",
  "Point",
  "Box",
  "Cylinder",
  "Sphere",
]

/** A flattened 2D path: what CAM and the 2D renderer consume. */
export interface Path {
  readonly points: ReadonlyArray<G.Vec2>
  readonly closed: boolean
}

const rectPoints = (r: { origin: G.Vec2; width: number; height: number }): Array<G.Vec2> => [
  r.origin,
  { x: r.origin.x + r.width, y: r.origin.y },
  { x: r.origin.x + r.width, y: r.origin.y + r.height },
  { x: r.origin.x, y: r.origin.y + r.height },
]

const circlePath = (center: G.Vec2, radius: number): Path => {
  const pts = G.sampleArc(center, radius, 0, Math.PI * 2, 72)
  pts.pop()
  return { points: pts, closed: true }
}

/** Flatten an element into polylines in the XY plane. */
export const toPaths: (element: Element) => ReadonlyArray<Path> = Match.type<Element>().pipe(
  Match.tagsExhaustive({
    Line: (e) => [{ points: [e.start, e.end], closed: false }],
    Circle: (e) => [circlePath(e.center, e.radius)],
    Arc: (e) => [
      { points: G.sampleArc(e.center, e.radius, G.degToRad(e.startAngle), G.degToRad(e.endAngle)), closed: false },
    ],
    Rectangle: (e) => [{ points: rectPoints(e), closed: true }],
    Polyline: (e) => [{ points: e.points, closed: e.closed }],
    Point: (e) => [{ points: [e.position], closed: false }],
    Box: (e) => [
      {
        points: rectPoints({ origin: { x: e.origin.x, y: e.origin.y }, width: e.size.x, height: e.size.y }),
        closed: true,
      },
    ],
    Cylinder: (e) => [circlePath({ x: e.base.x, y: e.base.y }, e.radius)],
    Sphere: (e) => [circlePath({ x: e.center.x, y: e.center.y }, e.radius)],
  }),
)

export const boundsOf = (element: Element): G.Bounds | undefined => {
  switch (element._tag) {
    case "Circle":
      return {
        min: { x: element.center.x - element.radius, y: element.center.y - element.radius },
        max: { x: element.center.x + element.radius, y: element.center.y + element.radius },
      }
    default:
      return G.boundsOf(toPaths(element).flatMap((p) => p.points))
  }
}

/** True when the element encloses an area (pockets, profiles). */
export const isClosed = (element: Element): boolean =>
  element._tag === "Polyline"
    ? element.closed
    : element._tag !== "Line" && element._tag !== "Arc" && element._tag !== "Point"

/** Enclosed area in square document units (0 for open elements). */
export const area = (element: Element): number => {
  switch (element._tag) {
    case "Circle":
      return Math.PI * element.radius ** 2
    case "Rectangle":
      return element.width * element.height
    case "Cylinder":
      return Math.PI * element.radius ** 2
    case "Sphere":
      return Math.PI * element.radius ** 2
    case "Box":
      return element.size.x * element.size.y
    case "Polyline":
      return element.closed ? Math.abs(G.signedArea(element.points)) : 0
    default:
      return 0
  }
}

/** Perimeter / length of the element's 2D profile. */
export const perimeter = (element: Element): number => {
  switch (element._tag) {
    case "Circle":
    case "Cylinder":
    case "Sphere":
      return 2 * Math.PI * element.radius
    case "Arc": {
      let sweep = element.endAngle - element.startAngle
      while (sweep <= 0) sweep += 360
      return G.degToRad(sweep) * element.radius
    }
    default:
      return toPaths(element).reduce((sum, p) => sum + G.polylineLength(p.points, p.closed), 0)
  }
}
