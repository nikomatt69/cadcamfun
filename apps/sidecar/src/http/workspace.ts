import { Api, BadRequest, CurrentUser, InternalError, NotFound } from "@cadcamfun/api"
import { cam, preview } from "@cadcamfun/core"
import { Effect, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { createHash } from "node:crypto"
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

/** Encoded previews kept in memory: a phone reopening a part, or two phones on one project, do not tessellate again. */
export const PREVIEW_CACHE_ENTRIES = 48
export const PREVIEW_CACHE_BYTES = 64 * 1024 * 1024

/**
 * The entity tag of one preview: the route kind, the entity, the stored content and the payload format. The content
 * is hashed rather than trusted to `updatedAt` alone, because two writes in one millisecond, or a checkout that
 * restores an older snapshot, could otherwise pair one revision with two different documents.
 */
export const previewTag = (kind: string, id: string, revision: string, ...content: ReadonlyArray<unknown>): string => {
  const hash = createHash("sha256").update(`${preview.PREVIEW_FORMAT}\0${kind}\0${id}\0${revision}`)
  for (const part of content) hash.update("\0").update(typeof part === "string" ? part : JSON.stringify(part) ?? "null")
  return `"${hash.digest("base64url").slice(0, 32)}"`
}

/** RFC 9110 §13.1.2: weak comparison, a list of tags or `*`. */
export const matchesTag = (header: string | undefined, tag: string): boolean => {
  if (!header) return false
  const bare = tag.replace(/^W\//, "")
  return header.split(",").some((candidate) => {
    const value = candidate.trim()
    return value === "*" || value.replace(/^W\//, "") === bare
  })
}

const encoder = new TextEncoder()

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

  const cache = new preview.PreviewCache<Uint8Array>({ maxEntries: PREVIEW_CACHE_ENTRIES, maxWeight: PREVIEW_CACHE_BYTES }, (bytes) => bytes.byteLength)

  /**
   * Answers a preview as JSON with its entity tag. A phone that already holds this tag (`If-None-Match`) gets a body-less
   * 304 before anything is tessellated; otherwise the encoded payload comes from the cache or is built once.
   */
  const conditional = Effect.fn("workspace.conditional")(function*<E, R>(tag: string, build: Effect.Effect<unknown, E, R>) {
    const request = yield* HttpServerRequest.HttpServerRequest
    const headers = { etag: tag, "cache-control": "private, no-cache" }
    if (matchesTag(request.headers["if-none-match"], tag)) return HttpServerResponse.empty({ status: 304, headers })
    const cached = cache.get(tag)
    const bytes = cached ?? encoder.encode(JSON.stringify(yield* build))
    if (!cached) cache.set(tag, bytes)
    return HttpServerResponse.uint8Array(bytes, { contentType: "application/json", headers })
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
        return yield* conditional(previewTag("drawing", drawing.id, drawing.updatedAt, drawing.data), Effect.sync(() => ({
          ...preview.meshPreview(preview.elementsOfDocument(drawing.data)), revision: drawing.updatedAt,
        })))
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
        return yield* conditional(previewTag("component", component.id, component.updatedAt, component.data), Effect.sync(() => ({
          ...preview.meshPreview(preview.elementsOfDocument(component.data)),
          parameters: preview.documentParameters(component.data),
          revision: component.updatedAt,
        })))
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
        const row = found.row
        const gcode = row.gcode ?? ""
        return yield* conditional(previewTag("toolpath", row.id, row.updatedAt, row.name, row.operationType, gcode, gcode.trim() ? null : row.data), Effect.gen(function*() {
          const path = yield* toolpathPreview(row.data, gcode)
          return {
            id: row.id,
            name: row.name,
            operationType: row.operationType,
            gcode,
            stats: path.stats,
            revision: row.updatedAt,
            updatedAt: row.updatedAt,
          }
        }))
      }).pipe(Effect.catchTag("DatabaseError", fail("Failed to read toolpath"))))
    .handle("toolpathPreview", ({ params }) =>
      Effect.gen(function*() {
        const user = yield* projectAccess(params.id)
        const found = yield* toolpaths.find(user.id, params.toolpathId)
        if (!found || found.project.id !== params.id) return yield* new NotFound({ message: "Toolpath not found" })
        const row = found.row
        const gcode = row.gcode ?? ""
        // Stored G-code wins over the program, so the program only enters the tag when it is what gets drawn.
        return yield* conditional(previewTag("toolpath-path", row.id, row.updatedAt, gcode, gcode.trim() ? null : row.data), Effect.gen(function*() {
          const path = yield* toolpathPreview(row.data, gcode)
          return { ...path, revision: row.updatedAt }
        }))
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
