/**
 * The shape of a machine configuration: the library's own record (the Resources page edits it, the assistant writes it)
 * and the row the CAM kernel takes. A machine configuration is what makes a machine the user's own: the kernel plans
 * against its ceilings, its controller and its rotary table.
 */
import { Schema } from "effect"

const Positive = Schema.Number.check(Schema.isGreaterThan(0))
const Range = Schema.Struct({ min: Schema.Number, max: Schema.Number })

/** The parameters a machine configuration carries (the stored `config` JSON). */
export const MachineConfigParams = Schema.Struct({
  workVolume: Schema.Struct({ x: Positive, y: Positive, z: Positive }),
  maxSpindleSpeed: Positive,
  maxFeedRate: Positive,
  controller: Schema.optional(Schema.String),
  /** Number of controlled axes: 3 (XYZ), 4 or 5 (with a rotary table). */
  axes: Schema.optional(Schema.Literals([3, 4, 5])),
  /** The rotary table of a 4/5-axis machine (required when `axes` is 4 or 5, checked by the sidecar). */
  rotary: Schema.optional(Schema.Struct({
    layout: Schema.Literals(["table-AC", "table-BC"]),
    tilt: Range,
    rotation: Schema.optional(Range),
    pivot: Schema.optional(Schema.Struct({ x: Schema.Number, y: Schema.Number, z: Schema.Number })),
    tcp: Schema.optional(Schema.Literals(["control", "program"]))
  })),
  additionalSettings: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})

/**
 * A machine configuration as the kernel takes it: the row and the parameters it carries. The parameters are read in
 * whichever shape they were written — the Resources form, the assistant's record or the canonical machine profile —
 * so the contract carries them whole and the kernel's machine profile decides what they mean. A configuration the
 * kernel cannot machine (a kind it does not machine, no spindle ceiling) is refused with the reason, never a default.
 */
export const CamMachineConfig = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The library's kinds: `mill`, `lathe`, `printer`, `laser`. */
  type: Schema.String,
  description: Schema.optional(Schema.String),
  config: Schema.Record(Schema.String, Schema.Json)
})
export type CamMachineConfig = typeof CamMachineConfig.Type
