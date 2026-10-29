import { Schema } from "effect"
import { cad, cam } from "@cadcamfun/core"
import { CamMachineConfig } from "./cam-machine-config.ts"

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
  cut: Schema.Literals(["face", "slot", "rough-side", "adaptive", "finish-wall", "finish-floor", "finish-3d", "drill", "spot", "chamfer", "engrave", "thread-mill", "tap", "ream"]),
  tool: Schema.Struct({
    kind: Schema.Literals(["flat", "ball", "bull", "chamfer", "spot", "drill", "facemill", "threadmill", "engraver", "tap", "reamer"]),
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
  /** Separate manual setup: CAD direction facing the spindle, never a rotary cycle. */
  setupOrientation: Schema.optionalKey(cam.kernel.SetupOrientationSchema),
  workOffset: Schema.optionalKey(cam.WorkOffsetSchema),
  material: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  machine: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(60))),
  /** A machine configuration of the library: the machine the person configured, with its ceilings and its controller. */
  machineConfig: Schema.optionalKey(CamMachineConfig),
  origin: Schema.optionalKey(Schema.Literals(["stock-center", "stock-corner"])),
  finishAllowance: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 5 }))),
  scallop: Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(1))), planOnly: Schema.optionalKey(Schema.Boolean),
  /** Explicit operations in machining order, CAD world mm (`planOnly` returns the planned ones to start from). */
  operations: Schema.optionalKey(Schema.Array(cam.kernel.OperationSpecSchema).check(Schema.isMaxLength(500))),
  /** Cutter library with flute length, stickout and holder; replaces the default crib. */
  tools: Schema.optionalKey(Schema.Array(cam.kernel.CutterSchema).check(Schema.isMinLength(1), Schema.isMaxLength(200))),
  /** Break the top edges with a chamfer of this width, mm (2D chamfer operations). */
  deburr: Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(5))),
  /** Hold the outlines cut through the full stock height with this many tabs (`width` mm of material, `height` mm high; spec 69 A1). */
  tabs: Schema.optionalKey(Schema.Struct({ count: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })), width: positive.check(Schema.isLessThanOrEqualTo(100)), height: positive.check(Schema.isLessThanOrEqualTo(50)) })),
  /** Write toolpaths that repeat translated (hole patterns, copies of a pocket) once as a subprogram (`M98` on the Fanuc and Haas posts, `CALL LBL` on the Heidenhain Klartext post). */
  subprograms: Schema.optionalKey(Schema.Boolean),
  /** Write the control's own fixed cycle where the kernel has one (Heidenhain: bore milling cycle 208) instead of the moves that do the same. */
  nativeCycles: Schema.optionalKey(Schema.Boolean),
  /** High-speed contour smoothing with this tolerance, mm (Fanuc AICC G5.1, Haas G187, Siemens CYCLE832, Heidenhain cycle 32, LinuxCNC G64 P); ignored by a control without it. */
  smoothing: Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(1))),
  /** A post definition (spec 54 C1) that writes the NC in place of the machine's post: inline, or the id of a library item (category "post"), or the `postDefinitionId` of the machine configuration. */
  postDefinition: Schema.optionalKey(Schema.Json),
  postDefinitionId: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80))),
  /** How a printer job is sliced (walls, infill, supports, adhesion, speeds, temperatures); read only when the machine is a printer. */
  print: Schema.optionalKey(cam.kernel.PrintRequirementSchema)
})
/**
 * Turning in the kernel (spec 29 A1): a turned profile in the lathe's own coordinates — X is a diameter,
 * z = 0 is the finished face and negative z runs towards the chuck. The part turns; a mill-turn head is
 * the separate `turnMill` machine model, never words invented by a turning plan.
 */
