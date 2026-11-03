import { Api, BadRequest, CurrentUser, EnvBadRequest, EnvForbidden, EnvInternal, EnvNotFound, Forbidden, InternalError, NotFound, envErr, normalizeComponentData, ok, validateComponentData } from "@cadcamfun/api"
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

  // Readers of versions, comments and relationships need to be project owner or organisation member (a public flag admits nobody).
  const readable = Effect.fn("components.readable")(function*(id: string) {
    const user = yield* CurrentUser
    const component = yield* components.access(user.id, id)
    if (!component) return yield* new NotFound({ message: "Component not found or access denied" })
    return { user, component }
  })
  const envReadable = Effect.fn("components.envReadable")(function*(id: string) {
    const user = yield* CurrentUser
    const component = yield* components.access(user.id, id)
    if (!component) return yield* envErr(EnvNotFound, "Component not found or access denied")
    return { user, component }
  })
  const envFail = (message: string) => (e: unknown) =>
    Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(envErr(EnvInternal, message))))
  const trimmed = (content: string | undefined) => (content ?? "").trim() === "" ? undefined : content

  return handlers
    .handle("list", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        return yield* components.search(user.id, { projectId: query.projectId, type: query.type, search: query.search })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch components"))))
    .handle("create", ({ payload }) =>
      Effect.gen(function*() {
        if (!payload.name || !payload.projectId) return yield* new BadRequest({ message: "Name and projectId are required" })
        const projectId = payload.projectId
        const user = yield* projectAccess(projectId)
        const component = yield* components.create(projectId, { ...payload, name: payload.name, type: payload.type || "custom" })
        const organizationId = yield* components.projectOrganization(projectId)
        if (organizationId) {
          const creatorName = (yield* components.userName(user.id)) || "User"
          yield* notifications.newComponent({ componentId: component.id, creatorId: user.id, componentName: component.name, organizationId, projectId, creatorName })
            .pipe(Effect.catch((e) => Effect.logError("Error creating component notifications", e)))
        }
        return component
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create component"))))
    .handle("details", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const found = yield* components.details(user.id, params.id)
        if (found === undefined) return yield* new NotFound({ message: "Component not found" })
        if (found === "forbidden") return yield* new Forbidden({ message: "You do not have permission to access this component" })
        return found
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch component details"))))
    .handle("relationships", ({ params }) =>
      Effect.gen(function*() {
        const { user, component } = yield* envReadable(params.id)
        return ok(yield* components.relationships(user.id, component))
      }).pipe(Effect.catchTag("DatabaseError", envFail("Failed to fetch relationships"))))
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

    .handle("listVersions", ({ params }) =>
      Effect.gen(function*() {
        yield* readable(params.id)
        return yield* components.listVersions(params.id)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch component versions"))))
    .handle("createVersion", ({ params, payload }) =>
      Effect.gen(function*() {
        const { user } = yield* readable(params.id)
        if (!payload.data) return yield* new BadRequest({ message: "Component data is required" })
        const validation = validateComponentData(payload.data)
        if (!validation.valid) return yield* new BadRequest({ message: `Invalid component data: ${validation.errors?.join(", ")}` })
        const version = yield* components.createVersion(params.id, user.id, normalizeComponentData(payload.data as Record<string, unknown>), payload.changeMessage ?? "")
        return { ...version, message: "Version created successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create component version"))))
    .handle("restoreVersion", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const componentId = params.id
        if (!payload.versionId) return yield* new BadRequest({ message: "Component ID and Version ID are required" })
        if (!(yield* components.access(user.id, componentId))) return yield* new NotFound({ message: "Component not found or access denied" })
        const version = yield* components.getVersion(componentId, payload.versionId)
        if (!version) return yield* new NotFound({ message: "Version not found" })
        if (version.data) {
          const validation = validateComponentData(version.data)
          if (!validation.valid) return yield* new BadRequest({ message: `Invalid version data: ${validation.errors?.join(", ")}` })
        }
        const restored = yield* components.restoreVersion(componentId, payload.versionId, user.id, (data) => normalizeComponentData(data as Record<string, unknown>))
        if (!restored) return yield* new NotFound({ message: "Version not found" })
        return { ...restored, message: "Version restored successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to restore component version"))))
    .handle("getVersion", ({ params }) =>
      Effect.gen(function*() {
        yield* envReadable(params.id)
        const version = yield* components.getVersion(params.id, params.versionId)
        if (!version) return yield* envErr(EnvNotFound, "Version not found")
        return ok(version)
      }).pipe(Effect.catchTag("DatabaseError", envFail("Failed to fetch component version"))))
    .handle("listComments", ({ params }) =>
      Effect.gen(function*() {
        yield* envReadable(params.id)
        return ok(yield* components.listComments(params.id))
      }).pipe(Effect.catchTag("DatabaseError", envFail("Failed to fetch comments"))))
    .handle("addComment", ({ params, payload }) =>
      Effect.gen(function*() {
        const { user } = yield* envReadable(params.id)
        const content = trimmed(payload.content)
        if (content === undefined) return yield* envErr(EnvBadRequest, "Comment content is required")
        return ok(yield* components.addComment(params.id, user.id, content), "Comment added successfully")
      }).pipe(Effect.catchTag("DatabaseError", envFail("Failed to add comment"))))
    .handle("editComment", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const comment = yield* components.findComment(params.id, params.commentId)
        if (!comment) return yield* envErr(EnvNotFound, "Comment not found")
        if (comment.userId !== user.id) return yield* envErr(EnvForbidden, "Not authorized to edit this comment")
        const content = trimmed(payload.content)
        if (content === undefined) return yield* envErr(EnvBadRequest, "Comment content is required")
        return ok(yield* components.editComment(params.commentId, content), "Comment updated successfully")
      }).pipe(Effect.catchTag("DatabaseError", envFail("Failed to update comment"))))
    .handle("removeComment", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const comment = yield* components.findComment(params.id, params.commentId)
        if (!comment) return yield* envErr(EnvNotFound, "Comment not found")
        // Only the author or the project owner may delete.
        if (comment.userId !== user.id && !(yield* components.isProjectOwner(user.id, params.id))) return yield* envErr(EnvForbidden, "Not authorized to delete this comment")
        yield* components.removeComment(params.commentId)
        return ok(null, "Comment deleted successfully")
      }).pipe(Effect.catchTag("DatabaseError", envFail("Failed to delete comment"))))
}))
