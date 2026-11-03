import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, NotFound } from "../errors.ts"
import { CreateProjectBody, ProjectRow, ProjectWithRelations } from "../projects.ts"

const nullable = Schema.NullOr(Schema.String)
export const OrganizationRole = Schema.Literals(["ADMIN", "MANAGER", "MEMBER"])
export const OrganizationBody = Schema.Struct({ name: Schema.String, description: Schema.optional(nullable) })
export const OrganizationRow = Schema.Struct({
  id: Schema.String, name: Schema.String, description: nullable, createdAt: Schema.String, updatedAt: Schema.String
})
export const OrganizationSummary = Schema.Struct({
  ...OrganizationRow.fields, role: OrganizationRole, userCount: Schema.Number, projectCount: Schema.Number
})
export const OrganizationMember = Schema.Struct({
  id: Schema.String, name: nullable, email: nullable, image: nullable, role: OrganizationRole, joinedAt: Schema.String
})
export const OrganizationDetails = Schema.Struct({
  ...OrganizationRow.fields, members: Schema.Array(OrganizationMember), projectCount: Schema.Number, userRole: OrganizationRole
})
/** A membership with its user, as `GET /api/organizations/:id/members` lists it (the `UserOrganization` row plus `user`). */
export const OrganizationMembership = Schema.Struct({
  id: Schema.String, userId: Schema.String, organizationId: Schema.String, role: OrganizationRole, joinedAt: Schema.String,
  user: Schema.Struct({ id: Schema.String, name: nullable, email: nullable, image: nullable })
})
/** `role` is checked by the handler (an unknown role is a 400 with the legacy wording, not a schema error). */
export const MemberRoleBody = Schema.Struct({ memberId: Schema.optional(Schema.String), role: Schema.optional(Schema.String) })
export const MemberRemoveBody = Schema.Struct({ memberId: Schema.optional(Schema.String) })
export const InviteBody = Schema.Struct({ email: Schema.optional(Schema.String), role: Schema.optional(Schema.String) })
const InvitationRef = Schema.Struct({ id: Schema.String, email: Schema.String, role: OrganizationRole, expiresAt: Schema.String })
/**
 * The legacy route answered 201 for a new invitation and 200 for a renewed one; the generated clients take one success schema per
 * endpoint, so both answer 201 and the `message` tells them apart. No mail server is configured: `inviteUrl` is the link to hand
 * over (legacy only e-mailed it), and it is only ever returned to the member who may invite.
 */
export const InvitationSaved = Schema.Struct({
  message: Schema.Literals(["Invitation created and sent", "Invitation updated and sent"]), invitation: InvitationRef, inviteUrl: Schema.String
})
const Msg = Schema.Struct({ message: Schema.String })
const id = { id: Schema.String }
export class OrganizationsGroup extends HttpApiGroup.make("organizations")
  .add(
    HttpApiEndpoint.get("list", "/api/organizations", { success: Schema.Array(OrganizationSummary), error: InternalError }),
    HttpApiEndpoint.post("create", "/api/organizations", { payload: OrganizationBody, success: OrganizationRow.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, InternalError] }),
    HttpApiEndpoint.get("get", "/api/organizations/:id", { params: id, success: OrganizationDetails, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.put("update", "/api/organizations/:id", { params: id, payload: OrganizationBody, success: OrganizationRow, error: [BadRequest, Forbidden, InternalError] }),
    HttpApiEndpoint.delete("remove", "/api/organizations/:id", { params: id, success: Schema.Struct({ message: Schema.String }), error: [BadRequest, Forbidden, InternalError] }),
    HttpApiEndpoint.get("members", "/api/organizations/:id/members", {
      params: id, query: { search: Schema.optional(Schema.String) }, success: Schema.Array(OrganizationMembership), error: [BadRequest, Forbidden, InternalError]
    }),
    HttpApiEndpoint.put("setMemberRole", "/api/organizations/:id/members", {
      params: id, payload: MemberRoleBody, success: OrganizationMembership, error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.delete("removeMember", "/api/organizations/:id/members", {
      params: id, payload: MemberRemoveBody, success: Msg, error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.post("invite", "/api/organizations/:id/invite", {
      params: id, payload: InviteBody,
      success: InvitationSaved.pipe(Schema.annotate({ httpApiStatus: 201 })),
      error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.get("projects", "/api/organizations/:id/projects", { params: id, success: Schema.Array(ProjectWithRelations), error: [BadRequest, Forbidden, InternalError] }),
    HttpApiEndpoint.post("createProject", "/api/organizations/:id/projects", {
      params: id, payload: Schema.Struct({ name: CreateProjectBody.fields.name, description: CreateProjectBody.fields.description }),
      success: ProjectRow.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, Forbidden, InternalError]
    })
  )
{}
