import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, NotFound } from "../errors.ts"

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
const id = { id: Schema.String }
export class OrganizationsGroup extends HttpApiGroup.make("organizations")
  .add(
    HttpApiEndpoint.get("list", "/api/organizations", { success: Schema.Array(OrganizationSummary), error: InternalError }),
    HttpApiEndpoint.post("create", "/api/organizations", { payload: OrganizationBody, success: OrganizationRow.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, InternalError] }),
    HttpApiEndpoint.get("get", "/api/organizations/:id", { params: id, success: OrganizationDetails, error: [BadRequest, Forbidden, NotFound, InternalError] }),
    HttpApiEndpoint.put("update", "/api/organizations/:id", { params: id, payload: OrganizationBody, success: OrganizationRow, error: [BadRequest, Forbidden, InternalError] }),
    HttpApiEndpoint.delete("remove", "/api/organizations/:id", { params: id, success: Schema.Struct({ message: Schema.String }), error: [BadRequest, Forbidden, InternalError] })
  )
{}
