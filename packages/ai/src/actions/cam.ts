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

const cutterKind = z.enum(["flat", "ball", "bull", "chamfer", "spot", "drill", "facemill", "threadmill", "engraver"])
const cutClass = z.enum(["face", "slot", "rough-side", "adaptive", "finish-wall", "finish-floor", "finish-3d", "drill", "spot", "chamfer", "engrave", "thread-mill"])
export const cuttingDataParameters = z.object({
  material: z.string().min(1).max(80),
  cut: cutClass,
  tool: z.object({
    kind: cutterKind, diameter: z.number().positive().max(250), flutes: z.number().int().min(1).max(16),
    toolMaterial: z.enum(["hss", "hss-co", "carbide", "pcd"]).optional(),
    coating: z.enum(["none", "tin", "ticn", "altin", "alcrn", "zrn", "dlc", "diamond"]).optional(),
    cornerRadius: z.number().positive().optional(), angle: z.number().positive().max(179).optional(), pitch: z.number().positive().optional(),
    fluteLength: z.number().positive().optional(), stickout: z.number().positive().optional(), shankDiameter: z.number().positive().optional()
  }),
  machine: z.string().min(1).max(60).optional(),
  depth: z.number().positive().optional(), ae: z.number().positive().optional(), ap: z.number().positive().optional(), scallop: z.number().positive().optional()
})
export const manufactureParameters = z.object({
  material: z.string().min(1).max(80),
  machine: z.string().min(1).max(60).optional(),
  origin: z.enum(["stock-center", "stock-corner"]).optional(),
  finishAllowance: z.number().min(0).max(5).optional(),
  scallop: z.number().positive().max(1).optional(),
  planOnly: z.boolean().optional()
})
export type ManufactureInput = z.infer<typeof manufactureParameters>

/** The machine limits a cutting-data call respects: a named preset, else the project machine's spindle and feed, else a typical VMC. */
const limitsFor = async (name: string | undefined, context: ActionContext): Promise<cam.kernel.MachineLimits> => {
  const preset = name !== undefined ? cam.kernel.findMachine(name) : undefined
  if (preset !== undefined) return preset.limits
  const profile = await context.handlers.machine?.(context.projectId)
  const base = cam.kernel.DEFAULT_MACHINE.limits
  return { ...base, ...(profile?.maxSpindleSpeed ? { maxRpm: profile.maxSpindleSpeed } : {}), ...(profile?.maxFeedRate ? { maxFeed: profile.maxFeedRate } : {}) }
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
    id: "cam.materials", kind: "read",
    parameters: z.object({ query: z.string().max(80).optional() }),
    // Pure: the kernel's material table.
    run: async ({ query }) => {
      const found = query !== undefined && query.trim() !== "" ? cam.kernel.findMaterial(query) : undefined
      const rows = (found !== undefined ? [found] : cam.kernel.MATERIALS).map((m) => ({
        id: m.id, name: m.name, iso: m.iso, family: m.family, hardnessHB: m.hardnessHB, ...(m.hardnessHRC !== undefined ? { hardnessHRC: m.hardnessHRC } : {}),
        kc11: m.kc11, mc: m.mc, vcCarbide: m.vcCarbide, vcHss: m.vcHss ?? null, fz10: m.fz10, coolant: m.coolant, notes: m.notes
      }))
      return query !== undefined && found === undefined ? { ok: false, error: `No material matches '${query}'`, known: cam.kernel.MATERIALS.map((m) => m.id) } : { ok: true, materials: rows, machines: cam.kernel.MACHINES.map((m) => ({ id: m.id, name: m.name, post: m.post, limits: m.limits })) }
    }
  }),
  defineAction({
    id: "cam.cutting_data", kind: "read", parameters: cuttingDataParameters,
    run: async (input, context) => {
      const material = cam.kernel.findMaterial(input.material)
      if (material === undefined) return { ok: false, error: `Unknown material '${input.material}': use cam action materials` }
      const t = input.tool
      const cutter: cam.kernel.Cutter = {
        id: "query", name: `${t.kind} Ø${t.diameter}`, kind: t.kind, diameter: t.diameter, flutes: t.flutes, material: t.toolMaterial ?? "carbide",
        coating: t.coating ?? (material.iso === "N" ? "none" : "altin"), fluteLength: t.fluteLength ?? 3 * t.diameter,
        shankDiameter: t.shankDiameter ?? Math.max(3, t.diameter), stickout: t.stickout ?? Math.max(10, 4 * t.diameter + 10),
        ...(t.cornerRadius !== undefined ? { cornerRadius: t.cornerRadius } : {}), ...(t.angle !== undefined ? { angle: t.angle } : {}), ...(t.pitch !== undefined ? { pitch: t.pitch } : {})
      }
      const issues = cam.kernel.cutterIssues(cutter)
      if (issues.length > 0) return { ok: false, error: issues.join("; ") }
      const machine = await limitsFor(input.machine, context)
      const data = cam.kernel.cuttingData({
        material, cutter, cut: input.cut, machine,
        ...(input.depth !== undefined ? { depth: input.depth } : {}), ...(input.ae !== undefined ? { ae: input.ae } : {}),
        ...(input.ap !== undefined ? { ap: input.ap } : {}), ...(input.scallop !== undefined ? { scallop: input.scallop } : {})
      })
      return { ok: true, material: { id: material.id, name: material.name, iso: material.iso }, machine, cuttingData: data }
    }
  }),
  defineAction({
    id: "cam.manufacture", kind: "read", parameters: manufactureParameters,
    run: (input, { handlers, projectId }) => handlers.manufacture?.(projectId, input) ?? Promise.resolve({ ok: false, error: "The CAM kernel is unavailable in this host." })
  }),
  defineAction({
    id: "cam.chain_status", kind: "read", replaces: "cam_chain_status",
    parameters: z.object({ operationId: z.string().min(1) }),
    run: ({ operationId }, { handlers, projectId }) => handlers.chainStatus({ projectId, operationId })
  })
]
