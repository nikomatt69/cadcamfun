/**
 * Schema-first 2D entities, discriminated by `_tag`, and the `Drawing`
 * document stored in `Drawing.data`.
 *
 * Geometry is always stored in millimetres and angles in radians. Selection
 * state is intentionally not part of an entity (it lives in UI state).
 */
import { Schema } from "effect"
import { normalizeAngle } from "./arc-math.ts"
import { TAU } from "./vec.ts"

// ---------------------------------------------------------------- scalars

/** Any finite number (rejects NaN and ±Infinity). */
const Num = Schema.Finite
const PositiveNum = Schema.Finite.check(Schema.isGreaterThan(0))
const NonNegativeNum = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
/** Angle normalised to `[0, 2π)`; use `normalizeAngle` when constructing. */
const NormalizedAngle = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThan(TAU)
)

export const Vec2Schema = Schema.Struct({ x: Num, y: Num })
export const Vec3Schema = Schema.Struct({ x: Num, y: Num, z: Num })

const Point = Vec2Schema

// ---------------------------------------------------------------- styling

export const ColorSchema = Schema.Struct({
  r: Num.check(Schema.isBetween({ minimum: 0, maximum: 255 })),
  g: Num.check(Schema.isBetween({ minimum: 0, maximum: 255 })),
  b: Num.check(Schema.isBetween({ minimum: 0, maximum: 255 })),
  a: Schema.optionalKey(Num.check(Schema.isBetween({ minimum: 0, maximum: 1 })))
})
export type Color = typeof ColorSchema.Type

export const LineTypeSchema = Schema.Literals(["continuous", "dashed", "dotted", "center", "phantom"])
export type LineType = typeof LineTypeSchema.Type

export const LineStyleSchema = Schema.Struct({
  color: ColorSchema,
  width: NonNegativeNum,
  type: LineTypeSchema
})
export type LineStyle = typeof LineStyleSchema.Type

/**
 * Local-to-world transform of an entity: scale, then rotate, then translate.
 * Composite transforms (which may contain shear) use `Affine2D` in
 * `transform.ts` instead.
 */
export const Transform2DSchema = Schema.Struct({
  translation: Vec2Schema,
  rotation: Num,
  scale: Vec2Schema
})
export type Transform2D = typeof Transform2DSchema.Type

// ---------------------------------------------------------------- entities

const baseFields = {
  id: Schema.String.check(Schema.isMinLength(1)),
  layerId: Schema.String,
  visible: Schema.Boolean,
  locked: Schema.Boolean,
  lineStyle: Schema.optionalKey(LineStyleSchema),
  transform: Schema.optionalKey(Transform2DSchema),
  userData: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown))
}

export const LineSchema = Schema.TaggedStruct("Line", {
  ...baseFields,
  start: Point,
  end: Point
})

export const CircleSchema = Schema.TaggedStruct("Circle", {
  ...baseFields,
  center: Point,
  radius: PositiveNum
})

/**
 * Circular arc. The sweep runs from `startAngle` to `endAngle` counter-clockwise
 * (or clockwise when `clockwise` is set). `startAngle === endAngle` denotes a
 * full circle.
 */
export const ArcSchema = Schema.TaggedStruct("Arc", {
  ...baseFields,
  center: Point,
  radius: PositiveNum,
  startAngle: NormalizedAngle,
  endAngle: NormalizedAngle,
  clockwise: Schema.Boolean
})

/**
 * Polyline. `bulge[i]` belongs to the segment from `points[i]` to
 * `points[i + 1]` (for a closed polyline, the last entry belongs to the
 * closing segment). `bulge = tan(sweep / 4)`, positive = counter-clockwise.
 * When present, `bulge` must have exactly one entry per point.
 */
