/**
 * Programs of a setup (spec 14 §3): each operation goes through the existing generator, its IR moves become one toolpath of a
 * single `Program`, and the program is emitted once by the post. The post already writes the tool change (`G80 M5 M9 T<n> M6
 * G43 H<n> M3 S...`) between toolpaths; nothing here concatenates text.
 */
import { analyseGcode } from "../generator/analysis.ts"
import { DEFAULT_GEOMETRY, decodeGenerateRequest, generateToolpath, type GenerateOutcome, type GeometryInput, type GcodeStats } from "../generator/index.ts"
import { arcExtrema, estimateTime, expandMoves, makeProgram, type Move, type Program, type Toolpath } from "../ir.ts"
import { consumeLife, emptyLifeBook, pickSister, type ToolLifeBook } from "../kernel/tool-library.ts"
import { formatOffsetRef } from "../work-offset.ts"
import { getPost } from "../post/index.ts"
import type { Tool } from "../tool.ts"
import type { Vec3 } from "../../cad/vec.ts"
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
  /** The pocket of every tool the program calls (a sister tool has its own), by tool id. */
  readonly pockets: Readonly<Record<string, number>>
  /** The tools the program calls, each once. */
  readonly tools: ReadonlyArray<Tool>
}

/** What one tool cut over the setup, against the life it was given. */
export interface ToolLifeEntry {
  readonly toolId: string
  readonly name: string
  readonly pocket: number
  /** Cutting minutes the setup spends with the tool (programmed feeds, no acceleration). */
  readonly minutes: number
  readonly lifeMinutes?: number
  /** The primary tool this one replaced once its life was spent. */
  readonly sisterOf?: string
}

