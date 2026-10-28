import { Schema } from "effect"

const id = Schema.String.check(Schema.isMinLength(1))
const offset = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
/**
 * Most elements one reading may cover, for `limit` and for the ids it may name. Raised from 20 to 100, then to 500: a
 * product drawing of a few parametric bodies plus their detail solids runs to several hundred elements, and a 100 cap
 * made the model fail the call instead of paging. The text of a page stays bounded per element (`ai-inspection.ts` in
 * the sidecar) and `nextOffset` keeps paging beyond it, so the cap bounds the request, not the size of the answer.
 */
export const INSPECTION_PAGE_MAX = 500
const limit = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(INSPECTION_PAGE_MAX))
const ids = Schema.Array(id).check(Schema.isMaxLength(INSPECTION_PAGE_MAX))

/**
 * The five ways the model may read a drawing. Each variant is exported on its own so the action catalogue can
 * derive one nikcli zod schema per action (`cad.inspect_elements`, …) from the authoritative Effect contract,
 * instead of maintaining a second hand-written mirror of the same shapes.
 */
export const CadInspectionElements = Schema.Struct({
  action: Schema.Literal("elements"),
  ids: Schema.optionalKey(ids),
  layerId: Schema.optionalKey(id), offset: Schema.optionalKey(offset), limit: Schema.optionalKey(limit)
})
export const CadInspectionLayers = Schema.Struct({ action: Schema.Literal("layers") })
export const CadInspectionSearch = Schema.Struct({
  action: Schema.Literal("search"),
  query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  layerId: Schema.optionalKey(id),
  limit: Schema.optionalKey(limit)
})
export const CadInspectionProperty = Schema.Struct({
  action: Schema.Literal("property"), elementId: id,
  path: Schema.Array(id).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  offset: Schema.optionalKey(offset),
  maxChars: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(50000)))
})
/**
 * Where every element sits: its own origin, what that point means for its type, its bounds, its distance from the
 * CAD zero and, for components, each child's position relative to the container.
 */
export const CadInspectionOrigins = Schema.Struct({
  action: Schema.Literal("origins"),
  ids: Schema.optionalKey(ids),
  layerId: Schema.optionalKey(id), offset: Schema.optionalKey(offset), limit: Schema.optionalKey(limit)
})

export const CadInspectionInput = Schema.Union([CadInspectionElements, CadInspectionLayers, CadInspectionSearch, CadInspectionProperty, CadInspectionOrigins])
export type CadInspectionInput = typeof CadInspectionInput.Type
