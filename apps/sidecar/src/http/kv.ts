import { Api, BadRequest, InternalError, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { KvStore } from "../services/kv.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))
/** Keys are dotted identifiers; anything else is rejected so a key can never address a path. */
const VALID = /^[A-Za-z0-9_.:-]{1,200}$/

export const KvHandlers = HttpApiBuilder.group(Api, "kv", Effect.fn(function*(handlers) {
  const kv = yield* KvStore
  return handlers
    .handle("list", ({ query }) => kv.list(query.prefix).pipe(Effect.map((entries) => ({ entries: [...entries] }))))
    .handle("get", ({ params }) => Effect.gen(function*() {
      const entry = yield* kv.get(params.key)
      if (!entry) return yield* new NotFound({ message: "Key not found" })
      return entry
    }))
    .handle("set", ({ params, payload }) => Effect.gen(function*() {
      if (!VALID.test(params.key)) return yield* new BadRequest({ message: "Invalid key" })
      return yield* kv.set(params.key, payload.value)
    }).pipe(Effect.catchTag("KvError", fail("Failed to store the value"))))
    .handle("remove", ({ params }) => Effect.gen(function*() {
      if (!(yield* kv.delete(params.key))) return yield* new NotFound({ message: "Key not found" })
      return { message: "Deleted" }
    }).pipe(Effect.catchTag("KvError", fail("Failed to delete the value"))))
}))
