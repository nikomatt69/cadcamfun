/**
 * Effect Schemas of the probing records (spec 73 §5.12), re-exported by `kernel/schema.ts`. On the wire angles are degrees; every
 * angle field decodes to radians, the unit of the core (`types.ts`, `device.ts`), and encodes back.
 */
import { Schema, SchemaTransformation } from "effect"
import { OFFSET_AXES, type OffsetAxis, OffsetCapacitySchema, UpdatePolicySchema, WorkOffsetRefSchema } from "../work-offset.ts"
import { MACRO_STYLES, type KernelProbing, type ProbeDevice, type ToolSetter } from "./device.ts"
import type { Characteristic, ProbeAction, ProbeCycle } from "./types.ts"

const DEG = Math.PI / 180
const finite = Schema.Finite
const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const nonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
const vec2 = Schema.Struct({ x: finite, y: finite })
const vec3 = Schema.Struct({ x: finite, y: finite, z: finite })
const sense = Schema.Literals([1, -1])
const name = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))
const resultName = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(32), Schema.isPattern(/^[A-Za-z][A-Za-z0-9_]*$/))
const toolNumber = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 9999 }))

/** Degrees on the wire, radians in the core. */
export const DegreesSchema = finite.pipe(Schema.decodeTo(finite, SchemaTransformation.transform({ decode: (d: number) => d * DEG, encode: (r: number) => Number((r / DEG).toFixed(10)) })))
const unitVec2 = vec2.check(Schema.makeFilter((v: { readonly x: number; readonly y: number }) => Math.abs(Math.hypot(v.x, v.y) - 1) <= 1e-6 ? undefined : "must be a unit vector"))

const depth = { depth: positive, top: Schema.optionalKey(finite) } as const

export const CalibrationArtefactSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("ring"), centre: vec2, diameter: positive, ...depth }),
  Schema.Struct({ kind: Schema.Literal("sphere"), centre: vec3, diameter: positive }),
  Schema.Struct({ kind: Schema.Literal("height"), at: vec2, z: finite })
])

export const ProbeCycleSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("z-surface"), at: vec2, expectedZ: finite }),
  Schema.Struct({ kind: Schema.Literal("edge"), at: vec3, normal: unitVec2 }),
  Schema.Struct({
    kind: Schema.Literal("corner"), corner: vec2, inside: Schema.Boolean, xSense: sense, ySense: sense, ...depth,
    inset: Schema.optionalKey(positive), touchesPerEdge: Schema.optionalKey(Schema.Literals([1, 2]))
  }),
  Schema.Struct({ kind: Schema.Literals(["web", "pocket"]), centre: vec2, width: positive, angle: DegreesSchema, ...depth }),
  Schema.Struct({ kind: Schema.Literal("rectangle"), inside: Schema.Boolean, centre: vec2, size: Schema.Struct({ x: positive, y: positive }), ...depth }),
  Schema.Struct({
    kind: Schema.Literals(["bore", "boss"]), centre: vec2, diameter: positive, ...depth,
    angles: Schema.optionalKey(Schema.Array(DegreesSchema).check(Schema.isMinLength(3), Schema.isMaxLength(32)))
  }),
  Schema.Struct({ kind: Schema.Literal("edge-angle"), start: vec2, along: unitVec2, pitch: positive, normal: unitVec2, ...depth }),
  Schema.Struct({ kind: Schema.Literal("plane"), points: Schema.Array(vec2).check(Schema.isMinLength(3), Schema.isMaxLength(64)), expectedZ: finite }),
  Schema.Struct({ kind: Schema.Literal("sphere"), centre: vec3, diameter: positive, touches: Schema.optionalKey(Schema.Literals([5, 9])) }),
  Schema.Struct({ kind: Schema.Literals(["tool-length", "tool-radius", "broken-tool"]), tool: toolNumber, nominalLength: Schema.optionalKey(positive), nominalRadius: Schema.optionalKey(positive) }),
  Schema.Struct({ kind: Schema.Literal("stylus-calibrate"), artefact: CalibrationArtefactSchema, directions: Schema.optionalKey(Schema.Literals([4, 8, 16])) }),
  Schema.Struct({
    kind: Schema.Literal("rotary-axis"), axis: Schema.Literals(["A", "B", "C"]), sphere: Schema.Struct({ centre: vec3, diameter: positive }),
    angles: Schema.Array(DegreesSchema).check(Schema.isMinLength(3), Schema.isMaxLength(72))
  })
])

