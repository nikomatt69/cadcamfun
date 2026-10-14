/**
 * Toolpath sub-resources the legacy UI used on `/toolpaths/:id`: version history, restore, comments, and the
 * predefined library the list page offers ("Standard Library"). Paths and bodies match the legacy routes.
 */
import { Api, BadRequest, CurrentUser, Forbidden, InternalError, NotFound } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ToolpathRepo } from "../repos/toolpath-repo.ts"
import { ToolpathLibrary } from "../repos/toolpath-library.ts"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { prepareCamProgramData } from "../services/cam-program.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

export const ToolpathExtrasHandlers = HttpApiBuilder.group(Api, "toolpathExtras", Effect.fn(function*(handlers) {
  const repo = yield* ToolpathRepo
  const library = yield* ToolpathLibrary
  const drawings = yield* DrawingRepo

  /** Visible toolpath (created by the user, in their organisation, or public) — the legacy `findFirst` guard. */
  const visible = Effect.fn("toolpathExtras.visible")(function*(id: string) {
    const user = yield* CurrentUser
    if (!id) return yield* new BadRequest({ message: "Toolpath ID is required and must be a string" })
    const found = yield* repo.find(user.id, id)
    if (!found) return yield* new NotFound({ message: "Toolpath not found or access denied" })
    return { user, found }
  })

  return handlers
    .handle("library", ({ query }) =>
      Effect.sync(() => library.filter({ type: query.type, operationType: query.operationType, category: query.category, search: query.search, projectId: query.projectId })))
    .handle("listVersions", ({ params }) =>
      visible(params.id).pipe(
        Effect.andThen(repo.listVersions(params.id)),
        Effect.catchTag("DatabaseError", fail("Failed to fetch toolpath versions"))))
    .handle("createVersion", ({ params, payload }) =>
      Effect.gen(function*() {
        const { user, found } = yield* visible(params.id)
        if (!found.canWrite) return yield* new NotFound({ message: "Toolpath not found or access denied" })
        if (payload.data === undefined && (payload.gcode === undefined || payload.gcode === "")) {
          return yield* new BadRequest({ message: "Either data or gcode must be provided" })
        }
        const drawing = found.row.drawingId ? yield* drawings.find(user.id, found.row.drawingId) : undefined
        const data = payload.data !== undefined ? yield* prepareCamProgramData({ data: payload.data, gcode: payload.gcode, previous: found.row.data, drawing }) : undefined
        const created = yield* repo.createVersion(params.id, user.id, { ...payload, ...(data !== undefined ? { data } : {}) })
        return { ...created, message: "Version created successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create toolpath version"))))
    .handle("restoreVersion", ({ params, payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const found = yield* repo.find(user.id, params.id)
        if (!found || !found.canWrite) return yield* new NotFound({ message: "Toolpath not found or access denied" })
        const version = yield* repo.findVersion(params.id, payload.versionId)
        if (!version) return yield* new NotFound({ message: "Version not found" })
        // Snapshot the current state first so the restore can itself be undone.
        yield* repo.createVersion(params.id, user.id, { data: found.row.data, gcode: found.row.gcode ?? "", changeMessage: "Auto-saved before version restore" })
        const updated = yield* repo.update(params.id, { data: version.data, gcode: version.gcode ?? found.row.gcode })
        return { ...updated, message: "Version restored successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to restore toolpath version"))))
    .handle("listComments", ({ params }) =>
      visible(params.id).pipe(
        Effect.andThen(repo.listComments(params.id)),
        Effect.catchTag("DatabaseError", fail("Failed to fetch toolpath comments"))))
    .handle("createComment", ({ params, payload }) =>
      Effect.gen(function*() {
        const { user } = yield* visible(params.id)
        if (payload.content.trim() === "") return yield* new BadRequest({ message: "Comment content is required" })
        return yield* repo.createComment(params.id, user.id, payload.content)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create toolpath comment"))))
    .handle("updateComment", ({ params, payload }) =>
      Effect.gen(function*() {
        const { user } = yield* visible(params.id)
        const comment = yield* repo.findComment(params.commentId)
        if (!comment || comment.toolpathId !== params.id) return yield* new NotFound({ message: "Comment not found" })
        if (comment.userId !== user.id) return yield* new Forbidden({ message: "Not authorized to edit this comment" })
        if (payload.content.trim() === "") return yield* new BadRequest({ message: "Comment content is required" })
        return yield* repo.updateComment(params.commentId, payload.content)
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to update toolpath comment"))))
    .handle("removeComment", ({ params }) =>
      Effect.gen(function*() {
        const { user, found } = yield* visible(params.id)
        const comment = yield* repo.findComment(params.commentId)
        if (!comment || comment.toolpathId !== params.id) return yield* new NotFound({ message: "Comment not found" })
        // Legacy rule: the comment's author, or the toolpath's creator, may delete it.
        if (comment.userId !== user.id && found.row.createdBy !== user.id) return yield* new Forbidden({ message: "Not authorized to delete this comment" })
        yield* repo.removeComment(params.commentId)
        return { message: "Comment deleted successfully" }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to delete toolpath comment"))))
}))
