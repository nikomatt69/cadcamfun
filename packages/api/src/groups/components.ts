import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, NotFound } from "../errors.ts"

const NullStr = Schema.NullOr(Schema.String)

export const ComponentRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: NullStr,
  data: Schema.Unknown,
  thumbnail: NullStr,
  type: NullStr,
  isPublic: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  projectId: Schema.String
})
export type ComponentRow = typeof ComponentRow.Type

/** GET /api/components/:id embeds a slim project. */
export const ComponentDetail = Schema.Struct({
  ...ComponentRow.fields,
  project: Schema.Struct({ id: Schema.String, name: Schema.String, ownerId: Schema.String })
})

export const ComponentBody = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(NullStr),
  data: Schema.optional(Schema.Unknown),
  type: Schema.optional(NullStr),
  isPublic: Schema.optional(Schema.Boolean),
  thumbnail: Schema.optional(NullStr)
})

/** Legacy PUT answers with the row spread plus a `message`. */
export const ComponentUpdated = Schema.Struct({ ...ComponentRow.fields, message: Schema.String })

const id = { id: Schema.String }
const Message = Schema.Struct({ message: Schema.String })

export class ComponentsGroup extends HttpApiGroup.make("components")
  .add(
    HttpApiEndpoint.get("get", "/api/components/:id", { params: id, success: ComponentDetail, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.put("update", "/api/components/:id", {
      params: id, payload: ComponentBody, success: ComponentUpdated, error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.delete("remove", "/api/components/:id", { params: id, success: Message, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.get("listForProject", "/api/projects/:id/components", { params: id, success: Schema.Array(ComponentRow), error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.post("createForProject", "/api/projects/:id/components", {
      params: id, payload: ComponentBody, success: ComponentRow.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, NotFound, InternalError]
    })
  )
{}
