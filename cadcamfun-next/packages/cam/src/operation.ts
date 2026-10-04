import { Schema } from "effect"
import { ElementId, Geometry } from "@cadcamfun/core"

const shared = {
  name: Schema.optional(Schema.String),
  toolId: Schema.String,
  elementIds: Schema.Array(ElementId),
  /** Final depth below stock top (Z=0), positive, in mm. */
  depth: Geometry.Positive,
  /** Depth per pass; defaults to the tool/material recommendation. */
  stepDown: Schema.optional(Geometry.Positive),
  /** Overrides for computed feeds. */
  feed: Schema.optional(Geometry.Positive),
  plunge: Schema.optional(Geometry.Positive),
  rpm: Schema.optional(Geometry.Positive),
}
const common = { id: Schema.String, ...shared }

export const Direction = Schema.Literals(["climb", "conventional"])
export type Direction = typeof Direction.Type

const Side = Schema.Literals(["outside", "inside", "on"])
/** Fraction of tool diameter between passes (0–1]. */
const StepOver = Geometry.Positive.check(Schema.isLessThanOrEqualTo(1))

const kinds = {
  /** Cut along a closed or open profile, offset by the tool radius. */
  Profile: { side: Side, direction: Direction },
  /** Clear the area enclosed by closed elements with concentric offset passes. */
  Pocket: { stepOver: StepOver, direction: Direction },
  /** Drill at Point positions and at the centre of circles. `peck` 0 disables pecking. */
  Drill: { peck: Geometry.NonNegative },
  /** Follow the element geometry exactly (no offset), e.g. for v-carving lines. */
  Engrave: {},
  /** Surface the bounding box of the selected elements (or the stock) with a zig-zag raster. */
  Facing: { stepOver: StepOver },
} as const

export const Profile = Schema.TaggedStruct("Profile", { ...common, ...kinds.Profile })
export const Pocket = Schema.TaggedStruct("Pocket", { ...common, ...kinds.Pocket })
export const Drill = Schema.TaggedStruct("Drill", { ...common, ...kinds.Drill })
export const Engrave = Schema.TaggedStruct("Engrave", { ...common, ...kinds.Engrave })
export const Facing = Schema.TaggedStruct("Facing", { ...common, ...kinds.Facing })

export const Operation = Schema.Union([Profile, Pocket, Drill, Engrave, Facing])
export type Operation = typeof Operation.Type
export type OperationTag = Operation["_tag"]

/** Operation without an id (assigned on insert). */
export const OperationInput = Schema.Union([
  Schema.TaggedStruct("Profile", { ...shared, ...kinds.Profile }),
  Schema.TaggedStruct("Pocket", { ...shared, ...kinds.Pocket }),
  Schema.TaggedStruct("Drill", { ...shared, ...kinds.Drill }),
  Schema.TaggedStruct("Engrave", { ...shared, ...kinds.Engrave }),
  Schema.TaggedStruct("Facing", { ...shared, ...kinds.Facing }),
])
export type OperationInput = typeof OperationInput.Type

export const Stock = Schema.Struct({
  /** Lower-left corner in XY. */
  origin: Geometry.Vec2,
  size: Geometry.Vec3,
})
export type Stock = typeof Stock.Type

/** CAM setup attached to a CAD document. */
export const Setup = Schema.Struct({
  machineId: Schema.String,
  materialId: Schema.String,
  stock: Schema.optional(Stock),
  /** Clearance height for rapids, mm above stock top. */
  safeZ: Geometry.Positive,
  operations: Schema.Array(Operation),
})
export type Setup = typeof Setup.Type
