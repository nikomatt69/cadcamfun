import { Schema } from "effect"

const id = Schema.String.check(Schema.isMinLength(1))
const offset = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const limit = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(20))

export const CadInspectionInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("elements"),
    ids: Schema.optionalKey(Schema.Array(id).check(Schema.isMaxLength(20))),
    layerId: Schema.optionalKey(id), offset: Schema.optionalKey(offset), limit: Schema.optionalKey(limit)
  }),
  Schema.Struct({ action: Schema.Literal("layers") }),
  Schema.Struct({
    action: Schema.Literal("search"),
    query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
    layerId: Schema.optionalKey(id),
    limit: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(50)))
  }),
  Schema.Struct({
    action: Schema.Literal("property"), elementId: id,
    path: Schema.Array(id).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
    offset: Schema.optionalKey(offset),
    maxChars: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(20000)))
  })
])
export type CadInspectionInput = typeof CadInspectionInput.Type
