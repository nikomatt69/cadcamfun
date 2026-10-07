import {
  AiConfig, AiCredentials, AiHost, AiService, DirectModel, defaultModelFactory, ToolHandlers, buildTools, defaultProviderSpecs,
  makeNikCliRuntime, systemPrompt, type ProviderId, type ToolHandlersShape
} from "@cadcamfun/ai"
import { DESIGN_SPACE, cam, checkModel } from "@cadcamfun/core"
import { Effect, Layer, Redacted } from "effect"
import { AppConfigService } from "../config.ts"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { MaterialRepo } from "../repos/material-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"
import { ToolRepo } from "../repos/tool-repo.ts"
import { ToolpathRepo } from "../repos/toolpath-repo.ts"
import { KvStore } from "./kv.ts"
import { normalizeElement, withDefaultTolerance } from "@cadcamfun/ai"
import { applyChanges, describeElements, elementsOf, newElements, type Element } from "./ai-elements.ts"
import { LocalProfile } from "./local-profile.ts"

/** The tool handlers the model can call, over the active project's newest drawing and the libraries. */
const toolHandlers = Effect.gen(function*() {
  const drawings = yield* DrawingRepo
  const materials = yield* MaterialRepo
  const tools = yield* ToolRepo
  const projects = yield* ProjectRepo
  const toolpaths = yield* ToolpathRepo
  const { user } = yield* LocalProfile
  const kv = yield* KvStore

  /**
   * The drawing the assistant works on. `projectId` is what the UI last opened (or "default"); when it names no
   * project, or a project without a drawing, the assistant gets one instead of an error: the user's newest
   * project (a new "Untitled project" if there is none) and its newest drawing (a new empty "Drawing 1").
   */
  const load = async (projectId: string): Promise<{ id: string; projectId: string; data: Record<string, unknown>; elements: Element[]; created: boolean }> => {
    let project: { id: string } | undefined = (await Effect.runPromise(projects.find(user.id, projectId)))?.project
    let created = false
    if (!project) {
      const own = (await Effect.runPromise(projects.list(user.id))).find((candidate) => candidate.ownerId === user.id)
      project = own ?? await Effect.runPromise(projects.create(user.id, { name: "Untitled project" }))
      created = own === undefined
    }
    let row = (await Effect.runPromise(drawings.listByProject(project.id)))[0]
    if (!row) {
      row = await Effect.runPromise(drawings.create(project.id, { name: "Drawing 1", data: { elements: [], version: "1.0" } }))
      created = true
    }
    const data = row.data !== null && typeof row.data === "object" ? (row.data as Record<string, unknown>) : {}
    return { id: row.id, projectId: project.id, data, elements: elementsOf(data), created }
  }
  const save = async (id: string, data: Record<string, unknown>, elements: ReadonlyArray<Element>) => {
    await Effect.runPromise(drawings.update(id, { data: { ...data, elements, version: "1.0" } }))
  }
  /** What the UI needs to mirror a change in the open editor: where it went and the resulting elements. */
  const where = (loaded: { id: string; projectId: string; created: boolean }) => ({ drawingId: loaded.id, projectId: loaded.projectId, ...(loaded.created ? { createdDrawing: true } : {}) })

  /** A stored operation of the active drawing with its request rebuilt over the drawing's current elements. */
  const operation = async (drawingId: string, operationId: string | undefined): Promise<{ id: string; request: Record<string, unknown> } | { error: string }> => {
    const { id, projectId, elements } = await load(drawingId)
    if (!operationId) return { error: "operationId is required" }
    const found = await Effect.runPromise(toolpaths.find(user.id, operationId))
    if (!found || found.row.drawingId !== id || found.project.id !== projectId) return { error: "Operation not found in the active drawing" }
    const stored = found.row.data as { request?: { settings?: unknown; geometry?: unknown; printer?: unknown } } | null
    if (!stored?.request) return { error: "Operation has no generation settings" }
    const savedGeometry = stored.request.geometry !== null && typeof stored.request.geometry === "object" ? stored.request.geometry : {}
    return { id: operationId, request: { ...stored.request, geometry: { ...savedGeometry, selectedElements: elements } } }
  }

  const handlers: ToolHandlersShape = {
    addEntities: async (projectId, entities) => {
      const loaded = await load(projectId)
      const created = newElements(entities as Array<Record<string, unknown> & { type: string }>, "default", () => crypto.randomUUID())
      await save(loaded.id, loaded.data, [...loaded.elements, ...created])
      return { ok: true, ids: created.map((e) => e.id), elements: created, ...where(loaded) }
    },
    addElements: async (projectId, rawInput) => {
      let raw = rawInput
      // Whoever calls this gets the same guarantees as the tool: defaults filled, types and counts checked, nothing added on error.
      const checked = raw.map((input) => normalizeElement(input))
      const problems = checked.flatMap((result, index) => (result.ok ? [] : [`elements[${index}]: ${result.error}`]))
      if (problems.length > 0) return { ok: false, error: "Nothing was added.", problems }
      raw = checked.flatMap((result) => (result.ok ? [result.element] : []))
      const loaded = await load(projectId)
      const settings = loaded.data["settings"] as { tolerance?: unknown } | undefined
      const drawingTolerance = typeof settings?.tolerance === "number" ? settings.tolerance : 0
      const created: Element[] = raw.map((input) => withDefaultTolerance(input, drawingTolerance).element).map((fields) => ({ ...fields, id: crypto.randomUUID(), layerId: typeof fields["layer"] === "string" ? fields["layer"] : typeof fields["layerId"] === "string" ? fields["layerId"] : "default" }) as Element)
      // Booleans refer to their operands by id; inside one batch a number is the index of an earlier element.
      for (const element of created) {
        const operands = element["operands"]
        if (!Array.isArray(operands)) continue
        const resolved = operands.map((operand) => (typeof operand === "number" ? created[operand]?.id : operand))
        if (resolved.some((operand) => typeof operand !== "string" || (!created.some((e) => e.id === operand) && !loaded.elements.some((e) => e.id === operand)))) {
          return { ok: false, error: "A boolean operand is not an element of this drawing or batch.", ...where(loaded) }
        }
        element["operands"] = resolved
      }
      await save(loaded.id, loaded.data, [...loaded.elements, ...created])
      return { ok: true, ids: created.map((e) => e.id), elements: created, ...where(loaded) }
    },
    modifyEntities: async (projectId, changes) => {
      const loaded = await load(projectId)
      const missing = changes.filter((c) => !loaded.elements.some((e) => e.id === c.id)).map((c) => c.id)
      if (missing.length > 0) return { ok: false, error: `Unknown element ids: ${missing.join(", ")}. Use cad_describe_drawing to list the ids.`, ...where(loaded) }
      const updated: Element[] = []
      const elements = loaded.elements.map((e) => {
        const change = changes.find((c) => c.id === e.id)
        if (!change) return e
        const next = applyChanges(e, change.changes as Record<string, unknown>)
        updated.push(next)
        return next
      })
      await save(loaded.id, loaded.data, elements)
      return { ok: true, modified: updated.length, elements: updated, ...where(loaded) }
    },
    deleteEntities: async (projectId, ids) => {
      const loaded = await load(projectId)
      const elements = loaded.elements.filter((e) => !ids.includes(e.id))
      await save(loaded.id, loaded.data, elements)
      return { ok: true, deleted: loaded.elements.length - elements.length, ids: loaded.elements.filter((e) => ids.includes(e.id)).map((e) => e.id), ...where(loaded) }
    },
    describeDrawing: async (projectId) => {
      const loaded = await load(projectId)
      return { ...describeElements(loaded.elements), settings: loaded.data["settings"] ?? null, ...where(loaded) }
    },
    checkDesign: async (projectId) => {
      const loaded = await load(projectId)
      const settings = (loaded.data["settings"] ?? {}) as { tolerance?: unknown; units?: unknown }
      const tolerance = typeof settings.tolerance === "number" ? settings.tolerance : undefined
      const bounds = (element: Record<string, unknown>) => {
        try {
          const b = cam.generator.elementBounds(element as never)
          return Number.isFinite(b.min.x) && Number.isFinite(b.max.z) ? { min: b.min, max: b.max } : undefined
        } catch { return undefined }
      }
      const issues = checkModel(loaded.elements, { ...(tolerance !== undefined ? { tolerance } : {}), boundsOf: bounds })
      const described = describeElements(loaded.elements, 0)
      return {
        ok: !issues.some((issue) => issue.severity === "error"),
        issues: issues.slice(0, 50), omitted: Math.max(0, issues.length - 50),
        stats: { elements: described.total, counts: described.counts, bounds: described.bounds, settings: loaded.data["settings"] ?? null },
        designSpace: DESIGN_SPACE, ...where(loaded)
      }
    },
    createOperation: async (drawingId, operation) => {
      const { id, projectId, elements, data } = await load(drawingId)
      const params = operation.params !== null && typeof operation.params === "object" ? operation.params : {}
      const settings = cam.generator.decodeSettings({ ...params, operationType: operation.type })
      // A lathe works from its stock size and a probe from the machine, so only drawing-based operations need elements.
      const needsElements = settings.machineType !== "lathe" && settings.operationType !== "probing"
      if (needsElements && elements.length === 0) return { ok: false, error: "The drawing has no elements yet: add shapes with cad_add_elements first." }
      const geometry = {
        geometryType: "selected" as const,
        selectedElements: elements
      }
      const request = { settings, geometry }
      const row = await Effect.runPromise(toolpaths.create(user.id, {
        name: `${operation.type} operation`, description: "Created by the nikcli CAD/CAM agent",
        data: { request }, projectId, drawingId: id, type: settings.machineType, operationType: settings.operationType
      }))
      return { ok: true, operationId: row.id, name: row.name, drawing: typeof data["name"] === "string" ? data["name"] : "Drawing", elements: elements.length }
    },
    listOperations: async (drawingId) => {
      const { id } = await load(drawingId)
      const rows = await Effect.runPromise(toolpaths.listForDrawing(id))
      return rows.map((row) => {
        const settings = (row.data as { request?: { settings?: Record<string, unknown> } } | null)?.request?.settings ?? {}
        return {
          id: row.id, name: row.name, type: row.type, operationType: row.operationType, generated: Boolean(row.gcode),
          tool: { type: settings["toolType"], diameter: settings["toolDiameter"] }, depth: settings["depth"], stepdown: settings["stepdown"], feedrate: settings["feedrate"]
        }
      })
    },
    updateOperation: async (drawingId, operationId, params) => {
      const { id, projectId } = await load(drawingId)
      const found = await Effect.runPromise(toolpaths.find(user.id, operationId))
      if (!found || found.row.drawingId !== id || found.project.id !== projectId) return { ok: false, error: "Operation not found in the active drawing" }
      const stored = found.row.data as { request?: { settings?: Record<string, unknown>; geometry?: unknown; printer?: unknown } } | null
      if (!stored?.request) return { ok: false, error: "Operation has no generation settings" }
      const settings = cam.generator.decodeSettings({ ...(stored.request.settings ?? {}), ...params })
      const request = { ...stored.request, settings }
      // The stored G-code no longer matches the settings: drop it so nothing exports a stale program.
      await Effect.runPromise(toolpaths.update(operationId, { data: { request }, gcode: null, operationType: settings.operationType }))
      return { ok: true, operationId, settings: { operationType: settings.operationType, toolDiameter: settings.toolDiameter, depth: settings.depth, stepdown: settings.stepdown, feedrate: settings.feedrate }, note: "Generate G-code again, then verify it." }
    },
    suggestParameters: async (drawingId, params) => {
      const { elements } = await load(drawingId)
      const settings = cam.generator.decodeSettings(params)
      const geometry = cam.generator.GeometrySchema.make({ geometryType: "selected", selectedElements: elements } as never)
      return cam.generator.suggestFor(settings, geometry as never)
    },
    generateGcode: async (drawingId, operationId) => {
      const found = await operation(drawingId, operationId)
      if ("error" in found) return { gcode: "", stats: { error: found.error } }
      const { response, error } = cam.generator.generateToolpath(found.request as never)
      if (error) return { gcode: "", stats: { error } }
      await Effect.runPromise(toolpaths.update(found.id, { data: { request: found.request, response }, gcode: response.gcode }))
      return { gcode: response.gcode, stats: response.stats }
    },
    verifyOperation: async (drawingId, operationId, options) => {
      const found = await operation(drawingId, operationId)
      if ("error" in found) return { ok: false, error: found.error }
      const { response, error } = cam.generator.generateToolpath(found.request as never)
      if (error) return { ok: false, error }
      const built = cam.verify.verifyRequestFor(found.request as never, response.gcode, {
        ...(options.tool !== undefined ? { tool: options.tool } : {}),
        ...(options.stock !== undefined ? { stock: options.stock } : {}),
        ...(options.fixtures !== undefined ? { fixtures: options.fixtures } : {}),
        ...(options.targetSolids !== undefined ? { target: { solids: options.targetSolids } } : {}),
        ...(options.resolution !== undefined ? { resolution: options.resolution } : {}),
        ...(options.tolerance !== undefined ? { tolerance: options.tolerance } : {})
      })
      if (!built.ok) return { ok: false, error: built.error }
      const report = cam.verify.verifyToolpath(built.request)
      // Keep the full report (with the height map) and the program it is about on the operation: the CAM page shows it.
      const row = await Effect.runPromise(toolpaths.find(user.id, found.id))
      const previous = row?.row.data !== null && typeof row?.row.data === "object" ? (row!.row.data as Record<string, unknown>) : {}
      await Effect.runPromise(toolpaths.update(found.id, { data: { ...previous, request: found.request, response, verification: { report, request: { stock: built.request.stock, tool: built.request.tool, fixtures: built.request.fixtures }, at: new Date().toISOString() } }, gcode: response.gcode }))
      // The height field is for the UI; the model gets the verdict, the numbers and where it went wrong.
      return {
        ok: report.ok, issues: report.issues.slice(0, 20), stats: report.stats,
        stock: built.request.stock, tool: built.request.tool,
        modelled: {
          holder: built.request.tool.holderDiameter !== undefined, shank: built.request.tool.cuttingLength !== undefined,
          fixtures: built.request.fixtures.length, target: built.request.target !== undefined
        },
        note: "A passing report covers only what is modelled; it is not a machine certification."
      }
    },
    remember: async (key, value) => { await Effect.runPromise(kv.set(`ai.memory.${key}`, value)); return { ok: true, key } },
    recall: async (prefix) => (await Effect.runPromise(kv.list(`ai.memory.${prefix ?? ""}`))).map((e) => ({ key: e.key.slice("ai.memory.".length), value: e.value })),
    lookupMaterial: async (query) => (await Effect.runPromise(materials.list(user.id, { search: query, includePublic: true }))).slice(0, 10).map((m) => ({ id: m.id, name: m.name })),
    lookupTool: async (query) => (await Effect.runPromise(tools.list(user.id, { search: query, includePublic: true }))).slice(0, 10).map((t) => ({ id: t.id, name: t.name, diameter: t.diameter, type: t.type }))
  }
  return handlers
})

