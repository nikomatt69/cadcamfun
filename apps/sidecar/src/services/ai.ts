import {
  AiBackground, AiConfig, AiCredentials, jsonFileCredentials, AiHost, AiService, BackgroundTaskManager, DirectModel, defaultModelFactory,
  ToolHandlers, backgroundToolSpecs, buildTools, defaultProviderSpecs, makeAiBackgroundLayer,
  makeNikCliRuntime, systemPrompt, type ProviderId, type ToolHandlersShape
} from "@cadcamfun/ai"
import { DESIGN_SPACE, cam, checkModel } from "@cadcamfun/core"
import { Effect, Layer, Redacted, Schema } from "effect"
import { AppConfigService } from "../config.ts"
import { announced } from "../startup.ts"
import { ActingUser } from "./acting-user.ts"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { MaterialRepo } from "../repos/material-repo.ts"
import { ProjectRepo } from "../repos/project-repo.ts"
import { ToolRepo } from "../repos/tool-repo.ts"
import { ToolpathRepo } from "../repos/toolpath-repo.ts"
import { KvStore } from "./kv.ts"
import { normalizeElement, withDefaultTolerance } from "@cadcamfun/ai"
import { groupElements, transformElements } from "./ai-transform.ts"
import { applyChanges, describeElements, elementsOf, newElements, type Element } from "./ai-elements.ts"
import { LocalProfile } from "./local-profile.ts"
import { ProjectVcs } from "./project-vcs.ts"
import { WorkflowRunner } from "./workflow-runner.ts"
import { vcsToolSpecs } from "./ai-vcs-tools.ts"
import { ProjectRepo as ProjectsForVcs } from "../repos/project-repo.ts"

/** The bounding box of an element in drawing coordinates, or undefined when it cannot be worked out. */
const elementBounds = (element: Record<string, unknown>) => {
  try {
    const b = cam.generator.elementBounds(element as never)
    return Number.isFinite(b.min.x) && Number.isFinite(b.max.z) ? { min: b.min, max: b.max } : undefined
  } catch { return undefined }
}

