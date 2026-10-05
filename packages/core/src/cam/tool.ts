/**
 * Cutting tools and stock (spec 04-core-cam.md §3). Both are plain data with a
 * Schema, because they come out of the database as JSON and are validated once
 * at the edge.
 *
 * Diameters and lengths are millimetres, `maxRpm` is revolutions per minute.
 */
import { Schema } from "effect"

export const ToolKindSchema = Schema.Literals(["endmill", "ballnose", "drill", "vbit", "facemill"])
export type ToolKind = typeof ToolKindSchema.Type

const NonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
const Positive = Schema.Finite.check(Schema.isGreaterThan(0))

export const ToolSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  kind: ToolKindSchema,
  /** Cutting diameter, mm. */
  diameter: Positive,
  flutes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  maxRpm: Positive,
  /** Length held in the spindle, mm; drives the "tool too long" stock check. */
  stickout: Schema.optionalKey(Positive),
  /** Included angle of a `vbit`, degrees. */
  angle: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 180 }))),
  /** Tip radius of a `ballnose`, mm. */
  tipRadius: Schema.optionalKey(Positive)
})
export type Tool = typeof ToolSchema.Type

export const decodeTool = Schema.decodeUnknownEffect(ToolSchema)
export const encodeTool = Schema.encodeEffect(ToolSchema)

/** Cutting radius, mm. */
export const toolRadius = (tool: Tool): number => tool.diameter / 2

/** Tip geometry a strategy needs: the radius the profile must stay clear by. */
export const effectiveRadius = (tool: Tool): number => toolRadius(tool)

/** A `vbit` tapers to a point, so its engagement grows with depth. */
export const isTapered = (tool: Tool): boolean => tool.kind === "vbit"

/**
 * Engagement radius at depth `depth` (positive mm below the surface): a flat
 * tool keeps its radius, a `vbit` shrinks linearly towards its point.
 */
export const radiusAtDepth = (tool: Tool, depth: number): number => {
  if (!isTapered(tool)) return toolRadius(tool)
  const angle = ((tool.angle ?? 60) * Math.PI) / 180
  const tan = Math.tan(angle / 2)
  return Math.max(0, toolRadius(tool) - depth * tan)
}

/** A drill can only plunge; it may not be fed sideways. */
export const isDrill = (tool: Tool): boolean => tool.kind === "drill"

export const StockSchema = Schema.Struct({
  /** Block size, mm. */
  x: Positive,
  y: Positive,
  z: Positive,
  /** Minimum corner of the block, mm (top face at `origin.z`). */
  origin: Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite }),
  material: Schema.String
})
export type Stock = typeof StockSchema.Type

export const decodeStock = Schema.decodeUnknownEffect(StockSchema)
export const encodeStock = Schema.encodeEffect(StockSchema)

/** Whether a point lies inside the stock block (used to reject cutting outside it). */
export const containsPoint = (stock: Stock, x: number, y: number): boolean =>
  x >= stock.origin.x - 1e-9 &&
  x <= stock.origin.x + stock.x + 1e-9 &&
  y >= stock.origin.y - 1e-9 &&
  y <= stock.origin.y + stock.y + 1e-9

/** Stock block of a `Program` used by the face operation. */
export const stockBounds = (stock: Stock): {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
  readonly topZ: number
} => ({
  minX: stock.origin.x,
  minY: stock.origin.y,
  maxX: stock.origin.x + stock.x,
  maxY: stock.origin.y + stock.y,
  topZ: stock.origin.z
})