export const ToolHandlersLive = Layer.effect(ToolHandlers, toolHandlers.pipe(Effect.map((h) => ToolHandlers.of(h))))

/** The embedded nikcli host (the primary path); skipped with `CADCAMFUN_AI_HOST=direct`. */
const AiHostLive = Layer.effect(AiHost, Effect.gen(function*() {
  const config = yield* AppConfigService
  const handlers = yield* ToolHandlers
  const credentials = yield* AiCredentials
  const runtime = yield* makeNikCliRuntime({
    dataDir: config.dataDir,
    providers: defaultProviderSpecs(),
    systemPrompt: systemPrompt(),
    // One request to models.dev, only while `<cache>/models.json` is missing: that file is
    // what turns "the four providers we declare" into the whole catalogue. Offline tests
    // set the flag and the seed answers "skipped" without touching the network.
    catalogue: { network: process.env.CADCAMFUN_AI_OFFLINE !== "1" },
    toolsFor: (projectId) => buildTools(handlers, projectId)
  })
  yield* credentials.attach({
    apply: (change) => change._tag === "set"
      ? runtime.setProviderKey(change.provider, Redacted.value(change.credential.key))
      : runtime.clearProviderKey(change.provider)
  })
  return AiHost.of({ runtime })
}))

const AiConfigLive = Layer.unwrap(AppConfigService.useSync((c) => AiConfig.layer({ dataDir: c.dataDir, forceGateway: false })))

/** Credentials, config, direct model and the service; needs the repos and `AppConfigService`. */
export const AiLive = Layer.unwrap(Effect.gen(function*() {
  const config = yield* AppConfigService
  const base = Layer.mergeAll(AiCredentials.layer, AiConfigLive)
  const withDirect = DirectModel.layerWith(config.aiModelFactory ?? defaultModelFactory).pipe(Layer.provideMerge(base))
  const withHandlers = ToolHandlersLive.pipe(Layer.provideMerge(withDirect))
  const withHost = config.aiHost === "direct" ? withHandlers : AiHostLive.pipe(Layer.provideMerge(withHandlers))
  return AiService.layer.pipe(Layer.provideMerge(withHost))
}))

export type { ProviderId }
