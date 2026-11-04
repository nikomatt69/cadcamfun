/**
 * The `process` evidence of a kernel job (spec 61, spec 69 G0/G0b/G0c/G2): what feed optimisation did per operation, the cycle time with
 * the machine's dynamics, the tool life used per tool and the indicative stability of each tool. Requested with `ManufacturingJob.process`;
 * a job without it is byte-identical to before. Every figure is labelled `uncalibrated`.
 */
import type { Program } from "../ir.ts"
import type { OperationOutcome } from "./contracts.ts"
import type { Cutter } from "./cutters.ts"
import { DYNAMICS_PRESETS, dynamicCycleTime, type CycleTimeResult, type MachineDynamics } from "./cycle-time.ts"
import type { FeedMode, FeedReport } from "./feed-optimise.ts"
import type { WorkpieceMaterial } from "./materials.ts"
import { estimateStability, planToolLife, taylorFor, type StabilityResult, type ToolLifeEntry, type ToolUse } from "./process.ts"

export interface ProcessRequest {
  /** Per-move feed optimisation on the carried stock (3-axis moves only): `chip` holds the chip thickness, `power` the spindle power. Default `off`. */
  readonly feedOptimisation?: FeedMode
  /** Machine dynamics for the cycle-time model: a class preset, with any figure overridden. Default preset `standard`. */
  readonly dynamics?: { readonly preset?: "economy" | "standard" | "high-speed"; readonly acceleration?: number; readonly jerk?: number; readonly lookAhead?: number }
  /** Taylor constants per tool id (V in m/min for T = 1 min, and the exponent); default: the bundled table, uncalibrated. */
  readonly taylor?: Readonly<Record<string, { readonly n: number; readonly c: number }>>
  /** Share of the life a tool may use before a change is planned (default 0.8). */
  readonly lifeLimit?: number
}

export interface FeedOperationReport {
  readonly operation: string
  readonly report: FeedReport
}

export interface ProcessReport {
  readonly feedOptimisation: { readonly mode: FeedMode; readonly operations: ReadonlyArray<FeedOperationReport> }
  /** The program's cut and rapid motion under the machine dynamics, plus the tool changes. */
  readonly cycleTime: CycleTimeResult & { readonly withToolChangesSeconds: number }
  readonly toolLife: ReadonlyArray<ToolLifeEntry & { readonly toolId: string }>
  readonly stability: ReadonlyArray<{ readonly toolId: string; readonly result: StabilityResult }>
  /** Always false: no calibration record is applied by the kernel. */
  readonly calibrated: false
  readonly label: string
}

export interface ProcessReportInput {
  readonly request: ProcessRequest
  readonly program: Program
  readonly operations: ReadonlyArray<OperationOutcome>
  readonly tools: ReadonlyArray<Cutter & { readonly number: number }>
  readonly material: WorkpieceMaterial
  readonly rapidFeed: number
  readonly toolChangeSeconds: number
  readonly feedReports: ReadonlyArray<FeedOperationReport>
}

export const buildProcessReport = (input: ProcessReportInput): ProcessReport => {
  const { request, material } = input
  const preset = DYNAMICS_PRESETS[request.dynamics?.preset ?? "standard"]
  const dynamics: MachineDynamics = {
    acceleration: request.dynamics?.acceleration ?? preset.acceleration,
    jerk: request.dynamics?.jerk ?? preset.jerk,
    lookAhead: request.dynamics?.lookAhead ?? preset.lookAhead,
    rapidFeed: input.rapidFeed
  }
  const cycle = dynamicCycleTime(input.program, dynamics)
  const cutterOf = new Map(input.tools.map((t) => [t.id, t]))
  const uses: ToolUse[] = []
  for (const op of input.operations) {
    const tool = cutterOf.get(op.toolId)
    if (tool === undefined || op.cutting === undefined || op.timeSeconds <= 0) continue
    uses.push({ operation: op.id, tool: tool.number, vc: op.cutting.vc, minutes: op.timeSeconds / 60 })
  }
  const taylorOf = (number: number): ReturnType<typeof taylorFor> => {
    const tool = input.tools.find((t) => t.number === number)!
    return taylorFor(tool.material, material.iso, request.taylor?.[tool.id])
  }
  const toolLife = planToolLife(uses, taylorOf, request.lifeLimit).map((e) => ({ ...e, toolId: input.tools.find((t) => t.number === e.tool)!.id }))
  // Cutting stiffness at a typical chip thickness of 0.05 mm (Kienzle kc = kc11 h^-mc), radial immersion factor 0.5.
  const ks = material.kc11 * Math.pow(0.05, -material.mc)
  const stability = input.tools.map((t) => ({ toolId: t.id, result: estimateStability(t, ks, { directional: 0.5 }) }))
  return {
    feedOptimisation: { mode: request.feedOptimisation ?? "off", operations: input.feedReports },
    cycleTime: { ...cycle, withToolChangesSeconds: cycle.seconds + input.tools.length * input.toolChangeSeconds },
    toolLife,
    stability,
    calibrated: false,
    label: "uncalibrated: handbook starting values, estimated tool dynamics; no calibration record applies"
  }
}
