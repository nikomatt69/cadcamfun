import { SessionUser, Unauthorized } from "@cadcamfun/api"
import { DEFAULT_ISSUER, DESKTOP_CLIENT_ID, IDENTITY_AUDIENCE, MOBILE_CLIENT_ID, normalizeIssuer } from "@cadcamfun/identity/client"
import { Context, Effect, Layer, Schema } from "effect"
import { createRemoteJWKSet, jwtVerify } from "jose"
import { AppConfigService } from "../config.ts"
import { AuthRepo } from "../repos/auth-repo.ts"

const Claims = Schema.Struct({
  sub: Schema.String, email: Schema.String, exp: Schema.Number,
  client_id: Schema.Literals([DESKTOP_CLIENT_ID, MOBILE_CLIENT_ID]),
})

/** Only the configured issuer can select a user. Never discover keys from an untrusted JWT. */
export class Identity extends Context.Service<Identity, {
  user(token: string): Effect.Effect<SessionUser, Unauthorized>
}>()("cadcamfun/Identity") {
  static readonly layer = Layer.effect(Identity, Effect.gen(function*() {
    const config = yield* AppConfigService
    const repo = yield* AuthRepo
    const issuer = yield* Effect.try({ try: () => normalizeIssuer(config.identityIssuer ?? DEFAULT_ISSUER), catch: () => new Unauthorized({ message: "Invalid identity issuer configuration" }) })
    const keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { timeoutDuration: 10_000 })
    return Identity.of({
      user: Effect.fn("Identity.user")(function*(token) {
        const claims = yield* Effect.tryPromise({
          try: async () => (await jwtVerify(token, keys, { issuer, audience: IDENTITY_AUDIENCE, algorithms: ["ES256"], requiredClaims: ["sub", "email", "exp", "iat", "client_id"] })).payload,
          catch: () => new Unauthorized({ message: "Identity session is invalid or expired" }),
        })
        const identity = yield* Schema.decodeUnknownEffect(Claims)(claims).pipe(Effect.mapError(() => new Unauthorized({ message: "Invalid identity claims" })))
        if (!identity.sub || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)) return yield* new Unauthorized({ message: "Invalid identity account" })
        const user = yield* repo.identityUser(issuer, identity.sub, identity.email).pipe(Effect.mapError(() => new Unauthorized({ message: "Could not resolve identity account" })))
        return new SessionUser({ id: user.id, email: user.email, name: user.name })
      }),
    })
  }))
}
