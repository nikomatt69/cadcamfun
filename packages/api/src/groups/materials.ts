import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, NotFound } from "../errors.ts"

const UserRef = Schema.Struct({ id: Schema.String, name: Schema.NullOr(Schema.String), email: Schema.NullOr(Schema.String) })
const OrgRef = Schema.Struct({ id: Schema.String, name: Schema.String })

export const MaterialRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  properties: Schema.Unknown,
  isPublic: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  ownerId: Schema.NullOr(Schema.String),
  organizationId: Schema.NullOr(Schema.String)
})
export type MaterialRow = typeof MaterialRow.Type

/** GET /api/materials/:id also embeds `owner` and `organization` (legacy `include`). */
export const MaterialDetail = Schema.Struct({
  ...MaterialRow.fields,
  owner: Schema.NullOr(UserRef),
  organization: Schema.NullOr(OrgRef)
})

// Fields are optional because the legacy handlers validate by hand and answer with their own message.
export const MaterialBody = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  properties: Schema.optional(Schema.Unknown),
  organizationId: Schema.optional(Schema.NullOr(Schema.String)),
  isPublic: Schema.optional(Schema.Boolean)
})

const Message = Schema.Struct({ message: Schema.String })
const id = { id: Schema.String }

export class MaterialsGroup extends HttpApiGroup.make("materials")
  .add(
    HttpApiEndpoint.get("list", "/api/materials", {
      query: { search: Schema.optional(Schema.String), public: Schema.optional(Schema.String) },
      success: Schema.Array(MaterialRow),
      error: InternalError
    }),
    HttpApiEndpoint.post("create", "/api/materials", {
      payload: MaterialBody,
      success: MaterialRow.pipe(Schema.annotate({ httpApiStatus: 201 })),
      error: [BadRequest, Forbidden, InternalError]
    }),
    HttpApiEndpoint.get("get", "/api/materials/:id", { params: id, success: MaterialDetail, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.put("update", "/api/materials/:id", {
      params: id,
      payload: MaterialBody,
      success: MaterialRow,
      error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.delete("remove", "/api/materials/:id", {
      params: id,
      success: Message,
      error: [BadRequest, Forbidden, NotFound, InternalError]
    })
  )
{}

// ---- /api/materials/:id/storage and /api/materials/export-import (envelope responses) ----
import { EnvBadRequest, EnvForbidden, EnvInternal, EnvMethodNotAllowed, EnvNotFound } from "../errors.ts"
import { Envelope } from "../errors.ts"

const envErrors = [EnvBadRequest, EnvForbidden, EnvNotFound, EnvMethodNotAllowed, EnvInternal] as const

export class MaterialsStorageGroup extends HttpApiGroup.make("materialsStorage")
  .add(
    // Body is the raw material data (any JSON).
    HttpApiEndpoint.post("save", "/api/materials/:id/storage", { params: id, payload: Schema.Unknown, success: Envelope(Schema.Unknown), error: envErrors }),
    HttpApiEndpoint.get("read", "/api/materials/:id/storage", {
      params: id,
      query: { signedUrl: Schema.optional(Schema.String) },
      success: Envelope(Schema.Unknown),
      error: envErrors
    }),
    HttpApiEndpoint.delete("remove", "/api/materials/:id/storage", { params: id, success: Envelope(Schema.Unknown), error: envErrors }),
    // GET streams JSON/ZIP downloads (raw response) or an envelope for `format=bucket`.
    HttpApiEndpoint.get("export", "/api/materials/export-import", {
      query: { ids: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.String)])), format: Schema.optional(Schema.String) },
      success: Schema.Unknown,
      error: envErrors
    }),
    HttpApiEndpoint.post("import", "/api/materials/export-import", { payload: Schema.Unknown, success: Envelope(Schema.Unknown), error: envErrors })
  )
{}
