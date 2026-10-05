import { Api, BadRequest, CurrentUser, EnvBadRequest, EnvNotFound, Forbidden, InternalError, NotFound, envErr, okAuth } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ProjectRepo } from "../repos/project-repo.ts"
import { ToolpathRepo, type ToolpathInput } from "../repos/toolpath-repo.ts"
import { internal } from "./entity-io.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

export const ToolpathsHandlers = HttpApiBuilder.group(Api, "toolpaths", Effect.fn(function*(handlers) {
  const repo = yield* ToolpathRepo
  const projects = yield* ProjectRepo

  const load = Effect.fn("toolpaths.load")(function*(id: string) {
    const user = yield* CurrentUser
    if (!id) return yield* new BadRequest({ message: "Toolpath ID is required and must be a string" })
    const found = yield* repo.find(user.id, id)
    if (!found) return yield* new NotFound({ message: "Toolpath not found or access denied" })
    return found
  })

  return handlers
    .handle("list", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        return yield* repo.list(user.id, { ...query, includePublic: query.public === "true" })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch toolpaths"))))
    .handle("create", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!payload.name || !payload.projectId) return yield* new BadRequest({ message: "Name and projectId are required" })
        if (!(yield* projects.find(user.id, payload.projectId))) return yield* new NotFound({ message: "Project not found or access denied" })
        return yield* repo.create(user.id, { ...payload, name: payload.name, projectId: payload.projectId })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create toolpath"))))
    .handle("get", ({ params }) =>
      load(params.id).pipe(
        Effect.map((f) => ({ ...f.row, project: { id: f.project.id, name: f.project.name, ownerId: f.project.ownerId } })),
        Effect.catchTag("DatabaseError", fail("Failed to fetch toolpath"))))
    .handle("update", ({ params, payload }) =>
      Effect.gen(function*() {
        const found = yield* load(params.id)
        if (!found.canWrite) return yield* new Forbidden({ message: "You do not have permission to modify this toolpath" })
        const patch: ToolpathInput = {}
        for (const k of ["name", "description", "type", "operationType", "isPublic", "thumbnail", "data", "gcode"] as const) {
          if (payload[k] !== undefined) (patch as Record<string, unknown>)[k] = payload[k]
        }
        if (Object.keys(patch).length === 0) return yield* new BadRequest({ message: "No fields provided for update" })
        const updated = yield* repo.update(params.id, patch)
        return { ...updated, message: "Toolpath updated successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update toolpath"))))
    .handle("remove", ({ params }) =>
      Effect.gen(function*() {
        const found = yield* load(params.id)
        if (!found.canWrite) return yield* new Forbidden({ message: "You do not have permission to modify this toolpath" })
        yield* repo.remove(params.id)
        return { message: "Toolpath deleted successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete toolpath"))))
    .handle("listForDrawing", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!params.id) return yield* new BadRequest({ message: "Drawing ID is required" })
        if (!(yield* repo.drawingWithProject(user.id, params.id))) return yield* new NotFound({ message: "Drawing not found or access denied" })
        return (yield* repo.listForDrawing(params.id)) as never
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch toolpaths"))))
    .handle("createForDrawing", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!params.id) return yield* new BadRequest({ message: "Drawing ID is required" })
        const drawing = yield* repo.drawingWithProject(user.id, params.id)
        if (!drawing) return yield* new NotFound({ message: "Drawing not found or access denied" })
        if (!payload.name) return yield* new BadRequest({ message: "Toolpath name is required" })
        if (!payload.data) return yield* new BadRequest({ message: "Toolpath data is required" })
        // Legacy parity: gcode/type/operationType are stored as given (no defaults on this route).
        return yield* repo.create(user.id, { ...payload, name: payload.name, projectId: drawing.projectId, drawingId: params.id, applyDefaults: false })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create toolpath"))))
}))

export const ProjectToolpathsHandlers = HttpApiBuilder.group(Api, "projectToolpaths", Effect.fn(function*(handlers) {
  const repo = yield* ToolpathRepo
  const projects = yield* ProjectRepo

  // Legacy quirk kept: the id is read from `?projectId=`, and org members need role ADMIN or MEMBER.
  const guard = Effect.fn("projectToolpaths.guard")(function*(projectId: string | undefined) {
    const user = yield* CurrentUser
    if (!projectId) return yield* envErr(EnvBadRequest, "Project ID is required")
    const access = yield* projects.find(user.id, projectId)
    const allowed = !!access && (access.project.ownerId === user.id || access.orgRole === "ADMIN" || access.orgRole === "MEMBER")
    if (!allowed) return yield* envErr(EnvNotFound, "Project not found or access denied")
    return { user, projectId }
  })

  return handlers
    .handle("list", ({ query }) =>
      Effect.gen(function*() {
        const { user, projectId } = yield* guard(query.projectId)
        return okAuth(yield* repo.listForProject(user.id, projectId))
      }).pipe(Effect.catchTag("DatabaseError", internal)))
    .handle("create", ({ query, payload }) =>
      Effect.gen(function*() {
        const { user, projectId } = yield* guard(query.projectId)
        if (!payload.name) return yield* envErr(EnvBadRequest, "Name is required")
        const created = yield* repo.create(user.id, { ...payload, name: payload.name, projectId })
        return okAuth(created, "Toolpath created successfully")
      }).pipe(Effect.catchTag("DatabaseError", internal)))
}))
