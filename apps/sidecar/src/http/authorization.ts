import { Authorization, CurrentUser, SessionUser, Unauthorized } from "@cadcamfun/api"
import { Effect, Layer, Redacted } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { timingSafeEqual } from "node:crypto"
import { AppConfigService } from "../config.ts"
import { AuthRepo } from "../repos/auth-repo.ts"
import { AuthTokens } from "../services/auth-tokens.ts"
import { BridgeTokens } from "../services/bridge-tokens.ts"
import { Identity } from "../services/identity.ts"
import { LocalProfile } from "../services/local-profile.ts"

/** Header carrying the session JWT issued by sign-in / magic-link verification. */
export const SESSION_HEADER = "x-session-token"

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Two layers: the per-launch bearer token proves the caller is the desktop shell; an
 * optional session token then selects *which* account the request acts as. A missing,
 * expired, forged or orphaned session token falls back to the local profile, so a stale
 * token in the webview can never lock the app out.
 */
export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function*() {
    const config = yield* AppConfigService
    const tokens = yield* AuthTokens
    const identity = yield* Identity
    const bridge = yield* BridgeTokens
    const repo = yield* AuthRepo
    const { user: local } = yield* LocalProfile

    const sessionUser = Effect.fn("Authorization.sessionUser")(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest
      const accountToken = request.headers["x-identity-token"]
      if (accountToken) return yield* identity.user(accountToken)
      const token = request.headers[SESSION_HEADER]
      if (!token) return local
      const claims = yield* tokens.verify(token).pipe(Effect.option)
      if (claims._tag === "None") return local
      if (claims.value.type !== "session") return local
      const row = yield* repo.findById(claims.value.userId).pipe(Effect.orElseSucceed(() => undefined))
      return row ? new SessionUser({ id: row.id, email: row.email, name: row.name }) : local
    })

    return Authorization.of({
      bearer: Effect.fn("Authorization.bearer")(function*(httpEffect, { credential }) {
        if (!safeEqual(Redacted.value(credential), Redacted.value(config.token))) {
          // Not the application's own token: a scoped bridge token opens the two action-bridge routes and nothing else.
          const grant = yield* bridge.grantOf(Redacted.value(credential))
          if (grant === undefined) return yield* new Unauthorized({ message: "Unauthorized" })
          const request = yield* HttpServerRequest.HttpServerRequest
          const path = request.url.split("?")[0]
          const allowed = (request.method === "GET" && path === "/api/ai/actions") || (request.method === "POST" && path === "/api/ai/actions/invoke")
          if (!allowed) return yield* new Unauthorized({ message: "This token only opens the action bridge" })
          const row = yield* repo.findById(grant.info.userId).pipe(Effect.orElseSucceed(() => undefined))
          return yield* Effect.provideService(httpEffect, CurrentUser, row ? new SessionUser({ id: row.id, email: row.email, name: row.name }) : local)
        }
        return yield* Effect.provideService(httpEffect, CurrentUser, yield* sessionUser())
      })
    })
  })
)
