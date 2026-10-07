import { Context, Schema } from "effect"
import { z } from "zod"
import type { HostToolSpec } from "../nikcli/runtime.ts"
import { analyzeGcode, type MachineProfile } from "../gcode-analysis.ts"
import { EntityChanges, EntityInput } from "../domain-schemas.ts"
import { ELEMENT_TYPES, normalizeElement } from "../element-catalog.ts"
import { toolPrompt } from "./prompts/index.ts"
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
  /** Elements in the editor's own shape (see `element-catalog.ts`); a number in `operands` is the index of an earlier element of the batch. */
  addElements(projectId: string, elements: ReadonlyArray<Record<string, unknown>>): Promise<unknown>
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
  "cad_add_entities", "cad_add_elements", "cad_modify_entities", "cad_delete_entities", "cad_describe_drawing",
  "cam_create_operation", "cam_list_operations", "cam_update_operation", "cam_suggest_parameters", "cam_generate_gcode", "cam_analyze_gcode",
  "cam_verify_toolpath", "lib_lookup_material", "lib_lookup_tool", "memory_remember", "memory_recall"
] as const

const point = z.object({ x: z.number(), y: z.number(), z: z.number().optional() })
const label = { layer: z.string().min(1).optional(), name: z.string().min(1).optional(), color: z.string().min(1).optional() }
export const entityZod = z.discriminatedUnion("type", [
  z.object({ type: z.literal("line"), start: point, end: point, ...label }),
  z.object({ type: z.literal("circle"), center: point, radius: z.number().positive(), ...label }),
  z.object({ type: z.literal("arc"), center: point, radius: z.number().positive(), startAngle: z.number(), endAngle: z.number(), ...label }),
  z.object({ type: z.literal("polyline"), points: z.array(point).min(2), closed: z.boolean().optional(), ...label }),
  z.object({ type: z.literal("rectangle"), origin: point, width: z.number().positive(), height: z.number().positive(), ...label })
])

/** Every handler re-validates with the Effect Schema, so zod and Effect cannot drift apart silently. */
const validated = <A>(schema: Schema.Decoder<A>, value: unknown): A => Schema.decodeUnknownSync(schema)(value)
const json = (value: unknown): string => JSON.stringify(value)

