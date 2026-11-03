import { Api, BadRequest, Conflict, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { MaterialRepo } from "../repos/material-repo.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

export const MaterialsHandlers = HttpApiBuilder.group(Api, "materials", Effect.fn(function*(handlers) {
  const repo = yield* MaterialRepo
  return handlers
    .handle("list", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        return yield* repo.list(user.id, { search: query.search })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch materials"))))
    .handle("create", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!payload.name || !payload.properties) return yield* new BadRequest({ message: "Name and properties are required" })
        if (payload.organizationId && !(yield* repo.isMember(user.id, payload.organizationId))) {
          return yield* new Forbidden({ message: "You are not a member of the specified organization" })
        }
        return yield* repo.create(user.id, { ...payload, name: payload.name, properties: payload.properties })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create material"))))
    .handle("get", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!params.id) return yield* new BadRequest({ message: "Material ID is required" })
        const found = yield* repo.find(user.id, params.id)
        if (!found) return yield* new NotFound({ message: "Material not found or access denied" })
        return found.detail
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch material"))))
    .handle("update", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const found = yield* repo.find(user.id, params.id)
        if (!found) return yield* new NotFound({ message: "Material not found or access denied" })
        if (!found.canWrite) return yield* new Forbidden({ message: "You do not have permission to modify this material" })
        const { baseUpdatedAt, ...fields } = payload
        // An editor that holds a copy writes only if nobody saved since (check and write are one transaction).
        const updated = baseUpdatedAt === undefined ? yield* repo.update(params.id, fields, user.id) : yield* repo.updateIfCurrent(params.id, fields, baseUpdatedAt, user.id)
        if (updated === "conflict") return yield* new Conflict({ message: "The material was saved elsewhere since it was read. Nothing was overwritten." })
        return updated
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update material"))))
    .handle("history", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!(yield* repo.find(user.id, params.id))) return yield* new NotFound({ message: "Material not found or access denied" })
        return yield* repo.history(params.id)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch material versions"))))
    .handle("remove", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const found = yield* repo.find(user.id, params.id)
        if (!found) return yield* new NotFound({ message: "Material not found or access denied" })
        if (!found.canWrite) return yield* new Forbidden({ message: "You do not have permission to modify this material" })
        yield* repo.remove(params.id)
        return { message: "Material deleted successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete material"))))
}))
