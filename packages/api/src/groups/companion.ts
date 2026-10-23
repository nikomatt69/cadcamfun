import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, InternalError, NotFound } from "../errors.ts"

/**
 * Management of the companion gateway (spec 13 §6): enable the phone-facing HTTPS listener, pair devices, revoke them.
 * These routes are for the desktop UI only: the gateway's route allow-list does not include `/api/companion`.
 */
export const CompanionDevice = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  createdAt: Schema.String,
  lastSeen: Schema.NullOr(Schema.String),
  /** Account the phone acts as: the one signed in on the desktop when the QR was created. */
  userId: Schema.String,
  email: Schema.NullOr(Schema.String),
})
export type CompanionDevice = typeof CompanionDevice.Type

export const CompanionStatus = Schema.Struct({
  enabled: Schema.Boolean,
  port: Schema.NullOr(Schema.Number),
  /** SHA-256 of the gateway certificate, the value phones pin. Null until the certificate exists. */
  fingerprint: Schema.NullOr(Schema.String),
  /** Address phones are told to use by default (first private IPv4 of this machine). */
  host: Schema.String,
  devices: Schema.Array(CompanionDevice),
})
export type CompanionStatus = typeof CompanionStatus.Type

export const CompanionPairing = Schema.Struct({
  id: Schema.String,
  link: Schema.String,
  /** When the QR stops working. The device token issued on redeem does not use this deadline. */
  expiresAt: Schema.String,
})

export const CompanionRedeemed = Schema.Struct({
  id: Schema.String,
  /** Device bearer. Returned once; only its hash is stored. */
  token: Schema.String,
  name: Schema.String,
  user: Schema.Struct({ id: Schema.String, email: Schema.NullOr(Schema.String), name: Schema.NullOr(Schema.String) }),
})

const errors = [BadRequest, NotFound, InternalError] as const

export class CompanionGroup extends HttpApiGroup.make("companion")
  .add(
    HttpApiEndpoint.get("status", "/api/companion", { success: CompanionStatus, error: InternalError }),
    HttpApiEndpoint.post("enable", "/api/companion/enable", { payload: Schema.Struct({ port: Schema.optional(Schema.Number) }), success: CompanionStatus, error: errors }),
    HttpApiEndpoint.post("disable", "/api/companion/disable", { success: CompanionStatus, error: InternalError }),
    HttpApiEndpoint.post("pair", "/api/companion/pair", { payload: Schema.Struct({ name: Schema.String, host: Schema.optional(Schema.String) }), success: CompanionPairing.pipe(Schema.annotate({ httpApiStatus: 201 })), error: errors }),
    HttpApiEndpoint.post("redeem", "/api/companion/redeem", { payload: Schema.Struct({ code: Schema.String }), success: CompanionRedeemed.pipe(Schema.annotate({ httpApiStatus: 201 })), error: errors }),
    HttpApiEndpoint.delete("revoke", "/api/companion/devices/:id", { params: { id: Schema.String }, success: CompanionStatus, error: errors }),
  )
{}
