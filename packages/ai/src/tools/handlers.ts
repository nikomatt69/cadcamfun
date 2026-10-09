import { Context } from "effect"
import type { cad, cam } from "@cadcamfun/core"
import type { MachineProfile } from "../gcode-analysis.ts"

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
  /** Moves, turns and scales existing elements, or lays out `copies` copies of them (each copy is the transform applied once more). */
  transformEntities(projectId: string, input: { ids: ReadonlyArray<string>; transform: cad.ElementTransform; copies: number }): Promise<unknown>
  /** Gathers elements into one component, or opens components into their parts. */
  groupEntities(projectId: string, input: { ids: ReadonlyArray<string>; ungroup: boolean; name?: string; layer?: string }): Promise<unknown>
  describeDrawing(projectId: string): Promise<unknown>
  /** Design-space and model checks (`cad.checkModel`) of the open drawing. */
  checkDesign(projectId: string): Promise<unknown>
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
