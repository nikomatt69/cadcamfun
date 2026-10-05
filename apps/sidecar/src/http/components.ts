import { Api, BadRequest, CurrentUser, InternalError, NotFound, validateComponentData, normalizeComponentData } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ComponentRepo, type ComponentPatch } from "../repos/component-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"
import { NotificationService } from "../services/notifications.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

export const ComponentsHandlers = HttpApiBuilder.group(Api, "components", Effect.fn(function*(handlers) {
  const components = yield* ComponentRepo
  const projects = yield* ProjectRepo
  const notifications = yield* NotificationService

  const load = Effect.fn("components.load")(function*(id: string) {
    const user = yield* CurrentUser
    if (!id) return yield* new BadRequest({ message: "Component ID is required and must be a string" })
    const component = yield* components.find(user.id, id)
    if (!component) return yield* new NotFound({ message: "Component not found or access denied" })
    return component
  })
  const projectAccess = Effect.fn("components.projectAccess")(function*(projectId: string) {
    const user = yield* CurrentUser
    if (!projectId) return yield* new BadRequest({ message: "Project ID is required" })
    if (!(yield* projects.find(user.id, projectId))) return yield* new NotFound({ message: "Project not found or access denied" })
    return user
  })

  return handlers
    .handle("get", ({ params }) => load(params.id).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch component"))))
    .handle("update", ({ params, payload }) =>
      Effect.gen(function*() {
        yield* load(params.id)
        // Legacy parity: write access is computed but never enforced (everyone who can see the component may edit it).
        if (payload.data) {
          const validation = validateComponentData(payload.data)
          if (!validation.valid) return yield* new BadRequest({ message: `Invalid component data: ${validation.errors?.join(", ")}` })
        }
        const patch: ComponentPatch = {}
        if (payload.name !== undefined) patch.name = payload.name
        if (payload.description !== undefined) patch.description = payload.description
        if (payload.type !== undefined) patch.type = payload.type
        if (payload.isPublic !== undefined) patch.isPublic = payload.isPublic
        if (payload.thumbnail !== undefined) patch.thumbnail = payload.thumbnail
        if (payload.data) patch.data = normalizeComponentData(payload.data as Record<string, unknown>)
        if (Object.keys(patch).length === 0) return yield* new BadRequest({ message: "No fields provided for update" })
        const updated = yield* components.update(params.id, patch)
        return { ...updated, message: "Component updated successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update component"))))
    .handle("remove", ({ params }) =>
      Effect.gen(function*() {
        yield* load(params.id)
        yield* components.remove(params.id)
        return { message: "Component deleted successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete component"))))
    .handle("listForProject", ({ params }) =>
      Effect.gen(function*() {
        yield* projectAccess(params.id)
        return yield* components.listByProject(params.id)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch components"))))
    .handle("createForProject", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* projectAccess(params.id)
        if (!payload.name) return yield* new BadRequest({ message: "Component name is required" })
        const component = yield* components.create(params.id, { ...payload, name: payload.name })
        // Notify the other members of the project's organisation; failures never fail the request (as in legacy).
        const organizationId = yield* components.projectOrganization(params.id)
        if (organizationId) {
          const creatorName = (yield* components.userName(user.id)) || "User"
          yield* notifications.newComponent({
            componentId: component.id, creatorId: user.id, componentName: component.name, organizationId, projectId: params.id, creatorName
          }).pipe(Effect.catch((e) => Effect.logError("Error creating component notifications", e)))
        }
        return component
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create component"))))
}))