export const buildTools = (handlers: ToolHandlersShape, projectId: string): ReadonlyArray<HostToolSpec> => [
  {
    id: "cad_add_elements",
    description: toolPrompt("cad_add_elements"),
    parameters: z.object({ elements: z.array(z.looseObject({ type: z.enum(ELEMENT_TYPES as unknown as [string, ...string[]]) })).min(1).max(200) }),
    execute: async (input) => {
      const { elements } = input as { elements: Array<Record<string, unknown>> }
      const normalized: Array<Record<string, unknown>> = []
      const problems: string[] = []
      const warnings: string[] = []
      elements.forEach((element, index) => {
        const result = normalizeElement(element)
        if (!result.ok) problems.push(`elements[${index}]: ${result.error}`)
        else {
          normalized.push(result.element)
          if (result.warning !== undefined) warnings.push(`elements[${index}]: ${result.warning}`)
        }
      })
      if (problems.length > 0) return json({ ok: false, error: "Nothing was added.", problems })
      const stored = await handlers.addElements(projectId, normalized)
      return json(warnings.length > 0 && stored !== null && typeof stored === "object" ? { ...stored, warnings } : stored)
    }
  },
  {
    id: "cad_add_entities", description: toolPrompt("cad_add_entities"),
    parameters: z.object({ entities: z.array(entityZod).min(1).max(500) }),
    execute: async (input) => {
      const { entities } = input as { entities: unknown[] }
      return json(await handlers.addEntities(projectId, entities.map((e) => validated(EntityInput, e))))
    }
  },
  {
    id: "cad_modify_entities", description: toolPrompt("cad_modify_entities"),
    parameters: z.object({ changes: z.array(z.object({ id: z.string().min(1), changes: z.record(z.string(), z.unknown()) })).min(1) }),
    execute: async (input) => {
      const { changes } = input as { changes: Array<{ id: string; changes: unknown }> }
      return json(await handlers.modifyEntities(projectId, changes.map((c) => ({ id: c.id, changes: validated(EntityChanges, c.changes) }))))
    }
  },
  {
    id: "cad_delete_entities", description: toolPrompt("cad_delete_entities"),
    parameters: z.object({ ids: z.array(z.string().min(1)).min(1), confirm: z.boolean() }),
    execute: async (input) => {
      const { ids, confirm } = input as { ids: string[]; confirm: boolean }
      if (confirm !== true) return json({ ok: false, error: "Deleting needs confirm: true." })
      return json(await handlers.deleteEntities(projectId, ids))
    }
  },
  { id: "cad_describe_drawing", description: toolPrompt("cad_describe_drawing"), parameters: z.object({}),
    execute: async () => json(await handlers.describeDrawing(projectId)) },
  {
    id: "cam_create_operation", description: toolPrompt("cam_create_operation"),
    parameters: z.object({ type: z.string().min(1), params: z.record(z.string(), z.unknown()).optional() }),
    execute: async (input) => {
      const operation = input as { type: string; params?: unknown }
      return json(await handlers.createOperation(projectId, { type: operation.type, params: operation.params ?? {} }))
    }
  },
  { id: "cam_list_operations", description: toolPrompt("cam_list_operations"), parameters: z.object({}),
    execute: async () => json(await handlers.listOperations(projectId)) },
  {
    id: "cam_update_operation", description: toolPrompt("cam_update_operation"),
    parameters: z.object({ operationId: z.string().min(1), params: z.record(z.string(), z.unknown()) }),
    execute: async (input) => {
      const { operationId, params } = input as { operationId: string; params: Record<string, unknown> }
      return json(await handlers.updateOperation(projectId, operationId, params))
    }
  },
  {
    id: "cam_suggest_parameters", description: toolPrompt("cam_suggest_parameters"),
    parameters: z.object({ params: z.record(z.string(), z.unknown()).optional() }),
    execute: async (input) => json(await handlers.suggestParameters(projectId, (input as { params?: Record<string, unknown> }).params ?? {}))
  },
  {
    id: "cam_generate_gcode", description: toolPrompt("cam_generate_gcode"),
    parameters: z.object({ operationId: z.string().optional(), maxLines: z.number().int().min(1).max(200).optional() }),
    execute: async (input) => {
      const { operationId, maxLines = 40 } = input as { operationId?: string; maxLines?: number }
      const result = await handlers.generateGcode(projectId, operationId)
      return json({ stats: result.stats, preview: result.gcode.split("\n").slice(0, maxLines).join("\n") })
    }
  },
  {
    id: "cam_analyze_gcode", description: toolPrompt("cam_analyze_gcode"),
    parameters: z.object({ gcode: z.string().min(1) }),
    execute: async (input) => json(analyzeGcode((input as { gcode: string }).gcode, await handlers.machine?.(projectId)))
  },
  {
    id: "cam_verify_toolpath",
    description: toolPrompt("cam_verify_toolpath"),
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
  { id: "lib_lookup_material", description: toolPrompt("lib_lookup_material"), parameters: z.object({ query: z.string() }),
    execute: async (input) => json(await handlers.lookupMaterial((input as { query: string }).query)) },
  { id: "lib_lookup_tool", description: toolPrompt("lib_lookup_tool"), parameters: z.object({ query: z.string() }),
    execute: async (input) => json(await handlers.lookupTool((input as { query: string }).query)) },
  {
    id: "memory_remember", description: toolPrompt("memory_remember"),
    parameters: z.object({ key: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/), value: z.string().min(1).max(2000) }),
    execute: async (input) => {
      const { key, value } = input as { key: string; value: string }
      return json(await handlers.remember(key, value))
    }
  },
  { id: "memory_recall", description: toolPrompt("memory_recall"),
    parameters: z.object({ prefix: z.string().optional() }),
    execute: async (input) => json(await handlers.recall((input as { prefix?: string }).prefix)) }
]
