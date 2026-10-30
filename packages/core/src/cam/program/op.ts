/**
 * An operation of a setup (spec 14 §3): which elements, which settings, which tool. Plain data with a Schema, because setups
 * come out of the database and the HTTP layer as JSON.
 */
import { Schema } from "effect"
import { ToolpathSettingsSchema } from "../generator/schema.ts"
import { ToolSchema } from "../tool.ts"

export const OperationSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  /** The CAD elements the operation machines; the caller resolves them to geometry (the core does no I/O). */
  elementIds: Schema.Array(Schema.String),
  params: ToolpathSettingsSchema,
  /** The tool identity is `tool.id` (the library id when there is one). */
  tool: ToolSchema,
  /** Carousel pocket (`T<n>`); absent = the pocket of the tool's first use. */
  pocket: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  enabled: Schema.Boolean,
  /** Continue the previous operation: a rest pass takes that operation's tool diameter as the tool that already cut. */
  fromPreviousStock: Schema.Boolean
})
export type Operation = typeof OperationSchema.Type
