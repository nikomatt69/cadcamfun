import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { EnvBadRequest, EnvForbidden, EnvInternal, EnvMethodNotAllowed, EnvNotFound, EnvelopeOpt } from "../errors.ts"

const errors = [EnvBadRequest, EnvForbidden, EnvNotFound, EnvMethodNotAllowed, EnvInternal] as const
const id = { id: Schema.String }

export const MachineType = Schema.Literals(["mill", "lathe", "printer", "laser"])

const Positive = Schema.Number.check(Schema.isGreaterThan(0))
const Range = Schema.Struct({ min: Schema.Number, max: Schema.Number })
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

/** POST body, validated by the handler so failures use the legacy `Invalid request data: …` message. */
export const CreateMachineConfig = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  description: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(1000)))),
  type: MachineType,
  config: MachineConfigParams,
  isPublic: Schema.optional(Schema.Boolean)
})

export class MachineConfigsGroup extends HttpApiGroup.make("machineConfigs")
  .add(
    HttpApiEndpoint.get("list", "/api/machine-configs", {
      query: {
        page: Schema.optional(Schema.String), limit: Schema.optional(Schema.String), type: Schema.optional(Schema.String),
        search: Schema.optional(Schema.String), public: Schema.optional(Schema.String)
      },
      success: EnvelopeOpt(Schema.Unknown), error: errors
    }),
    HttpApiEndpoint.post("create", "/api/machine-configs", {
      payload: Schema.Unknown, success: EnvelopeOpt(Schema.Unknown), error: errors
    }),
    HttpApiEndpoint.get("get", "/api/machine-configs/:id", { params: id, success: EnvelopeOpt(Schema.Unknown), error: errors }),
    HttpApiEndpoint.put("update", "/api/machine-configs/:id", {
      params: id, payload: Schema.Unknown, success: EnvelopeOpt(Schema.Unknown), error: errors
    }),
    HttpApiEndpoint.delete("remove", "/api/machine-configs/:id", { params: id, success: EnvelopeOpt(Schema.Unknown), error: errors }),
    HttpApiEndpoint.post("clone", "/api/machine-configs/:id/clone", {
      params: id, payload: Schema.Unknown, success: EnvelopeOpt(Schema.Unknown), error: errors
    })
  )
{}

// ---- /api/machine-configs/:id/storage and /api/machine-configs/export-import (helpers.ts envelope) ----
import { Envelope } from "../errors.ts"

export class MachineConfigsStorageGroup extends HttpApiGroup.make("machineConfigsStorage")
  .add(
    HttpApiEndpoint.post("save", "/api/machine-configs/:id/storage", { params: id, payload: Schema.Unknown, success: Envelope(Schema.Unknown), error: errors }),
    HttpApiEndpoint.get("read", "/api/machine-configs/:id/storage", {
      params: id, query: { signedUrl: Schema.optional(Schema.String) }, success: Envelope(Schema.Unknown), error: errors
    }),
    HttpApiEndpoint.delete("remove", "/api/machine-configs/:id/storage", { params: id, success: Envelope(Schema.Unknown), error: errors }),
    HttpApiEndpoint.get("export", "/api/machine-configs/export-import", {
      query: { ids: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.String)])), format: Schema.optional(Schema.String) },
      success: Schema.Unknown, error: errors
    }),
    HttpApiEndpoint.post("import", "/api/machine-configs/export-import", { payload: Schema.Unknown, success: Envelope(Schema.Unknown), error: errors })
  )
{}
