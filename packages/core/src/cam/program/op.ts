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
  fromPreviousStock: Schema.Boolean,
  /** The workpieces of the setup this operation runs on (their ids); absent = every one of them. */
  workpieceIds: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Operations (ids) that must run before this one in the machining order: a finish pass names its rough pass. */
  dependsOn: Schema.optionalKey(Schema.Array(Schema.String))
})
export type Operation = typeof OperationSchema.Type

/**
 * One step of an operation template: the tool, the settings and the strategy of an operation, without the elements it machines (the
 * use of the template gives those). Ids of `dependsOn` are step ids of the same template.
 */
export const OperationTemplateStepSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  params: ToolpathSettingsSchema,
  tool: ToolSchema,
  pocket: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  /** Continue the previous operation (a rest pass): only meaningful when the steps of one feature run one after the other. */
  fromPreviousStock: Schema.optionalKey(Schema.Boolean),
  dependsOn: Schema.optionalKey(Schema.Array(Schema.String))
})
export type OperationTemplateStep = typeof OperationTemplateStepSchema.Type

/** A named cycle of operations (rough, semi-finish, finish; drill, ream) that a setup applies to the features it names. */
export const OperationTemplateSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  steps: Schema.Array(OperationTemplateStepSchema).check(Schema.isMinLength(1), Schema.isMaxLength(16))
})
export type OperationTemplate = typeof OperationTemplateSchema.Type

/**
 * An application of a template to elements. `perElement` makes one instance of the template per element (a row of holes, a set of
 * pockets); otherwise one instance machines all the elements together. `order`: `perStep` runs a step over every instance before the
 * next step (each tool loaded once: all roughing, then all finishing); `perFeature` finishes an instance before the next one starts.
 */
export const TemplateUseSchema = Schema.Struct({
  id: Schema.String.check(Schema.isMinLength(1)),
  templateId: Schema.String.check(Schema.isMinLength(1)),
  /** Defaults to the template's name. */
  name: Schema.optionalKey(Schema.String),
  elementIds: Schema.Array(Schema.String),
  perElement: Schema.optionalKey(Schema.Boolean),
  order: Schema.optionalKey(Schema.Literals(["perStep", "perFeature"])),
  workpieceIds: Schema.optionalKey(Schema.Array(Schema.String)),
  enabled: Schema.optionalKey(Schema.Boolean),
  /** Index in the setup's `operations` the expanded operations go before; absent = after all of them. */
  position: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  /** Settings of every step replaced for this use (a depth, a stepover): keys the steps' settings have. */
  overrides: Schema.optionalKey(Schema.Record(Schema.String, Schema.Union([Schema.Finite, Schema.String, Schema.Boolean])))
})
export type TemplateUse = typeof TemplateUseSchema.Type