export const PolylineSchema = Schema.TaggedStruct("Polyline", {
  ...baseFields,
  points: Schema.Array(Point).check(Schema.isMinLength(2)),
  closed: Schema.Boolean,
  bulge: Schema.optionalKey(Schema.Array(Num))
}).check(
  Schema.makeFilter((p) =>
    p.bulge === undefined || p.bulge.length === p.points.length
      ? undefined
      : { path: ["bulge"], issue: "bulge must have exactly one entry per point" }
  )
)

export const RectangleSchema = Schema.TaggedStruct("Rectangle", {
  ...baseFields,
  corner1: Point,
  corner2: Point
})

export const EllipseSchema = Schema.TaggedStruct("Ellipse", {
  ...baseFields,
  center: Point,
  radiusX: PositiveNum,
  radiusY: PositiveNum,
  rotation: Num
})

/**
 * B-spline. Open splines use `knots` when given (length `n + degree + 1`),
 * otherwise a clamped uniform knot vector. Closed splines are uniform periodic
 * (the control points wrap around) and ignore `knots`.
 */
export const SplineSchema = Schema.TaggedStruct("Spline", {
  ...baseFields,
  controlPoints: Schema.Array(Point).check(Schema.isMinLength(2)),
  degree: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 })),
  closed: Schema.Boolean,
  knots: Schema.optionalKey(Schema.Array(Num))
})

export const TextAlignmentSchema = Schema.Literals(["left", "center", "right"])
export const TextBaselineSchema = Schema.Literals(["top", "middle", "bottom"])

export const TextSchema = Schema.TaggedStruct("Text", {
  ...baseFields,
  position: Point,
  text: Schema.String,
  fontSize: PositiveNum,
  fontFamily: Schema.String,
  rotation: Num,
  alignment: TextAlignmentSchema,
  baseline: TextBaselineSchema
})

export const DimensionTypeSchema = Schema.Literals(["linear", "aligned", "angular", "radial", "diameter"])

export const DimensionSchema = Schema.TaggedStruct("Dimension", {
  ...baseFields,
  start: Point,
  end: Point,
  text: Schema.String,
  textPosition: Point,
  arrowSize: NonNegativeNum,
  textSize: PositiveNum,
  dimensionType: DimensionTypeSchema
})

export const HatchPatternSchema = Schema.Literals(["solid", "lines", "dots", "cross"])

export const HatchSchema = Schema.TaggedStruct("Hatch", {
  ...baseFields,
  boundary: Schema.Array(Point).check(Schema.isMinLength(3)),
  pattern: HatchPatternSchema,
  scale: PositiveNum,
  angle: Num,
  fillColor: Schema.optionalKey(Schema.String)
})

// ---------------------------------------------------------------- types

export type LineEntity = typeof LineSchema.Type
export type CircleEntity = typeof CircleSchema.Type
export type ArcEntity = typeof ArcSchema.Type
export type PolylineEntity = typeof PolylineSchema.Type
export type RectangleEntity = typeof RectangleSchema.Type
export type EllipseEntity = typeof EllipseSchema.Type
export type SplineEntity = typeof SplineSchema.Type
export type TextEntity = typeof TextSchema.Type
export type DimensionEntity = typeof DimensionSchema.Type
export type HatchEntity = typeof HatchSchema.Type

type BaseFieldsType = Schema.Struct.Type<typeof baseFields>

/** Group of entities. Children are block-local: they are placed at `basePoint` (world = local + basePoint). */
export interface BlockEntity extends BaseFieldsType {
  readonly _tag: "Block"
  readonly name: string
  readonly basePoint: { readonly x: number; readonly y: number }
  readonly entities: ReadonlyArray<Entity>
}

export type Entity =
  | LineEntity
  | CircleEntity
  | ArcEntity
  | PolylineEntity
  | RectangleEntity
  | EllipseEntity
  | SplineEntity
  | TextEntity
  | DimensionEntity
  | HatchEntity
  | BlockEntity

export type EntityTag = Entity["_tag"]

