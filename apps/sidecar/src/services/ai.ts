import {
  AiConfig, AiCredentials, AiHost, AiService, DirectModel, defaultModelFactory, ToolHandlers, buildTools, defaultProviderSpecs,
  makeNikCliRuntime, systemPrompt, type ProviderId, type ToolHandlersShape
} from "@cadcamfun/ai"
import { baseEntity, emptyDrawing, type Drawing } from "@cadcamfun/core"
import { Effect, Layer, Redacted } from "effect"
import { AppConfigService } from "../config.ts"
import { DrawingRepo } from "../repos/drawing-repo.ts"
import { MaterialRepo } from "../repos/material-repo.ts"
import { ToolRepo } from "../repos/tool-repo.ts"
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
  const { user } = yield* LocalProfile
  const kv = yield* KvStore

  const load = async (projectId: string): Promise<{ id: string; drawing: Drawing }> => {
    const rows = await Effect.runPromise(drawings.listByProject(projectId))
    const row = rows[0]
    if (!row) {
      const created = await Effect.runPromise(drawings.create(projectId, { name: "Drawing", data: emptyDrawing(crypto.randomUUID(), "Drawing") }))
      return { id: created.id, drawing: emptyDrawing(created.id, "Drawing") }
    }
    const data = (row as { data?: unknown }).data
    const drawing = data && typeof data === "object" && "entities" in data ? (data as Drawing) : emptyDrawing(row.id, row.name)
    return { id: row.id, drawing }
  }
  const save = async (id: string, drawing: Drawing) => {
    await Effect.runPromise(drawings.update(id, { data: { ...drawing, version: drawing.version + 1 } }))
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
    createOperation: async () => ({ ok: false, error: "Operations are created from the CAM workspace in this version." }),
    generateGcode: async () => ({ gcode: "", stats: { note: "Use the CAM workspace to generate G-code." } }),
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
