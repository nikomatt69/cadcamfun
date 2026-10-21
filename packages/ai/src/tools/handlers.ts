import type { SetupCandidate, MachiningPlanInput, ManufactureInput } from "../actions/cam.ts"
import type { CadAssemblyInput, CadDistanceInput, CadExactInput, CadGrepInput, CadShellInput } from "../actions/cad.ts"
import type { CadComponentRelationsInput, CadInspectionInput } from "../actions/cad.ts"
import type { ParametricHandlerInput } from "../actions/parametric.ts"
export type { ParametricHandlerInput } from "../actions/parametric.ts"
import type { WebSearchInput } from "../web-search.ts"
import type { VisionCapture } from "../vision.ts"
import { Context } from "effect"
import type { cad, cam } from "@cadcamfun/core"
import type { MachineProfile } from "../gcode-analysis.ts"
import type { ActionConflict, ActionCommitted, ActionDenied, ActionInvalidInput, ActionInterrupted } from "@cadcamfun/api"
import type { CamManufactureOperationInput } from "@cadcamfun/api"

/** What the stock handlers answer with: the raw piece as it is stored, or the one just configured. */
export type CamStockInput = { action: "inspect" } | { action: "set"; stock: typeof cam.generator.StockSchema.Type }

/** What `cam_verify_toolpath` adds to the operation's own settings and stock; validated before the handler runs. */
export interface VerifyToolOptions {
  readonly tool?: Partial<cam.verify.VerifyTool>
  readonly fixtures?: ReadonlyArray<typeof cam.verify.VerifyFixtureSchema.Type>
  readonly targetSolids?: ReadonlyArray<cad.Solid>
  readonly stock?: cam.verify.VerifyBounds
  readonly resolution?: number
  readonly tolerance?: number
  readonly start?: { readonly x: number; readonly y: number; readonly z: number }
}

/**
 * What the sidecar lends the model: every method works on the active project's data and
 * returns JSON-safe results (no secrets, no filesystem paths).
 */
