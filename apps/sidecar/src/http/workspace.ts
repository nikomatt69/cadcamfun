import { Api, BadRequest, CamProgramDocument, CurrentUser, InternalError, NotFound, type ToolRow } from "@cadcamfun/api"
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

const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined

/** A tool row as `cam.toolModelOf` reads it (the desktop's `toolResourceOf`). */
const toolResourceOf = (row: ToolRow): cam.ToolResource => ({
  type: row.type, diameter: row.diameter,
  numberOfFlutes: row.numberOfFlutes, cuttingLength: row.cuttingLength, totalLength: row.totalLength,
  shankDiameter: row.shankDiameter, cornerRadius: row.cornerRadius ?? null, tipAngle: row.tipAngle ?? null,
  threadPitch: row.threadPitch ?? null, holderDiameter: row.holderDiameter ?? null,
  holderLength: row.holderLength ?? null, stickout: row.stickout ?? null,
})

/**
 * The inputs of the stored document that change the machine scene, for the entity tag. The CAD drawing, the notes and
 * the operation list are left out, so editing them does not make the phone fetch the same path again.
 */
const sceneTagInputs = (data: unknown): unknown => {
  const record = recordOf(data)
  if (record === undefined) return null
  const artifact = recordOf(record.kernelArtifact)
  const request = recordOf(record.kernelRequest)
  return {
    settings: record.settings ?? null,
    stock: record.stock ?? null,
    program: record.program ?? null,
    generatorGcode: record.gcode ?? null,
    artifact: artifact === undefined ? null : {
      nc: artifact.nc ?? null, identity: artifact.identity ?? null,
      stockBounds: artifact.stockBounds ?? null, machine: artifact.machine ?? null,
    },
    machine: request?.machine ?? null,
  }
}

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

  /**
   * The tools the stored program's own toolpaths name, by tool id.
   *
   * A program that changes tools has one toolpath per tool (spec 32 §4.8); the phone draws each operation with the
   * cutter that runs it, so the tool rows travel with the preview.
   */
  const programToolsOf = Effect.fn("workspace.programTools")(function*(data: unknown, userId: string) {
    const record = recordOf(data)
    const program = recordOf(record?.program)
    const paths = Array.isArray(program?.toolpaths) ? program.toolpaths : []
    const ids = idsOf(paths.map((path) => {
      const entry = recordOf(path)
      return typeof entry?.toolId === "string" ? entry.toolId : null
    }))
    if (ids.length === 0) return [] as ReadonlyArray<{ readonly toolId: string; readonly resource: cam.ToolResource }>
    const rows = yield* tools.visibleByIds(userId, ids)
    return rows.map((row) => ({ toolId: row.id, resource: toolResourceOf(row) }))
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

  /** The machine scene of a stored CAM document; absent when the row holds something else (older or partial data). */
  const documentScene = Effect.fn("workspace.documentScene")(function*(data: unknown, gcode: string, toolRow: ToolRow | undefined, programTools: ReadonlyArray<{ readonly toolId: string; readonly resource: cam.ToolResource }>) {
    const document = yield* Schema.decodeUnknownEffect(CamProgramDocument)(data).pipe(Effect.orElseSucceed(() => undefined))
    if (document === undefined) return undefined
    return preview.machineScenePreview({
      settings: document.settings,
      stock: document.stock,
      gcode,
      program: document.program,
      ...(document.kernelArtifact !== undefined ? { artifact: document.kernelArtifact, kernelNc: document.kernelArtifact.nc } : {}),
      ...(document.gcode !== "" ? { generatorGcode: document.gcode } : {}),
      ...(document.kernelRequest?.machine !== undefined ? { machineId: document.kernelRequest.machine } : {}),
      ...(toolRow !== undefined ? { toolResource: toolResourceOf(toolRow) } : {}),
      ...(programTools.length > 0 ? { tools: programTools } : {}),
    })
  })

  /**
   * The part the program cuts: the drawing the document was made from, as a mesh.
   *
   * The phone draws it beside the path, like the desktop's CAM preview draws the workpiece. A document that names no
   * drawing has no part to draw.
   */
  const documentPart = Effect.fn("workspace.documentPart")(function*(data: unknown) {
    const document = yield* Schema.decodeUnknownEffect(CamProgramDocument)(data).pipe(Effect.orElseSucceed(() => undefined))
    if (document === undefined) return undefined
    const elements = preview.elementsOfDocument(document.drawing)
    if (elements.length === 0) return undefined
    return preview.meshPreview(elements)
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
        return yield* conditional(previewTag("drawing", drawing.id, drawing.updatedAt, drawing.data), Effect.sync(() => {
          const elements = preview.elementsOfDocument(drawing.data)
          const features = preview.featureTrees(elements)
          return {
            ...preview.meshPreview(elements),
            ...(features.length > 0 ? { features } : {}),
            revision: drawing.updatedAt,
          }
        }))
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
        return yield* conditional(previewTag("component", component.id, component.updatedAt, component.data), Effect.sync(() => {
          const elements = preview.elementsOfDocument(component.data)
          const features = preview.featureTrees(elements)
          return {
            ...preview.meshPreview(elements),
            parameters: preview.documentParameters(component.data),
            ...(features.length > 0 ? { features } : {}),
            revision: component.updatedAt,
          }
        }))
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
        // A tool edit changes the scene even when the toolpath row did not change, so its shape values enter the tag.
        const toolRow = row.toolId === null ? undefined : (yield* tools.visibleByIds(user.id, [row.toolId]))[0]
        // The tools the program's own toolpaths name: a program that changes tools draws each operation with its cutter.
        const programTools = yield* programToolsOf(row.data, user.id)
        const tag = previewTag("toolpath-path", row.id, row.updatedAt, gcode,
          toolRow !== undefined ? toolResourceOf(toolRow) : null, row.machineConfigId, sceneTagInputs(row.data),
          programTools.map((entry) => entry.resource))
        return yield* conditional(tag, Effect.gen(function*() {
          const scene = yield* documentScene(row.data, gcode, toolRow, programTools)
          const path = scene ?? (yield* toolpathPreview(row.data, gcode))
          const part = yield* documentPart(row.data)
          return { ...path, ...(part !== undefined ? { part } : {}), revision: row.updatedAt }
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
