import { Api, BadRequest, CurrentUser, InternalError, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { OrganizationRepo } from "../repos/organization-repo.ts"

const fail = (message: string) => (error: unknown) =>
  Effect.logError(message, error).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

export const OrganizationsHandlers = HttpApiBuilder.group(Api, "organizations", Effect.fn(function*(handlers) {
  const repo = yield* OrganizationRepo
  return handlers
    .handle("list", () => Effect.gen(function*() {
      const user = yield* CurrentUser
      return yield* repo.list(user.id)
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch organizations"))))
    .handle("create", ({ payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!payload.name) return yield* new BadRequest({ message: "Organization name is required" })
      return yield* repo.create(user.id, payload)
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create organization"))))
    .handle("get", ({ params }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      const organization = yield* repo.get(user.id, params.id)
      if (!organization) return yield* new NotFound({ message: "Organization not found" })
      return organization
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch organization"))))
    .handle("update", ({ params, payload }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      if (!payload.name) return yield* new BadRequest({ message: "Organization name is required" })
      const organization = yield* repo.update(user.id, params.id, payload)
      if (!organization) return yield* new InternalError({ message: "Failed to update organization" })
      return organization
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update organization"))))
    .handle("remove", ({ params }) => Effect.gen(function*() {
      const user = yield* CurrentUser
      yield* repo.remove(user.id, params.id)
      return { message: "Organization deleted successfully" }
    }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete organization"))))
}))
