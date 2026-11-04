import { cam } from "@cadcamfun/core"
import { Schema } from "effect"
import { CamOffsetEntry, CamOffsetKey, CamProbingDialect, CamProbingFeatureHint, CamProbingFrame, CamProbingMisplacement, CamProbingSettingsInput } from "./cam-probing.ts"

/**
 * The probing actions of `cam_edit` (spec 73 §3.3): `probe` plans a cycle (from a feature of the drawing, or given) and stores it as a
 * probe operation with its program; `probe_run` simulates a stored one on the part and keeps a report; `probe_apply` writes what a
 * report measured (or rows the call names) into the machine's work offsets. Millimetres; angles on the wire are degrees.
 */
const k = cam.kernel
const id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128))
const degrees = Schema.Finite.check(Schema.isBetween({ minimum: -120, maximum: 120 }))

export const CamProbeFeature = Schema.Struct({
  elementId: id,
  /** A stable face or edge reference of the element (`cad grep`), when the element has several features. */
  ref: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(400))),
  hint: Schema.optionalKey(CamProbingFeatureHint)
})

export const CamProbeInput = Schema.Struct({
  /** A stored probe operation to replace (a new one is stored otherwise). */
  operationId: Schema.optionalKey(id),
  /** Exactly one of `feature` and `operation` (the stored cycle is kept when `operationId` names one and neither is sent). */
  feature: Schema.optionalKey(CamProbeFeature),
  operation: Schema.optionalKey(k.ProbeCycleSchema),
  checks: Schema.optionalKey(Schema.Array(k.CharacteristicSchema).check(Schema.isMaxLength(20))),
  /** The offset the cycle measures into; absent: a pure measurement that moves no offset. */
  workOffset: Schema.optionalKey(CamOffsetKey),
  /** What the program does with the correction (default `set`). */
  update: Schema.optionalKey(Schema.Literals(cam.probing.UPDATE_MODES)),
  /** mm: the band of the two tolerance modes. */
  tolerance: Schema.optionalKey(Schema.Finite.check(Schema.isGreaterThan(0))),
  /** The tilted plane the cycle runs in, degrees. */
  frame: Schema.optionalKey(Schema.Struct({ a: Schema.optionalKey(degrees), b: Schema.optionalKey(degrees), c: Schema.optionalKey(degrees) })),
  /** The control the program is written for (default: the machine's post, else fanuc). */
  dialect: Schema.optionalKey(CamProbingDialect),
  machineConfig: Schema.optionalKey(id),
  settings: Schema.optionalKey(CamProbingSettingsInput),
  expectedRevision: Schema.optionalKey(Schema.String)
})
export type CamProbeInput = typeof CamProbeInput.Type

export const CamProbeRunInput = Schema.Struct({
  operationId: id,
  /** How far the real part sits from the drawn one (mm, degrees): the simulated machine's truth. */
  misplace: Schema.optionalKey(CamProbingMisplacement),
  machineConfig: Schema.optionalKey(id),
  setupId: Schema.optionalKey(id),
  /** A rotary calibration: pivot error (mm) and axis tilt (degrees) the simulated table has. */
  calibrationError: Schema.optionalKey(Schema.Struct({
    pivot: Schema.optionalKey(Schema.Struct({ x: Schema.Finite, y: Schema.Finite, z: Schema.Finite })),
    tilt: Schema.optionalKey(Schema.Finite)
  })),
  runId: Schema.optionalKey(id)
})
export type CamProbeRunInput = typeof CamProbeRunInput.Type

export const CamProbeApplyEntry = Schema.Struct({ offset: CamOffsetKey, ...CamOffsetEntry.fields })

export const CamProbeApplyInput = Schema.Struct({
  machineConfig: id,
  /** Exactly one of `reportId` (what a report measured) and `entries` (rows the call names). */
  reportId: Schema.optionalKey(id),
  entries: Schema.optionalKey(Schema.Array(CamProbeApplyEntry).check(Schema.isMinLength(1), Schema.isMaxLength(12))),
  setupId: Schema.optionalKey(id),
  /** `set` writes the values; `add` adds them (of a report, its corrections) to the rows the machine holds. */
  mode: Schema.Literals(["add", "set"]),
  baseUpdatedAt: Schema.optionalKey(Schema.String)
})
export type CamProbeApplyInput = typeof CamProbeApplyInput.Type

export { CamProbingFrame }

/** What a stored probe operation keeps in `Toolpath.data` (wire units), read by `probe_run`, `cam review` and the Probing panel. */
export const PROBE_FORMAT = "cadcamfun-probe"
