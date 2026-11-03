import { Api, BadRequest, Conflict, CurrentUser, EnvBadRequest, EnvForbidden, EnvInternal, EnvNotFound, Forbidden, InternalError, NotFound, envErr, normalizeComponentData, ok, validateComponentData } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ComponentRepo, type ComponentPatch } from "../repos/component-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"
import { NotificationService } from "../services/notifications.ts"
import { StorageService } from "../services/storage.ts"
import { filterComponentLibrary } from "../repos/components-library.ts"
import { analyzeComponentData } from "../repos/component-analysis.ts"
import { type EntityExportIO, exportEntities, exportMeta, internal } from "./entity-io.ts"
import type { ComponentDetail } from "@cadcamfun/api"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

export const ComponentsHandlers = HttpApiBuilder.group(Api, "components", Effect.fn(function*(handlers) {
  const components = yield* ComponentRepo
  const projects = yield* ProjectRepo
  const notifications = yield* NotificationService
  const storage = yield* StorageService

  const storagePathOf = (data: unknown): string | undefined =>
    data && typeof data === "object" ? (data as { storagePath?: string }).storagePath : undefined
  // Storage routes: the component must be one the user can see; anyone else gets 404 (legacy answered 403 for a component that exists).
  const storageGuard = Effect.fn("components.storage.guard")(function*(id: string) {
    const user = yield* CurrentUser
    const found = yield* components.find(user.id, id)
    if (!found) return yield* envErr(EnvNotFound, "Component not found")
    return found
  })
  const exportIO: EntityExportIO<typeof ComponentDetail.Type> = {
    plural: "components", noun: "components", title: "Components", type: "component",
    exportRow: (c, by) => ({
      id: c.id, name: c.name, description: c.description,
      type: c.data && typeof c.data === "object" ? (c.data as { type?: string }).type || "unknown" : "unknown",
      data: c.data, metadata: { ...exportMeta(by), projectName: c.project.name }
    }),
    visibleByIds: components.visibleByIds,
    listAll: components.listVisible
  }

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
    // Legacy demanded an `id` query parameter this route never had and so always answered 400; the catalogue is served without it.
    .handle("library", ({ query }) => Effect.sync(() => ok(filterComponentLibrary(query))))
    .handle("analysis", ({ params }) =>
      Effect.gen(function*() {
        const { user, component } = yield* envReadable(params.id)
        const referencing = yield* components.referencing(user.id, params.id)
        const byProject = new Map<string, { id: string; name: string; usageCount: number }>()
        for (const r of referencing) byProject.set(r.projectId, { id: r.projectId, name: r.projectName, usageCount: (byProject.get(r.projectId)?.usageCount ?? 0) + 1 })
        const last = referencing.length ? new Date(Math.max(...referencing.map((r) => r.updatedAt.getTime()))) : new Date()
        return ok({ ...analyzeComponentData(component.data, component.type), usage: { references: referencing.length, lastUsed: last.toISOString().split("T")[0]!, projects: [...byProject.values()] } })
      }).pipe(Effect.catchTag("DatabaseError", envFail("Failed to analyze component"))))
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
        // An editor that holds a copy writes only if nobody saved since (check and write are one transaction).
        const updated = payload.baseUpdatedAt === undefined ? yield* components.update(params.id, patch) : yield* components.updateIfCurrent(params.id, payload.baseUpdatedAt, patch)
        if (updated === "conflict") return yield* new Conflict({ message: "The component was saved elsewhere since it was read. Nothing was overwritten." })
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
        const restored = yield* components.restoreVersion(componentId, payload.versionId, user.id, (data) => normalizeComponentData(data as Record<string, unknown>), payload.baseUpdatedAt)
        if (restored === "conflict") return yield* new Conflict({ message: "The component was saved elsewhere since it was read. Nothing was restored." })
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
    .handle("saveStorage", ({ params, payload }) =>
      Effect.gen(function*() {
        const component = yield* storageGuard(params.id)
        if (!payload) return yield* envErr(EnvBadRequest, "Component data is required")
        const storagePath = yield* storage.upload(storage.generateObjectPath("component", params.id), payload as object)
        const data = typeof component.data === "object" && component.data ? component.data : {}
        yield* components.update(params.id, { data: { ...data, storagePath } })
        return ok({ storagePath }, "Component saved to storage successfully")
      }).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
    .handle("readStorage", ({ params, query }) =>
      Effect.gen(function*() {
        const component = yield* storageGuard(params.id)
        const storagePath = storagePathOf(component.data)
        if (!storagePath) return yield* envErr(EnvNotFound, "This component does not have storage data")
        if (query.signedUrl === "true") return ok({ signedUrl: yield* storage.signedUrl(storagePath) })
        return ok(yield* storage.download(storagePath))
      }).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
    .handle("removeStorage", ({ params }) =>
      Effect.gen(function*() {
        const component = yield* storageGuard(params.id)
        const storagePath = storagePathOf(component.data)
        if (!storagePath) return yield* envErr(EnvNotFound, "This component does not have storage data")
        yield* storage.delete(storagePath)
        // Legacy wrote `{ ...component.data?.toString, storagePath: null }` and so lost the rest of the data; only the path goes.
        const { storagePath: _removed, ...rest } = component.data as Record<string, unknown>
        yield* components.update(params.id, { data: rest })
        return ok(null, "Component storage data deleted successfully")
      }).pipe(Effect.catchTags({
        DatabaseError: internal,
        StorageError: () => Effect.fail(envErr(EnvInternal, "Failed to delete component storage"))
      })))
    .handle("export", ({ query }) =>
      exportEntities(exportIO)(query).pipe(
        Effect.provideService(StorageService, storage),
        Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
    .handle("import", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const body = (payload ?? {}) as { projectId?: string; data?: unknown; path?: string; importMode?: string }
        if (!body.projectId) return yield* envErr(EnvBadRequest, "Project ID is required")
        if (!(yield* projects.find(user.id, body.projectId))) return yield* envErr(EnvNotFound, "Project not found or access denied")
        let importData: unknown
        if (body.data) importData = body.data
        else if (body.path) importData = yield* storage.download(body.path)
        else return yield* envErr(EnvBadRequest, "No import data provided")
        if (!importData) return yield* envErr(EnvBadRequest, "Invalid import data")
        const items = (Array.isArray(importData) ? importData : [importData]) as Record<string, unknown>[]
        return ok(yield* components.importMany(body.projectId, items, body.importMode ?? "create"), "Components imported successfully")
      }).pipe(Effect.catchTags({ DatabaseError: internal, StorageError: internal })))
}))
