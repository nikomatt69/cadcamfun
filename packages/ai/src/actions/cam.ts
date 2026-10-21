/**
 * `cam` — reading the machining side of the project: the machine, the operations, the stock, the chain, static
 * analysis of a program and what the verifier says about geometry it can model.
 *
 * Verification replays the stored program and persists its bound report, so it is a write (`cam_edit.verify`),
 * not a read: a read-only specialist may inspect what a report already says, never persist a new report.
 */
import { cam } from "@cadcamfun/core"
import { CAM_ACTION_INPUTS, VisionInput as CAM_VISION_INPUT, CamSetupCandidate, CamMachiningPlan, CamManufactureInput } from "@cadcamfun/api"
import { analyzeGcode } from "../gcode-analysis.ts"
import { machineRun } from "../machine-run.ts"
import { vision } from "./cad.ts"
import { defineAction, defineWireAction, type ActionContext, type ActionSpec } from "./action.ts"

export type SetupCandidate = typeof CamSetupCandidate.Type
export type MachiningPlanInput = typeof CamMachiningPlan.Type
export type ManufactureInput = typeof CamManufactureInput.Type

/** The machine limits a cutting-data call respects: a named preset, else the project machine's spindle and feed, else a typical VMC. */
const limitsFor = async (name: string | undefined, context: ActionContext): Promise<cam.kernel.MachineLimits> => {
  const preset = name !== undefined ? cam.kernel.findMachine(name) : undefined
  if (preset !== undefined) return preset.limits
  const profile = await context.handlers.machine?.(context.projectId)
  const base = cam.kernel.DEFAULT_MACHINE.limits
  return { ...base, ...(profile?.maxSpindleSpeed ? { maxRpm: profile.maxSpindleSpeed } : {}), ...(profile?.maxFeedRate ? { maxFeed: profile.maxFeedRate } : {}) }
}