/** The tool handlers the model can call, over the active project's newest drawing and the libraries. */
const toolHandlers = Effect.gen(function*() {
  const drawings = yield* DrawingRepo
  const materials = yield* MaterialRepo
  const tools = yield* ToolRepo
  const projects = yield* ProjectRepo
  const toolpaths = yield* ToolpathRepo
  const { user: local } = yield* LocalProfile
  const kv = yield* KvStore
  const actingCell = yield* ActingUser
  /** The account of the chat turn that called a tool (the local profile until one has). */
  const acting = () => actingCell.get(local)

  /**
   * The drawing the assistant works on. `projectId` is what the UI last opened (or "default"); when it names no
   * project, or a project without a drawing, the assistant gets one instead of an error: the user's newest
   * project (a new "Untitled project" if there is none) and its newest drawing (a new empty "Drawing 1").
   */
  const load = async (projectId: string): Promise<{ id: string; projectId: string; data: Record<string, unknown>; elements: Element[]; created: boolean }> => {
    let project: { id: string } | undefined = (await Effect.runPromise(projects.find(acting().id, projectId)))?.project
    let created = false
    if (!project) {
      const own = (await Effect.runPromise(projects.list(acting().id))).find((candidate) => candidate.ownerId === acting().id)
      project = own ?? await Effect.runPromise(projects.create(acting().id, { name: "Untitled project" }))
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
    const found = await Effect.runPromise(toolpaths.find(acting().id, operationId))
    if (!found || found.row.drawingId !== id || found.project.id !== projectId) return { error: "Operation not found in the active drawing" }
    const stored = found.row.data as { request?: { settings?: unknown; geometry?: unknown; printer?: unknown } } | null
    if (!stored?.request) return { error: "Operation has no generation settings" }
    const savedGeometry = stored.request.geometry !== null && typeof stored.request.geometry === "object" ? stored.request.geometry : {}
    return { id: operationId, request: { ...stored.request, geometry: { ...savedGeometry, selectedElements: elements } } }
  }

  /** The 3D-printer choices (infill, supports, walls) are stored beside the settings, not in them. */
  const PRINTER_KEYS: ReadonlyArray<string> = ["infillDensity", "infillPattern", "supportType", "shellCount", "printResolution", "printOrientation"]
  const splitPrinter = (params: Record<string, unknown>): { readonly printer: Record<string, unknown>; readonly rest: Record<string, unknown> } => {
    const printer: Record<string, unknown> = {}
    const rest: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(params)) (PRINTER_KEYS.includes(key) ? printer : rest)[key] = value
    return { printer, rest }
  }
  const decodePrinter = (input: Record<string, unknown>) => Schema.decodeUnknownSync(cam.generator.PrinterExtrasSchema)(input)

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
      const refused: string[] = []
      const elements = loaded.elements.map((e) => {
        const change = changes.find((c) => c.id === e.id)
        if (!change) return e
        const next = applyChanges(e, change.changes as Record<string, unknown>)
        // The element must still be one the editor can draw: right field types, a history that still builds a solid. An element
        // that was not valid to begin with (made by hand in the editor) is not judged.
        if (normalizeElement(e).ok) {
          const after = normalizeElement(next)
          if (!after.ok) { refused.push(`${e.id}: ${after.error}`); return e }
        }
        updated.push(next)
        return next
      })
      if (refused.length > 0) return { ok: false, error: `Nothing changed. ${refused.join("; ")}`, ...where(loaded) }
      await save(loaded.id, loaded.data, elements)
      return { ok: true, modified: updated.length, elements: updated, ...where(loaded) }
    },
    deleteEntities: async (projectId, ids) => {
      const loaded = await load(projectId)
      const elements = loaded.elements.filter((e) => !ids.includes(e.id))
      await save(loaded.id, loaded.data, elements)
      return { ok: true, deleted: loaded.elements.length - elements.length, ids: loaded.elements.filter((e) => ids.includes(e.id)).map((e) => e.id), ...where(loaded) }
    },
    transformEntities: async (projectId, input) => {
      const loaded = await load(projectId)
      const result = transformElements(loaded.elements, input, () => crypto.randomUUID())
      if (!result.ok) return { ok: false, error: result.error, ...where(loaded) }
      const elements = result.copied
        ? [...loaded.elements, ...result.elements]
        : loaded.elements.map((e) => result.elements.find((next) => next.id === e.id) ?? e)
      await save(loaded.id, loaded.data, elements)
      return { ok: true, mode: result.copied ? "copied" : "transformed", copied: result.copied, ids: result.elements.map((e) => e.id), elements: result.elements, ...where(loaded) }
    },
    groupEntities: async (projectId, input) => {
      const loaded = await load(projectId)
      const result = groupElements(loaded.elements, input, () => crypto.randomUUID())
      if (!result.ok) return { ok: false, error: result.error, ...where(loaded) }
      const elements = [...loaded.elements.filter((e) => !result.removed.includes(e.id)), ...result.added]
      await save(loaded.id, loaded.data, elements)
      return { ok: true, removed: result.removed, ids: result.added.map((e) => e.id), elements: result.added, ...where(loaded) }
    },
    describeDrawing: async (projectId) => {
      const loaded = await load(projectId)
      return { ...describeElements(loaded.elements, 200, elementBounds), settings: loaded.data["settings"] ?? null, ...where(loaded) }
    },
    checkDesign: async (projectId) => {
      const loaded = await load(projectId)
      const settings = (loaded.data["settings"] ?? {}) as { tolerance?: unknown; units?: unknown }
      const tolerance = typeof settings.tolerance === "number" ? settings.tolerance : undefined
      const issues = checkModel(loaded.elements, { ...(tolerance !== undefined ? { tolerance } : {}), boundsOf: elementBounds })
      const described = describeElements(loaded.elements, 0, elementBounds)
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
      const split = splitPrinter(params as Record<string, unknown>)
      const settings = cam.generator.decodeSettings({ ...split.rest, operationType: operation.type })
      const printer = decodePrinter(split.printer)
      // A lathe works from its stock size and a probe from the machine, so only drawing-based operations need elements.
      const needsElements = settings.machineType !== "lathe" && settings.operationType !== "probing"
      if (needsElements && elements.length === 0) return { ok: false, error: "The drawing has no elements yet: add shapes with cad_add_elements first." }
      const geometry = {
        geometryType: "selected" as const,
        selectedElements: elements
      }
      const request = { settings, geometry, printer }
      const row = await Effect.runPromise(toolpaths.create(acting().id, {
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
      const found = await Effect.runPromise(toolpaths.find(acting().id, operationId))
      if (!found || found.row.drawingId !== id || found.project.id !== projectId) return { ok: false, error: "Operation not found in the active drawing" }
      const stored = found.row.data as { request?: { settings?: Record<string, unknown>; geometry?: unknown; printer?: unknown } } | null
      if (!stored?.request) return { ok: false, error: "Operation has no generation settings" }
      const split = splitPrinter(params)
      const settings = cam.generator.decodeSettings({ ...(stored.request.settings ?? {}), ...split.rest })
      const printer = decodePrinter({ ...(stored.request.printer !== null && typeof stored.request.printer === "object" ? stored.request.printer as Record<string, unknown> : {}), ...split.printer })
      const request = { ...stored.request, settings, printer }
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
      const row = await Effect.runPromise(toolpaths.find(acting().id, found.id))
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
    lookupMaterial: async (query) => (await Effect.runPromise(materials.list(acting().id, { search: query, includePublic: true }))).slice(0, 10).map((m) => ({ id: m.id, name: m.name })),
    lookupTool: async (query) => (await Effect.runPromise(tools.list(acting().id, { search: query, includePublic: true }))).slice(0, 10).map((t) => ({ id: t.id, name: t.name, diameter: t.diameter, type: t.type }))
  }
  return handlers
})

export const ToolHandlersLive = Layer.effect(ToolHandlers, toolHandlers.pipe(Effect.map((h) => ToolHandlers.of(h))))

/** The embedded nikcli host (the primary path); skipped with `CADCAMFUN_AI_HOST=direct`. */
const AiHostLive = Layer.effect(AiHost, Effect.gen(function*() {
  const config = yield* AppConfigService
  const handlers = yield* ToolHandlers
  const credentials = yield* AiCredentials
  const vcs = yield* ProjectVcs
  const runner = yield* WorkflowRunner
  const projectsRepo = yield* ProjectsForVcs
  const { user: local } = yield* LocalProfile
  const actingCell = yield* ActingUser
  // Read when a tool runs, so the version-control tools act as the account that is chatting.
  const actor = {
    get userId() { return actingCell.get(local).id },
    get name() { return actingCell.get(local).name ?? "User" },
    get email() { return actingCell.get(local).email ?? "unknown@cadcamfun.local" }
  }
  // Runtime-wide scheduler: instantiated before the host so `toolsFor` can
  // hand its four `agent_task*` tool specs to every project's host. The same
  // instance is passed to `AiBackgroundLive` below so the worker runner owns
  // it (no second scheduler, no second scheduler across projects).
  const scheduler = new BackgroundTaskManager({})
  const runtime = yield* makeNikCliRuntime({
    dataDir: config.dataDir,
    providers: defaultProviderSpecs(config.aiMinimaxBaseUrl ? { minimax: config.aiMinimaxBaseUrl } : {}),
    systemPrompt: systemPrompt(),
    // Import the (large) host bundle once the sidecar has announced itself, not while the API is still starting.
    warmAfter: announced,
    // One request to models.dev, only while `<cache>/models.json` is missing: that file is
    // what turns "the four providers we declare" into the whole catalogue. Offline tests
    // set the flag and the seed answers "skipped" without touching the network.
    catalogue: { network: process.env.CADCAMFUN_AI_OFFLINE !== "1" },
    toolsFor: (projectId) => [
      ...buildTools(handlers, projectId),
      ...vcsToolSpecs({ vcs, runner, projects: projectsRepo, actor }),
      ...backgroundToolSpecs(scheduler)
    ]
  })
  yield* credentials.attach({
    apply: (change) => change._tag === "set"
      ? runtime.setProviderKey(change.provider, Redacted.value(change.credential.key))
      : runtime.clearProviderKey(change.provider)
  })
  return AiHost.of({ runtime, scheduler })
}))

const AiBackgroundLive = Layer.unwrap(Effect.gen(function*() {
  const host = yield* AiHost
  return makeAiBackgroundLayer.pipe(Layer.provide(Layer.succeed(AiHost, host)))
})).pipe(Layer.provide(AiHostLive), Layer.orDie)

const AiConfigLive = Layer.unwrap(AppConfigService.useSync((c) => AiConfig.layer({ dataDir: c.dataDir, forceGateway: false })))

/** Credentials, config, direct model and the service; needs the repos and `AppConfigService`. */
export const AiLive = Layer.unwrap(Effect.gen(function*() {
  const config = yield* AppConfigService
  // Keys are kept in <data dir>/ai/credentials.json (owner-only), so they are not asked for again after a restart.
  const base = Layer.mergeAll(ActingUser.layer, AiCredentials.layerPersisted(jsonFileCredentials(`${config.dataDir}/ai/credentials.json`)), AiConfigLive)
  const withDirect = DirectModel.layerWith(config.aiModelFactory ?? defaultModelFactory).pipe(Layer.provideMerge(base))
  const withHandlers = ToolHandlersLive.pipe(Layer.provideMerge(withDirect))
  const withHost = config.aiHost === "direct" ? withHandlers : AiHostLive.pipe(Layer.provideMerge(withHandlers))
  // Build the background runner from the live host once the host is in scope,
  // so the worker's `runner` always closes over the same scheduler the host
  // advertised. Without the host (the `direct` path) we provide a stub that
  // simply refuses to enqueue — the four `agent_task*` tools won't be wired.
  const withBackground = config.aiHost === "direct"
    ? withHost
    : AiBackgroundLive.pipe(Layer.provideMerge(withHost))
  return AiService.layer.pipe(Layer.provideMerge(withBackground))
}))

export type { ProviderId }