const CharacteristicWire = Schema.Struct({
  name, kind: Schema.Literals(["size", "position", "true-position", "flatness", "angle"]), result: resultName, result2: Schema.optionalKey(resultName),
  nominal: finite, nominal2: Schema.optionalKey(finite), lower: finite, upper: finite
})
type CharacteristicWire = typeof CharacteristicWire.Type
const angular = (c: CharacteristicWire, k: number): CharacteristicWire =>
  c.kind === "angle" ? { ...c, nominal: c.nominal * k, lower: c.lower * k, upper: c.upper * k } : c

/** A characteristic; an `angle` characteristic's nominal and limits are degrees on the wire. */
export const CharacteristicSchema = CharacteristicWire.check(Schema.makeFilter((c: CharacteristicWire) => c.lower <= c.upper ? undefined : "lower must not exceed upper"))
  .pipe(Schema.decodeTo(Schema.toType(CharacteristicWire), SchemaTransformation.transform({ decode: (c: CharacteristicWire) => angular(c, DEG), encode: (c: CharacteristicWire) => angular(c, 1 / DEG) })))

export const ProbeActionSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("set-offset"), ref: WorkOffsetRefSchema, axes: Schema.Struct(Object.fromEntries(OFFSET_AXES.map((a) => [a, Schema.optionalKey(resultName)])) as { readonly [K in OffsetAxis]: Schema.optionalKey<typeof resultName> }), policy: UpdatePolicySchema }),
  Schema.Struct({ kind: Schema.Literal("rotation"), result: resultName, via: Schema.Literals(["g68", "offset-r", "table-c"]), ref: Schema.optionalKey(WorkOffsetRefSchema), policy: UpdatePolicySchema }),
  Schema.Struct({ kind: Schema.Literal("tool-offset"), tool: toolNumber, quantity: Schema.Literals(["length", "radius"]), result: resultName, part: Schema.Literals(["geometry", "wear"]) }),
  Schema.Struct({
    kind: Schema.Literal("inspect"), characteristics: Schema.Array(CharacteristicSchema).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
    onFail: Schema.Literals(["alarm", "stop", "flag", "continue"]), flag: Schema.optionalKey(resultName)
  }),
  Schema.Struct({
    kind: Schema.Literal("wear-comp"), tool: toolNumber, quantity: Schema.Literals(["length", "radius"]), result: resultName, nominal: finite,
    gain: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })), deadband: nonNegative, limit: positive, sense
  }),
  Schema.Struct({ kind: Schema.Literal("report"), results: Schema.Array(resultName).check(Schema.isMinLength(1), Schema.isMaxLength(50)) })
])

const StylusCalibrationSchema = Schema.Struct({
  ballDiameter: positive, effectiveRadius: positive,
  directional: Schema.optionalKey(Schema.Array(Schema.Struct({ angle: DegreesSchema, radius: positive })).check(Schema.isMaxLength(64))),
  zTrigger: Schema.optionalKey(finite), centreOffset: Schema.optionalKey(vec2),
  artefact: Schema.optionalKey(Schema.Struct({ kind: Schema.Literals(["ring", "sphere", "height"]), diameter: Schema.optionalKey(positive), serial: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(64))) })),
  calibratedAt: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(40)))
})

const blocks = Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120), Schema.isPattern(/^[^\r\n]*$/))).check(Schema.isMaxLength(8))