export interface ToolHandlersShape {
  validateMachiningPlan?(projectId: string, input: MachiningPlanInput): Promise<unknown>
  /** Runs the CAM kernel on the active drawing: plan from the CAD, cutting data per material, NC and its replay evidence. */
  manufacture?(projectId: string, input: ManufactureInput, signal?: AbortSignal): Promise<unknown>
  /** Stores the native kernel's original multi-tool NC and artifact in the active drawing after write admission. */
  manufactureOperation?(projectId: string, input: typeof CamManufactureOperationInput.Type, signal?: AbortSignal): Promise<unknown>
  reviewOperation?(projectId: string, operationId: string): Promise<unknown>
  compareSetups?(projectId: string, candidates: ReadonlyArray<SetupCandidate>): Promise<unknown>
  stock?(projectId: string, input: CamStockInput): Promise<unknown>
  cadInspect?(projectId: string, input: CadInspectionInput): Promise<unknown>
  cadComponentRelations?(projectId: string, input: CadComponentRelationsInput): Promise<unknown>
  /** The exact B-rep kernel over the open drawing: per solid validity, mass properties, holes and how the CAM planner will machine it. */
  cadExact?(projectId: string, input: CadExactInput): Promise<unknown>
  /** Exact interference, bill of materials, joints and the fasteners still missing of the open drawing. */
  cadAssembly?(projectId: string, input: CadAssemblyInput): Promise<unknown>
  /** What hollowing one solid would give (exact shell, volumes, open faces by name); nothing in the drawing changes. */
  cadShell?(projectId: string, input: CadShellInput): Promise<unknown>
  /** The exact smallest gap between two solids, with the closest points. */
  cadDistance?(projectId: string, input: CadDistanceInput): Promise<unknown>
  webSearch?(input: WebSearchInput, signal?: AbortSignal): Promise<unknown>
  vision?(projectId: string, mode: "cad" | "cam", focus?: string, signal?: AbortSignal): Promise<{ ok: false; error: string } | { ok: true; capture: VisionCapture; evidence: unknown }>
  parametric?(projectId: string, input: ParametricHandlerInput): Promise<unknown>
  addEntities(projectId: string, entities: ReadonlyArray<unknown>): Promise<unknown>
  /** Substring search over the drawing that returns each parametric hit's parameters with its revision. */
  grep(projectId: string, input: CadGrepInput): Promise<unknown>
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
  createOperation(projectId: string, operation: { type: string; params: unknown; expectedRevision?: string }): Promise<unknown>
  generateGcode(projectId: string, operationId?: string): Promise<
    { gcode: string; stats?: unknown } | typeof ActionCommitted.Type | ActionConflict | ActionDenied | ActionInvalidInput | ActionInterrupted
  >
  /** The program last generated for an operation, as it is stored (nothing is regenerated); an error when there is none yet. */
  operationProgram?(projectId: string, operationId: string): Promise<{ ok: true; operationId: string; gcode: string } | { ok: false; error: string }>
  listOperations(projectId: string): Promise<unknown>
  updateOperation(projectId: string, operationId: string, params: Record<string, unknown>, expectedRevision?: string): Promise<unknown>
  suggestParameters(projectId: string, params: Record<string, unknown>): Promise<unknown>
  /** Replays an operation's G-code against its stock: removal, collisions, gouges (`cam.verify`). */
  verifyOperation(projectId: string, operationId: string, options: VerifyToolOptions): Promise<unknown>
  lookupMaterial(query: string): Promise<unknown>
  lookupTool(query: string): Promise<unknown>
  /** Saved reusable components across the user's accessible projects. */
  lookupComponent(query: string): Promise<unknown>
  /** The user's saved machine configurations (kinematics, post, work offsets, ceilings), searched like the other libraries. */
  lookupMachineConfig(query: string): Promise<unknown>
  /** Removes one library row by id (`confirm: true` is enforced by the tool schema, not here). */
  deleteLibrary(input: { kind: "material" | "tool" | "machine_config" | "library_item"; id: string }): Promise<unknown>
  machine?(projectId: string): Promise<MachineProfile | undefined>
  /** Persistent notes the assistant keeps between sessions (the `ai.memory.*` keys of the key-value store). */
  remember(key: string, value: string): Promise<unknown>
  recall(prefix?: string): Promise<unknown>
  /** The project's standing AI context (`ai.projectcontext.<projectId>`): the CAD/CAM answer to `AGENTS.md`. */
  projectContext(projectId: string): Promise<unknown>
  /** Replaces that document; returns what the store actually kept, never what the caller intended to write. */
  saveProjectContext(projectId: string, text: string): Promise<unknown>
  /** Components that are instantiated in the active CAD drawing. */
  listComponents(projectId: string): Promise<unknown>
  saveComponent(projectId: string, ids: ReadonlyArray<string>, name: string, metadata?: { readonly description?: string; readonly type?: string; readonly isPublic?: boolean }): Promise<unknown>
  insertComponent(projectId: string, componentId: string, transform?: cad.ElementTransform): Promise<unknown>
  deleteComponent(componentId: string): Promise<unknown>
  /** Library writes: create or replace a material, tool or machine config, and set a project's defaults. */
  upsertMaterial(input: Record<string, unknown>): Promise<unknown>
  upsertTool(input: Record<string, unknown>): Promise<unknown>
  upsertMachineConfig(input: Record<string, unknown>): Promise<unknown>
  upsertLibraryItem(input: Record<string, unknown>): Promise<unknown>
  setCost(input: Record<string, unknown>): Promise<unknown>
  setProjectDefault(input: { projectId?: string; materialId?: string; toolId?: string; machineConfigId?: string }): Promise<unknown>
  /** Next recommended operation from the current chain state, and one operation's chain state. */
  suggestChain(input: { projectId: string; fromOperationId?: string; materialHint?: string; toolHint?: string }): Promise<unknown>
  chainStatus(input: { projectId: string; operationId: string }): Promise<unknown>
}

export class ToolHandlers extends Context.Service<ToolHandlers, ToolHandlersShape>()("cadcamfun/ToolHandlers") {}
