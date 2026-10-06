import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import { BadRequest, Forbidden, InternalError, NotFound } from "../errors.ts"
import { ProjectWithRelations } from "../projects.ts"

const opt = Schema.optional
const nullable = Schema.NullOr(Schema.String)
const message = Schema.Struct({ message: Schema.String })

/** `{ success: false, error }` failures of the desktop-client routes. */
const failure = { success: Schema.Literal(false), error: Schema.String }
export class DesktopBadRequest extends Schema.TaggedError<DesktopBadRequest>()("DesktopBadRequest", failure, { httpApiStatus: 400 }) {}
export class DesktopUnauthorized extends Schema.TaggedError<DesktopUnauthorized>()("DesktopUnauthorized", failure, { httpApiStatus: 401 }) {}
export class DesktopNotFound extends Schema.TaggedError<DesktopNotFound>()("DesktopNotFound", failure, { httpApiStatus: 404 }) {}
export class DesktopConflict extends Schema.TaggedError<DesktopConflict>()("DesktopConflict", failure, { httpApiStatus: 409 }) {}
export class DesktopInternal extends Schema.TaggedError<DesktopInternal>()("DesktopInternal", failure, { httpApiStatus: 500 }) {}
export class NotifyBadRequest extends Schema.TaggedError<NotifyBadRequest>()("NotifyBadRequest", failure, { httpApiStatus: 400 }) {}
export class NotifyInternal extends Schema.TaggedError<NotifyInternal>()("NotifyInternal", failure, { httpApiStatus: 500 }) {}

export const PushSubscriptionBody = Schema.Struct({
  endpoint: opt(Schema.String), keys: opt(Schema.Struct({ p256dh: opt(Schema.String), auth: opt(Schema.String) }))
})
export const PushDeleteBody = Schema.Struct({ endpoint: opt(Schema.String) })
export const NotifyBody = Schema.Struct({ userId: opt(Schema.String), message: opt(Schema.Unknown) })
export const DesktopSignInBody = Schema.Struct({
  email: opt(Schema.String), password: opt(Schema.String), deviceId: opt(Schema.String), platform: opt(Schema.String)
})
export const DesktopSignInReply = Schema.Struct({
  success: Schema.Literal(true), token: Schema.String,
  user: Schema.Struct({ id: Schema.String, name: nullable, email: nullable, image: nullable }),
  syncData: Schema.Struct({ lastSync: Schema.String, version: Schema.String })
})
export const DesktopProject = Schema.Struct({
  id: Schema.String, name: Schema.String, description: nullable, owner_id: Schema.String, organization_id: nullable,
  is_public: Schema.Boolean, created_at: Schema.String, updated_at: Schema.String
})
export const DesktopProjectBody = Schema.Struct({
  name: opt(Schema.Unknown), description: opt(Schema.String), organization_id: opt(Schema.String), is_public: opt(Schema.Boolean)
})
const DesktopEnvelope = <A extends Schema.Top>(data: A) => Schema.Struct({ success: Schema.Literal(true), data, message: Schema.String })
export const DesktopUser = Schema.Struct({
  id: Schema.String, name: nullable, email: nullable, image: nullable, created_at: Schema.String, updated_at: Schema.String
})
const id = { id: Schema.String }
const trackedBody = Schema.Struct({ name: opt(Schema.String), description: opt(Schema.NullOr(Schema.String)), organizationId: opt(Schema.NullOr(Schema.String)) })

export class MiscGroup extends HttpApiGroup.make("misc")
  .add(
    HttpApiEndpoint.post("pushSubscribe", "/api/push-subscription", {
      payload: PushSubscriptionBody, success: Schema.Struct({ success: Schema.Literal(true), id: Schema.String }), error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.delete("pushUnsubscribe", "/api/push-subscription", {
      payload: PushDeleteBody, success: Schema.Struct({ success: Schema.Literal(true) }), error: [BadRequest, InternalError]
    }),
    HttpApiEndpoint.post("notify", "/api/app-control/notify", {
      payload: NotifyBody, success: Schema.Struct({ success: Schema.Literal(true), message: Schema.String }), error: [NotifyBadRequest, NotifyInternal]
    }),
    HttpApiEndpoint.post("desktopSignin", "/api/desktop/auth/signin", {
      payload: DesktopSignInBody, success: DesktopSignInReply, error: [DesktopBadRequest, DesktopUnauthorized, DesktopInternal]
    }),
    HttpApiEndpoint.get("desktopProjects", "/api/desktop/projects", {
      success: DesktopEnvelope(Schema.Array(DesktopProject)), error: DesktopInternal
    }),
    HttpApiEndpoint.post("desktopCreateProject", "/api/desktop/projects", {
      payload: DesktopProjectBody, success: DesktopEnvelope(DesktopProject).pipe(Schema.annotate({ httpApiStatus: 201 })),
      error: [DesktopBadRequest, DesktopConflict, DesktopInternal]
    }),
    HttpApiEndpoint.get("desktopUserByEmail", "/api/desktop/user/by-email", {
      query: { email: opt(Schema.String) }, success: DesktopEnvelope(DesktopUser), error: [DesktopBadRequest, DesktopNotFound, DesktopInternal]
    }),
    HttpApiEndpoint.get("trackedGet", "/api/projects/tracked/:id", { params: id, success: ProjectWithRelations, error: [BadRequest, NotFound, InternalError] }),
    HttpApiEndpoint.put("trackedUpdate", "/api/projects/tracked/:id", {
      params: id, payload: trackedBody, success: ProjectWithRelations, error: [BadRequest, Forbidden, NotFound, InternalError]
    }),
    HttpApiEndpoint.delete("trackedRemove", "/api/projects/tracked/:id", { params: id, success: message, error: [BadRequest, Forbidden, NotFound, InternalError] })
  )
{}
