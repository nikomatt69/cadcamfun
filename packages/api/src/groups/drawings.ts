import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, NotFound } from "../errors.ts"

const NullStr = Schema.NullOr(Schema.String)

export const DrawingRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: NullStr,
  data: Schema.Unknown,
  thumbnail: NullStr,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  projectId: Schema.String
})
export type DrawingRow = typeof DrawingRow.Type

/** GET /api/drawings/:id embeds the project with the caller's role in its organisation. */
export const DrawingDetail = Schema.Struct({
  ...DrawingRow.fields,
  project: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    ownerId: Schema.String,
    organization: Schema.NullOr(Schema.Struct({
      id: Schema.String,
      users: Schema.Array(Schema.Struct({ role: Schema.String }))
    }))
  })
})

// Optional so the handlers can answer with the legacy validation messages.
export const DrawingBody = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(NullStr),
  data: Schema.optional(Schema.Unknown),
  thumbnail: Schema.optional(NullStr)
})

const Message = Schema.Struct({ message: Schema.String })
const id = { id: Schema.String }

export class DrawingsGroup extends HttpApiGroup.make("drawings")
  .add(
    HttpApiEndpoint.get("get", "/api/drawings/:id", { params: id, success: DrawingDetail, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.put("update", "/api/drawings/:id", {
      params: id, payload: DrawingBody, success: DrawingRow, error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.delete("remove", "/api/drawings/:id", { params: id, success: Message, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.get("listForProject", "/api/projects/:id/drawings", { params: id, success: Schema.Array(DrawingRow), error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.post("createForProject", "/api/projects/:id/drawings", {
      params: id, payload: DrawingBody, success: DrawingRow.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, NotFound, InternalError]
    })
  )
{}
