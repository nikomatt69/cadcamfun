import { Api, BadRequest, CurrentUser, InternalError, NotFound, type SessionUser } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Companion, CompanionError } from "../services/companion.ts"
import { LocalProfile } from "../services/local-profile.ts"

const wire = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.mapError(self, (e) => e instanceof CompanionError
    ? (e.code === "not-found" ? new NotFound({ message: e.message }) : e.code === "invalid" ? new BadRequest({ message: e.message }) : new InternalError({ message: e.message }))
    : e as Exclude<E, CompanionError>)

export const CompanionHandlers = HttpApiBuilder.group(Api, "companion", Effect.fn(function*(handlers) {
  const companion = yield* Companion
  const { user: local } = yield* LocalProfile
  /** The signed-in desktop account; undefined while the desktop runs as the local profile. */
  const account = Effect.map(CurrentUser, (user: SessionUser) => user.id === local.id ? undefined : user)
  return handlers
    // Opening the companion screen signed in gives devices paired without an account to that account.
    .handle("status", () => Effect.gen(function*() {
      const user = yield* account
      if (user) yield* companion.adopt(user)
      return yield* companion.status
    }))
    .handle("enable", ({ payload }) => wire(companion.enable(payload.port)))
    .handle("disable", () => companion.disable.pipe(Effect.mapError((e) => new InternalError({ message: e.message }))))
    .handle("pair", ({ payload }) => Effect.flatMap(account, (user) => wire(companion.pair(payload.name, payload.host, user))))
    .handle("revoke", ({ params }) => wire(companion.revoke(params.id)))
}))
