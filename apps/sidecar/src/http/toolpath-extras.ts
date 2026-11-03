/**
 * Toolpath sub-resources the legacy UI used on `/toolpaths/:id`: version history, restore, comments, and the
 * predefined library the list page offers ("Standard Library"). Paths and bodies match the legacy routes.
 */
import { Api, BadRequest, CurrentUser, EnvBadRequest, EnvNotFound, Forbidden, InternalError, NotFound, envErr, ok } from "@cadcamfun/api"
import { Effect } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import JSZip from "jszip"
import { ProjectRepo } from "../repos/project-repo.ts"
import { exportMeta, internal } from "./entity-io.ts"
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
  const projects = yield* ProjectRepo

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
    .handle("export", ({ query }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const format = query.format ?? "json"
        const ids = query.ids === undefined ? undefined : typeof query.ids === "string" ? [query.ids] : query.ids
        const found = yield* repo.exportable(user.id, ids)
        if (found.length === 0) return yield* envErr(EnvNotFound, "No accessible toolpaths found")
        const rows = found.map(({ row, projectName }) => ({
          id: row.id, name: row.name, description: row.description, type: row.type || "mill", operationType: row.operationType || "contour",
          data: row.data, gcode: row.gcode || "", metadata: { ...exportMeta(user.id), projectName }
        }))
        const stamp = Date.now()
        if (format === "json") return HttpServerResponse.jsonUnsafe(rows, { headers: { "content-disposition": `attachment; filename="toolpaths-export-${stamp}.json"` } })
        if (format !== "zip") return yield* envErr(EnvBadRequest, "Unsupported export format")
        // One folder per toolpath (`toolpath.json` plus the G-code when there is any), indexed by `index.json`.
        const zip = new JSZip()
        const folderOf = (name: string) => name.replace(/[^a-z0-9]/gi, "_")
        for (const r of rows) {
          zip.file(`${folderOf(r.name)}/toolpath.json`, JSON.stringify(r, null, 2))
          if (r.gcode) zip.file(`${folderOf(r.name)}/${folderOf(r.name)}.gcode`, r.gcode)
        }
        zip.file("index.json", JSON.stringify({ exported_at: new Date().toISOString(), toolpaths: rows.map((r) => ({ id: r.id, name: r.name, folder: folderOf(r.name) })) }, null, 2))
        const bytes = yield* Effect.tryPromise({ try: () => zip.generateAsync({ type: "uint8array" }), catch: (cause) => cause }).pipe(Effect.catch(internal))
        return HttpServerResponse.uint8Array(bytes, { contentType: "application/zip", headers: { "content-disposition": `attachment; filename="toolpaths-export-${stamp}.zip"` } })
      }).pipe(Effect.catchTags({ DatabaseError: internal })))
    .handle("import", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        const body = (payload ?? {}) as { projectId?: string; data?: unknown; gcode?: string; name?: string; type?: string; operationType?: string; settings?: unknown; importMode?: string }
        if (!body.projectId) return yield* envErr(EnvBadRequest, "Project ID is required")
        if (!(yield* projects.find(user.id, body.projectId))) return yield* envErr(EnvNotFound, "Project not found or access denied")
        // A bare G-code body becomes one toolpath named after the day it was imported.
        const importData = body.data ? body.data : body.gcode
          ? { name: body.name || `Imported G-code ${new Date().toLocaleDateString()}`, type: body.type || "mill", operationType: body.operationType || "contour", data: body.settings || {}, gcode: body.gcode }
          : undefined
        if (!importData) return yield* envErr(EnvBadRequest, "No import data or G-code provided")
        const items = (Array.isArray(importData) ? importData : [importData]) as Record<string, unknown>[]
        return ok(yield* repo.importMany(user.id, body.projectId, items, body.importMode ?? "create"), "Toolpaths imported successfully")
      }).pipe(Effect.catchTags({ DatabaseError: internal })))
}))
