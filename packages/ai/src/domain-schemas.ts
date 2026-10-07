import { Schema } from "effect"

/**
 * Minimal local stand-ins for the CAD/CAM payload schemas.
 *
 * WP1 (`@cadcamfun/core`) owns the real `Entity` and CAM parameter Schemas but
 * had not landed when this package was written. Everything the AI layer needs
 * is isolated in this single module so it can be swapped for core's exports by
 * editing only this file (the field names below are deliberately the obvious
 * ones: units are millimetres, angles radians).
 */

const Finite = Schema.Finite
const Positive = Schema.Finite.check(Schema.isGreaterThan(0))
const NonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))

/** A point in millimetres; `z` is optional and defaults to 0 (the drawing plane). */
export const Point2 = Schema.Struct({ x: Finite, y: Finite, z: Schema.optionalKey(Finite) })
export type Point2 = typeof Point2.Type

const common = {
  layer: Schema.optionalKey(Schema.NonEmptyString)
}

export const LineInput = Schema.Struct({ type: Schema.Literal("line"), start: Point2, end: Point2, ...common })
export const CircleInput = Schema.Struct({ type: Schema.Literal("circle"), center: Point2, radius: Positive, ...common })
export const ArcInput = Schema.Struct({
  type: Schema.Literal("arc"),
  center: Point2,
  radius: Positive,
  /** Radians, counter-clockwise from +X. */
  startAngle: Finite,
  endAngle: Finite,
  ...common
})
export const PolylineInput = Schema.Struct({
  type: Schema.Literal("polyline"),
  points: Schema.Array(Point2).check(Schema.isMinLength(2)),
  closed: Schema.optionalKey(Schema.Boolean),
  ...common
})
export const RectangleInput = Schema.Struct({
  type: Schema.Literal("rectangle"),
  origin: Point2,
  width: Positive,
  height: Positive,
  ...common
})

const solid = { center: Point2, color: Schema.optionalKey(Schema.NonEmptyString), name: Schema.optionalKey(Schema.NonEmptyString), ...common }
export const CubeInput = Schema.Struct({ type: Schema.Literal("cube"), width: Positive, height: Positive, depth: Positive, ...solid })
export const SphereInput = Schema.Struct({ type: Schema.Literal("sphere"), radius: Positive, ...solid })
export const CylinderInput = Schema.Struct({ type: Schema.Literal("cylinder"), radius: Positive, height: Positive, ...solid })
export const ConeInput = Schema.Struct({ type: Schema.Literal("cone"), radius: Positive, height: Positive, ...solid })
export const TorusInput = Schema.Struct({ type: Schema.Literal("torus"), radius: Positive, tube: Positive, ...solid })

/** A new entity (no id yet): 2D drawing entities and the 3D primitives the editor renders. */
export const EntityInput = Schema.Union([LineInput, CircleInput, ArcInput, PolylineInput, RectangleInput, CubeInput, SphereInput, CylinderInput, ConeInput, TorusInput])
export type EntityInput = typeof EntityInput.Type

/** Field changes for an existing entity; the entity `type` itself cannot change. */
export const EntityChanges = Schema.Struct({
  start: Schema.optionalKey(Point2),
  end: Schema.optionalKey(Point2),
  center: Schema.optionalKey(Point2),
  origin: Schema.optionalKey(Point2),
  radius: Schema.optionalKey(Positive),
  startAngle: Schema.optionalKey(Finite),
  endAngle: Schema.optionalKey(Finite),
  width: Schema.optionalKey(Positive),
  height: Schema.optionalKey(Positive),
  points: Schema.optionalKey(Schema.Array(Point2).check(Schema.isMinLength(2))),
  closed: Schema.optionalKey(Schema.Boolean),
  depth: Schema.optionalKey(Positive),
  tube: Schema.optionalKey(Positive),
  name: Schema.optionalKey(Schema.NonEmptyString),
  color: Schema.optionalKey(Schema.NonEmptyString),
  layer: Schema.optionalKey(Schema.NonEmptyString)
})
export type EntityChanges = typeof EntityChanges.Type

export const EntityId = Schema.NonEmptyString

export const OPERATION_TYPES = ["contour", "pocket", "drill", "engrave", "profile", "threading", "3d_surface"] as const
export const OperationType = Schema.Literals(OPERATION_TYPES)

export const OperationInput = Schema.Struct({
  type: OperationType,
  /** Library tool id (see `lib_lookup_tool`). */
  toolId: Schema.NonEmptyString,
  entityIds: Schema.Array(EntityId).check(Schema.isMinLength(1)),
  /** Total depth of cut, mm, positive downward. */
  depth: Positive,
  stepdown: Schema.optionalKey(Positive),
  feedRate: Schema.optionalKey(Positive),
  spindleSpeed: Schema.optionalKey(Positive),
  name: Schema.optionalKey(Schema.NonEmptyString)
})
export type OperationInput = typeof OperationInput.Type

export const MachineProfile = Schema.Struct({
  /** Axis travel limits, mm. */
  limits: Schema.Struct({
    xMin: Finite,
    xMax: Finite,
    yMin: Finite,
    yMax: Finite,
    zMin: Finite,
    zMax: Finite
  }),
  maxFeedRate: Schema.optionalKey(Positive),
  maxSpindleSpeed: Schema.optionalKey(Positive),
  /** Z at or below this value is "in material" (default 0, top of stock). */
  stockTopZ: Schema.optionalKey(Finite)
})
export type MachineProfile = typeof MachineProfile.Type

export const MaterialQuery = Schema.Struct({ query: Schema.NonEmptyString })
export const ToolQuery = Schema.Struct({ query: Schema.NonEmptyString })

export const DeleteRequest = Schema.Struct({
  ids: Schema.Array(EntityId).check(Schema.isMinLength(1)),
  /** Must be literally `true`; guards against accidental deletion by the model. */
  confirm: Schema.Literal(true)
})

export const ModifyRequest = Schema.Struct({
  changes: Schema.Array(Schema.Struct({ id: EntityId, set: EntityChanges })).check(Schema.isMinLength(1))
})

export const AddEntitiesRequest = Schema.Struct({
  entities: Schema.Array(EntityInput).check(Schema.isMinLength(1)).check(Schema.isMaxLength(200))
})

export const GenerateGcodeRequest = Schema.Struct({
  operationIds: Schema.optionalKey(Schema.Array(EntityId)),
  previewLines: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 200 })))
})

export const DescribeDrawingRequest = Schema.Struct({
  includeEntities: Schema.optionalKey(Schema.Boolean)
})

export const AnalyzeGcodeRequest = Schema.Struct({
  gcode: Schema.NonEmptyString,
  machine: Schema.optionalKey(MachineProfile)
})

export { Finite, NonNegative, Positive }
