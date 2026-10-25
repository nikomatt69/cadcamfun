import { Api, BadRequest, CamKernelArtifact, Conflict, CurrentUser, EnvBadRequest, EnvNotFound, Forbidden, InternalError, NotFound, envErr, okAuth } from "@cadcamfun/api"
import { cam, drawing as sheets } from "@cadcamfun/core"
import { Effect, Schema } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ProjectRepo } from "../repos/project-repo.ts"
import { ToolpathRepo, type ToolpathInput } from "../repos/toolpath-repo.ts"
import { internal } from "./entity-io.ts"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { isPortableProgram, prepareCamProgramData } from "../services/cam-program.ts"

const fail = (message: string) => (e: unknown) =>
  Effect.logError(message, e).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

export const ToolpathsHandlers = HttpApiBuilder.group(Api, "toolpaths", Effect.fn(function*(handlers) {
  const repo = yield* ToolpathRepo
  const projects = yield* ProjectRepo
  const drawings = yield* DrawingRepo

  const assertPortableWrite = Effect.fn("toolpaths.portableWrite")(function*(userId: string, projectId: string, data: unknown) {
    const access = yield* projects.find(userId, projectId)
    if (!access) return yield* new NotFound({ message: "Project not found or access denied" })
    if (isPortableProgram(data) && access.project.ownerId !== userId && access.orgRole !== "ADMIN" && access.orgRole !== "MANAGER") {
      return yield* new Forbidden({ message: "You do not have permission to save a CAM program in this project" })
    }
  })

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
        return yield* repo.list(user.id, { ...query })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch toolpaths"))))
    .handle("create", ({ payload }) =>
      Effect.gen(function*() {
        const user = yield* CurrentUser
        if (!payload.name || !payload.projectId) return yield* new BadRequest({ message: "Name and projectId are required" })
        yield* assertPortableWrite(user.id, payload.projectId, payload.data)
        const data = yield* prepareCamProgramData({ data: payload.data, gcode: payload.gcode })
        return yield* repo.create(user.id, { ...payload, data, name: payload.name, projectId: payload.projectId })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create toolpath"))))
    .handle("get", ({ params }) =>
      load(params.id).pipe(
        Effect.map((f) => ({ ...f.row, project: { id: f.project.id, name: f.project.name, ownerId: f.project.ownerId } })),
        Effect.catchTag("DatabaseError", fail("Failed to fetch toolpath"))))
    .handle("setupSheet", ({ params }) =>
      Effect.gen(function*() {
        const found = yield* load(params.id)
        const stored = (found.row.data as { readonly kernelArtifact?: unknown } | null)?.kernelArtifact
        if (stored === undefined || stored === null) return yield* new BadRequest({ message: "This toolpath has no kernel program: only a program the CAM kernel generated has a setup sheet" })
        const artifact = yield* Effect.try({ try: () => Schema.decodeUnknownSync(CamKernelArtifact)(stored), catch: () => new BadRequest({ message: "The stored kernel program does not match the contract; regenerate it" }) })
        // The sheet carries the title block of the drawing the program belongs to, completed the way every screen completes it.
        const user = yield* CurrentUser
        const owner = found.row.drawingId === null ? undefined : yield* drawings.find(user.id, found.row.drawingId)
        const block = sheets.completeTitleBlock((owner?.data as { titleBlock?: unknown } | null)?.titleBlock, { name: owner?.name ?? found.row.name, ...(user.name ? { author: user.name } : {}) })
        const sheet = cam.kernel.setupSheetData(artifact, { title: found.row.name, titleBlock: block })
        if (typeof sheet === "string") return yield* new BadRequest({ message: sheet })
        return { data: sheet, html: cam.kernel.setupSheetHtml(sheet) }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to build the setup sheet"))))
    .handle("postCheck", ({ payload }) =>
      Effect.sync(() => {
        const compiled = cam.compileDefinition(payload.definition)
        if (!compiled.ok) return { valid: false, issues: compiled.issues }
        if (payload.sample === false) return { valid: true, issues: [] }
        try {
          return { valid: true, issues: [], sample: compiled.post.emit(cam.samplePostProgram(), {}) }
        } catch (cause) {
          // A definition can be well formed and still write a program the control cannot take: that is its answer, not a failure.
          return { valid: false, issues: [{ path: "", message: cause instanceof Error ? cause.message : String(cause) }] }
        }
      }))
    .handle("update", ({ params, payload }) =>
      Effect.gen(function*() {
        const found = yield* load(params.id)
        if (!found.canWrite) return yield* new Forbidden({ message: "You do not have permission to modify this toolpath" })
        const patch: ToolpathInput = {}
        for (const k of ["name", "description", "type", "operationType", "isPublic", "thumbnail", "data", "gcode"] as const) {
          if (payload[k] !== undefined) (patch as Record<string, unknown>)[k] = payload[k]
        }
        if (Object.keys(patch).length === 0) return yield* new BadRequest({ message: "No fields provided for update" })
        if (payload.data !== undefined || payload.gcode !== undefined) {
          const user = yield* CurrentUser
          const drawing = found.row.drawingId ? yield* drawings.find(user.id, found.row.drawingId) : undefined
          patch.data = yield* prepareCamProgramData({ data: payload.data !== undefined ? payload.data : found.row.data, gcode: payload.gcode !== undefined ? payload.gcode : found.row.gcode, previous: found.row.data, drawing })
        }
        // An editor that holds a copy writes only if nobody saved since (check and write are one transaction).
        const base = payload.baseUpdatedAt
        const updated = base === undefined ? yield* repo.update(params.id, patch) : yield* repo.updateWhere(params.id, (row) => row.updatedAt === base, () => patch)
        if (updated === undefined) return yield* new Conflict({ message: "The toolpath was saved elsewhere since it was read. Nothing was overwritten." })
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
        yield* assertPortableWrite(user.id, drawing.projectId, payload.data)
        const sourceDrawing = yield* drawings.find(user.id, params.id)
        const data = yield* prepareCamProgramData({ data: payload.data, gcode: payload.gcode, drawing: sourceDrawing })
        // Legacy parity: gcode/type/operationType are stored as given (no defaults on this route).
        return yield* repo.create(user.id, { ...payload, data, name: payload.name, projectId: drawing.projectId, drawingId: params.id, applyDefaults: false })
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to create toolpath"))))
}))

export const ProjectToolpathsHandlers = HttpApiBuilder.group(Api, "projectToolpaths", Effect.fn(function*(handlers) {
  const repo = yield* ToolpathRepo
  const projects = yield* ProjectRepo

  // Legacy quirk kept: the id is read from `?projectId=`, and org members need role ADMIN or MEMBER.
  const guard = Effect.fn("projectToolpaths.guard")(function*(projectId: string | undefined, native = false) {
    const user = yield* CurrentUser
    if (!projectId) return yield* envErr(EnvBadRequest, "Project ID is required")
    const access = yield* projects.find(user.id, projectId)
    const allowed = !!access && (access.project.ownerId === user.id || access.orgRole === "ADMIN" || access.orgRole === (native ? "MANAGER" : "MEMBER"))
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
        const { user, projectId } = yield* guard(query.projectId, isPortableProgram(payload.data))
        if (!payload.name) return yield* envErr(EnvBadRequest, "Name is required")
        const data = yield* prepareCamProgramData({ data: payload.data, gcode: payload.gcode }).pipe(Effect.catchTag("BadRequest", (error) => envErr(EnvBadRequest, error.message)))
        const created = yield* repo.create(user.id, { ...payload, data, name: payload.name, projectId })
        return okAuth(created, "Toolpath created successfully")
      }).pipe(Effect.catchTag("DatabaseError", internal)))
}))
