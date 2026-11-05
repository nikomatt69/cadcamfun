/**
 * Programs of a setup (spec 14 §3): each operation goes through the existing generator, its IR moves become one toolpath of a
 * single `Program`, and the program is emitted once by the post. The post already writes the tool change (`G80 M5 M9 T<n> M6
 * G43 H<n> M3 S...`) between toolpaths; nothing here concatenates text.
 */
import { analyseGcode } from "../generator/analysis.ts"
import { DEFAULT_GEOMETRY, decodeGenerateRequest, generateToolpath, type GenerateOutcome, type GeometryInput, type GcodeStats } from "../generator/index.ts"
import { makeProgram, type Move, type Program, type Toolpath } from "../ir.ts"
import { getPost } from "../post/index.ts"
import type { Operation } from "./op.ts"
import { groupsOf, planPrograms, type SetupPlan } from "./plan.ts"
import { runsOf, validateSetup, workpieceIssues, workpiecesOf, type Setup, type SetupIssue, type WorkpieceOrder } from "./setup.ts"
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

/** What a tool change costs the cycle, seconds: a typical automatic changer. Indicative, never calibrated to a machine. */
const TOOL_CHANGE_SECONDS = 6
const toolChangesOf = (toolpaths: ReadonlyArray<Toolpath>): number => toolpaths.reduce((n, tp, i) => (i > 0 && toolpaths[i - 1]!.toolId !== tp.toolId ? n + 1 : n), 0)

const round = (value: number): number => Math.round(value * 1000) / 1000

/**
 * The geometry of an operation from the elements the caller resolved (`elements` by id): the operation's element ids in order, as
 * the "selected" geometry of the generator. An id with no element is an error the caller must show, so it throws with the ids.
 */
export const geometryFor = (operation: Operation, elements: Readonly<Record<string, Readonly<Record<string, unknown>>>>, stock?: GeometryInput["stock"]): GeometryInput => {
  const missing = operation.elementIds.filter((id) => elements[id] === undefined)
  if (missing.length > 0) throw new RangeError(`${operation.name}: no element for ${missing.join(", ")}`)
  return { ...DEFAULT_GEOMETRY, geometryType: "selected", selectedElements: operation.elementIds.map((id) => elements[id]!), ...(stock !== undefined ? { stock } : {}) }
}

