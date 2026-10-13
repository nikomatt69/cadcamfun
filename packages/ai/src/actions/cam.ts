/**
 * `cam` — reading the machining side of the project: the machine, the operations, the stock, the chain, static
 * analysis of a program and what the verifier says about geometry it can model.
 *
 * Verification persists the regenerated program and the report on the operation, so it is a write (`cam_edit.verify`),
 * not a read: a read-only specialist may inspect what a report already says, never regenerate and store NC.
 */
import { z } from "zod"
import { cam } from "@cadcamfun/core"
import { analyzeGcode } from "../gcode-analysis.ts"
import { visionInputSchema } from "../vision.ts"
import { ToolMediaResult } from "../tools/define.ts"
import { defineAction, type ActionContext, type ActionSpec } from "./action.ts"

const machineType = z.enum(["mill", "lathe", "3dprinter"])

export const setupCandidateParameters = z.object({
  name: z.string().min(1).max(100), params: z.record(z.string(), z.unknown()),
  toolId: z.string().min(1).optional(), materialId: z.string().min(1).optional()
})
export type SetupCandidate = z.infer<typeof setupCandidateParameters>

export const machiningPlanSchema = z.object({
  operations: z.array(z.object({ type: z.string().min(1), params: z.record(z.string(), z.unknown()) })).min(1).max(8),
  expectedRevision: z.string().min(1).max(100).optional()
})
export type MachiningPlanInput = z.infer<typeof machiningPlanSchema>

const vision = async (input: z.infer<typeof visionInputSchema>, context: ActionContext) => {
  if (context.handlers.vision === undefined) return { ok: false, error: "Viewport capture is unavailable in this host." }
  const result = await context.handlers.vision(context.projectId, "cam", input.focus, context.signal)
  if (!result.ok) return result
  return new ToolMediaResult(result.evidence, [{ type: "file", mime: result.capture.mime, filename: "cam-viewport.png", url: `data:${result.capture.mime};base64,${result.capture.data}` }])
}

export const CAM_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineAction({
    id: "cam.plan_check", kind: "read", parameters: machiningPlanSchema,
    run: (input, { handlers, projectId }) => handlers.validateMachiningPlan?.(projectId, input) ?? { ok: false, error: "Plan validation is unavailable in this host." }
  }),
  defineAction({
    id: "cam.review", kind: "read", parameters: z.object({ operationId: z.string().min(1) }),
    run: ({ operationId }, { handlers, projectId }) => handlers.reviewOperation?.(projectId, operationId) ?? { ok: false, error: "Saved review is unavailable in this host." }
  }),
  defineAction({
    id: "cam.machine", kind: "read", replaces: "cam_describe_machine",
    parameters: z.object({ machineType }),
    // Pure: reads the kinematics table, needs no project data.
    run: async ({ machineType: kind }) => ({ ...cam.kinematicsOf(kind), origins: cam.ORIGINS[kind] })
  }),
  defineAction({
    id: "cam.operations", kind: "read", replaces: "cam_list_operations",
    parameters: z.object({}),
    run: (_input, { handlers, projectId }) => handlers.listOperations(projectId)
  }),
  defineAction({
    id: "cam.suggest", kind: "read", replaces: "cam_suggest_parameters",
    parameters: z.object({ params: z.record(z.string(), z.unknown()).optional() }),
    run: ({ params }, { handlers, projectId }) => handlers.suggestParameters(projectId, params ?? {})
  }),
  defineAction({
    id: "cam.compare_setups", kind: "read", replaces: "cam_suggest_parameters",
    parameters: z.object({ candidates: z.array(setupCandidateParameters).min(1).max(4) }),
    run: ({ candidates }, { handlers, projectId }) =>
      handlers.compareSetups?.(projectId, candidates) ?? Promise.resolve({ ok: false, error: "Setup comparisons are not available in this runtime." })
  }),
  defineAction({
    id: "cam.analyze", kind: "read", replaces: "cam_analyze_gcode",
    // The program text, or the operation whose stored program is read: `cam_edit.generate` answers with a preview only, so the
    // whole program the machine would run is reachable only by its operation.
    parameters: z.object({ gcode: z.string().min(1).optional(), operationId: z.string().min(1).optional(), machineType: machineType.optional() }),
    run: async ({ gcode: text, operationId, machineType: kind }, { handlers, projectId }) => {
      if ((text === undefined) === (operationId === undefined)) return { ok: false, error: "Send exactly one of gcode (a program text) or operationId (an operation whose program was generated)." }
      let gcode = text ?? ""
      if (operationId !== undefined) {
        if (handlers.operationProgram === undefined) return { ok: false, error: "Stored programs are not available in this host: send the program text as gcode." }
        const program = await handlers.operationProgram(projectId, operationId)
        if (!program.ok) return program
        gcode = program.gcode
      }
      const report = analyzeGcode(gcode, await handlers.machine?.(projectId))
      if (kind === undefined) return report
      // The checks of the line scanner plus the ones that follow from the machine's own axes and what rotates.
      const axes = cam.checkAxes(gcode, kind).map((issue) => ({ severity: issue.severity, code: issue.code, line: issue.line, message: issue.message }))
      return { ...report, machineType: kind, issues: [...report.issues, ...axes] }
    }
  }),
  defineAction({
    id: "cam.stock", kind: "read", replaces: "cam_stock",
    parameters: z.object({}),
    run: (_input, { handlers, projectId }) =>
      handlers.stock === undefined
        ? Promise.resolve({ ok: false, error: "Stock management is unavailable in this host." })
        : handlers.stock(projectId, { action: "inspect" })
  }),
  defineAction({
    id: "cam.vision", kind: "read", replaces: "cam_vision",
    parameters: visionInputSchema,
    run: vision
  }),
  defineAction({
    id: "cam.chain_suggest", kind: "read", replaces: "cam_operations_suggest_chain",
    parameters: z.object({ fromOperationId: z.string().optional(), materialHint: z.string().optional(), toolHint: z.string().optional() }),
    run: ({ fromOperationId, materialHint, toolHint }, { handlers, projectId }) =>
      handlers.suggestChain({ projectId, ...(fromOperationId !== undefined ? { fromOperationId } : {}), ...(materialHint !== undefined ? { materialHint } : {}), ...(toolHint !== undefined ? { toolHint } : {}) })
  }),
  defineAction({
    id: "cam.chain_status", kind: "read", replaces: "cam_chain_status",
    parameters: z.object({ operationId: z.string().min(1) }),
    run: ({ operationId }, { handlers, projectId }) => handlers.chainStatus({ projectId, operationId })
  })
]