export const BlockSchema: Schema.Codec<BlockEntity> = Schema.TaggedStruct("Block", {
  ...baseFields,
  name: Schema.String,
  basePoint: Point,
  entities: Schema.Array(Schema.suspend((): Schema.Codec<Entity> => EntitySchema))
})

export const EntitySchema: Schema.Codec<Entity> = Schema.Union([
  LineSchema,
  CircleSchema,
  ArcSchema,
  PolylineSchema,
  RectangleSchema,
  EllipseSchema,
  SplineSchema,
  TextSchema,
  DimensionSchema,
  HatchSchema,
  BlockSchema
])

export const ENTITY_TAGS: ReadonlyArray<EntityTag> = [
  "Line",
  "Circle",
  "Arc",
  "Polyline",
  "Rectangle",
  "Ellipse",
  "Spline",
  "Text",
  "Dimension",
  "Hatch",
  "Block"
]

/** Schema validators/codecs for entities. */
export const decodeEntity = Schema.decodeUnknownEffect(EntitySchema)
export const encodeEntity = Schema.encodeEffect(EntitySchema)
export const isEntity = Schema.is(EntitySchema)

/** Whether the entity outlines a closed region (usable as a pocket/profile boundary). */
export const isClosedShape = (entity: Entity): boolean => {
  switch (entity._tag) {
    case "Circle":
    case "Rectangle":
    case "Ellipse":
    case "Hatch":
      return true
    case "Polyline":
    case "Spline":
      return entity.closed
    case "Line":
    case "Arc":
    case "Text":
    case "Dimension":
    case "Block":
      return false
  }
}

// ---------------------------------------------------------------- drawing

export const UnitsSchema = Schema.Literals(["mm", "inch"])
export type Units = typeof UnitsSchema.Type

export const LayerSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  visible: Schema.Boolean,
  locked: Schema.Boolean,
  /** CSS colour string (usually `#rrggbb`). */
  color: Schema.String
})
export type Layer = typeof LayerSchema.Type

/** Current on-disk format version of the `Drawing` document. */
export const CURRENT_SCHEMA_VERSION = 1

/**
 * The document stored in `Drawing.data`. Geometry is always in millimetres;
 * `units` is only the user's display preference. `version` is the document
 * revision counter; `schemaVersion` is the format version (see `migrateDrawing`).
 */
export const DrawingSchema = Schema.Struct({
  schemaVersion: Schema.Literal(CURRENT_SCHEMA_VERSION),
  id: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  units: UnitsSchema,
  layers: Schema.Array(LayerSchema),
  entities: Schema.Array(EntitySchema),
  version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
})
export type Drawing = typeof DrawingSchema.Type

export const decodeDrawing = Schema.decodeUnknownEffect(DrawingSchema)
export const encodeDrawing = Schema.encodeEffect(DrawingSchema)
export const isDrawing = Schema.is(DrawingSchema)

/** Creates an empty drawing with a single default layer. */
export const emptyDrawing = (id: string, name: string, units: Units = "mm"): Drawing => ({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  id,
  name,
  units,
  layers: [{ id: "layer-0", name: "0", visible: true, locked: false, color: "#1e88e5" }],
  entities: [],
  version: 0
})

// ---------------------------------------------------------------- construction helpers

/** Base fields with defaults, for building entities in code and tests. */
export const baseEntity = (id: string, layerId = "layer-0"): BaseFieldsType => ({
  id,
  layerId,
  visible: true,
  locked: false
})

/** Builds an `Arc` with angles normalised to `[0, 2π)`. */
export const makeArc = (
  id: string,
  center: { readonly x: number; readonly y: number },
  radius: number,
  startAngle: number,
  endAngle: number,
  clockwise = false,
  layerId = "layer-0"
): ArcEntity => ({
  ...baseEntity(id, layerId),
  _tag: "Arc",
  center,
  radius,
  startAngle: normalizeAngle(startAngle),
  endAngle: normalizeAngle(endAngle),
  clockwise
})

