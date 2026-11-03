import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, EnvBadRequest, EnvForbidden, EnvInternal, EnvNotFound, Envelope, Forbidden, InternalError, NotFound } from "../errors.ts"

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

const Person = Schema.Struct({ name: NullStr, email: NullStr })
/** A saved state of a component's data; list and get embed the author. */
export const ComponentVersionRow = Schema.Struct({
  id: Schema.String,
  componentId: Schema.String,
  data: Schema.Unknown,
  changeMessage: NullStr,
  userId: Schema.String,
  createdAt: Schema.String
})
export const ComponentVersionDetail = Schema.Struct({ ...ComponentVersionRow.fields, user: Person })
export const ComponentVersionBody = Schema.Struct({ data: Schema.optional(Schema.Unknown), changeMessage: Schema.optional(Schema.String) })
export const ComponentVersionCreated = Schema.Struct({ ...ComponentVersionRow.fields, message: Schema.String })
/** Legacy bodies also carry the component `id`; the path already names it, so it is not part of the payload (extra keys are ignored). */
export const ComponentRestoreBody = Schema.Struct({ versionId: Schema.optional(Schema.String) })

export const ComponentCommentRow = Schema.Struct({
  id: Schema.String,
  componentId: Schema.String,
  content: Schema.String,
  userId: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  user: Schema.Struct({ id: Schema.String, name: NullStr, email: NullStr, image: NullStr })
})
export const ComponentCommentBody = Schema.Struct({ content: Schema.optional(Schema.String) })

const id = { id: Schema.String }
const versionParams = { id: Schema.String, versionId: Schema.String }
const commentParams = { id: Schema.String, commentId: Schema.String }
const envErrors = [EnvBadRequest, EnvForbidden, EnvNotFound, EnvInternal]
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
    }),
    // Versions: the bodies are plain (legacy answered `res.json`), the single-version read uses the envelope.
    HttpApiEndpoint.get("listVersions", "/api/components/:id/versions", { params: id, success: Schema.Array(ComponentVersionDetail), error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.post("createVersion", "/api/components/:id/versions", {
      params: id, payload: ComponentVersionBody, success: ComponentVersionCreated.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, NotFound, InternalError]
    }),
    HttpApiEndpoint.post("restoreVersion", "/api/components/:id/versions/restore", {
      params: id, payload: ComponentRestoreBody, success: ComponentUpdated, error: [BadRequest, NotFound, InternalError]
    }),
    HttpApiEndpoint.get("getVersion", "/api/components/:id/versions/:versionId", { params: versionParams, success: Envelope(ComponentVersionDetail), error: envErrors }),
    // Comments: envelope bodies.
    HttpApiEndpoint.get("listComments", "/api/components/:id/comments", { params: id, success: Envelope(Schema.Array(ComponentCommentRow)), error: envErrors }),
    HttpApiEndpoint.post("addComment", "/api/components/:id/comments", { params: id, payload: ComponentCommentBody, success: Envelope(ComponentCommentRow), error: envErrors }),
    HttpApiEndpoint.put("editComment", "/api/components/:id/comments/:commentId", { params: commentParams, payload: ComponentCommentBody, success: Envelope(ComponentCommentRow), error: envErrors }),
    HttpApiEndpoint.delete("removeComment", "/api/components/:id/comments/:commentId", { params: commentParams, success: Envelope(Schema.Null), error: envErrors })
  )
{}
