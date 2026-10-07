/**
 * Effect Schema mirrors of `packages/ai/src/tools/catalogue.ts` tool parameter shapes.
 *
 * The sidecar validates tool inputs with zod before the handler runs; the desktop
 * validates again at the SSE boundary so a malformed event becomes a typed
 * `tool_result { ok: false }` in the assistant transcript rather than a silent
 * crash or a tool call dispatched against the store with garbage data.
 *
 * Both layers exist on purpose: the sidecar guards the host's executor, this
 * layer guards the UI's `tool_call` reducer (see spec 08-ai.md §3).
 */
import { Schema } from "effect"
import type { ToolId } from "./tools.ts"

const nonEmptyString = Schema.String.check(Schema.isMinLength(1))

const record = Schema.Record(Schema.String, Schema.Unknown)

const intPositive = Schema.Number.check(Schema.isInt(), Schema.isFinite(), Schema.isGreaterThan(0))
const intNonNegative = Schema.Number.check(Schema.isInt(), Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0))

const machineType = Schema.Union([
  Schema.Literal("mill"),
  Schema.Literal("lathe"),
  Schema.Literal("3dprinter")
])

const bounds = Schema.Struct({
  minX: Schema.Number.check(Schema.isFinite()),
  maxX: Schema.Number.check(Schema.isFinite()),
  minY: Schema.Number.check(Schema.isFinite()),
  maxY: Schema.Number.check(Schema.isFinite()),
  minZ: Schema.Number.check(Schema.isFinite()),
  maxZ: Schema.Number.check(Schema.isFinite())
})

const verifyTool = Schema.Struct({
  cuttingLength: Schema.optional(intPositive),
  shankDiameter: Schema.optional(intPositive),
  stickout: Schema.optional(intPositive),
  holderDiameter: Schema.optional(intPositive),
  holderLength: Schema.optional(intPositive)
})

const verifyFixture = Schema.Struct({
  id: nonEmptyString,
  bounds
})

const empty = Schema.Struct({})

const memoryKey = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.-]{1,80}$/))

/**
 * The schema catalogue. Adding a tool means adding its input shape here AND
 * in `packages/ai/src/tools/catalogue.ts`; the two must agree. Drift is
 * surfaced by the validation pipeline returning `tool_result { ok: false }`.
 *
 * Typed as `Record<ToolId, Schema.Top>` so `ToolInputSchemas[tool]` resolves
 * to a single schema type the decoder can consume (rather than the
 * `as const satisfies` union TS can't narrow).
 */
export const ToolInputSchemas: Record<ToolId, Schema.Top> = {
  cad_add_elements: Schema.Struct({
    elements: Schema.Array(record).check(Schema.isMinLength(1), Schema.isMaxLength(200))
  }),
  cad_add_entities: Schema.Struct({
    entities: Schema.Array(Schema.Unknown).check(Schema.isMinLength(1), Schema.isMaxLength(500))
  }),
  cad_modify_entities: Schema.Struct({
    changes: Schema.Array(Schema.Struct({
      id: nonEmptyString,
      changes: record
    })).check(Schema.isMinLength(1))
  }),
  cad_delete_entities: Schema.Struct({
    ids: Schema.Array(nonEmptyString).check(Schema.isMinLength(1)),
    confirm: Schema.Literal(true)
  }),
  cad_check_design: empty,
  cad_import_drawing: Schema.Struct({
    format: Schema.optional(Schema.Union([Schema.Literal("dxf"), Schema.Literal("svg"), Schema.Literal("step")])),
    content: Schema.optional(nonEmptyString),
    attachment: Schema.optional(nonEmptyString),
    depth: Schema.optional(Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0))),
    up: Schema.optional(Schema.Union([Schema.Literal("x"), Schema.Literal("y"), Schema.Literal("z")])),
    scale: Schema.optional(Schema.Number),
    gap: Schema.optional(Schema.Number),
    tolerance: Schema.optional(Schema.Number),
    name: Schema.optional(nonEmptyString),
    color: Schema.optional(nonEmptyString),
    layer: Schema.optional(nonEmptyString)
  }),
  cad_describe_drawing: empty,
  cam_describe_machine: Schema.Struct({ machineType }),
  cam_create_operation: Schema.Struct({
    type: nonEmptyString,
    params: Schema.optional(record)
  }),
  cam_list_operations: empty,
  cam_update_operation: Schema.Struct({
    operationId: nonEmptyString,
    params: record
  }),
  cam_suggest_parameters: Schema.Struct({
    params: Schema.optional(record)
  }),
  cam_generate_gcode: Schema.Struct({
    operationId: Schema.optional(nonEmptyString),
    maxLines: Schema.optional(Schema.Number.check(Schema.isInt(), Schema.isFinite(), Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(200)))
  }),
  cam_analyze_gcode: Schema.Struct({
    gcode: nonEmptyString,
    machineType: Schema.optional(machineType)
  }),
  cam_verify_toolpath: Schema.Struct({
    operationId: nonEmptyString,
    tool: Schema.optional(verifyTool),
    fixtures: Schema.optional(Schema.Array(verifyFixture).check(Schema.isMaxLength(50))),
    targetSolids: Schema.optional(Schema.Array(record).check(Schema.isMaxLength(20))),
    stock: Schema.optional(bounds),
    resolution: Schema.optional(intPositive),
    tolerance: Schema.optional(intNonNegative)
  }),
  lib_lookup_material: Schema.Struct({ query: Schema.String }),
  lib_lookup_tool: Schema.Struct({ query: Schema.String }),
  memory_remember: Schema.Struct({
    key: memoryKey,
    value: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000))
  }),
  memory_recall: Schema.Struct({
    prefix: Schema.optional(Schema.String)
  })
}

export type ToolInputSchemas = typeof ToolInputSchemas