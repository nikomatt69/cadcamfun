import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, NotFound } from "./errors.ts"

// ---- Shapes identical to `.reference/src/pages/api/projects/*` (JSON dates are ISO strings) ----

const UserRef = Schema.Struct({ id: Schema.String, name: Schema.NullOr(Schema.String), email: Schema.NullOr(Schema.String) })
const OrgRef = Schema.Struct({ id: Schema.String, name: Schema.String })

export const ProjectRow = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  ownerId: Schema.String,
  organizationId: Schema.NullOr(Schema.String),
  isPublic: Schema.Boolean
})
export type ProjectRow = typeof ProjectRow.Type

export const ProjectWithRelations = Schema.Struct({
  ...ProjectRow.fields,
  owner: UserRef,
  organization: Schema.NullOr(OrgRef),
  _count: Schema.Struct({ drawings: Schema.Number, components: Schema.Number })
})
export type ProjectWithRelations = typeof ProjectWithRelations.Type

export const CreateProjectBody = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  organizationId: Schema.optional(Schema.NullOr(Schema.String)),
  isPublic: Schema.optional(Schema.Boolean)
})
export const UpdateProjectBody = CreateProjectBody

const Message = Schema.Struct({ message: Schema.String })
const id = { id: Schema.String }

export class ProjectsGroup extends HttpApiGroup.make("projects")
  .add(
    HttpApiEndpoint.get("list", "/api/projects", { success: Schema.Array(ProjectWithRelations), error: InternalError }),
    HttpApiEndpoint.post("create", "/api/projects", {
      payload: CreateProjectBody,
      success: ProjectRow.pipe(Schema.annotate({ httpApiStatus: 201 })),
      error: [BadRequest, Forbidden, InternalError]
    }),
    HttpApiEndpoint.get("get", "/api/projects/:id", { params: id, success: ProjectWithRelations, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.put("update", "/api/projects/:id", {
      params: id,
      payload: UpdateProjectBody,
      success: ProjectWithRelations,
      error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.delete("remove", "/api/projects/:id", {
      params: id,
      success: Message,
      error: [BadRequest, Forbidden, NotFound, InternalError]
    })
  )
{}
