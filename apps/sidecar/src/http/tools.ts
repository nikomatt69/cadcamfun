import { Api, BadRequest, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ToolRepo } from "../repos/tool-repo.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

export const ToolsHandlers = HttpApiBuilder.group(Api, "tools", Effect.fn(function*(handlers) {
  const repo = yield* ToolRepo
  return handlers
    .handle("list", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const d = query.diameter ? parseFloat(query.diameter) : NaN
        return yield* repo.list(user.id, {
          type: query.type, material: query.material, search: query.search,
          ...(Number.isNaN(d) ? {} : { diameter: d })
        })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch tools"))))
    .handle("create", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!payload.name || !payload.type || !payload.diameter || !payload.material) {
          return yield* new BadRequest({ message: "Name, type, diameter, and material are required" })
        }
        if (payload.organizationId && !(yield* repo.isMember(user.id, payload.organizationId))) {
          return yield* new Forbidden({ message: "You are not a member of the specified organization" })
        }
        return yield* repo.create(user.id, { ...payload, name: payload.name, type: payload.type, diameter: payload.diameter, material: payload.material })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create tool"))))
    .handle("get", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!params.id) return yield* new BadRequest({ message: "Tool ID is required" })
        const found = yield* repo.find(user.id, params.id)
        if (!found) return yield* new NotFound({ message: "Tool not found or access denied" })
        return found.detail
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch tool"))))
    .handle("update", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const found = yield* repo.find(user.id, params.id)
        if (!found) return yield* new NotFound({ message: "Tool not found or access denied" })
        if (!found.canWrite) return yield* new Forbidden({ message: "You do not have permission to modify this tool" })
        return yield* repo.update(params.id, payload)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update tool"))))
    .handle("remove", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const found = yield* repo.find(user.id, params.id)
        if (!found) return yield* new NotFound({ message: "Tool not found or access denied" })
        if (!found.canWrite) return yield* new Forbidden({ message: "You do not have permission to modify this tool" })
        yield* repo.remove(params.id)
        return { message: "Tool deleted successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete tool"))))
}))
