import { Context, Schema } from "effect"
import { z } from "zod"
import type { HostToolSpec } from "../nikcli/runtime.ts"
import { analyzeGcode, type MachineProfile } from "../gcode-analysis.ts"
import { EntityChanges, EntityInput } from "../domain-schemas.ts"
import { cad, cam } from "@cadcamfun/core"

/** What `cam_verify_toolpath` adds to the operation's own settings and stock; validated before the handler runs. */
export interface VerifyToolOptions {
  readonly tool?: Partial<cam.verify.VerifyTool>
  readonly fixtures?: ReadonlyArray<typeof cam.verify.VerifyFixtureSchema.Type>
  readonly targetSolids?: ReadonlyArray<cad.Solid>
  readonly stock?: cam.verify.VerifyBounds
  readonly resolution?: number
  readonly tolerance?: number
}

/**
 * What the sidecar lends the model: every method works on the active project's data and
 * returns JSON-safe results (no secrets, no filesystem paths).
 */
export interface ToolHandlersShape {
  addEntities(projectId: string, entities: ReadonlyArray<unknown>): Promise<unknown>
  modifyEntities(projectId: string, changes: ReadonlyArray<{ id: string; changes: unknown }>): Promise<unknown>
  deleteEntities(projectId: string, ids: ReadonlyArray<string>): Promise<unknown>
  describeDrawing(projectId: string): Promise<unknown>
  createOperation(projectId: string, operation: { type: string; params: unknown }): Promise<unknown>
  generateGcode(projectId: string, operationId?: string): Promise<{ gcode: string; stats?: unknown }>
  listOperations(projectId: string): Promise<unknown>
  updateOperation(projectId: string, operationId: string, params: Record<string, unknown>): Promise<unknown>
  suggestParameters(projectId: string, params: Record<string, unknown>): Promise<unknown>
  /** Replays an operation's G-code against its stock: removal, collisions, gouges (`cam.verify`). */
  verifyOperation(projectId: string, operationId: string, options: VerifyToolOptions): Promise<unknown>
  lookupMaterial(query: string): Promise<unknown>
  lookupTool(query: string): Promise<unknown>
  machine?(projectId: string): Promise<MachineProfile | undefined>
  /** Persistent notes the assistant keeps between sessions (the `ai.memory.*` keys of the key-value store). */
  remember(key: string, value: string): Promise<unknown>
  recall(prefix?: string): Promise<unknown>
}

export class ToolHandlers extends Context.Service<ToolHandlers, ToolHandlersShape>()("cadcamfun/ToolHandlers") {}

/** The only tool ids the `cadcam` agent may call. */
export const TOOL_IDS = [
  "cad_add_entities", "cad_modify_entities", "cad_delete_entities", "cad_describe_drawing",
  "cam_create_operation", "cam_list_operations", "cam_update_operation", "cam_suggest_parameters", "cam_generate_gcode", "cam_analyze_gcode",
  "cam_verify_toolpath", "lib_lookup_material", "lib_lookup_tool", "memory_remember", "memory_recall"
] as const

const point = z.object({ x: z.number(), y: z.number() })
export const entityZod = z.discriminatedUnion("type", [
  z.object({ type: z.literal("line"), start: point, end: point, layer: z.string().min(1).optional() }),
  z.object({ type: z.literal("circle"), center: point, radius: z.number().positive(), layer: z.string().min(1).optional() }),
  z.object({ type: z.literal("arc"), center: point, radius: z.number().positive(), startAngle: z.number(), endAngle: z.number(), layer: z.string().min(1).optional() }),
  z.object({ type: z.literal("polyline"), points: z.array(point).min(2), closed: z.boolean().optional(), layer: z.string().min(1).optional() }),
  z.object({ type: z.literal("rectangle"), origin: point, width: z.number().positive(), height: z.number().positive(), layer: z.string().min(1).optional() })
])

/** Every handler re-validates with the Effect Schema, so zod and Effect cannot drift apart silently. */
const validated = <A>(schema: Schema.Decoder<A>, value: unknown): A => Schema.decodeUnknownSync(schema)(value)
const json = (value: unknown): string => JSON.stringify(value)

