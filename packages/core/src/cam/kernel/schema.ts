/**
 * Effect Schemas of the CAM kernel's caller-supplied records (spec 29 §3): a cutter of the tool library (with its holder)
 * and an explicit operation. The application edges (HTTP, the assistant's actions) validate with these once; the kernel then
 * works on the plain readonly records of `contracts.ts` / `cutters.ts`.
 */
import { SETUP_ORIENTATIONS } from "../setup.ts"
import { Schema } from "effect"
import { CoolantSchema, WorkOffsetSchema } from "../ir.ts"
import type { Cutter } from "./cutters.ts"
import { PROFILE_LEAD_INS, SURFACE_MODES, type JobSetup, type OperationSpec, type PrintRequirement } from "./contracts.ts"
import { MultiaxisStrategySchema } from "../operations/multiaxis.ts"
import { ProbeOperationFieldsSchema } from "../probing/schema.ts"
import { WorkOffsetRefSchema } from "../work-offset.ts"

export { CalibrationArtefactSchema, CharacteristicSchema, DegreesSchema, KernelProbingSchema, ProbeActionSchema, ProbeCycleSchema, ProbeDeviceSchema, ToolSetterSchema } from "../probing/schema.ts"
export { OffsetEntrySchema, UpdatePolicySchema, WorkOffsetRefSchema, WorkOffsetTableSchema } from "../work-offset.ts"

export const SetupOrientationSchema = Schema.Literals(SETUP_ORIENTATIONS)

const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const nonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
const id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80))
const point = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
const vec3 = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })
/** The rulings of a ruled wall for a flank cut (CAD world mm): see `operations/swarf.ts`. */
export const SwarfWallSchema = Schema.Struct({
  bottom: Schema.Array(vec3).check(Schema.isMinLength(2), Schema.isMaxLength(2000)),
  top: Schema.Array(vec3).check(Schema.isMinLength(2), Schema.isMaxLength(2000)),
  normal: Schema.Array(vec3).check(Schema.isMinLength(2), Schema.isMaxLength(2000)),
  concaveRadius: Schema.optionalKey(positive)
})
const ring = Schema.Array(point).check(Schema.isMinLength(3), Schema.isMaxLength(20_000))

export const CutterSchema = Schema.Struct({
  id, name: Schema.String.check(Schema.isMaxLength(120)),
  kind: Schema.Literals(["flat", "ball", "bull", "chamfer", "spot", "drill", "facemill", "threadmill", "engraver", "tap", "reamer", "countersink", "boringbar", "tslot", "dovetail", "tapered", "lollipop", "barrel", "lens"]),
  diameter: positive, flutes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 24 })),
  material: Schema.Literals(["hss", "hss-co", "carbide", "pcd"]),
  coating: Schema.Literals(["none", "tin", "ticn", "altin", "alcrn", "zrn", "dlc", "diamond"]),
  cornerRadius: Schema.optionalKey(nonNegative), angle: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 180 }))),
  tipDiameter: Schema.optionalKey(nonNegative), pitch: Schema.optionalKey(positive),
  neckDiameter: Schema.optionalKey(positive), formRadius: Schema.optionalKey(positive), headHeight: Schema.optionalKey(positive),
  fluteLength: positive, shankDiameter: positive, stickout: positive,
  holder: Schema.optionalKey(Schema.Struct({ diameter: positive, length: positive, steps: Schema.optionalKey(Schema.Array(Schema.Struct({ diameter: positive, length: positive }))) })),
  maxRpm: Schema.optionalKey(positive), number: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 999 })))
})

/** A hole-making cycle (`HoleCycle` in `contracts.ts`). */
export const HoleCycleSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("countersink"), diameter: positive }),
  Schema.Struct({
    kind: Schema.Literal("deep"), peck: positive, retract: Schema.Literals(["full", "chip-break"]), peckReduction: Schema.optionalKey(nonNegative), minPeck: Schema.optionalKey(positive),
    chipBreakRetract: Schema.optionalKey(positive), fullRetractEvery: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))), dwell: Schema.optionalKey(nonNegative)
  }),
  Schema.Struct({ kind: Schema.Literal("back-bore"), diameter: positive, pilotDiameter: positive, face: Schema.Finite }),
  Schema.Struct({
    kind: Schema.Literal("tilted"), peck: Schema.optionalKey(nonNegative), chipBreak: Schema.optionalKey(Schema.Boolean),
    sites: Schema.Array(Schema.Struct({ entry: vec3, direction: vec3, depth: positive })).check(Schema.isMinLength(1), Schema.isMaxLength(5000))
  })
])

/** Boundary and avoid regions of an operation (`MachiningLimits`, spec 69 C7). */
export const MachiningLimitsSchema = Schema.Struct({
  boundary: Schema.optionalKey(ring), avoid: Schema.optionalKey(Schema.Array(ring).check(Schema.isMaxLength(200))),
  containment: Schema.optionalKey(Schema.Literals(["edge", "centre"]))
})

