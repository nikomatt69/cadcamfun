import { Api, BadRequest, Conflict, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { drawing as sheet } from "@cadcamfun/core"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

/** A title block that is stored must be a valid one: the screens, the sheet and the assistant all read it. */
const titleBlockOf = (data: unknown) => {
  const block = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>)["titleBlock"] : undefined
  const errors = sheet.titleBlockErrors(block)
  return errors.length === 0 ? Effect.void : Effect.fail(new BadRequest({ message: `Invalid title block: ${errors.map((e) => e.message).join("; ")}` }))
}

export const DrawingsHandlers = HttpApiBuilder.group(Api, "drawings", Effect.fn(function*(handlers) {
  const drawings = yield* DrawingRepo
  const projects = yield* ProjectRepo

  /** Legacy access rule: owner of the project, or member of its organisation. */
  const load = Effect.fn("drawings.load")(function*(id: string) {
    const user = yield* CurrentUser
    if (!id) return yield* new BadRequest({ message: "Drawing ID is required" })
    const drawing = yield* drawings.find(user.id, id)
    if (!drawing) return yield* new NotFound({ message: "Drawing not found" })
    const hasAccess = drawing.project.ownerId === user.id || (!!drawing.project.organization && drawing.project.organization.users.length > 0)
    if (!hasAccess) return yield* new Forbidden({ message: "You do not have permission to access this drawing" })
    return { user, drawing }
  })
  const projectAccess = Effect.fn("drawings.projectAccess")(function*(projectId: string) {
    const user = yield* CurrentUser
    if (!projectId) return yield* new BadRequest({ message: "Project ID is required" })
    if (!(yield* projects.find(user.id, projectId))) return yield* new NotFound({ message: "Project not found or access denied" })
  })

  return handlers
    .handle("get", ({ params }) =>
      load(params.id).pipe(Effect.map((r) => r.drawing), Effect.catchTag("DatabaseError", fail("Failed to fetch drawing"))))
    .handle("update", ({ params, payload }) =>
      Effect.gen(function*() {
        yield* load(params.id)
        yield* titleBlockOf(payload.data)
        const { baseUpdatedAt, mergeData, ...fields } = payload
        const saved = yield* drawings.save(params.id, fields, baseUpdatedAt, mergeData === true)
        if (!saved.ok) return yield* new Conflict({ message: `The drawing was saved elsewhere since it was read (${saved.currentUpdatedAt}). Nothing was overwritten.` })
        return saved.row
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update drawing"))))
    .handle("versions", ({ params }) =>
      load(params.id).pipe(Effect.andThen(drawings.versions(params.id)), Effect.catchTag("DatabaseError", fail("Failed to fetch drawing versions"))))
    .handle("restoreVersion", ({ params }) =>
      Effect.gen(function*() {
        yield* load(params.id)
        const row = yield* drawings.restoreVersion(params.id, params.versionId)
        if (!row) return yield* new NotFound({ message: "Version not found" })
        return row
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to restore drawing version"))))
    .handle("remove", ({ params }) =>
      Effect.gen(function*() {
        const { user, drawing } = yield* load(params.id)
        const canDelete = drawing.project.ownerId === user.id || !!drawing.project.organization?.users.some((u) => u.role === "ADMIN")
        if (!canDelete) return yield* new Forbidden({ message: "You do not have permission to delete this drawing" })
        yield* drawings.remove(params.id)
        return { message: "Drawing deleted successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete drawing"))))
    .handle("listForProject", ({ params }) =>
      Effect.gen(function*() {
        yield* projectAccess(params.id)
        return yield* drawings.listByProject(params.id)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch drawings"))))
    .handle("createForProject", ({ params, payload }) =>
      Effect.gen(function*() {
        yield* projectAccess(params.id)
        if (!payload.name) return yield* new BadRequest({ message: "Drawing name is required" })
        yield* titleBlockOf(payload.data)
        return yield* drawings.create(params.id, { ...payload, name: payload.name })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create drawing"))))
}))
