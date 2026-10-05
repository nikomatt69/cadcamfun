import { Api, BadRequest, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ProjectRepo } from "../repos/project-repo.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

export const ProjectsHandlers = HttpApiBuilder.group(Api, "projects", Effect.fn(function*(handlers) {
  const repo = yield* ProjectRepo
  return handlers
    .handle("list", () =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        return yield* repo.list(user.id)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch projects"))))
    .handle("create", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!payload.name) return yield* new BadRequest({ message: "Project name is required" })
        if (payload.organizationId && !(yield* repo.isMember(user.id, payload.organizationId))) {
          return yield* new Forbidden({ message: "User does not belong to the specified organization" })
        }
        return yield* repo.create(user.id, { ...payload, name: payload.name })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create project"))))
    .handle("get", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!params.id) return yield* new BadRequest({ message: "Project ID is required" })
        const access = yield* repo.find(user.id, params.id)
        if (!access) return yield* new NotFound({ message: "Project not found or access denied" })
        return access.project
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch project"))))
    .handle("update", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const access = yield* repo.find(user.id, params.id)
        if (!access) return yield* new NotFound({ message: "Project not found or access denied" })
        const canUpdate = access.project.ownerId === user.id || access.orgRole === "ADMIN" || access.orgRole === "MANAGER"
        if (!canUpdate) return yield* new Forbidden({ message: "You do not have permission to update this project" })
        if (!payload.name) return yield* new BadRequest({ message: "Project name is required" })
        if (payload.organizationId && payload.organizationId !== access.project.organization?.id &&
          !(yield* repo.isMember(user.id, payload.organizationId))) {
          return yield* new Forbidden({ message: "You do not have access to the specified organization" })
        }
        return yield* repo.update(params.id, { ...payload, name: payload.name })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update project"))))
    .handle("remove", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const access = yield* repo.find(user.id, params.id)
        if (!access) return yield* new NotFound({ message: "Project not found or access denied" })
        if (access.project.ownerId !== user.id && access.orgRole !== "ADMIN") {
          return yield* new Forbidden({ message: "You do not have permission to delete this project" })
        }
        yield* repo.remove(params.id)
        return { message: "Project deleted successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete project"))))
}))