const overrides = {
  id, enabled: Schema.optionalKey(Schema.Boolean), dependsOn: Schema.optionalKey(Schema.Array(id).check(Schema.isMaxLength(200))),
  limits: Schema.optionalKey(MachiningLimitsSchema), name: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(120))), tool: id,
  rpm: Schema.optionalKey(positive), feed: Schema.optionalKey(positive), plungeFeed: Schema.optionalKey(positive),
  stepdown: Schema.optionalKey(positive), stepover: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  coolant: Schema.optionalKey(CoolantSchema), radialEngagement: Schema.optionalKey(positive)
} as const

const region = Schema.Struct({ boundary: ring, islands: Schema.optionalKey(Schema.Array(ring).check(Schema.isMaxLength(500))) })

export const OperationSpecSchema = Schema.Union([
  Schema.Struct({ ...overrides, strategy: Schema.Literal("face"), bottom: Schema.Finite }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("adaptive"), region, top: Schema.Finite, bottom: Schema.Finite, allowance: Schema.optionalKey(nonNegative) }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("pocket"), region, top: Schema.Finite, bottom: Schema.Finite, allowance: Schema.optionalKey(nonNegative), finish: Schema.optionalKey(Schema.Boolean), within: Schema.optionalKey(region) }),
  Schema.Struct({
    ...overrides, strategy: Schema.Literal("profile"), loop: ring, side: Schema.Literals(["outside", "inside"]), top: Schema.Finite, bottom: Schema.Finite, allowance: Schema.optionalKey(nonNegative), finish: Schema.optionalKey(Schema.Boolean),
    tabs: Schema.optionalKey(Schema.Array(Schema.Struct({ position: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })), width: positive, height: positive })).check(Schema.isMaxLength(64))),
    leadIn: Schema.optionalKey(Schema.Literals(PROFILE_LEAD_INS)), leadRadius: Schema.optionalKey(positive),
    compensation: Schema.optionalKey(Schema.Literals(["none", "controller"]))
  }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("bore"), center: point, diameter: positive, top: Schema.Finite, bottom: Schema.Finite, allowance: Schema.optionalKey(nonNegative) }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("drill"), points: Schema.Array(point).check(Schema.isMinLength(1), Schema.isMaxLength(5000)), top: Schema.Finite, bottom: Schema.Finite, cut: Schema.optionalKey(Schema.Literals(["drill", "spot", "tap", "ream"])), cycle: Schema.optionalKey(HoleCycleSchema) }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("thread"), center: point, diameter: positive, pitch: positive, internal: Schema.Boolean, top: Schema.Finite, length: positive, rightHand: Schema.optionalKey(Schema.Boolean) }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("engrave"), paths: Schema.Array(Schema.Struct({ points: Schema.Array(point).check(Schema.isMinLength(2)), closed: Schema.Boolean })).check(Schema.isMinLength(1), Schema.isMaxLength(2000)), top: Schema.Finite, depth: positive }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("chamfer"), loops: Schema.Array(Schema.Struct({ points: ring, side: Schema.Literals(["outside", "inside"]) })).check(Schema.isMinLength(1), Schema.isMaxLength(2000)), top: Schema.Finite, width: positive, tipOffset: Schema.optionalKey(nonNegative) }),
  Schema.Struct({
    ...overrides, strategy: Schema.Literal("surface"), mode: Schema.Literals(SURFACE_MODES),
    slopeAngle: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 5, maximum: 85 }))),
    allowance: Schema.optionalKey(nonNegative), scallop: Schema.optionalKey(positive), clearing: Schema.optionalKey(Schema.Literals(["contour", "adaptive"])),
    angle: Schema.optionalKey(Schema.Finite), restFrom: Schema.optionalKey(id), center: Schema.optionalKey(point), contact: Schema.optionalKey(Schema.Literals(["heightfield", "mesh"]))
  }),
  Schema.Struct({
    ...overrides, strategy: Schema.Literal("multiaxis"), mode: Schema.optionalKey(MultiaxisStrategySchema), top: Schema.Finite, stepover: positive,
    angle: Schema.optionalKey(Schema.Finite), toolAxis: Schema.optionalKey(Schema.Literals(["normal", "lead", "point", "line", "curve", "shortest"])), axisPoint: Schema.optionalKey(vec3), axisLine: Schema.optionalKey(Schema.Struct({ a: vec3, b: vec3 })), axisCurve: Schema.optionalKey(Schema.Array(vec3).check(Schema.isMinLength(2), Schema.isMaxLength(20000))), maxTilt: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 180 }))), holderDiameter: Schema.optionalKey(positive),
    lead: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: -85, maximum: 85 }))),
    tilt: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: -85, maximum: 85 }))),
    /** `mode: "swarf"`: the walls to cut with the side of the cutter (read from the exact solid by `swarfWalls`). */
    walls: Schema.optionalKey(Schema.Array(SwarfWallSchema).check(Schema.isMaxLength(64))),
    /** `mode: "swarf"`: a point on each wall to cut (CAD world mm); the kernel reads the rulings from the exact solid. */
    near: Schema.optionalKey(Schema.Array(vec3).check(Schema.isMinLength(1), Schema.isMaxLength(64)))
  }),
  /** A probe cycle (spec 73): `tool` is the probe device id. */
  Schema.Struct({ ...overrides, strategy: Schema.Literal("probe"), ...ProbeOperationFieldsSchema })
])

