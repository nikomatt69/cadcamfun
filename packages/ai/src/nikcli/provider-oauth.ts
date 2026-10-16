import { Effect, Schema } from "effect"
import { AiConfigError } from "../errors.ts"
import type { ProjectHost } from "./runtime.ts"
import { SUBSCRIPTION_PROVIDERS, readOAuthGrants } from "./oauth-store.ts"

const Authorization = Schema.Struct({
  url: Schema.String, instructions: Schema.String,
  method: Schema.Literals(["auto", "code", "auto-code"])
})
export interface OAuthAuthorization extends Schema.Schema.Type<typeof Authorization> {
  readonly attemptId: string
}

/** The native plugin owns PKCE, callback listeners, token exchange and renewal. */
export const providerOAuth = (host: () => Effect.Effect<ProjectHost, AiConfigError>, authFile: string) => {
  let pending: { provider: string; id: string; method: number; callback: string; host: ProjectHost; expires: number; completing: boolean } | undefined
  let starting = false
  const error = (message: string) => new AiConfigError({ message })
  const idle = Effect.suspend(() => {
    if (starting || (pending && (pending.completing || pending.expires > Date.now()))) {
      return Effect.fail(error("Finish the current provider sign-in before changing credentials."))
    }
    pending = undefined
    return Effect.void
  })
  return {
    idle,
    authorize: Effect.fn("ProviderOAuth.authorize")(function*(provider: string) {
      if (!(SUBSCRIPTION_PROVIDERS as ReadonlyArray<string>).includes(provider)) return yield* error("This provider does not support subscription sign-in.")
      yield* idle
      starting = true
      return yield* Effect.gen(function*() {
        const target = yield* host()
        const result = yield* Effect.tryPromise({
          try: async () => {
            const methods = (await target.client.provider.auth())[provider] ?? []
            const method = methods.findIndex((entry) => entry.type === "oauth")
            if (method < 0) throw new Error("OAuth is unavailable")
            return { method, raw: await target.client.provider.oauthAuthorize({ providerID: provider, method }) }
          },
          // The host failure is the only clue a person has: keep the sanitized sentence but name the cause
          // (a busy callback port during a restart, a plugin that refused, a browser-less authorization).
          catch: (cause) => error(`Could not start provider sign-in. ${cause instanceof Error ? cause.message : String(cause)}`)
        })
        const value = yield* Schema.decodeUnknownEffect(Authorization)(result.raw).pipe(Effect.mapError(() => error("The provider returned an invalid sign-in response.")))
        const secure = yield* Effect.try({ try: () => new URL(value.url).protocol === "https:", catch: () => error("The provider returned an invalid sign-in URL.") })
        if (!secure) return yield* error("The provider returned an invalid sign-in URL.")
        pending = { provider, id: crypto.randomUUID(), method: result.method, callback: value.method, host: target, expires: Date.now() + 5 * 60_000, completing: false }
        return { ...value, attemptId: pending.id }
      }).pipe(Effect.ensuring(Effect.sync(() => { starting = false })))
    }),
    complete: Effect.fn("ProviderOAuth.complete")(function*(provider: string, attemptId: string, code?: string, connected: Effect.Effect<void, AiConfigError> = Effect.void) {
      const attempt = pending
      if (!attempt || attempt.provider !== provider || attempt.id !== attemptId || attempt.expires <= Date.now() || attempt.completing) {
        return yield* error("This sign-in attempt is missing, expired or already completing. Start sign-in again.")
      }
      if (attempt.callback === "code" && !code?.trim()) return yield* error("Enter the authorization code.")
      attempt.completing = true
      return yield* Effect.tryPromise({
        try: async (signal) => {
          const success = await attempt.host.client.provider.oauthCallback({ providerID: provider, method: attempt.method, ...(code?.trim() ? { code: code.trim() } : {}) }, { signal })
          if (!success || !readOAuthGrants(authFile)[provider]) throw new Error("No subscription grant saved")
        },
        catch: () => error("Provider sign-in failed or timed out. Start sign-in again.")
      }).pipe(Effect.andThen(connected), Effect.ensuring(Effect.sync(() => { pending = undefined })))
    })
  }
}
