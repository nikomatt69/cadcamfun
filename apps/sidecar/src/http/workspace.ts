import { Api, BadRequest, CurrentUser, InternalError, NotFound } from "@cadcamfun/api"
import { cam, preview } from "@cadcamfun/core"
import { Effect, Schema } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { ComponentRepo } from "../repos/component-repo.ts"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { MachineConfigRepo } from "../repos/machine-config-repo.ts"
import { MaterialRepo } from "../repos/material-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"
import { ToolpathRepo } from "../repos/toolpath-repo.ts"
import { ToolRepo } from "../repos/tool-repo.ts"

const fail = (message: string) => (error: unknown) =>
  Effect.logError(message, error).pipe(Effect.andThen(Effect.fail(new InternalError({ message }))))

const iso = (value: Date | string): string => (value instanceof Date ? value.toISOString() : value)

const idsOf = (values: ReadonlyArray<string | null>): string[] => [...new Set(values.filter((id): id is string => !!id))]

/**
 * Phone workspace. Every handler is a GET. The stored CAD document stays on the desktop; the response is a
 * summary, a mesh, or a toolpath polyline.
 */
export const WorkspaceHandlers = HttpApiBuilder.group(Api, "workspace", Effect.fn(function*(handlers) {
  const projects = yield* ProjectRepo
  const drawings = yield* DrawingRepo
  const components = yield* ComponentRepo
  const toolpaths = yield* ToolpathRepo
  const materials = yield* MaterialRepo
  const tools = yield* ToolRepo
  const machines = yield* MachineConfigRepo

  const projectAccess = Effect.fn("workspace.projectAccess")(function*(projectId: string) {
    const user = yield* CurrentUser
    if (!projectId) return yield* new BadRequest({ message: "Project ID is required" })
    if (!(yield* projects.find(user.id, projectId))) return yield* new NotFound({ message: "Project not found or access denied" })
    return user
  })

  const toolpathPreview = Effect.fn("workspace.toolpathPreview")(function*(data: unknown, gcode: string) {
    if (gcode.trim().length > 0) return preview.toolpathPreviewFromGcode(gcode)
    const record = data !== null && typeof data === "object" ? data as Record<string, unknown> : undefined
    const candidate = record?.program ?? record
    if (!candidate) return preview.emptyToolpathPreview()
    const program = yield* Schema.decodeUnknownEffect(cam.ProgramSchema)(candidate).pipe(Effect.orElseSucceed(() => undefined))
    return program ? preview.toolpathPreviewFromProgram(program) : preview.emptyToolpathPreview()
  })

  return handlers
    .handle("drawings", ({ params }) =>
      Effect.gen(function*() {
        yield* projectAccess(params.id)
        const rows = yield* drawings.listByProject(params.id)
        return rows.map((row) => ({ id: row.id, name: row.name, subtitle: row.description, updatedAt: row.updatedAt }))
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch drawings"))))
    .handle("drawingPreview", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* projectAccess(params.id)
        const drawing = yield* drawings.find(user.id, params.drawingId)
        if (!drawing || drawing.projectId !== params.id) return yield* new NotFound({ message: "Drawing not found" })
        return { ...preview.meshPreview(preview.elementsOfDocument(drawing.data)), revision: drawing.updatedAt }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to preview drawing"))))
    .handle("components", ({ params }) =>
      Effect.gen(function*() {
        yield* projectAccess(params.id)
        const rows = yield* components.listByProject(params.id)
        return rows.map((row) => ({ id: row.id, name: row.name, subtitle: row.type, updatedAt: row.updatedAt }))
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch components"))))
    .handle("componentPreview", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* projectAccess(params.id)
        const component = yield* components.find(user.id, params.componentId)
        if (!component || component.projectId !== params.id) return yield* new NotFound({ message: "Component not found" })
        return {
          ...preview.meshPreview(preview.elementsOfDocument(component.data)),
          parameters: preview.documentParameters(component.data),
          revision: component.updatedAt,
        }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to preview component"))))
    .handle("toolpaths", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* projectAccess(params.id)
        const rows = yield* toolpaths.list(user.id, { projectId: params.id, includePublic: true })
        return rows.map((row) => ({ id: row.id, name: row.name, subtitle: row.operationType ?? row.type, updatedAt: row.updatedAt }))
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch toolpaths"))))
    .handle("toolpath", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* projectAccess(params.id)
        const found = yield* toolpaths.find(user.id, params.toolpathId)
        if (!found || found.project.id !== params.id) return yield* new NotFound({ message: "Toolpath not found" })
        const gcode = found.row.gcode ?? ""
        const path = yield* toolpathPreview(found.row.data, gcode)
        return {
          id: found.row.id,
          name: found.row.name,
          operationType: found.row.operationType,
          gcode,
          stats: path.stats,
          revision: found.row.updatedAt,
          updatedAt: found.row.updatedAt,
        }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to read toolpath"))))
    .handle("toolpathPreview", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* projectAccess(params.id)
        const found = yield* toolpaths.find(user.id, params.toolpathId)
        if (!found || found.project.id !== params.id) return yield* new NotFound({ message: "Toolpath not found" })
        const path = yield* toolpathPreview(found.row.data, found.row.gcode ?? "")
        return { ...path, revision: found.row.updatedAt }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to preview toolpath"))))
    .handle("library", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* projectAccess(params.id)
        const [componentRows, pathRows] = yield* Effect.all([
          components.listByProject(params.id),
          toolpaths.list(user.id, { projectId: params.id, includePublic: true }),
        ], { concurrency: 2 })
        const [materialRows, toolRows, machineRows] = yield* Effect.all([
          materials.visibleByIds(user.id, idsOf(pathRows.map((row) => row.materialId))),
          tools.visibleByIds(user.id, idsOf(pathRows.map((row) => row.toolId))),
          machines.visibleByIds(user.id, idsOf(pathRows.map((row) => row.machineConfigId))),
        ], { concurrency: 3 })
        return {
          materials: materialRows.map((row) => ({ id: row.id, name: row.name, subtitle: row.description, updatedAt: iso(row.updatedAt) })),
          tools: toolRows.map((row) => ({ id: row.id, name: row.name, subtitle: `${row.type} · Ø${row.diameter}`, updatedAt: row.updatedAt })),
          machines: machineRows.map((row) => ({ id: row.id, name: row.name, subtitle: row.type, updatedAt: row.updatedAt })),
          components: componentRows.map((row) => ({ id: row.id, name: row.name, subtitle: row.type, updatedAt: row.updatedAt })),
        }
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to fetch library"))))
}))
