import { Schema } from "effect"
import { cad, cam } from "@cadcamfun/core"

const id = Schema.NonEmptyString
const revision = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))
const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const params = Schema.Record(Schema.String, Schema.Unknown)
// Effect's empty Struct also accepts arrays; action parameters always use an object, including no-argument calls.
/** An action that takes no arguments: an object (never an array), shown to the model as one with no properties. */
export const EmptyActionInput = Schema.Struct({}).check(Schema.makeFilter((input) => !Array.isArray(input), {
  expected: "an action parameter object", toJsonSchema: () => ({ type: "object", properties: {} })
}))
const empty = EmptyActionInput

/** Shared inputs of the CAM action catalogue. Lengths are millimetres; these schemas never carry trusted authority. */
export const CamSetupCandidate = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)), params,
  toolId: Schema.optionalKey(id), materialId: Schema.optionalKey(id)
})
export const CamMachiningPlan = Schema.Struct({
  operations: Schema.Array(Schema.Struct({ type: id, params })).check(Schema.isMinLength(1), Schema.isMaxLength(8)),
  expectedRevision: Schema.optionalKey(revision)
})
export const CamCuttingDataInput = Schema.Struct({
  material: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  cut: Schema.Literals(["face", "slot", "rough-side", "adaptive", "finish-wall", "finish-floor", "finish-3d", "drill", "spot", "chamfer", "engrave", "thread-mill"]),
  tool: Schema.Struct({
    kind: Schema.Literals(["flat", "ball", "bull", "chamfer", "spot", "drill", "facemill", "threadmill", "engraver"]),
    diameter: positive.check(Schema.isLessThanOrEqualTo(250)),
    flutes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16 })),
    toolMaterial: Schema.optionalKey(Schema.Literals(["hss", "hss-co", "carbide", "pcd"])),
    coating: Schema.optionalKey(Schema.Literals(["none", "tin", "ticn", "altin", "alcrn", "zrn", "dlc", "diamond"])),
    cornerRadius: Schema.optionalKey(positive), angle: Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(179))),
    pitch: Schema.optionalKey(positive), fluteLength: Schema.optionalKey(positive), stickout: Schema.optionalKey(positive),
    shankDiameter: Schema.optionalKey(positive)
  }),
  machine: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(60))),
  depth: Schema.optionalKey(positive), ae: Schema.optionalKey(positive), ap: Schema.optionalKey(positive), scallop: Schema.optionalKey(positive)
})
export const CamManufactureInput = Schema.Struct({
  material: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  machine: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(60))),
  origin: Schema.optionalKey(Schema.Literals(["stock-center", "stock-corner"])),
  finishAllowance: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 5 }))),
  scallop: Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(1))), planOnly: Schema.optionalKey(Schema.Boolean),
  /** Explicit operations in machining order, CAD world mm (`planOnly` returns the planned ones to start from). */
  operations: Schema.optionalKey(Schema.Array(cam.kernel.OperationSpecSchema).check(Schema.isMaxLength(500))),
  /** Cutter library with flute length, stickout and holder; replaces the default crib. */
  tools: Schema.optionalKey(Schema.Array(cam.kernel.CutterSchema).check(Schema.isMinLength(1), Schema.isMaxLength(200))),
  /** Break the top edges with a chamfer of this width, mm (2D chamfer operations). */
  deburr: Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(5))),
  /** Write toolpaths that repeat translated (hole patterns, copies of a pocket) once as an `M98` subprogram (Fanuc and Haas posts). */
  subprograms: Schema.optionalKey(Schema.Boolean)
})
export const CamManufactureOperationInput = Schema.Struct({
  material: CamManufactureInput.fields.material, machine: CamManufactureInput.fields.machine,
  origin: CamManufactureInput.fields.origin, finishAllowance: CamManufactureInput.fields.finishAllowance,
  scallop: CamManufactureInput.fields.scallop, expectedRevision: Schema.optionalKey(revision),
  operations: CamManufactureInput.fields.operations, tools: CamManufactureInput.fields.tools, deburr: CamManufactureInput.fields.deburr,
  subprograms: CamManufactureInput.fields.subprograms
})

export const CamCreateInput = Schema.Struct({ type: id, params: Schema.optionalKey(params), expectedRevision: Schema.optionalKey(revision) })
export const CamUpdateInput = Schema.Struct({ operationId: id, params, expectedRevision: Schema.optionalKey(revision) })
export const CamGenerateInput = Schema.Struct({
  operationId: Schema.optionalKey(Schema.String),
  maxLines: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 })))
})
export const CamVerifyInput = Schema.Struct({
  operationId: id,
  tool: Schema.optionalKey(Schema.Struct({
    cuttingLength: Schema.optionalKey(positive), shankDiameter: Schema.optionalKey(positive), stickout: Schema.optionalKey(positive),
    holderDiameter: Schema.optionalKey(positive), holderLength: Schema.optionalKey(positive)
  })),
  fixtures: Schema.optionalKey(Schema.Array(cam.verify.VerifyFixtureSchema).check(Schema.isMaxLength(50))),
  targetSolids: Schema.optionalKey(Schema.Array(cad.SolidSchema).check(Schema.isMaxLength(20))),
  stock: Schema.optionalKey(cam.verify.BoundsSchema), resolution: Schema.optionalKey(positive),
  tolerance: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))), start: Schema.optionalKey(cad.Vec3Schema)
})
export const CamStockSetInput = Schema.Struct({
  stock: Schema.Struct({
    ...cam.generator.StockSchema.fields,
    material: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))), elementId: Schema.optionalKey(id)
  })
})

/** Action names are transport discriminators; the catalogue derives nikcli objects from these leaves. */
export const CAM_ACTION_INPUTS = {
  "cam.plan_check": CamMachiningPlan,
  "cam.review": Schema.Struct({ operationId: id }),
  "cam.machine": Schema.Struct({ machineType: cam.generator.MachineTypeSchema }),
  "cam.operations": empty,
  "cam.suggest": Schema.Struct({ params: Schema.optionalKey(params) }),
  "cam.compare_setups": Schema.Struct({ candidates: Schema.Array(CamSetupCandidate).check(Schema.isMinLength(1), Schema.isMaxLength(4)) }),
  "cam.analyze": Schema.Struct({ gcode: Schema.optionalKey(id), operationId: Schema.optionalKey(id), machineType: Schema.optionalKey(cam.generator.MachineTypeSchema) }),
  "cam.stock": empty,
  "cam.chain_suggest": Schema.Struct({ fromOperationId: Schema.optionalKey(Schema.String), materialHint: Schema.optionalKey(Schema.String), toolHint: Schema.optionalKey(Schema.String) }),
  "cam.materials": Schema.Struct({ query: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(80))) }),
  "cam.cutting_data": CamCuttingDataInput,
  "cam.manufacture": CamManufactureInput,
  "cam.chain_status": Schema.Struct({ operationId: id }),
  "cam_edit.create": CamCreateInput,
  "cam_edit.update": CamUpdateInput,
  "cam_edit.generate": CamGenerateInput,
  "cam_edit.verify": CamVerifyInput,
  "cam_edit.stock_set": CamStockSetInput,
  "cam_edit.manufacture": CamManufactureOperationInput
} as const
