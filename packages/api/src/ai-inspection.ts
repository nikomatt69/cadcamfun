import { Schema } from "effect"

const id = Schema.String.check(Schema.isMinLength(1))
const offset = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const limit = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(20))

/**
 * The four ways the model may read a drawing. Each variant is exported on its own so the action catalogue can
 * derive one nikcli zod schema per action (`cad.inspect_elements`, …) from the authoritative Effect contract,
 * instead of maintaining a second hand-written mirror of the same shapes.
 */
export const CadInspectionElements = Schema.Struct({
  action: Schema.Literal("elements"),
  ids: Schema.optionalKey(Schema.Array(id).check(Schema.isMaxLength(20))),
  layerId: Schema.optionalKey(id), offset: Schema.optionalKey(offset), limit: Schema.optionalKey(limit)
})
export const CadInspectionLayers = Schema.Struct({ action: Schema.Literal("layers") })
export const CadInspectionSearch = Schema.Struct({
  action: Schema.Literal("search"),
  query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  layerId: Schema.optionalKey(id),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(50)))
})
export const CadInspectionProperty = Schema.Struct({
  action: Schema.Literal("property"), elementId: id,
  path: Schema.Array(id).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  offset: Schema.optionalKey(offset),
  maxChars: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(20000)))
})

export const CadInspectionInput = Schema.Union([CadInspectionElements, CadInspectionLayers, CadInspectionSearch, CadInspectionProperty])
export type CadInspectionInput = typeof CadInspectionInput.Type