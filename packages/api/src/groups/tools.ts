import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, NotFound } from "../errors.ts"

const UserRef = Schema.Struct({ id: Schema.String, name: Schema.NullOr(Schema.String), email: Schema.NullOr(Schema.String) })
const OrgRef = Schema.Struct({ id: Schema.String, name: Schema.String })
const NullNum = Schema.NullOr(Schema.Number)
const NullStr = Schema.NullOr(Schema.String)

export const ToolRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  type: Schema.String,
  diameter: Schema.Number,
  material: Schema.String,
  numberOfFlutes: NullNum,
  maxRPM: NullNum,
  coolantType: NullStr,
  cuttingLength: NullNum,
  totalLength: NullNum,
  shankDiameter: NullNum,
  /** Shape for the tool's 3D model (spec 31): corner / nose radius, included or taper angle, thread pitch, holder, stickout. */
  cornerRadius: Schema.optionalKey(NullNum),
  tipAngle: Schema.optionalKey(NullNum),
  threadPitch: Schema.optionalKey(NullNum),
  holderDiameter: Schema.optionalKey(NullNum),
  holderLength: Schema.optionalKey(NullNum),
  stickout: Schema.optionalKey(NullNum),
  notes: NullStr,
  isPublic: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  ownerId: NullStr,
  organizationId: NullStr
})
export type ToolRow = typeof ToolRow.Type

export const ToolDetail = Schema.Struct({ ...ToolRow.fields, owner: Schema.NullOr(UserRef), organization: Schema.NullOr(OrgRef) })

const opt = <A extends Schema.Top>(s: A) => Schema.optional(s)
export const ToolBody = Schema.Struct({
  name: opt(Schema.String),
  type: opt(Schema.String),
  diameter: opt(Schema.Number),
  material: opt(Schema.String),
  numberOfFlutes: opt(NullNum),
  maxRPM: opt(NullNum),
  coolantType: opt(NullStr),
  cuttingLength: opt(NullNum),
  totalLength: opt(NullNum),
  shankDiameter: opt(NullNum),
  cornerRadius: opt(NullNum),
  tipAngle: opt(NullNum),
  threadPitch: opt(NullNum),
  holderDiameter: opt(NullNum),
  holderLength: opt(NullNum),
  stickout: opt(NullNum),
  notes: opt(NullStr),
  organizationId: opt(NullStr),
  isPublic: opt(Schema.Boolean)
})

const Message = Schema.Struct({ message: Schema.String })
const id = { id: Schema.String }

export class ToolsGroup extends HttpApiGroup.make("tools")
  .add(
    HttpApiEndpoint.get("list", "/api/tools", {
      query: {
        type: opt(Schema.String), material: opt(Schema.String), diameter: opt(Schema.String),
        search: opt(Schema.String), public: opt(Schema.String)
      },
      success: Schema.Array(ToolRow),
      error: InternalError
    }),
    HttpApiEndpoint.post("create", "/api/tools", {
      payload: ToolBody,
      success: ToolRow.pipe(Schema.annotate({ httpApiStatus: 201 })),
      error: [BadRequest, Forbidden, InternalError]
    }),
    HttpApiEndpoint.get("get", "/api/tools/:id", { params: id, success: ToolDetail, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.put("update", "/api/tools/:id", {
      params: id, payload: ToolBody, success: ToolRow, error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.delete("remove", "/api/tools/:id", {
      params: id, success: Message, error: [BadRequest, Forbidden, NotFound, InternalError]
    })
  )
{}

// ---- /api/tools/:id/storage, /api/tools/export-import, /api/tools/:id/export-import (envelope responses) ----
import { EnvBadRequest, EnvForbidden, EnvInternal, EnvMethodNotAllowed, EnvNotFound, Envelope } from "../errors.ts"

const envErrors = [EnvBadRequest, EnvForbidden, EnvNotFound, EnvMethodNotAllowed, EnvInternal] as const
const exportQuery = {
  ids: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  format: Schema.optional(Schema.String)
}

export class ToolsStorageGroup extends HttpApiGroup.make("toolsStorage")
  .add(
    HttpApiEndpoint.post("save", "/api/tools/:id/storage", { params: id, payload: Schema.Unknown, success: Envelope(Schema.Unknown), error: envErrors }),
    HttpApiEndpoint.get("read", "/api/tools/:id/storage", {
      params: id, query: { path: Schema.optional(Schema.String), signedUrl: Schema.optional(Schema.String) },
      success: Envelope(Schema.Unknown), error: envErrors
    }),
    HttpApiEndpoint.delete("remove", "/api/tools/:id/storage", {
      params: id, query: { path: Schema.optional(Schema.String) }, success: Envelope(Schema.Unknown), error: envErrors
    }),
    HttpApiEndpoint.get("export", "/api/tools/export-import", { query: exportQuery, success: Schema.Unknown, error: envErrors }),
    HttpApiEndpoint.post("import", "/api/tools/export-import", { payload: Schema.Unknown, success: Envelope(Schema.Unknown), error: envErrors }),
    // Legacy duplicate that ignores `:id` (identical handler).
    HttpApiEndpoint.get("exportById", "/api/tools/:id/export-import", { params: id, query: exportQuery, success: Schema.Unknown, error: envErrors }),
    HttpApiEndpoint.post("importById", "/api/tools/:id/export-import", { params: id, payload: Schema.Unknown, success: Envelope(Schema.Unknown), error: envErrors })
  )
{}
