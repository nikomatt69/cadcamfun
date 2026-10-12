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
import { CadInspectionInput } from "@cadcamfun/api"
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

const positive = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0))
const nonNegative = Schema.Number.check(Schema.isFinite(), Schema.isGreaterThanOrEqualTo(0))
const verifyTool = Schema.Struct({
  cuttingLength: Schema.optional(positive),
  shankDiameter: Schema.optional(positive),
  stickout: Schema.optional(positive),
  holderDiameter: Schema.optional(positive),
  holderLength: Schema.optional(positive)
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
  cam_stock: Schema.Union([Schema.Struct({ action: Schema.Literal("inspect") }), Schema.Struct({ action: Schema.Literal("set"), stock: record })]),
  cad_inspect: CadInspectionInput,
  cad_component_relations: Schema.Struct({ firstId: nonEmptyString, secondId: nonEmptyString }),
  web_search: Schema.Struct({ query: nonEmptyString, numResults: Schema.optional(intPositive.check(Schema.isLessThanOrEqualTo(8))) }),
  attachment_read: Schema.Struct({ attachment: nonEmptyString, offset: Schema.optional(intNonNegative), maxChars: Schema.optional(intPositive.check(Schema.isLessThanOrEqualTo(20000))) }),
  cad_parametric: Schema.Union([
    Schema.Struct({ action: Schema.Literal("inspect"), elementId: nonEmptyString }),
    Schema.Struct({ action: Schema.Literal("validate"), history: record }),
    Schema.Struct({ action: Schema.Literal("create"), history: record, name: nonEmptyString, x: Schema.optional(Schema.Number), y: Schema.optional(Schema.Number), z: Schema.optional(Schema.Number), layer: Schema.optional(nonEmptyString) }),
    Schema.Struct({ action: Schema.Literal("update"), elementId: nonEmptyString, parameters: record, expectedRevision: nonEmptyString }),
    Schema.Struct({ action: Schema.Literal("test"), elementId: nonEmptyString, cases: Schema.Array(record).check(Schema.isMinLength(1), Schema.isMaxLength(12)) }),
    Schema.Struct({
      action: Schema.Literal("recipe"), recipe: nonEmptyString, params: Schema.optional(record), create: Schema.optional(Schema.Boolean), name: Schema.optional(nonEmptyString),
      x: Schema.optional(Schema.Number), y: Schema.optional(Schema.Number), z: Schema.optional(Schema.Number), layer: Schema.optional(nonEmptyString)
    }),
    Schema.Struct({
      action: Schema.Literal("dfm"), elementId: Schema.optional(nonEmptyString), history: Schema.optional(record),
      process: Schema.optional(Schema.Union([Schema.Literal("mill"), Schema.Literal("turn"), Schema.Literal("print")])),
      toolDiameter: Schema.optional(Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0))),
      material: Schema.optional(Schema.Union([Schema.Literal("metal"), Schema.Literal("cast"), Schema.Literal("plastic")])),
      minWall: Schema.optional(Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0))), envelope: Schema.optional(record)
    }),
    Schema.Struct({
      action: Schema.Literal("fastener"), size: Schema.optional(nonEmptyString),
      fit: Schema.optional(Schema.Union([Schema.Literal("fine"), Schema.Literal("medium"), Schema.Literal("coarse")])),
      shaftDiameter: Schema.optional(Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)))
    })
  ]),
  cad_vision: Schema.Struct({ focus: Schema.optional(Schema.String) }),
  cam_vision: Schema.Struct({ focus: Schema.optional(Schema.String) }),
  cad_add_elements: Schema.Struct({
    elements: Schema.Array(record).check(Schema.isMinLength(1), Schema.isMaxLength(40))
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
  cad_transform_entities: Schema.Struct({
    ids: Schema.Array(nonEmptyString).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    dx: Schema.optional(Schema.Number.check(Schema.isFinite())),
    dy: Schema.optional(Schema.Number.check(Schema.isFinite())),
    dz: Schema.optional(Schema.Number.check(Schema.isFinite())),
    rotateAxis: Schema.optional(Schema.Union([Schema.Literal("x"), Schema.Literal("y"), Schema.Literal("z")])),
    rotateDegrees: Schema.optional(Schema.Number.check(Schema.isFinite())),
    scale: Schema.optional(Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0))),
    about: Schema.optional(Schema.Struct({ x: Schema.Number, y: Schema.Number, z: Schema.Number })),
    copies: Schema.optional(intNonNegative.check(Schema.isLessThanOrEqualTo(100)))
  }),
  cad_group_entities: Schema.Struct({
    ids: Schema.Array(nonEmptyString).check(Schema.isMinLength(1), Schema.isMaxLength(200)),
    name: Schema.optional(nonEmptyString),
    ungroup: Schema.optional(Schema.Boolean),
    layer: Schema.optional(nonEmptyString)
  }),
  cad_editor: Schema.Struct({
    actions: Schema.Array(record).check(Schema.isMinLength(1), Schema.isMaxLength(40))
  }),
  cad_delete_entities: Schema.Struct({
    ids: Schema.Array(nonEmptyString).check(Schema.isMinLength(1)),
    confirm: Schema.Literal(true)
  }),
  cad_check_design: empty,
  cad_import_drawing: Schema.Struct({
    format: Schema.optional(Schema.Union([Schema.Literal("dxf"), Schema.Literal("svg"), Schema.Literal("step"), Schema.Literal("mesh")])),
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
    params: Schema.optional(record),
    candidates: Schema.optional(Schema.Array(Schema.Struct({ name: nonEmptyString, params: record, toolId: Schema.optional(nonEmptyString), materialId: Schema.optional(nonEmptyString) })).check(Schema.isMinLength(1), Schema.isMaxLength(4)))
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
    resolution: Schema.optional(positive),
    tolerance: Schema.optional(nonNegative)
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