export const CAM_ACTIONS: ReadonlyArray<ActionSpec> = [
  defineWireAction({
    id: "cam.plan_check", kind: "read", parameters: CAM_ACTION_INPUTS["cam.plan_check"],
    run: (input, { handlers, projectId }) => handlers.validateMachiningPlan?.(projectId, input) ?? { ok: false, error: "Plan validation is unavailable in this host." }
  }),
  defineWireAction({
    id: "cam.review", kind: "read", parameters: CAM_ACTION_INPUTS["cam.review"],
    run: ({ operationId }, { handlers, projectId }) => handlers.reviewOperation?.(projectId, operationId) ?? { ok: false, error: "Saved review is unavailable in this host." }
  }),
  defineWireAction({
    id: "cam.machine", kind: "read", replaces: "cam_describe_machine",
    parameters: CAM_ACTION_INPUTS["cam.machine"],
    // The kinematics table; with a program, its run on the machine (an operation's program is read from the project).
    run: async ({ machineType: kind, gcode: text, operationId, params, at }, { handlers, projectId }) => {
      // How the CAM preview draws this machine (spec 31): the default set-up's triad, what turns and in which sense.
      const setup = cam.viewer.setupOf(kind, cam.generator.withMachineDefaults({ ...cam.generator.DEFAULT_SETTINGS, machineType: kind }), { width: 100, height: 100, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 })
      const { axes, rotary } = cam.viewer.displayAxes(setup)
      const table = {
        ...cam.kinematicsOf(kind), origins: cam.ORIGINS[kind],
        preview: {
          axes: axes.map((a) => ({ name: a.name, display: a.direction, positive: a.positive })),
          ...(rotary !== undefined ? { turns: rotary.turns } : {}),
          mapping: kind === "lathe" ? "spindle axis horizontal: display x = Z (chuck on the left), display z = X/2 (rear turret up, front turret down)" : "as programmed, Z up",
          rotation: kind === "3dprinter" ? cam.viewer.spinSenseText(kind, "cw") : { M3: cam.viewer.spinSenseText(kind, "cw"), M4: cam.viewer.spinSenseText(kind, "ccw") },
          workholding: kind === "mill"
            ? "vise (default, jaws along X), clamps, plate or none: params workholding, viseJawAxis, clampDepth, parallelsHeight, viseJawHeight, workholdingConfigured"
            : kind === "lathe" ? "3-jaw / 4-jaw chuck or collet: params chuckType, gripLength, latheTurret, stockBore, tailstock, workholdingConfigured" : "bed: params bedWidth, bedDepth, bedOrigin, buildHeight, printerKinematics"
        }
      }
      if (text === undefined && operationId === undefined) return table
      if (text !== undefined && operationId !== undefined) return { ok: false, error: "Send at most one of gcode or operationId." }
      let gcode = text ?? ""
      if (operationId !== undefined) {
        if (handlers.operationProgram === undefined) return { ok: false, error: "Stored programs are not available in this host: send the program text as gcode." }
        const program = await handlers.operationProgram(projectId, operationId)
        if (!program.ok) return program
        gcode = program.gcode
      }
      // The program on this machine: the same timeline, set-up and checks the preview draws.
      // A tool resource in params.tool (type, diameter, cuttingLength, cornerRadius, tipAngle, threadPitch, holder...) is drawn
      // and checked with the same 3D model the preview uses.
      const { tool, ...settingsParams } = (params ?? {}) as Record<string, unknown>
      return { ...table, run: machineRun({ kind, gcode, params: settingsParams, ...(tool !== undefined && typeof tool === "object" ? { tool: tool as never } : {}), ...(at !== undefined ? { at } : {}) }) }
    }
  }),
  defineWireAction({
    id: "cam.operations", kind: "read", replaces: "cam_list_operations",
    parameters: CAM_ACTION_INPUTS["cam.operations"],
    run: (_input, { handlers, projectId }) => handlers.listOperations(projectId)
  }),
  defineWireAction({
    id: "cam.suggest", kind: "read", replaces: "cam_suggest_parameters",
    parameters: CAM_ACTION_INPUTS["cam.suggest"],
    run: ({ params }, { handlers, projectId }) => handlers.suggestParameters(projectId, params ?? {})
  }),
  defineWireAction({
    id: "cam.compare_setups", kind: "read", replaces: "cam_suggest_parameters",
    parameters: CAM_ACTION_INPUTS["cam.compare_setups"],
    run: ({ candidates }, { handlers, projectId }) =>
      handlers.compareSetups?.(projectId, candidates) ?? Promise.resolve({ ok: false, error: "Setup comparisons are not available in this runtime." })
  }),
  defineWireAction({
    id: "cam.analyze", kind: "read", replaces: "cam_analyze_gcode",
    // The program text, or the operation whose stored program is read: `cam_edit.generate` answers with a preview only, so the
    // whole program the machine would run is reachable only by its operation.
    parameters: CAM_ACTION_INPUTS["cam.analyze"],
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
      // Without a machine type, say which machine the words point at (the preview uses the same reading).
      if (kind === undefined) { const inferred = cam.inferMachineKind(gcode); return inferred === undefined ? report : { ...report, inferredMachine: inferred } }
      // The checks of the line scanner plus the ones that follow from the machine's own axes and what rotates.
      const axes = cam.checkAxes(gcode, kind).map((issue) => ({ severity: issue.severity, code: issue.code, line: issue.line, message: issue.message }))
      return { ...report, machineType: kind, issues: [...report.issues, ...axes] }
    }
  }),
  defineWireAction({
    id: "cam.stock", kind: "read", replaces: "cam_stock",
    parameters: CAM_ACTION_INPUTS["cam.stock"],
    run: (_input, { handlers, projectId }) =>
      handlers.stock === undefined
        ? Promise.resolve({ ok: false, error: "Stock management is unavailable in this host." })
        : handlers.stock(projectId, { action: "inspect" })
  }),
  defineWireAction({
    id: "cam.vision", kind: "read", replaces: "cam_vision",
    parameters: CAM_VISION_INPUT,
    run: vision("cam", "cam-viewport.png")
  }),
  defineWireAction({
    id: "cam.chain_suggest", kind: "read", replaces: "cam_operations_suggest_chain",
    parameters: CAM_ACTION_INPUTS["cam.chain_suggest"],
    run: ({ fromOperationId, materialHint, toolHint }, { handlers, projectId }) =>
      handlers.suggestChain({ projectId, ...(fromOperationId !== undefined ? { fromOperationId } : {}), ...(materialHint !== undefined ? { materialHint } : {}), ...(toolHint !== undefined ? { toolHint } : {}) })
  }),
  defineWireAction({
    id: "cam.materials", kind: "read",
    parameters: CAM_ACTION_INPUTS["cam.materials"],
    // Pure: the kernel's material table.
    run: async ({ query }) => {
      const found = query !== undefined && query.trim() !== "" ? cam.kernel.findMaterial(query) : undefined
      const rows = (found !== undefined ? [found] : cam.kernel.MATERIALS).map((m) => ({
        id: m.id, name: m.name, iso: m.iso, family: m.family, hardnessHB: m.hardnessHB, ...(m.hardnessHRC !== undefined ? { hardnessHRC: m.hardnessHRC } : {}),
        kc11: m.kc11, mc: m.mc, vcCarbide: m.vcCarbide, vcHss: m.vcHss ?? null, fz10: m.fz10, coolant: m.coolant, notes: m.notes
      }))
      return query !== undefined && found === undefined ? { ok: false, error: `No material matches '${query}'`, known: cam.kernel.MATERIALS.map((m) => m.id) } : { ok: true, materials: rows, machines: cam.kernel.MACHINES.map((m) => ({ id: m.id, name: m.name, post: m.post, limits: m.limits, ...(m.fiveAxis !== undefined ? { fiveAxis: m.fiveAxis } : {}) })) }
    }
  }),
  defineWireAction({
    id: "cam.cutting_data", kind: "read", parameters: CAM_ACTION_INPUTS["cam.cutting_data"],
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
  defineWireAction({
    id: "cam.manufacture", kind: "read", parameters: CAM_ACTION_INPUTS["cam.manufacture"],
    run: (input, { handlers, projectId, signal }) => handlers.manufacture?.(projectId, input, signal) ?? Promise.resolve({ ok: false, error: "The CAM kernel is unavailable in this host." })
  }),
  defineWireAction({
    id: "cam.chain_status", kind: "read", replaces: "cam_chain_status",
    parameters: CAM_ACTION_INPUTS["cam.chain_status"],
    run: ({ operationId }, { handlers, projectId }) => handlers.chainStatus({ projectId, operationId })
  })
]
