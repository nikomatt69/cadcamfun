import { Authorization, CurrentUser, Unauthorized } from "@cadcamfun/api"
import { Effect, Layer, Redacted } from "effect"
import { timingSafeEqual } from "node:crypto"
import { AppConfigService } from "../config.ts"
import { LocalProfile } from "../services/local-profile.ts"

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function*() {
    const config = yield* AppConfigService
    const { user } = yield* LocalProfile
    return Authorization.of({
      bearer: Effect.fn("Authorization.bearer")(function*(httpEffect, { credential }) {
        if (!safeEqual(Redacted.value(credential), Redacted.value(config.token))) {
          return yield* new Unauthorized({ message: "Unauthorized" })
        }
        return yield* Effect.provideService(httpEffect, CurrentUser, user)
      })
    })
  })
)
