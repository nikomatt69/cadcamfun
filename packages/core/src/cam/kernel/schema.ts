/**
 * Effect Schemas of the CAM kernel's caller-supplied records (spec 29 §3): a cutter of the tool library (with its holder)
 * and an explicit operation. The application edges (HTTP, the assistant's actions) validate with these once; the kernel then
 * works on the plain readonly records of `contracts.ts` / `cutters.ts`.
 */
import { Schema } from "effect"
import { CoolantSchema } from "../ir.ts"
import type { Cutter } from "./cutters.ts"
import { SURFACE_MODES, type OperationSpec } from "./contracts.ts"

const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const nonNegative = Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0))
const id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80))
const point = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
const ring = Schema.Array(point).check(Schema.isMinLength(3), Schema.isMaxLength(20_000))

export const CutterSchema = Schema.Struct({
  id, name: Schema.String.check(Schema.isMaxLength(120)),
  kind: Schema.Literals(["flat", "ball", "bull", "chamfer", "spot", "drill", "facemill", "threadmill", "engraver", "tap", "reamer"]),
  diameter: positive, flutes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 24 })),
  material: Schema.Literals(["hss", "hss-co", "carbide", "pcd"]),
  coating: Schema.Literals(["none", "tin", "ticn", "altin", "alcrn", "zrn", "dlc", "diamond"]),
  cornerRadius: Schema.optionalKey(nonNegative), angle: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 180 }))),
  tipDiameter: Schema.optionalKey(nonNegative), pitch: Schema.optionalKey(positive),
  fluteLength: positive, shankDiameter: positive, stickout: positive,
  holder: Schema.optionalKey(Schema.Struct({ diameter: positive, length: positive })),
  maxRpm: Schema.optionalKey(positive), number: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 999 })))
})

const overrides = {
  id, name: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(120))), tool: id,
  rpm: Schema.optionalKey(positive), feed: Schema.optionalKey(positive), plungeFeed: Schema.optionalKey(positive),
  stepdown: Schema.optionalKey(positive), stepover: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
  coolant: Schema.optionalKey(CoolantSchema), radialEngagement: Schema.optionalKey(positive)
} as const

const region = Schema.Struct({ boundary: ring, islands: Schema.optionalKey(Schema.Array(ring).check(Schema.isMaxLength(500))) })

export const OperationSpecSchema = Schema.Union([
  Schema.Struct({ ...overrides, strategy: Schema.Literal("face"), bottom: Schema.Finite }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("adaptive"), region, top: Schema.Finite, bottom: Schema.Finite, allowance: Schema.optionalKey(nonNegative) }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("pocket"), region, top: Schema.Finite, bottom: Schema.Finite, allowance: Schema.optionalKey(nonNegative), finish: Schema.optionalKey(Schema.Boolean) }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("profile"), loop: ring, side: Schema.Literals(["outside", "inside"]), top: Schema.Finite, bottom: Schema.Finite, allowance: Schema.optionalKey(nonNegative), finish: Schema.optionalKey(Schema.Boolean) }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("bore"), center: point, diameter: positive, top: Schema.Finite, bottom: Schema.Finite, allowance: Schema.optionalKey(nonNegative) }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("drill"), points: Schema.Array(point).check(Schema.isMinLength(1), Schema.isMaxLength(5000)), top: Schema.Finite, bottom: Schema.Finite, cut: Schema.optionalKey(Schema.Literals(["drill", "spot", "tap", "ream"])) }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("thread"), center: point, diameter: positive, pitch: positive, internal: Schema.Boolean, top: Schema.Finite, length: positive, rightHand: Schema.optionalKey(Schema.Boolean) }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("engrave"), paths: Schema.Array(Schema.Struct({ points: Schema.Array(point).check(Schema.isMinLength(2)), closed: Schema.Boolean })).check(Schema.isMinLength(1), Schema.isMaxLength(2000)), top: Schema.Finite, depth: positive }),
  Schema.Struct({ ...overrides, strategy: Schema.Literal("chamfer"), loops: Schema.Array(Schema.Struct({ points: ring, side: Schema.Literals(["outside", "inside"]) })).check(Schema.isMinLength(1), Schema.isMaxLength(2000)), top: Schema.Finite, width: positive, tipOffset: Schema.optionalKey(nonNegative) }),
  Schema.Struct({
    ...overrides, strategy: Schema.Literal("surface"), mode: Schema.Literals(SURFACE_MODES),
    slopeAngle: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 5, maximum: 85 }))),
    allowance: Schema.optionalKey(nonNegative), scallop: Schema.optionalKey(positive), clearing: Schema.optionalKey(Schema.Literals(["contour", "adaptive"])),
    angle: Schema.optionalKey(Schema.Finite), restFrom: Schema.optionalKey(id), center: Schema.optionalKey(point)
  }),
  Schema.Struct({
    ...overrides, strategy: Schema.Literal("multiaxis"), top: Schema.Finite, stepover: positive,
    angle: Schema.optionalKey(Schema.Finite), toolAxis: Schema.optionalKey(Schema.Literals(["normal", "lead"])),
    lead: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: -85, maximum: 85 }))),
    tilt: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: -85, maximum: 85 })))
  })
])

// The schemas describe exactly the kernel's records: a drift fails the typecheck here, not at runtime.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const _cutter: Same<typeof CutterSchema.Type, Cutter> extends true ? true : never = true as Same<typeof CutterSchema.Type, Cutter> extends true ? true : never
const _operation: [typeof OperationSpecSchema.Type] extends [OperationSpec] ? true : never = true
void _cutter
void _operation
