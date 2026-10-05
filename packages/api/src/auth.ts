import { Context, Schema } from "effect"
import { HttpApiMiddleware, HttpApiSecurity } from "effect/unstable/httpapi"
import { Unauthorized } from "./errors.ts"

export class SessionUser extends Schema.Class<SessionUser>("cadcamfun/SessionUser")({
  id: Schema.String,
  email: Schema.NullOr(Schema.String),
  name: Schema.NullOr(Schema.String)
}) {}

/** Equivalent of the legacy `requireAuth(req, res)`: the authenticated user id, available to every handler. */
export class CurrentUser extends Context.Service<CurrentUser, SessionUser>()("cadcamfun/api/CurrentUser") {}

/** Bearer-token guard (per-launch token from the Tauri shell, see specs/05). Provides `CurrentUser`. */
export class Authorization extends HttpApiMiddleware.Service<Authorization, { provides: CurrentUser; requires: never }>()(
  "cadcamfun/api/Authorization",
  {
    requiredForClient: true,
    security: { bearer: HttpApiSecurity.bearer },
    error: Unauthorized
  }
) {}
