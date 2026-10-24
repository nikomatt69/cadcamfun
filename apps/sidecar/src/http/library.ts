import { Api, BadRequest, CurrentUser, Forbidden, InternalError, KeyedInternal, NotFound } from "@cadcamfun/api"
import { cam } from "@cadcamfun/core"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { LibraryRepo } from "../repos/library-repo.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))
const keyed = (e: unknown) => Effect.logError("Error in library API", e).pipe(Effect.andThen(Effect.fail(new KeyedInternal({ error: "Internal server error" }))))

/** A stored post definition (category "post", type "definition") is checked when it is saved: a library never holds one the kernel would refuse. */
const postDefinitionProblem = (category: string | undefined, type: string | undefined, data: unknown): string | undefined => {
  if (category !== "post" || type !== "definition") return undefined
  const issues = cam.definitionIssues(data)
  return issues.length === 0 ? undefined : `Invalid post definition: ${issues.slice(0, 5).map((i) => `${i.path === "" ? "(root)" : i.path}: ${i.message}`).join("; ")}`
}

export const LibraryHandlers = HttpApiBuilder.group(Api, "library", Effect.fn(function*(handlers) {
  const repo = yield* LibraryRepo
  const load = Effect.fn("library.load")(function*(id: string) {
    const user = yield* CurrentUser
    if (!id) return yield* new BadRequest({ message: "Library item ID is required" })
    const found = yield* repo.find(user.id, id)
    if (!found) return yield* new NotFound({ message: "Library item not found or access denied" })
    return { user, ...found }
  })

  return handlers
    .handle("list", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        return yield* repo.list(user.id, query)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch library items"))))
    .handle("create", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!payload.name || !payload.category || !payload.type || !payload.data) return yield* new BadRequest({ message: "Missing required fields" })
        const invalid = postDefinitionProblem(payload.category, payload.type, payload.data)
        if (invalid !== undefined) return yield* new BadRequest({ message: invalid })
        if (payload.organizationId && !(yield* repo.isMember(user.id, payload.organizationId))) {
          return yield* new Forbidden({ message: "User does not belong to the specified organization" })
        }
        return yield* repo.create(user.id, { ...payload, name: payload.name, category: payload.category, type: payload.type, data: payload.data })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create library item"))))
    .handle("get", ({ params }) => load(params.id).pipe(Effect.map((f) => f.row), Effect.catchTag("DatabaseError", fail("Failed to fetch library item"))))
    .handle("update", ({ params, payload }) =>
      Effect.gen(function*() {
        const { user, item, role } = yield* load(params.id)
        const canUpdate = item.ownerId === user.id || (!!item.organizationId && (role === "ADMIN" || role === "MANAGER"))
        if (!canUpdate) return yield* new Forbidden({ message: "You do not have permission to update this item" })
        const invalid = postDefinitionProblem(payload.category ?? item.category, payload.type ?? item.type, payload.data ?? item.data)
        if (invalid !== undefined) return yield* new BadRequest({ message: invalid })
        return yield* repo.update(item, payload)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update library item"))))
    .handle("remove", ({ params }) =>
      Effect.gen(function*() {
        const { user, item, role } = yield* load(params.id)
        const canDelete = item.ownerId === user.id || (!!item.organizationId && role === "ADMIN")
        if (!canDelete) return yield* new Forbidden({ message: "You do not have permission to delete this item" })
        yield* repo.remove(params.id)
        return { message: "Library item deleted successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete library item"))))
    .handle("components", () => Effect.gen(function*() { const u = yield* CurrentUser; return { data: (yield* repo.catalogue(u.id, "components")) as never } }).pipe(Effect.catchTag("DatabaseError", keyed)))
    .handle("materials", () => Effect.gen(function*() { const u = yield* CurrentUser; return { data: (yield* repo.catalogue(u.id, "materials")) as never } }).pipe(Effect.catchTag("DatabaseError", keyed)))
    .handle("tools", () => Effect.gen(function*() { const u = yield* CurrentUser; return { data: (yield* repo.catalogue(u.id, "tools")) as never } }).pipe(Effect.catchTag("DatabaseError", keyed)))
}))
