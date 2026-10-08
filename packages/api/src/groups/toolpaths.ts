import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, EnvBadRequest, EnvForbidden, EnvInternal, EnvMethodNotAllowed, EnvNotFound, EnvelopeOpt, Forbidden, InternalError, NotFound } from "../errors.ts"

const NullStr = Schema.NullOr(Schema.String)

export const ToolpathRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: NullStr,
  data: Schema.Unknown,
  type: NullStr,
  operationType: NullStr,
  gcode: NullStr,
  thumbnail: NullStr,
  isPublic: Schema.Boolean,
  projectId: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  createdBy: Schema.String,
  drawingId: NullStr,
  materialId: NullStr,
  toolId: NullStr,
  machineConfigId: NullStr
})
export type ToolpathRow = typeof ToolpathRow.Type

export const ToolpathDetail = Schema.Struct({
  ...ToolpathRow.fields,
  project: Schema.Struct({ id: Schema.String, name: Schema.String, ownerId: Schema.String })
})

/** `GET /api/drawings/:id/toolpaths` embeds the linked material, machine config and tool. */
export const ToolpathWithRefs = Schema.Struct({
  ...ToolpathRow.fields,
  Material: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String })),
  MachineConfig: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String, type: Schema.String })),
  Tool: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String, type: Schema.String, diameter: Schema.Number }))
})

const opt = <A extends Schema.Top>(s: A) => Schema.optional(s)
export const ToolpathBody = Schema.Struct({
  name: opt(Schema.String),
  description: opt(NullStr),
  data: opt(Schema.Unknown),
  gcode: opt(NullStr),
  projectId: opt(Schema.String),
  type: opt(NullStr),
  operationType: opt(NullStr),
  isPublic: opt(Schema.Boolean),
  thumbnail: opt(NullStr),
  materialId: opt(NullStr),
  machineConfigId: opt(NullStr),
  toolId: opt(NullStr),
  simulation: opt(Schema.Unknown)
})

export const ToolpathUpdated = Schema.Struct({ ...ToolpathRow.fields, message: Schema.String })
const id = { id: Schema.String }
const Message = Schema.Struct({ message: Schema.String })

export class ToolpathsGroup extends HttpApiGroup.make("toolpaths")
  .add(
    HttpApiEndpoint.get("list", "/api/toolpaths", {
      query: { projectId: opt(Schema.String), type: opt(Schema.String), operationType: opt(Schema.String), search: opt(Schema.String), public: opt(Schema.String) },
      success: Schema.Array(ToolpathRow), error: InternalError
    }),
    HttpApiEndpoint.post("create", "/api/toolpaths", {
      payload: ToolpathBody, success: ToolpathRow.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, NotFound, InternalError]
    }),
    HttpApiEndpoint.get("get", "/api/toolpaths/:id", { params: id, success: ToolpathDetail, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.put("update", "/api/toolpaths/:id", {
      params: id, payload: ToolpathBody, success: ToolpathUpdated, error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.delete("remove", "/api/toolpaths/:id", { params: id, success: Message, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.get("listForDrawing", "/api/drawings/:id/toolpaths", { params: id, success: Schema.Array(ToolpathWithRefs), error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.post("createForDrawing", "/api/drawings/:id/toolpaths", {
      params: id, payload: ToolpathBody, success: ToolpathRow.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, NotFound, InternalError]
    })
  )
{}

// Envelope variant (lib/api/helpers): the project id comes from the *query string* (`?projectId=`), as in the legacy handler.
const envErrors = [EnvBadRequest, EnvForbidden, EnvNotFound, EnvMethodNotAllowed, EnvInternal] as const
export class ProjectToolpathsGroup extends HttpApiGroup.make("projectToolpaths")
  .add(
    HttpApiEndpoint.get("list", "/api/projects/:id/toolpaths", { params: id, query: { projectId: opt(Schema.String) }, success: EnvelopeOpt(Schema.Unknown), error: envErrors }),
    HttpApiEndpoint.post("create", "/api/projects/:id/toolpaths", {
      params: id, query: { projectId: opt(Schema.String) }, payload: ToolpathBody, success: EnvelopeOpt(Schema.Unknown), error: envErrors
    })
  )
{}

/** Legacy `ToolpathVersion` row; `GET versions` embeds the author's name and email. */
export const ToolpathVersionRow = Schema.Struct({
  id: Schema.String,
  toolpathId: Schema.String,
  data: Schema.Unknown,
  gcode: NullStr,
  changeMessage: NullStr,
  userId: Schema.String,
  createdAt: Schema.String
})
export type ToolpathVersionRow = typeof ToolpathVersionRow.Type

export const ToolpathVersionWithUser = Schema.Struct({
  ...ToolpathVersionRow.fields,
  user: Schema.NullOr(Schema.Struct({ name: NullStr, email: NullStr }))
})

/** Legacy `ToolpathComment` row with the author embedded (`id, name, email, image`). */
export const ToolpathCommentRow = Schema.Struct({
  id: Schema.String,
  toolpathId: Schema.String,
  content: Schema.String,
  userId: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  user: Schema.NullOr(Schema.Struct({ id: Schema.String, name: NullStr, email: NullStr, image: NullStr }))
})
export type ToolpathCommentRow = typeof ToolpathCommentRow.Type

/** One entry of the predefined toolpath library (`GET /api/toolpaths/library`). */
export const ToolpathLibraryItem = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  type: Schema.String,
  operationType: Schema.String,
  category: Schema.String,
  tags: Schema.Array(Schema.String),
  data: Schema.Unknown,
  gcode: Schema.String,
  projectId: Schema.String
})
export type ToolpathLibraryItem = typeof ToolpathLibraryItem.Type

const commentId = { id: Schema.String, commentId: Schema.String }

export class ToolpathExtrasGroup extends HttpApiGroup.make("toolpathExtras")
  .add(
    HttpApiEndpoint.get("library", "/api/toolpaths/library", {
      query: { projectId: Schema.String, type: opt(Schema.String), operationType: opt(Schema.String), category: opt(Schema.String), search: opt(Schema.String) },
      success: Schema.Array(ToolpathLibraryItem), error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.get("listVersions", "/api/toolpaths/:id/versions", { params: id, success: Schema.Array(ToolpathVersionWithUser), error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.post("createVersion", "/api/toolpaths/:id/versions", {
      params: id,
      payload: Schema.Struct({ data: opt(Schema.Unknown), gcode: opt(Schema.String), changeMessage: opt(Schema.String) }),
      success: Schema.Struct({ ...ToolpathVersionRow.fields, message: Schema.String }).pipe(Schema.annotate({ httpApiStatus: 201 })),
      error: [BadRequest, NotFound, InternalError]
    }),
    HttpApiEndpoint.post("restoreVersion", "/api/toolpaths/:id/versions/restore", {
      params: id, payload: Schema.Struct({ versionId: Schema.String }), success: ToolpathUpdated,
      error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.get("listComments", "/api/toolpaths/:id/comments", { params: id, success: Schema.Array(ToolpathCommentRow), error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.post("createComment", "/api/toolpaths/:id/comments", {
      params: id, payload: Schema.Struct({ content: Schema.String }), success: ToolpathCommentRow.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, NotFound, InternalError]
    }),
    HttpApiEndpoint.put("updateComment", "/api/toolpaths/:id/comments/:commentId", {
      params: commentId, payload: Schema.Struct({ content: Schema.String }), success: ToolpathCommentRow, error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.delete("removeComment", "/api/toolpaths/:id/comments/:commentId", { params: commentId, success: Message, error: [BadRequest, Forbidden, NotFound, InternalError] })
  )
{}
