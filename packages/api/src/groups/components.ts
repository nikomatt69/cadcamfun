import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, EnvBadRequest, EnvForbidden, EnvInternal, EnvMethodNotAllowed, EnvNotFound, Envelope, Forbidden, InternalError, NotFound } from "../errors.ts"

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

/** POST /api/components: the project comes from the body. */
export const ComponentCreateBody = Schema.Struct({ ...ComponentBody.fields, projectId: Schema.optional(Schema.String) })

/** GET /api/components/:id/details: the component with its project, the viewer's rights and a usage count. */
export const ComponentFullDetail = Schema.Struct({
  ...ComponentRow.fields,
  project: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    description: NullStr,
    ownerId: Schema.String,
    owner: Schema.Struct({ id: Schema.String, name: NullStr, email: NullStr }),
    organization: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String, users: Schema.Array(Schema.Struct({ role: Schema.String })) }))
  }),
  usageStats: Schema.Struct({ usedInDrawings: Schema.Number }),
  canEdit: Schema.Boolean,
  canDelete: Schema.Boolean
})

export const ComponentRelationships = Schema.Struct({
  relatedComponents: Schema.Array(Schema.Struct({
    id: Schema.String, name: Schema.String, description: NullStr, type: NullStr, projectId: Schema.String, isPublic: Schema.Boolean
  })),
  relationships: Schema.Array(Schema.Struct({ sourceId: Schema.String, targetId: Schema.String, type: Schema.Literal("references") }))
})

/** Structural report of a component. The times and the memory figure are estimates from the JSON size, not measurements. */
export const ComponentAnalysis = Schema.Struct({
  complexity: Schema.Struct({ score: Schema.Number, factors: Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.Number, benchmark: Schema.Number })) }),
  performance: Schema.Struct({ score: Schema.Number, metrics: Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.Number, unit: Schema.String, benchmark: Schema.Number })) }),
  compatibility: Schema.Struct({ score: Schema.Number, platforms: Schema.Array(Schema.Struct({ name: Schema.String, compatible: Schema.Boolean })) }),
  usage: Schema.Struct({
    references: Schema.Number,
    lastUsed: Schema.String,
    projects: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, usageCount: Schema.Number }))
  })
})

const id = { id: Schema.String }
const versionParams = { id: Schema.String, versionId: Schema.String }
const commentParams = { id: Schema.String, commentId: Schema.String }
const envErrors = [EnvBadRequest, EnvForbidden, EnvNotFound, EnvInternal]
const storageErrors = [EnvBadRequest, EnvForbidden, EnvNotFound, EnvMethodNotAllowed, EnvInternal]
const Message = Schema.Struct({ message: Schema.String })

export class ComponentsGroup extends HttpApiGroup.make("components")
  .add(
    HttpApiEndpoint.get("list", "/api/components", {
      query: { projectId: Schema.optional(Schema.String), type: Schema.optional(Schema.String), search: Schema.optional(Schema.String), public: Schema.optional(Schema.String) },
      success: Schema.Array(ComponentRow), error: [InternalError]
    }),
    HttpApiEndpoint.post("create", "/api/components", {
      payload: ComponentCreateBody, success: ComponentRow.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, NotFound, InternalError]
    }),
    HttpApiEndpoint.get("details", "/api/components/:id/details", { params: id, success: ComponentFullDetail, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.get("relationships", "/api/components/:id/relationships", { params: id, success: Envelope(ComponentRelationships), error: envErrors }),
    HttpApiEndpoint.get("get", "/api/components/:id", { params: id, success: ComponentDetail, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.put("update", "/api/components/:id", {
      params: id, payload: ComponentBody, success: ComponentUpdated, error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.delete("remove", "/api/components/:id", { params: id, success: Message, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.get("listForProject", "/api/projects/:id/components", { params: id, success: Schema.Array(ComponentRow), error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.post("createForProject", "/api/projects/:id/components", {
      params: id, payload: ComponentBody, success: ComponentRow.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, NotFound, InternalError]
    }),
    HttpApiEndpoint.get("analysis", "/api/components/:id/analysis", { params: id, success: Envelope(ComponentAnalysis), error: envErrors }),
    // The shipped catalogue of CAD parts. Items come in two shapes (library entries and component data), so they stay `Unknown`.
    HttpApiEndpoint.get("library", "/api/components/library", {
      query: { type: Schema.optional(Schema.String), category: Schema.optional(Schema.String), search: Schema.optional(Schema.String) },
      success: Envelope(Schema.Array(Schema.Unknown)), error: [EnvInternal]
    }),
    // Object storage of a component's data (envelope bodies; the POST body is the raw component data).
    HttpApiEndpoint.post("saveStorage", "/api/components/:id/storage", { params: id, payload: Schema.Unknown, success: Envelope(Schema.Unknown), error: storageErrors }),
    HttpApiEndpoint.get("readStorage", "/api/components/:id/storage", {
      params: id, query: { signedUrl: Schema.optional(Schema.String) }, success: Envelope(Schema.Unknown), error: storageErrors
    }),
    HttpApiEndpoint.delete("removeStorage", "/api/components/:id/storage", { params: id, success: Envelope(Schema.Unknown), error: storageErrors }),
    // GET streams a JSON/ZIP download (raw response) or an envelope for `format=bucket`; POST imports into one project.
    HttpApiEndpoint.get("export", "/api/components/export-import", {
      query: { ids: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.String)])), format: Schema.optional(Schema.String) },
      success: Schema.Unknown, error: storageErrors
    }),
    HttpApiEndpoint.post("import", "/api/components/export-import", { payload: Schema.Unknown, success: Envelope(Schema.Unknown), error: storageErrors }),
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
