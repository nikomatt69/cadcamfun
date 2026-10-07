import {
  AiConfig, AiCredentials, AiHost, AiService, DirectModel, defaultModelFactory, ToolHandlers, buildTools, defaultProviderSpecs,
  makeNikCliRuntime, systemPrompt, type ProviderId, type ToolHandlersShape
} from "@cadcamfun/ai"
import { baseEntity, cam, emptyDrawing, type Drawing } from "@cadcamfun/core"
import { Effect, Layer, Redacted } from "effect"
import { AppConfigService } from "../config.ts"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { MaterialRepo } from "../repos/material-repo.ts"
import { ToolRepo } from "../repos/tool-repo.ts"
import { ToolpathRepo } from "../repos/toolpath-repo.ts"
import { KvStore } from "./kv.ts"
import { LocalProfile } from "./local-profile.ts"

type Entity = Drawing["entities"][number]

/** Builds core entities from the model's plain tool input (ids are assigned here, never by the model). */
const toEntity = (input: Record<string, unknown>, layerId: string): Entity => {
  const base = baseEntity(crypto.randomUUID(), typeof input["layer"] === "string" ? input["layer"] : layerId)
  const p = (key: string) => input[key] as { x: number; y: number }
  switch (input["type"]) {
    case "line": return { ...base, _tag: "Line", start: p("start"), end: p("end") }
    case "circle": return { ...base, _tag: "Circle", center: p("center"), radius: input["radius"] as number }
    case "arc": return {
      ...base, _tag: "Arc", center: p("center"), radius: input["radius"] as number,
      startAngle: input["startAngle"] as number, endAngle: input["endAngle"] as number, clockwise: false
    }
    case "polyline": return { ...base, _tag: "Polyline", points: input["points"] as Array<{ x: number; y: number }>, closed: input["closed"] === true }
    default: {
      const o = p("origin"); const w = input["width"] as number; const h = input["height"] as number
      return { ...base, _tag: "Rectangle", corner1: o, corner2: { x: o.x + w, y: o.y + h } }
    }
  }
}

/** The tool handlers the model can call, over the active project's newest drawing and the libraries. */
const toolHandlers = Effect.gen(function*() {
  const drawings = yield* DrawingRepo
  const materials = yield* MaterialRepo
  const tools = yield* ToolRepo
  const toolpaths = yield* ToolpathRepo
  const { user } = yield* LocalProfile
  const kv = yield* KvStore

  const load = async (projectId: string): Promise<{ id: string; projectId: string; drawing: Drawing }> => {
    const rows = await Effect.runPromise(drawings.listByProject(projectId))
    const row = rows[0]
    if (!row) {
      throw new Error(`No drawing found for nikcli project ${projectId}`)
    }
    const data = (row as { data?: unknown }).data
    const drawing = data && typeof data === "object" && "entities" in data ? (data as Drawing) : emptyDrawing(row.id, row.name)
    return { id: row.id, projectId: (row as { projectId: string }).projectId, drawing }
  }
  const save = async (id: string, drawing: Drawing) => {
    await Effect.runPromise(drawings.update(id, { data: { ...drawing, version: drawing.version + 1 } }))
  }

  /** A stored operation of the active drawing with its request rebuilt over the drawing's current entities. */
  const operation = async (drawingId: string, operationId: string | undefined): Promise<{ id: string; request: Record<string, unknown> } | { error: string }> => {
    const { id, projectId, drawing } = await load(drawingId)
    if (!operationId) return { error: "operationId is required" }
    const found = await Effect.runPromise(toolpaths.find(user.id, operationId))
    if (!found || found.row.drawingId !== id || found.project.id !== projectId) return { error: "Operation not found in the active drawing" }
    const stored = found.row.data as { request?: { settings?: unknown; geometry?: unknown; printer?: unknown } } | null
    if (!stored?.request) return { error: "Operation has no generation settings" }
    const savedGeometry = stored.request.geometry !== null && typeof stored.request.geometry === "object" ? stored.request.geometry : {}
    return {
      id: operationId,
      request: { ...stored.request, geometry: { ...savedGeometry, selectedElements: drawing.entities.map((entity) => ({ ...entity, type: entity._tag })) } }
    }
  }

  const handlers: ToolHandlersShape = {
    addEntities: async (projectId, entities) => {
      const { id, drawing } = await load(projectId)
      const layerId = drawing.layers[0]?.id ?? "layer-0"
      const created = entities.map((e) => toEntity(e as Record<string, unknown>, layerId))
      await save(id, { ...drawing, entities: [...drawing.entities, ...created] })
      return { ok: true, ids: created.map((e) => e.id) }
    },
    modifyEntities: async (projectId, changes) => {
      const { id, drawing } = await load(projectId)
      const missing = changes.filter((c) => !drawing.entities.some((e) => e.id === c.id)).map((c) => c.id)
      if (missing.length > 0) return { ok: false, error: `Unknown entity ids: ${missing.join(", ")}` }
      const entities = drawing.entities.map((e) => {
        const change = changes.find((c) => c.id === e.id)
        return change ? ({ ...e, ...(change.changes as object) } as Entity) : e
      })
      await save(id, { ...drawing, entities })
      return { ok: true, modified: changes.length }
    },
    deleteEntities: async (projectId, ids) => {
      const { id, drawing } = await load(projectId)
      const entities = drawing.entities.filter((e) => !ids.includes(e.id))
      await save(id, { ...drawing, entities })
      return { ok: true, deleted: drawing.entities.length - entities.length }
    },
    describeDrawing: async (projectId) => {
      const { drawing } = await load(projectId)
      const counts: Record<string, number> = {}
      for (const e of drawing.entities) counts[e._tag] = (counts[e._tag] ?? 0) + 1
      return { name: drawing.name, units: drawing.units, layers: drawing.layers.map((l) => ({ id: l.id, name: l.name })), counts,
        entities: drawing.entities.slice(0, 200).map((e) => ({ id: e.id, type: e._tag, layerId: e.layerId })) }
    },
    createOperation: async (drawingId, operation) => {
      const { id, projectId, drawing } = await load(drawingId)
      const params = operation.params !== null && typeof operation.params === "object" ? operation.params : {}
      const settings = cam.generator.decodeSettings({ ...params, operationType: operation.type })
      const geometry = {
        geometryType: "selected" as const,
        selectedElements: drawing.entities.map((entity) => ({ ...entity, type: entity._tag }))
      }
      const request = { settings, geometry }
      const row = await Effect.runPromise(toolpaths.create(user.id, {
        name: `${operation.type} operation`, description: "Created by the nikcli CAD/CAM agent",
        data: { request }, projectId, drawingId: id, type: settings.machineType, operationType: settings.operationType
      }))
      return { ok: true, operationId: row.id, name: row.name, drawing: drawing.name }
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
      const { drawing } = await load(drawingId)
      const settings = cam.generator.decodeSettings(params)
      const geometry = cam.generator.GeometrySchema.make({
        geometryType: "selected",
        selectedElements: drawing.entities.map((entity) => ({ ...entity, type: entity._tag }))
      } as never)
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