export const generateSetup = (setup: Setup, geometryOf: (operation: Operation) => GeometryInput): GeneratedSetup => {
  const plan: SetupPlan = planPrograms(setup)
  const issues = validateSetup(setup)
  const warnings: string[] = [...plan.warnings]
  const blocked = new Set(issues.flatMap((i) => (i.operationId !== undefined ? [i.operationId] : [])))
  const post = getPost(setup.post.postId)
  if (post === undefined) return { programs: [], toolTable: plan.toolTable, totals: { programs: 0, toolLoads: 0, toolChanges: 0, cutLength: 0, rapidLength: 0, estimatedSeconds: 0 }, warnings: [`The post ${setup.post.postId} is not implemented`], issues }
  // Two workpieces on one register, or an operation on a workpiece that is not there, would cut the wrong part: nothing is generated.
  if (workpieceIssues(setup).length > 0) return { programs: [], toolTable: plan.toolTable, totals: { programs: 0, toolLoads: 0, toolChanges: 0, cutLength: 0, rapidLength: 0, estimatedSeconds: 0 }, warnings: [...warnings, "The fixture is inconsistent: no program was generated"], issues }
  const ordered = setup.operations.filter((op) => op.enabled)
  const pockets = assignPockets(ordered)
  const programs: GeneratedProgram[] = []
  groupsOf(setup).forEach((group, index) => {
    const planned = plan.programs[index]!
    const programWarnings: string[] = []
    // An operation is generated once: its moves are the same on every workpiece, only the work offset differs.
    const outcomes = new Map<string, Toolpath | undefined>()
    const toolpathOf = (op: Operation): Toolpath | undefined => {
      if (outcomes.has(op.id)) return outcomes.get(op.id)
      outcomes.set(op.id, undefined)
      if (blocked.has(op.id)) { programWarnings.push(`${op.name} is skipped: ${issues.filter((i) => i.operationId === op.id).map((i) => i.message).join("; ")}`); return undefined }
      const pocket = pockets.get(op.id)!
      // A rest pass that continues the operation before it cut with that operation's tool.
      const before = ordered[ordered.indexOf(op) - 1]
      const settings = {
        ...op.params,
        toolDiameter: op.tool.diameter, flutes: op.tool.flutes, toolNumber: pocket, workOffset: setup.workOffset,
        ...(op.fromPreviousStock && op.params.useRestMachining && before !== undefined ? { restToolDiameter: before.tool.diameter } : {})
      }
      // One operation that cannot be generated (an element that is gone, settings the generator refuses, a fault inside it) fails alone:
      // the operations that work still make their toolpaths, and the failure is reported by name.
      const outcome = ((): GenerateOutcome | { readonly error: string; readonly response?: undefined } => {
        try {
          return generateToolpath(decodeGenerateRequest({ settings, geometry: geometryOf(op), evidence: false, ...(setup.post.stamp !== undefined ? { stamp: setup.post.stamp } : {}) }))
        } catch (cause) {
          return { error: cause instanceof Error ? cause.message : String(cause) }
        }
      })()
      if (outcome.error !== undefined || outcome.response === undefined) { programWarnings.push(`${op.name} produced nothing: ${outcome.error ?? "no result"}`); return undefined }
      programWarnings.push(...outcome.response.warnings.map((w) => `${op.name}: ${w}`))
      const moves: Move[] = outcome.response.program.toolpaths.flatMap((t) => t.moves)
      const made: Toolpath = { id: op.id, name: op.name, toolId: op.tool.id, spindleRpm: Math.min(op.params.rpm, op.tool.maxRpm), coolant: op.params.coolant ? "flood" : "off", moves, operation: { id: op.id, name: op.name } }
      outcomes.set(op.id, made)
      return made
    }
    // The program of one order of the runs. The comparison below builds the other order from the same cached toolpaths.
    const build = (order: WorkpieceOrder) => {
      const toolpaths: Toolpath[] = []
      const used: Operation[] = []
      for (const { operation: op, workpiece, multi } of runsOf({ ...setup, workpieceOrder: order }, group.operations)) {
        const made = toolpathOf(op)
        if (made === undefined) continue
        if (!used.includes(op)) used.push(op)
        toolpaths.push(multi
          ? { ...made, id: `${op.id}@${workpiece.id}`, name: `${op.name} - ${workpiece.name}`, workOffset: workpiece.workOffset, ...(workpiece.workOffsetRef !== undefined ? { workOffsetRef: workpiece.workOffsetRef } : {}), operation: { id: `${op.id}@${workpiece.id}`, name: `${op.name} - ${workpiece.name}` } }
          : made)
      }
      const fixture = workpiecesOf(setup)
      const program = makeProgram(planned.name, toolpaths, {
        workOffset: toolpaths[0]?.workOffset ?? setup.workOffset,
        ...(toolpaths[0]?.workOffsetRef !== undefined ? { workOffsetRef: toolpaths[0].workOffsetRef } : {}),
        metadata: {
          programNumber: String(planned.programNumber), ...(setup.stock !== undefined ? { material: setup.stock.material } : {}),
          ...(fixture.length > 1 ? { workpieces: fixture.map((wp) => `${wp.name}=${wp.workOffset}`).join(", ") } : {})
        }
      })
      const toolNumbers: Record<string, number> = {}
      for (const op of used) toolNumbers[op.tool.id] = pockets.get(op.id)!
      const gcode = post.emit(program, {
        decimals: setup.post.decimals, useCannedCycles: setup.post.useCannedCycles, arcMode: setup.post.arcMode, header: setup.post.header, tolerance: setup.post.tolerance,
        toolNumbers, retractBeforeToolChange: setup.retractBeforeToolChange,
        ...(setup.post.lineNumbers !== undefined ? { lineNumbers: setup.post.lineNumbers } : {}),
        ...(setup.post.stamp !== undefined ? { stamp: setup.post.stamp } : {})
      })
      const stats = analyseGcode(gcode, planned.name).stats
      return { toolpaths, used, program, gcode, stats, seconds: stats.estimatedSeconds + toolChangesOf(toolpaths) * TOOL_CHANGE_SECONDS }
    }
    const order: WorkpieceOrder = setup.workpieceOrder ?? "toolFirst"
    const { used, program, gcode, stats, seconds } = build(order)
    if (workpiecesOf(setup).length > 1 && used.length > 0) {
      const otherOrder: WorkpieceOrder = order === "toolFirst" ? "partFirst" : "toolFirst"
      const other = build(otherOrder)
      if (Math.abs(other.seconds - seconds) >= 1) {
        const faster = other.seconds < seconds ? otherOrder : order
        programWarnings.push(`${faster === "toolFirst" ? "Tool first" : "Part first"} runs about ${Math.round(Math.abs(other.seconds - seconds))} s faster than ${faster === "toolFirst" ? "part first" : "tool first"} (${TOOL_CHANGE_SECONDS} s per tool change, indicative, uncalibrated)`)
      }
    }
    programs.push({
      name: planned.name, programNumber: planned.programNumber, gcode, program, stats,
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
