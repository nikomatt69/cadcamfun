import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Conflict, Forbidden, InternalError, NotFound, Unauthorized } from "../errors.ts"
import { CompanionPairing } from "./companion.ts"

export const CloudState = Schema.Literals(["local", "pending", "downloaded", "applied", "conflict"])
export const CloudConnection = Schema.Struct({
  configured: Schema.Boolean,
  origin: Schema.NullOr(Schema.String),
  workspaceId: Schema.NullOr(Schema.String),
  deviceId: Schema.String,
})
export type CloudConnection = typeof CloudConnection.Type

export const CloudProjectStatus = Schema.Struct({
  projectId: Schema.String,
  localHead: Schema.NullOr(Schema.String),
  remoteHead: Schema.NullOr(Schema.String),
  state: CloudState,
  dirty: Schema.Boolean,
})
export type CloudProjectStatus = typeof CloudProjectStatus.Type

export const CloudProjectSummary = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  head: Schema.NullOr(Schema.String),
  state: CloudState,
  updatedAt: Schema.String,
})
export type CloudProjectSummary = typeof CloudProjectSummary.Type

export const CloudAsset = Schema.Struct({
  id: Schema.String,
  fileName: Schema.String,
  key: Schema.String,
  contentType: Schema.String,
  objectId: Schema.String,
  objectType: Schema.String,
  size: Schema.Number,
  sha256: Schema.String,
  body: Schema.String,
})
export type CloudAsset = typeof CloudAsset.Type

export const CloudTransfer = Schema.Struct({
  version: Schema.Literal(1),
  projectId: Schema.String,
  branch: Schema.String,
  head: Schema.String,
  objects: Schema.Array(Schema.Struct({ oid: Schema.String, type: Schema.Literals(["blob", "tree", "commit"]), body: Schema.String })),
  assets: Schema.Array(CloudAsset),
})
export type CloudTransfer = typeof CloudTransfer.Type

const errors = [BadRequest, Conflict, Forbidden, NotFound, Unauthorized, InternalError] as const
const id = { id: Schema.String }

/** Local connection controls are never forwarded by the public companion gateway. */
export class CloudGroup extends HttpApiGroup.make("cloud").add(
  HttpApiEndpoint.get("connection", "/api/cloud/connection", { success: CloudConnection, error: errors }),
  HttpApiEndpoint.put("setConnection", "/api/cloud/connection", {
    payload: Schema.Struct({ origin: Schema.String, workspaceId: Schema.String, token: Schema.String }), success: CloudConnection, error: errors,
  }),
  HttpApiEndpoint.delete("disconnect", "/api/cloud/connection", { success: CloudConnection, error: errors }),
  HttpApiEndpoint.post("enroll", "/api/cloud/enroll", { payload: Schema.Struct({ origin: Schema.String, name: Schema.String, setupCode: Schema.optional(Schema.String) }), success: CloudConnection, error: errors }),
  HttpApiEndpoint.post("pair", "/api/cloud/pair", { payload: Schema.Struct({ name: Schema.String }), success: CompanionPairing, error: errors }),
  HttpApiEndpoint.get("projects", "/api/cloud/projects", { success: Schema.Array(CloudProjectSummary), error: errors }),
  HttpApiEndpoint.post("clone", "/api/cloud/projects/:id/clone", { params: id, success: CloudProjectStatus, error: errors }),
  HttpApiEndpoint.get("status", "/api/projects/:id/cloud/status", { params: id, success: CloudProjectStatus, error: errors }),
  HttpApiEndpoint.post("publish", "/api/projects/:id/cloud/publish", { params: id, success: CloudProjectStatus, error: errors }),
  HttpApiEndpoint.post("fetch", "/api/projects/:id/cloud/fetch", { params: id, success: CloudProjectStatus, error: errors }),
  HttpApiEndpoint.post("apply", "/api/projects/:id/cloud/apply", { params: id, payload: Schema.Struct({ expectedHead: Schema.optional(Schema.String) }), success: CloudProjectStatus, error: errors }),
  HttpApiEndpoint.post("send", "/api/projects/:id/cloud/send", { params: id, payload: Schema.Struct({ message: Schema.optional(Schema.String) }), success: CloudProjectStatus, error: errors }),
  HttpApiEndpoint.get("remoteProjects", "/api/cloud/remote/projects", { success: Schema.Array(CloudProjectSummary), error: errors }),
  HttpApiEndpoint.get("remoteExport", "/api/cloud/remote/projects/:id", { params: id, success: CloudTransfer, error: errors }),
  HttpApiEndpoint.put("remoteImport", "/api/cloud/remote/projects/:id", {
    params: id, payload: Schema.Struct({ transfer: CloudTransfer, expectedHead: Schema.NullOr(Schema.String) }), success: CloudProjectStatus, error: errors,
  }),
  HttpApiEndpoint.post("remoteReceipt", "/api/cloud/remote/projects/:id/receipt", {
    params: id, payload: Schema.Struct({ head: Schema.String, deviceId: Schema.String, state: Schema.Literals(["downloaded", "applied"]) }), success: CloudProjectStatus, error: errors,
  }),
) {}
