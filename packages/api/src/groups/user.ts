import { Schema } from "effect"
import { Multipart } from "effect/unstable/http"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { BadRequest, InternalError, KeyedInternal, NotFound } from "../errors.ts"

const nullable = Schema.NullOr(Schema.String)
const opt = Schema.optional
const message = Schema.Struct({ message: Schema.String })
const ProfileFields = {
  id: Schema.String, name: nullable, email: nullable, image: nullable, bio: nullable, location: nullable,
  website: nullable, company: nullable, title: nullable, publicProfile: Schema.Boolean, showEmail: Schema.Boolean
}
export const UserProfile = Schema.Struct({ ...ProfileFields, createdAt: Schema.String, _count: Schema.Struct({ projects: Schema.Number }) })
// Multipart fields arrive as strings; the handler validates them with the legacy messages.
export const UserProfileUpdate = Schema.Struct({
  name: opt(Schema.String), bio: opt(Schema.String), location: opt(Schema.String), website: opt(Schema.String),
  company: opt(Schema.String), title: opt(Schema.String), publicProfile: opt(Schema.String), showEmail: opt(Schema.String),
  profileImage: opt(Multipart.FilesSchema)
}).pipe(HttpApiSchema.asMultipart())
export const UserProfileUpdated = Schema.Struct({
  message: Schema.String,
  user: Schema.Struct({ ...ProfileFields, updatedAt: Schema.String }),
  name: nullable, email: nullable, image: nullable
})
export const UserStats = Schema.Struct({
  projectsCount: Schema.Number, drawingsCount: Schema.Number, toolpathsCount: Schema.Number,
  componentsCount: Schema.Number, totalDesigns: Schema.Number, memberSince: Schema.String
})
const Item = Schema.Struct({ id: Schema.String, name: Schema.String, description: nullable, createdAt: Schema.String, updatedAt: Schema.String })
export const UserProjectItem = Item
export const UserThumbItem = Schema.Struct({ ...Item.fields, thumbnail: nullable, projectId: nullable })
export const UserOrganizationItem = Schema.Struct({
  ...Item.fields, role: Schema.String, userCount: Schema.Number, projectCount: Schema.Number
})
export const PublicUser = Schema.Struct({
  id: Schema.String, name: nullable, email: nullable, image: nullable, createdAt: Schema.String,
  organizations: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, role: Schema.String }))
})
export const ApiKeyItem = Schema.Struct({ id: Schema.String, name: Schema.String, createdAt: Schema.String, lastUsed: nullable, expiresAt: nullable })
export const ApiKeyCreate = Schema.Struct({ name: opt(Schema.Unknown) })
export const ApiKeyCreated = Schema.Struct({ message: Schema.String, apiKey: Schema.String, name: Schema.String })
export const PasswordChange = Schema.Struct({ currentPassword: opt(Schema.String), newPassword: opt(Schema.String) })
export const ApiToken = Schema.Struct({
  id: Schema.String, name: Schema.String, prefix: Schema.String, permissions: Schema.Array(Schema.String),
  createdAt: Schema.String, lastUsed: opt(Schema.String), expiresAt: opt(Schema.String), isActive: Schema.Boolean
})
export const TokenCreate = Schema.Struct({ name: opt(Schema.String), permissions: opt(Schema.Unknown), expiresIn: opt(Schema.Number) })
export class TokenBadRequest extends Schema.TaggedError<TokenBadRequest>()("TokenBadRequest", { error: Schema.String }, { httpApiStatus: 400 }) {}
const id = { id: Schema.String }

export class UserGroup extends HttpApiGroup.make("user")
  .add(
    HttpApiEndpoint.get("profile", "/api/user/profile", { success: UserProfile, error: [NotFound, InternalError] }),
    HttpApiEndpoint.put("updateProfile", "/api/user/profile", { payload: UserProfileUpdate, success: UserProfileUpdated, error: [BadRequest, InternalError] }),
    HttpApiEndpoint.get("stats", "/api/user/stats", { success: UserStats, error: KeyedInternal }),
    HttpApiEndpoint.get("components", "/api/user/components", { success: Schema.Array(UserThumbItem), error: InternalError }),
    HttpApiEndpoint.get("projects", "/api/user/projects", { success: Schema.Array(UserProjectItem), error: InternalError }),
    HttpApiEndpoint.get("toolpaths", "/api/user/toolpaths", { success: Schema.Array(UserThumbItem), error: InternalError }),
    HttpApiEndpoint.get("organizations", "/api/user/organizations", { success: Schema.Array(UserOrganizationItem), error: InternalError }),
    HttpApiEndpoint.get("apiKeys", "/api/user/api-keys", { success: Schema.Array(ApiKeyItem), error: InternalError }),
    HttpApiEndpoint.post("createApiKey", "/api/user/api-keys", {
      payload: ApiKeyCreate, success: ApiKeyCreated.pipe(Schema.annotate({ httpApiStatus: 201 })), error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.delete("revokeApiKey", "/api/user/api-keys", { query: { keyId: opt(Schema.String) }, success: message, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.delete("deleteAccount", "/api/user/delete-account", { success: message, error: [NotFound, InternalError] }),
    HttpApiEndpoint.put("password", "/api/user/password", { payload: PasswordChange, success: message, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.get("tokens", "/api/user/tokens", { success: Schema.Struct({ tokens: Schema.Array(ApiToken) }), error: KeyedInternal }),
    HttpApiEndpoint.post("createToken", "/api/user/tokens", {
      payload: TokenCreate,
      success: Schema.Struct({ token: ApiToken, fullToken: Schema.String }).pipe(Schema.annotate({ httpApiStatus: 201 })),
      error: [TokenBadRequest, KeyedInternal]
    }),
    HttpApiEndpoint.get("verifyChange", "/api/user/verify-change", {
      query: { token: opt(Schema.String), type: opt(Schema.String), password: opt(Schema.String) },
      success: message, error: [BadRequest, NotFound, InternalError]
    }),
    HttpApiEndpoint.get("byId", "/api/user/:id", { params: id, success: PublicUser, error: [BadRequest, NotFound, InternalError] })
  )
{}