export const ProbeDeviceSchema = Schema.Struct({
  id: name, toolNumber,
  stylus: Schema.Struct({ ballDiameter: positive, length: positive, shankDiameter: positive }),
  body: Schema.Struct({ diameter: positive, length: positive }),
  calibration: Schema.optionalKey(StylusCalibrationSchema),
  overtravel: Schema.Struct({ xy: positive, z: positive }),
  feeds: Schema.Struct({ positioning: positive, fast: positive, touch: positive, max: positive }),
  backoff: positive, doubleTouch: Schema.Boolean,
  orientSpindle: Schema.optionalKey(DegreesSchema),
  on: Schema.optionalKey(blocks), off: Schema.optionalKey(blocks)
})

export const ToolSetterSchema = Schema.Struct({
  kind: Schema.Literals(["contact", "laser"]), position: vec3, triggerZ: finite, discDiameter: Schema.optionalKey(positive),
  maxToolDiameter: positive, feeds: Schema.Struct({ fast: positive, touch: positive }), radiusRpm: Schema.optionalKey(positive), brokenTolerance: positive
})

const varNumber = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 99_999 }))

export const KernelProbingSchema = Schema.Struct({
  probes: Schema.Array(ProbeDeviceSchema).check(Schema.isMaxLength(8)),
  toolSetter: Schema.optionalKey(ToolSetterSchema),
  macroStyle: Schema.Literals(MACRO_STYLES),
  skipCode: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^G31(\.\d)?( P\d)?$|^G38\.[2-5]$/))),
  skipFrame: Schema.Literals(["program", "work"]),
  tiltedPlane: Schema.Boolean,
  offsets: OffsetCapacitySchema,
  toolOffsets: Schema.optionalKey(Schema.Struct({
    lengthGeometry: Schema.optionalKey(varNumber), lengthWear: Schema.optionalKey(varNumber), radiusGeometry: Schema.optionalKey(varNumber), radiusWear: Schema.optionalKey(varNumber)
  })),
  resultBase: Schema.optionalKey(varNumber),
  scratch: Schema.optionalKey(Schema.Struct({ from: varNumber, to: varNumber })),
  calibrationSource: Schema.Literals(["baked", "variables"])
})

/** The fields of the probe member of `OperationSpecSchema` (besides the overrides every operation has). */
export const ProbeOperationFieldsSchema = {
  cycle: ProbeCycleSchema,
  actions: Schema.optionalKey(Schema.Array(ProbeActionSchema).check(Schema.isMaxLength(20))),
  search: Schema.optionalKey(positive),
  clearance: Schema.optionalKey(positive),
  doubleTouch: Schema.optionalKey(Schema.Boolean),
  resultPrefix: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8), Schema.isPattern(/^[A-Za-z][A-Za-z0-9]*$/))),
  native: Schema.optionalKey(Schema.Boolean)
} as const

// The schemas describe exactly the core records: a drift fails the typecheck here.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const _cycle: Same<typeof ProbeCycleSchema.Type, ProbeCycle> extends true ? true : never = true as Same<typeof ProbeCycleSchema.Type, ProbeCycle> extends true ? true : never
const _action: [typeof ProbeActionSchema.Type] extends [ProbeAction] ? true : never = true
const _char: [typeof CharacteristicSchema.Type] extends [Characteristic] ? true : never = true
const _device: Same<typeof ProbeDeviceSchema.Type, ProbeDevice> extends true ? true : never = true as Same<typeof ProbeDeviceSchema.Type, ProbeDevice> extends true ? true : never
const _setter: Same<typeof ToolSetterSchema.Type, ToolSetter> extends true ? true : never = true as Same<typeof ToolSetterSchema.Type, ToolSetter> extends true ? true : never
const _probing: [typeof KernelProbingSchema.Type] extends [KernelProbing] ? true : never = true
void _cycle
void _action
void _char
void _device
void _setter
void _probing