// The schemas describe exactly the kernel's records: a drift fails the typecheck here, not at runtime.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const _cutter: Same<typeof CutterSchema.Type, Cutter> extends true ? true : never = true as Same<typeof CutterSchema.Type, Cutter> extends true ? true : never
const _operation: [typeof OperationSpecSchema.Type] extends [OperationSpec] ? true : never = true
void _cutter
void _operation

const percent = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 }))

/** How a printer job is sliced (`PrintRequirement`): every field optional, bounded to what a printer can do. */
export const PrintRequirementSchema = Schema.Struct({
  layerHeight: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0.04, maximum: 1.2 }))),
  firstLayerHeight: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0.04, maximum: 1.2 }))),
  walls: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 20 }))),
  topLayers: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
  bottomLayers: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
  infillDensity: Schema.optionalKey(percent),
  infillPattern: Schema.optionalKey(Schema.Literals(["lines", "grid", "triangles", "honeycomb", "gyroid", "concentric"])),
  supports: Schema.optionalKey(Schema.Literals(["none", "buildplate", "everywhere"])),
  supportAngle: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 10, maximum: 80 }))),
  adhesion: Schema.optionalKey(Schema.Literals(["none", "skirt", "brim", "raft"])),
  brimWidth: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 50 }))),
  printSpeed: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 5, maximum: 600 }))),
  nozzleTemperature: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 120, maximum: 450 }))),
  bedTemperature: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 150 }))),
  fan: Schema.optionalKey(percent),
  vase: Schema.optionalKey(Schema.Boolean),
  orientation: Schema.optionalKey(Schema.Literals(["as-designed", "auto"])),
  seam: Schema.optionalKey(Schema.Literals(["nearest", "aligned", "random"])),
  retractionDistance: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 15 }))),
  zHop: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 5 }))),
  flow: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 50, maximum: 150 }))),
  relativeExtrusion: Schema.optionalKey(Schema.Boolean)
})
const _print: [typeof PrintRequirementSchema.Type] extends [PrintRequirement] ? true : never = true
void _print

/** A workholding body (`FixtureBody`): an axis-aligned box in CAD world coordinates. */
export const FixtureBodySchema = Schema.Struct({ id, min: vec3, max: vec3, role: Schema.optionalKey(Schema.Literals(["jaw", "clamp", "support"])) })

/** A stock that is not a box (`StockModel`): a vertical bar or a closed mesh in CAD world coordinates. */
export const StockModelSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("cylinder"), center: point, radius: positive, z0: Schema.Finite, z1: Schema.Finite, segments: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 16, maximum: 512 }))) }),
  Schema.Struct({
    kind: Schema.Literal("mesh"),
    mesh: Schema.Struct({ positions: Schema.Array(Schema.Finite).check(Schema.isMaxLength(3_000_000)), indices: Schema.Array(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))).check(Schema.isMaxLength(3_000_000)) })
  })
])

const stockBox = Schema.Struct({ min: vec3, max: vec3 })

/** A tilted work plane for a 3+2 setup (`Workplane`, spec 69 C1). */
export const WorkplaneSchema = Schema.Struct({ normal: vec3, xHint: Schema.optionalKey(vec3) })

/** One fixing of the part (`JobSetup`, spec 69 C1). */
export const JobSetupSchema = Schema.Struct({
  id, name: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(120))),
  orientation: Schema.optionalKey(SetupOrientationSchema), workplane: Schema.optionalKey(WorkplaneSchema), origin: Schema.optionalKey(Schema.Literals(["stock-center", "stock-corner"])),
  workOffset: Schema.optionalKey(WorkOffsetSchema), workOffsetRef: Schema.optionalKey(WorkOffsetRefSchema), stock: Schema.optionalKey(stockBox), stockModel: Schema.optionalKey(StockModelSchema),
  fixtures: Schema.optionalKey(Schema.Array(FixtureBodySchema).check(Schema.isMaxLength(64))),
  operations: Schema.optionalKey(Schema.Array(OperationSpecSchema).check(Schema.isMaxLength(2000)))
})
const _setup: [typeof JobSetupSchema.Type] extends [JobSetup] ? true : never = true
void _setup
