import { Api, BadRequest, CurrentUser, InternalError, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Companion, CompanionError } from "../services/companion.ts"

const wire = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  Effect.mapError(self, (e) => e instanceof CompanionError
    ? (e.code === "not-found" ? new NotFound({ message: e.message }) : e.code === "invalid" ? new BadRequest({ message: e.message }) : new InternalError({ message: e.message }))
    : e as Exclude<E, CompanionError>)

export const CompanionHandlers = HttpApiBuilder.group(Api, "companion", Effect.fn(function*(handlers) {
  const companion = yield* Companion
  return handlers
    .handle("status", () => companion.status)
    .handle("enable", ({ payload }) => wire(companion.enable(payload.port)))
    .handle("disable", () => companion.disable.pipe(Effect.mapError((e) => new InternalError({ message: e.message }))))
    .handle("pair", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      return yield* wire(companion.pair(payload.name, payload.host, user))
    }))
    .handle("redeem", ({ payload }) => wire(companion.redeem(payload.code)))
    .handle("revoke", ({ params }) => wire(companion.revoke(params.id)))
}))