export const buildTools = (handlers: ToolHandlersShape, projectId: string): ReadonlyArray<HostToolSpec> => [
  {
    id: "cad_add_entities", description: "Append 2D entities (millimetres, radians) to the active drawing.",
    parameters: z.object({ entities: z.array(entityZod).min(1).max(500) }),
    execute: async (input) => {
      const { entities } = input as { entities: unknown[] }
      return json(await handlers.addEntities(projectId, entities.map((e) => validated(EntityInput, e))))
    }
  },
  {
    id: "cad_modify_entities", description: "Change fields of existing entities by id.",
    parameters: z.object({ changes: z.array(z.object({ id: z.string().min(1), changes: z.record(z.string(), z.unknown()) })).min(1) }),
    execute: async (input) => {
      const { changes } = input as { changes: Array<{ id: string; changes: unknown }> }
      return json(await handlers.modifyEntities(projectId, changes.map((c) => ({ id: c.id, changes: validated(EntityChanges, c.changes) }))))
    }
  },
  {
    id: "cad_delete_entities", description: "Delete entities by id. Requires confirm: true.",
    parameters: z.object({ ids: z.array(z.string().min(1)).min(1), confirm: z.boolean() }),
    execute: async (input) => {
      const { ids, confirm } = input as { ids: string[]; confirm: boolean }
      if (confirm !== true) return json({ ok: false, error: "Deleting needs confirm: true." })
      return json(await handlers.deleteEntities(projectId, ids))
    }
  },
  { id: "cad_describe_drawing", description: "Counts, bounds and layers of the active drawing.", parameters: z.object({}),
    execute: async () => json(await handlers.describeDrawing(projectId)) },
  {
    id: "cam_create_operation", description: "Add a CAM operation (profile, pocket, drill...) with its parameters.",
    parameters: z.object({ type: z.string().min(1), params: z.record(z.string(), z.unknown()).optional() }),
    execute: async (input) => {
      const operation = input as { type: string; params?: unknown }
      return json(await handlers.createOperation(projectId, { type: operation.type, params: operation.params ?? {} }))
    }
  },
  { id: "cam_list_operations", description: "List the CAM operations of the active drawing (id, type, tool, depth).", parameters: z.object({}),
    execute: async () => json(await handlers.listOperations(projectId)) },
  {
    id: "cam_update_operation", description: "Change parameters of an existing CAM operation (depth, stepdown, feedrate, toolDiameter...). Regenerate and verify afterwards.",
    parameters: z.object({ operationId: z.string().min(1), params: z.record(z.string(), z.unknown()) }),
    execute: async (input) => {
      const { operationId, params } = input as { operationId: string; params: Record<string, unknown> }
      return json(await handlers.updateOperation(projectId, operationId, params))
    }
  },
  {
    id: "cam_suggest_parameters", description: "Suggested depth, stepdown, cutting speed, chip load and warnings (depth over stock, small element) for the drawing and the given settings.",
    parameters: z.object({ params: z.record(z.string(), z.unknown()).optional() }),
    execute: async (input) => json(await handlers.suggestParameters(projectId, (input as { params?: Record<string, unknown> }).params ?? {}))
  },
  {
    id: "cam_generate_gcode", description: "Run the CAM pipeline and return statistics plus the first lines of G-code.",
    parameters: z.object({ operationId: z.string().optional(), maxLines: z.number().int().min(1).max(200).optional() }),
    execute: async (input) => {
      const { operationId, maxLines = 40 } = input as { operationId?: string; maxLines?: number }
      const result = await handlers.generateGcode(projectId, operationId)
      return json({ stats: result.stats, preview: result.gcode.split("\n").slice(0, maxLines).join("\n") })
    }
  },
  {
    id: "cam_analyze_gcode", description: "Static safety checks of G-code (travel limits, rapids below Z0, missing spindle/feed).",
    parameters: z.object({ gcode: z.string().min(1) }),
    execute: async (input) => json(analyzeGcode((input as { gcode: string }).gcode, await handlers.machine?.(projectId)))
  },
  {
    id: "cam_verify_toolpath",
    description: "Simulate an operation's G-code against its stock: material removal, rapids through material, shank/holder/fixture collisions, cutting below the stock and, with targetSolids, gouges. Run it before calling any toolpath safe. Describe the holder and fixtures when you know them: an unmodelled holder is not checked.",
    parameters: z.object({
      operationId: z.string().min(1),
      tool: z.object({
        cuttingLength: z.number().positive().optional(), shankDiameter: z.number().positive().optional(), stickout: z.number().positive().optional(),
        holderDiameter: z.number().positive().optional(), holderLength: z.number().positive().optional()
      }).optional(),
      fixtures: z.array(z.object({
        id: z.string().min(1),
        bounds: z.object({ minX: z.number(), maxX: z.number(), minY: z.number(), maxY: z.number(), minZ: z.number(), maxZ: z.number() })
      })).max(50).optional(),
      targetSolids: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
      stock: z.object({ minX: z.number(), maxX: z.number(), minY: z.number(), maxY: z.number(), minZ: z.number(), maxZ: z.number() }).optional(),
      resolution: z.number().positive().optional(), tolerance: z.number().min(0).optional()
    }),
    execute: async (input) => {
      const { operationId, tool, fixtures, targetSolids, stock, resolution, tolerance } = input as {
        operationId: string; tool?: Partial<cam.verify.VerifyTool>; fixtures?: unknown[]; targetSolids?: unknown[]
        stock?: cam.verify.VerifyBounds; resolution?: number; tolerance?: number
      }
      const options: VerifyToolOptions = {
        ...(tool !== undefined ? { tool } : {}),
        ...(fixtures !== undefined ? { fixtures: validated(Schema.Array(cam.verify.VerifyFixtureSchema), fixtures) } : {}),
        ...(targetSolids !== undefined ? { targetSolids: validated(Schema.Array(cad.SolidSchema), targetSolids) } : {}),
        ...(stock !== undefined ? { stock: validated(cam.verify.BoundsSchema, stock) } : {}),
        ...(resolution !== undefined ? { resolution } : {}),
        ...(tolerance !== undefined ? { tolerance } : {})
      }
      return json(await handlers.verifyOperation(projectId, operationId, options))
    }
  },
  { id: "lib_lookup_material", description: "Search the material library.", parameters: z.object({ query: z.string() }),
    execute: async (input) => json(await handlers.lookupMaterial((input as { query: string }).query)) },
  { id: "lib_lookup_tool", description: "Search the tool library.", parameters: z.object({ query: z.string() }),
    execute: async (input) => json(await handlers.lookupTool((input as { query: string }).query)) },
  {
    id: "memory_remember", description: "Save a short note (a preference, a fact about the part or the machine) that you will see again in later conversations.",
    parameters: z.object({ key: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/), value: z.string().min(1).max(2000) }),
    execute: async (input) => {
      const { key, value } = input as { key: string; value: string }
      return json(await handlers.remember(key, value))
    }
  },
  { id: "memory_recall", description: "List the notes saved with memory_remember, optionally only those whose key starts with a prefix.",
    parameters: z.object({ prefix: z.string().optional() }),
    execute: async (input) => json(await handlers.recall((input as { prefix?: string }).prefix)) }
]