export const CamTurningInput = Schema.Struct({
  profile: Schema.Array(Schema.Struct({
    diameter: positive.check(Schema.isLessThanOrEqualTo(500)),
    z: Schema.Finite.check(Schema.isBetween({ minimum: -2000, maximum: 0 }))
  })).check(Schema.isMinLength(2), Schema.isMaxLength(200)),
  stock: Schema.Struct({ diameter: positive.check(Schema.isLessThanOrEqualTo(500)), length: positive.check(Schema.isLessThanOrEqualTo(2000)) }),
  stepdown: Schema.optionalKey(positive.check(Schema.isBetween({ minimum: 0.001, maximum: 100 }))),
  allowance: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 5 }))),
  feedMmRev: Schema.optionalKey(positive.check(Schema.isLessThanOrEqualTo(10))),
  rpm: Schema.optionalKey(positive.check(Schema.isBetween({ minimum: 1, maximum: 20000 }))),
  /** The turning centre the plan runs on (a preset id or a saved configuration): it bounds the bar and the spindle. */
  machine: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(60))),
  machineConfig: Schema.optionalKey(CamMachineConfig)
})
export const CamTurningOperationInput = Schema.Struct({ ...CamTurningInput.fields, expectedRevision: Schema.optionalKey(revision) })
const turnPoint = Schema.Struct({ diameter: Schema.Finite, z: Schema.Finite })
/** Preview geometry before NC rounding; the bar tail is retained, not parted off. */
export const CamTurningPlan = Schema.Struct({
  release: Schema.Literal("preview"),
  passes: Schema.Array(Schema.Struct({ kind: Schema.Literals(["face", "rough", "finish"]), diameter: Schema.Finite, points: Schema.Array(turnPoint), removed: Schema.Finite })),
  stockAfter: Schema.Array(Schema.Finite), stockProfiles: Schema.Array(Schema.Array(turnPoint)),
  stockVolume: Schema.Finite, partVolume: Schema.Finite, unmachinedVolume: Schema.Finite, removedVolume: Schema.Finite,
  /** The spindle speed and the feed the plan runs at (the machine's ceilings when they are lower). */
  rpm: Schema.Finite, feed: Schema.Finite,
  /** The turning centre the plan was bounded by, when one was given. */
  machine: Schema.optionalKey(Schema.Struct({ id: Schema.String, name: Schema.String })),
  nc: Schema.String, issues: Schema.Array(Schema.String)
})
export const CamManufactureOperationInput = Schema.Struct({
  setupOrientation: CamManufactureInput.fields.setupOrientation,
  workOffset: CamManufactureInput.fields.workOffset,
  material: CamManufactureInput.fields.material, machine: CamManufactureInput.fields.machine,
  machineConfig: CamManufactureInput.fields.machineConfig,
  origin: CamManufactureInput.fields.origin, finishAllowance: CamManufactureInput.fields.finishAllowance,
  scallop: CamManufactureInput.fields.scallop, expectedRevision: Schema.optionalKey(revision),
  operations: CamManufactureInput.fields.operations, tools: CamManufactureInput.fields.tools, deburr: CamManufactureInput.fields.deburr, tabs: CamManufactureInput.fields.tabs,
  subprograms: CamManufactureInput.fields.subprograms, nativeCycles: CamManufactureInput.fields.nativeCycles, smoothing: CamManufactureInput.fields.smoothing, print: CamManufactureInput.fields.print
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
  /** The shop sheet of a saved kernel program (tools, operations, times, evidence), read from its own artifact. */
  "cam.setup_sheet": Schema.Struct({ operationId: id }),
  /**
   * The machine's kinematics; with a program (text or operation), how it runs there (spec 31): what turns and in which sense,
   * where the tool is at `at` seconds, the set-up findings (vise, chuck, bed), the turned part or the printed layers. `params`
   * are generator settings (workholding, lathe turret and grip, printer bed...) laid over the machine's defaults.
   */
  "cam.machine": Schema.Struct({
    machineType: cam.generator.MachineTypeSchema,
    gcode: Schema.optionalKey(id),
    operationId: Schema.optionalKey(id),
    params: Schema.optionalKey(params),
    at: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)))
  }),
  "cam.operations": empty,
  "cam.suggest": Schema.Struct({ params: Schema.optionalKey(params) }),
  "cam.compare_setups": Schema.Struct({ candidates: Schema.Array(CamSetupCandidate).check(Schema.isMinLength(1), Schema.isMaxLength(4)) }),
  "cam.analyze": Schema.Struct({ gcode: Schema.optionalKey(id), operationId: Schema.optionalKey(id), machineType: Schema.optionalKey(cam.generator.MachineTypeSchema) }),
  "cam.stock": empty,
  "cam.chain_suggest": Schema.Struct({ fromOperationId: Schema.optionalKey(Schema.String), materialHint: Schema.optionalKey(Schema.String), toolHint: Schema.optionalKey(Schema.String) }),
  "cam.materials": Schema.Struct({ query: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(80))) }),
  "cam.cutting_data": CamCuttingDataInput,
  "cam.turn": CamTurningInput,
  "cam_edit.turn": CamTurningOperationInput,
  "cam.manufacture": CamManufactureInput,
  "cam.chain_status": Schema.Struct({ operationId: id }),
  "cam_edit.create": CamCreateInput,
  "cam_edit.update": CamUpdateInput,
  "cam_edit.generate": CamGenerateInput,
  "cam_edit.verify": CamVerifyInput,
  "cam_edit.stock_set": CamStockSetInput,
  "cam_edit.manufacture": CamManufactureOperationInput
} as const
