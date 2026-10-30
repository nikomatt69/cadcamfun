/**
 * Programs of a setup (spec 14 §3): each operation goes through the existing generator, its IR moves become one toolpath of a
 * single `Program`, and the program is emitted once by the post. The post already writes the tool change (`G80 M5 M9 T<n> M6
 * G43 H<n> M3 S...`) between toolpaths; nothing here concatenates text.
 */
import { analyseGcode } from "../generator/analysis.ts"
import { decodeGenerateRequest, generateToolpath, type GeometryInput, type GcodeStats } from "../generator/index.ts"
import { makeProgram, type Move, type Program, type Toolpath } from "../ir.ts"
import { getPost } from "../post/index.ts"
import type { Operation } from "./op.ts"
import { groupsOf, planPrograms, type SetupPlan } from "./plan.ts"
import { validateSetup, type Setup, type SetupIssue } from "./setup.ts"
import { assignPockets, type ToolTableEntry } from "./tooltable.ts"

export interface GeneratedProgram {
  readonly name: string
  readonly programNumber: number
  readonly gcode: string
  readonly program: Program
  readonly stats: GcodeStats
  readonly warnings: ReadonlyArray<string>
  readonly operationIds: ReadonlyArray<string>
  readonly toolNumbers: ReadonlyArray<number>
}

export interface GeneratedSetup {
  readonly programs: ReadonlyArray<GeneratedProgram>
  readonly toolTable: ReadonlyArray<ToolTableEntry>
  readonly totals: {
    readonly programs: number
    readonly toolLoads: number
    readonly toolChanges: number
    readonly cutLength: number
    readonly rapidLength: number
    readonly estimatedSeconds: number
  }
  readonly warnings: ReadonlyArray<string>
  /** Problems found before generating; a setup with an error-level problem generates nothing for the operations it names. */
  readonly issues: ReadonlyArray<SetupIssue>
}

const round = (value: number): number => Math.round(value * 1000) / 1000

export const generateSetup = (setup: Setup, geometryOf: (operation: Operation) => GeometryInput): GeneratedSetup => {
  const plan: SetupPlan = planPrograms(setup)
  const issues = validateSetup(setup)
  const warnings: string[] = [...plan.warnings]
  const blocked = new Set(issues.flatMap((i) => (i.operationId !== undefined ? [i.operationId] : [])))
  const post = getPost(setup.post.postId)
  if (post === undefined) return { programs: [], toolTable: plan.toolTable, totals: { programs: 0, toolLoads: 0, toolChanges: 0, cutLength: 0, rapidLength: 0, estimatedSeconds: 0 }, warnings: [`The post ${setup.post.postId} is not implemented`], issues }
  const ordered = setup.operations.filter((op) => op.enabled)
  const pockets = assignPockets(ordered)
  const programs: GeneratedProgram[] = []
  groupsOf(setup).forEach((group, index) => {
    const planned = plan.programs[index]!
    const programWarnings: string[] = []
    const toolpaths: Toolpath[] = []
    const used: Operation[] = []
    for (const op of group.operations) {
      if (blocked.has(op.id)) { programWarnings.push(`${op.name} is skipped: ${issues.filter((i) => i.operationId === op.id).map((i) => i.message).join("; ")}`); continue }
      const pocket = pockets.get(op.id)!
      // A rest pass that continues the operation before it cut with that operation's tool.
      const before = ordered[ordered.indexOf(op) - 1]
      const settings = {
        ...op.params,
        toolDiameter: op.tool.diameter, flutes: op.tool.flutes, toolNumber: pocket, workOffset: setup.workOffset,
        ...(op.fromPreviousStock && op.params.useRestMachining && before !== undefined ? { restToolDiameter: before.tool.diameter } : {})
      }
      const outcome = generateToolpath(decodeGenerateRequest({ settings, geometry: geometryOf(op), evidence: false, ...(setup.post.stamp !== undefined ? { stamp: setup.post.stamp } : {}) }))
      if (outcome.error !== undefined) { programWarnings.push(`${op.name} produced nothing: ${outcome.error}`); continue }
      programWarnings.push(...outcome.response.warnings.map((w) => `${op.name}: ${w}`))
      const moves: Move[] = outcome.response.program.toolpaths.flatMap((t) => t.moves)
      toolpaths.push({ id: op.id, name: op.name, toolId: op.tool.id, spindleRpm: Math.min(op.params.rpm, op.tool.maxRpm), coolant: op.params.coolant ? "flood" : "off", moves, operation: { id: op.id, name: op.name } })
      used.push(op)
    }
    const program = makeProgram(planned.name, toolpaths, {
      workOffset: setup.workOffset,
      metadata: { programNumber: String(planned.programNumber), ...(setup.stock !== undefined ? { material: setup.stock.material } : {}) }
    })
    const toolNumbers: Record<string, number> = {}
    for (const op of used) toolNumbers[op.tool.id] = pockets.get(op.id)!
    const gcode = post.emit(program, {
      decimals: setup.post.decimals, useCannedCycles: setup.post.useCannedCycles, arcMode: setup.post.arcMode, header: setup.post.header, tolerance: setup.post.tolerance,
      toolNumbers, retractBeforeToolChange: setup.retractBeforeToolChange,
      ...(setup.post.lineNumbers !== undefined ? { lineNumbers: setup.post.lineNumbers } : {}),
      ...(setup.post.stamp !== undefined ? { stamp: setup.post.stamp } : {})
    })
    programs.push({
      name: planned.name, programNumber: planned.programNumber, gcode, program, stats: analyseGcode(gcode, planned.name).stats,
      warnings: programWarnings, operationIds: used.map((op) => op.id), toolNumbers: planned.toolNumbers
    })
    warnings.push(...programWarnings)
  })
  return {
    programs, toolTable: plan.toolTable, issues, warnings,
    totals: {
      programs: programs.length, toolLoads: plan.toolLoads, toolChanges: plan.toolChanges,
      cutLength: round(programs.reduce((s, p) => s + p.stats.cutLength, 0)), rapidLength: round(programs.reduce((s, p) => s + p.stats.rapidLength, 0)),
      estimatedSeconds: Math.round(programs.reduce((s, p) => s + p.stats.estimatedSeconds, 0))
    }
  }
}