export interface GeneratedSetup {
  readonly programs: ReadonlyArray<GeneratedProgram>
  readonly toolTable: ReadonlyArray<ToolTableEntry>
  /** Cutting minutes per tool, against its life, with the sister tools that took over. Empty when no tool has a life and none was swapped. */
  readonly toolLife: ReadonlyArray<ToolLifeEntry>
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

/**
 * Toolpaths that reach the workholding: every move (arcs by their box, cycles expanded) of every run, moved to the fixture's frame by
 * the workpiece's placement, against each clamp box grown by the tool's radius sideways and by its stick-out upwards from the tip.
 * Reported once per operation, workpiece and clamp; an advisory, since the boxes are as exact as the operator made them.
 */
const fixtureReach = (setup: Setup, operations: ReadonlyArray<Operation>, toolpathOf: (op: Operation) => Toolpath | undefined): ReadonlyArray<string> => {
  const fixtures = setup.fixtures ?? []
  if (fixtures.length === 0) return []
  const out: string[] = []
  for (const { operation: op, workpiece } of runsOf(setup, operations)) {
    const made = toolpathOf(op)
    if (made === undefined) continue
    const at = workpiece.placement ?? { x: 0, y: 0, z: 0 }
    const r = op.tool.diameter / 2, up = op.tool.stickout ?? Math.max(10, 4 * op.tool.diameter + 10)
    const points: Array<{ readonly a: Vec3; readonly b: Vec3 }> = []
    let from = { x: 0, y: 0, z: 0 }
    for (const move of expandMoves(made.moves, from)) {
      const to = (move as { readonly to?: Vec3 }).to
      if (to === undefined) continue
      if (move._tag === "Arc") {
        const box = [from, to, ...arcExtrema(move, from)]
        const lo = { x: Math.min(...box.map((p) => p.x)), y: Math.min(...box.map((p) => p.y)), z: Math.min(...box.map((p) => p.z)) }
        const hi = { x: Math.max(...box.map((p) => p.x)), y: Math.max(...box.map((p) => p.y)), z: Math.max(...box.map((p) => p.z)) }
        points.push({ a: lo, b: hi })
      } else points.push({ a: from, b: to })
      from = to
    }
    for (const fx of fixtures) {
      const lo = { x: fx.min.x - r, y: fx.min.y - r, z: fx.min.z - up }, hi = { x: fx.max.x + r, y: fx.max.y + r, z: fx.max.z }
      const hit = points.some(({ a, b }) => {
        // Slab test of the segment (or the box of an arc) against the grown clamp box, in the fixture's frame.
        let t0 = 0, t1 = 1
        for (const axis of ["x", "y", "z"] as const) {
          const p = a[axis] + at[axis], d = b[axis] - a[axis]
          if (Math.abs(d) < 1e-12) { if (p < lo[axis] || p > hi[axis]) return false; continue }
          let u = (lo[axis] - p) / d, v = (hi[axis] - p) / d
          if (u > v) [u, v] = [v, u]
          t0 = Math.max(t0, u); t1 = Math.min(t1, v)
          if (t0 > t1) return false
        }
        return true
      })
      if (hit) out.push(`${op.name}${setup.workpieces !== undefined && setup.workpieces.length > 1 ? ` on ${workpiece.name}` : ""}: the tool reaches ${fx.name} (${op.tool.name} Ø${op.tool.diameter}, ${up} mm out of the holder)`)
    }
  }
  return out
}

export const generateSetup = (setup: Setup, geometryOf: (operation: Operation) => GeometryInput): GeneratedSetup => {
  const plan: SetupPlan = planPrograms(setup)
  const issues = validateSetup(setup)
  const warnings: string[] = [...plan.warnings]
  const blocked = new Set(issues.flatMap((i) => (i.operationId !== undefined ? [i.operationId] : [])))
  const post = getPost(setup.post.postId)
  if (post === undefined) return { programs: [], toolTable: plan.toolTable, toolLife: [], totals: { programs: 0, toolLoads: 0, toolChanges: 0, cutLength: 0, rapidLength: 0, estimatedSeconds: 0 }, warnings: [`The post ${setup.post.postId} is not implemented`], issues }
  // Two workpieces on one register, or an operation on a workpiece that is not there, would cut the wrong part: nothing is generated.
  if (workpieceIssues(setup).length > 0) return { programs: [], toolTable: plan.toolTable, toolLife: [], totals: { programs: 0, toolLoads: 0, toolChanges: 0, cutLength: 0, rapidLength: 0, estimatedSeconds: 0 }, warnings: [...warnings, "The fixture is inconsistent: no program was generated"], issues }
  const ordered = setup.operations.filter((op) => op.enabled)
  const pockets = assignPockets(ordered)
  /** The generator settings of an operation: its own, with the tool's size, its pocket and the setup's register. A rest pass that continues the operation before it cut with that operation's tool. */
  const settingsOf = (op: Operation) => {
    const before = ordered[ordered.indexOf(op) - 1]
    return {
      ...op.params,
      toolDiameter: op.tool.diameter, flutes: op.tool.flutes, toolNumber: pockets.get(op.id)!, workOffset: setup.workOffset,
      ...(op.fromPreviousStock && op.params.useRestMachining && before !== undefined ? { restToolDiameter: before.tool.diameter } : {})
    }
  }
  const programs: GeneratedProgram[] = []
  // A sister tool has a pocket of its own, after the highest one the operations hold.
  const sisterPocket = new Map<string, number>()
  { let next = Math.max(0, ...pockets.values()) + 1; for (const sister of setup.sisters ?? []) if (ordered.some((op) => op.tool.id === sister.toolId)) sisterPocket.set(sister.toolId, next++) }
  // Cutting minutes every tool has spent so far over the programs, in order; the tool each program really called, for the report.
  let lifeBook: ToolLifeBook = emptyLifeBook
  const called = new Map<string, { readonly tool: Tool; readonly pocket: number; readonly sisterOf?: string }>()
  groupsOf(setup).forEach((group, index) => {
    const planned = plan.programs[index]!
    const programWarnings: string[] = []
    // An operation is generated once: its moves are the same on every workpiece, only the work offset differs.
    const outcomes = new Map<string, Toolpath | undefined>()
    const toolpathOf = (op: Operation): Toolpath | undefined => {
      if (outcomes.has(op.id)) return outcomes.get(op.id)
      outcomes.set(op.id, undefined)
      if (blocked.has(op.id)) { programWarnings.push(`${op.name} is skipped: ${issues.filter((i) => i.operationId === op.id).map((i) => i.message).join("; ")}`); return undefined }
      const settings = settingsOf(op)
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
      let book = lifeBook
      const swapped = new Map<string, Tool>()
      const spent = new Set<string>()
      const callsLocal = new Map<string, { readonly tool: Tool; readonly pocket: number; readonly sisterOf?: string }>()
      const buildWarnings: string[] = []
      for (const { operation: op, workpiece, multi } of runsOf({ ...setup, workpieceOrder: order }, group.operations)) {
        const made = toolpathOf(op)
        if (made === undefined) continue
        if (!used.includes(op)) used.push(op)
        // Tool life: a run goes to the tool in use unless its remaining life cannot cover it; then the next member of the sister group takes over.
        let tool = swapped.get(op.tool.id) ?? op.tool
        const minutes = estimateTime(made, 1e12) / 60
        const sister = setup.sisters?.find((s) => s.toolId === op.tool.id)
        if (tool.lifeMinutes !== undefined || sister !== undefined) {
          const members = sister === undefined ? [tool] : [op.tool, sister.tool]
          const life = (id: string): number => members.find((m) => m.id === id)?.lifeMinutes ?? Infinity
          const choice = pickSister({ id: op.tool.id, members: members.map((m) => m.id) }, book, life, minutes)
          if (choice.toolId === undefined) {
            if (!spent.has(tool.id)) { spent.add(tool.id); buildWarnings.push(`${tool.name} has no life left for ${op.name}: ${choice.reason}. Replace or regrind it, or give it a sister tool`) }
          } else if (choice.toolId !== tool.id) {
            tool = members.find((m) => m.id === choice.toolId)!
            swapped.set(op.tool.id, tool)
            buildWarnings.push(`${op.tool.name} is spent after ${(book.usedMinutes[op.tool.id] ?? 0).toFixed(1)} min: ${tool.name} (T${sisterPocket.get(op.tool.id)}) takes over from ${op.name}`)
            if (Math.abs(tool.diameter - op.tool.diameter) > 1e-9) buildWarnings.push(`${tool.name} is Ø${tool.diameter}, ${op.tool.name} is Ø${op.tool.diameter}: ${op.name} was made for the primary tool`)
          }
        }
        book = consumeLife(book, tool.id, minutes)
        const pocket = tool === op.tool || tool.id === op.tool.id ? pockets.get(op.id)! : sisterPocket.get(op.tool.id)!
        callsLocal.set(tool.id, { tool, pocket, ...(tool.id !== op.tool.id ? { sisterOf: op.tool.id } : {}) })
        const asTool: Toolpath = tool.id === op.tool.id ? made : { ...made, toolId: tool.id, spindleRpm: Math.min(op.params.rpm, tool.maxRpm) }
        // A part on an indexed face: the table turns to its angles first, then the same moves run under that face's register.
        const indexed = workpiece.index === undefined ? asTool : { ...asTool, moves: [{ _tag: "Orient" as const, ...workpiece.index }, ...asTool.moves] }
        toolpaths.push(multi
          ? { ...indexed, id: `${op.id}@${workpiece.id}`, name: `${op.name} - ${workpiece.name}`, workOffset: workpiece.workOffset, ...(workpiece.workOffsetRef !== undefined ? { workOffsetRef: workpiece.workOffsetRef } : {}), operation: { id: `${op.id}@${workpiece.id}`, name: `${op.name} - ${workpiece.name}` } }
          : indexed)
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
      for (const [id, c] of callsLocal) toolNumbers[id] = c.pocket
      const gcode = post.emit(program, {
        decimals: setup.post.decimals, useCannedCycles: setup.post.useCannedCycles, arcMode: setup.post.arcMode, header: setup.post.header, tolerance: setup.post.tolerance,
        toolNumbers, retractBeforeToolChange: setup.retractBeforeToolChange,
        ...(setup.post.lineNumbers !== undefined ? { lineNumbers: setup.post.lineNumbers } : {}),
        ...(setup.post.stamp !== undefined ? { stamp: setup.post.stamp } : {})
      })
      const stats = analyseGcode(gcode, planned.name).stats
      return { toolpaths, used, program, gcode, stats, book, calls: callsLocal, toolNumbers, notes: buildWarnings, seconds: stats.estimatedSeconds + toolChangesOf(toolpaths) * TOOL_CHANGE_SECONDS }
    }
    const order: WorkpieceOrder = setup.workpieceOrder ?? "toolFirst"
    const { used, program, gcode, stats, seconds, book, calls, toolNumbers, notes } = build(order)
    lifeBook = book
    for (const [id, c] of calls) if (!called.has(id)) called.set(id, c)
    programWarnings.push(...notes)
    if (workpiecesOf(setup).length > 1 && used.length > 0) {
      const otherOrder: WorkpieceOrder = order === "toolFirst" ? "partFirst" : "toolFirst"
      const other = build(otherOrder)
      if (Math.abs(other.seconds - seconds) >= 1) {
        const faster = other.seconds < seconds ? otherOrder : order
        programWarnings.push(`${faster === "toolFirst" ? "Tool first" : "Part first"} runs about ${Math.round(Math.abs(other.seconds - seconds))} s faster than ${faster === "toolFirst" ? "part first" : "tool first"} (${TOOL_CHANGE_SECONDS} s per tool change, indicative, uncalibrated)`)
      }
    }
    programWarnings.push(...fixtureReach(setup, group.operations, toolpathOf))
    programs.push({
      name: planned.name, programNumber: planned.programNumber, gcode, program, stats,
      warnings: programWarnings, operationIds: used.map((op) => op.id), toolNumbers: [...new Set([...planned.toolNumbers, ...[...calls.values()].map((c) => c.pocket)])],
      pockets: toolNumbers, tools: [...calls.values()].map((c) => c.tool)
    })
    warnings.push(...programWarnings)
  })
  const life: ToolLifeEntry[] = [...called.entries()].map(([toolId, c]) => ({
    toolId, name: c.tool.name, pocket: c.pocket, minutes: Math.round((lifeBook.usedMinutes[toolId] ?? 0) * 100) / 100,
    ...(c.tool.lifeMinutes !== undefined ? { lifeMinutes: c.tool.lifeMinutes } : {}), ...(c.sisterOf !== undefined ? { sisterOf: c.sisterOf } : {})
  })).sort((a, b) => a.pocket - b.pocket)
  const sisterEntries: ToolTableEntry[] = life.filter((l) => l.sisterOf !== undefined).map((l) => ({ pocket: l.pocket, tool: called.get(l.toolId)!.tool, operationIds: [] }))
  return {
    programs, toolTable: [...plan.toolTable, ...sisterEntries].sort((a, b) => a.pocket - b.pocket), toolLife: life.some((l) => l.lifeMinutes !== undefined || l.sisterOf !== undefined) ? life : [], issues, warnings,
    totals: {
      programs: programs.length, toolLoads: plan.toolLoads, toolChanges: plan.toolChanges,
      cutLength: round(programs.reduce((s, p) => s + p.stats.cutLength, 0)), rapidLength: round(programs.reduce((s, p) => s + p.stats.rapidLength, 0)),
      estimatedSeconds: Math.round(programs.reduce((s, p) => s + p.stats.estimatedSeconds, 0))
    }
  }
}
