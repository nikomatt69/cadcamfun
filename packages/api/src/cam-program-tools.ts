import { Schema } from "effect"
import { cam } from "@cadcamfun/core"

const num = Schema.Finite
const int = Schema.Int
const positive = Schema.Finite.check(Schema.isGreaterThan(0))
const xy = Schema.Struct({ x: num, y: num })
const sign = Schema.Literals([1, -1])

/** Probing (spec 72 P4-7): a probe is a sensor, not a cutter. */
export const CamProbeSettings = Schema.Struct({
  /** Stylus ball diameter, mm. */
  stylusDiameter: positive,
  /** Probing feed, mm/min. */
  feed: positive,
  /** How far past the expected surface the probe searches before it reports a miss, mm. */
  search: positive,
  workOffset: Schema.Literals(["G54", "G55", "G56", "G57", "G58", "G59"]),
  /** Height the probe travels at between touches, in the current work coordinates, mm. */
  safeZ: num
})

export const CamProbeOperation = Schema.Union([
  Schema.Struct({ cycle: Schema.Literal("z-surface"), at: xy, expectedZ: num, zero: Schema.optionalKey(num) }),
  Schema.Struct({ cycle: Schema.Literal("edge"), axis: Schema.Literals(["X", "Y"]), direction: sign, at: xy, depth: num, expectedEdge: num, zero: Schema.optionalKey(num) }),
  Schema.Struct({ cycle: Schema.Literal("corner"), corner: xy, sx: sign, sy: sign, depth: num, zero: Schema.optionalKey(xy) }),
  Schema.Struct({ cycle: Schema.Literal("bore"), centre: xy, diameter: positive, depth: num }),
  Schema.Struct({ cycle: Schema.Literal("boss"), centre: xy, diameter: positive, depth: num, top: num })
])

export const CamProbeStep = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("rapid"), x: Schema.optionalKey(num), y: Schema.optionalKey(num), z: Schema.optionalKey(num) }),
  Schema.Struct({ kind: Schema.Literal("rapid-mid"), axis: Schema.Literals(["X", "Y"]), store: int, store2: int }),
  Schema.Struct({ kind: Schema.Literal("touch"), axis: Schema.Literals(["X", "Y", "Z"]), distance: num, store: int }),
  Schema.Struct({ kind: Schema.Literal("set-offset"), axis: Schema.Literals(["X", "Y", "Z"]), store: int, store2: Schema.optionalKey(int), radius: num, sign, value: num }),
  Schema.Struct({ kind: Schema.Literal("report-size"), axis: Schema.Literals(["X", "Y", "Z"]), store: int, store2: int, stylus: num, inside: Schema.Boolean, label: Schema.String })
])

export const CamProbePlanRequest = Schema.Struct({ operation: CamProbeOperation, settings: CamProbeSettings })
export const CamProbePlan = Schema.Struct({ steps: Schema.Array(CamProbeStep), notes: Schema.Array(Schema.String) })
export type CamProbePlan = typeof CamProbePlan.Type

/** The program text for a control: steps from a plan, or the operation itself (planned first). */
export const CamProbeEmitRequest = Schema.Struct({
  operation: CamProbeOperation, settings: CamProbeSettings,
  dialect: Schema.Literals(["fanuc", "linuxcnc", "siemens"])
})
export const CamProbeProgram = Schema.Struct({ gcode: Schema.String, steps: Schema.Array(CamProbeStep), notes: Schema.Array(Schema.String) })

/** Linking (spec 72 P3-4): the air between cuts. */
export const CamLinkReportRequest = Schema.Struct({
  toolpaths: Schema.Array(cam.ToolpathSchema).check(Schema.isMaxLength(500)),
  /** Lowest Z at which a rapid may cross the work: the highest obstacle plus a margin. */
  lowSafeZ: num,
  rapidRate: Schema.optionalKey(positive)
})
export const CamLinkReport = Schema.Struct({
  toolpaths: Schema.Array(cam.ToolpathSchema),
  report: Schema.Struct({ airBefore: num, airAfter: num, reduction: num, rewrittenLinks: int })
})

export const CamLinkOrderRequest = Schema.Struct({
  items: Schema.Array(Schema.Struct({ id: Schema.String, tool: Schema.String, start: xy, end: xy, reorderable: Schema.optionalKey(Schema.Boolean) })).check(Schema.isMaxLength(2_000)),
  from: Schema.optionalKey(xy)
})
export const CamLinkOrder = Schema.Struct({ order: Schema.Array(Schema.String), before: num, after: num })
