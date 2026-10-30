/**
 * The plan of a setup (spec 14 §3): which operations form which program, with which pockets. Pure: no geometry and no clock, so the
 * UI can offer every grouping from the same planner and show the cost of each (tool loads, tool changes) before anything is generated.
 */
import type { Operation } from "./op.ts"
import { enabledOperations, type Setup } from "./setup.ts"
import { assignPockets, buildToolTable, type ToolTableEntry } from "./tooltable.ts"

export interface PlannedProgram {
  readonly name: string
  readonly programNumber: number
  /** Pockets the program uses, in order of first use. */
  readonly toolNumbers: ReadonlyArray<number>
  /** Operation ids in machining order. */
  readonly operations: ReadonlyArray<string>
}

export interface SetupPlan {
  readonly programs: ReadonlyArray<PlannedProgram>
  readonly toolTable: ReadonlyArray<ToolTableEntry>
  /** Times a tool goes into the spindle over all programs: one per program plus every change inside one. */
  readonly toolLoads: number
  /** Tool changes inside a program. */
  readonly toolChanges: number
  readonly warnings: ReadonlyArray<string>
}

/** The operations regrouped so that each tool runs once, tools in order of first use, operations of one tool in their order. */
export const reorderByTool = (operations: ReadonlyArray<Operation>): ReadonlyArray<Operation> => {
  const order: string[] = []
  const byTool = new Map<string, Operation[]>()
  for (const op of operations) {
    if (!byTool.has(op.tool.id)) { byTool.set(op.tool.id, []); order.push(op.tool.id) }
    byTool.get(op.tool.id)!.push(op)
  }
  return order.flatMap((id) => byTool.get(id)!)
}

/** Groups of enabled operations, one per program. */
export const groupsOf = (setup: Setup): ReadonlyArray<{ readonly name: string; readonly operations: ReadonlyArray<Operation> }> => {
  const ops = enabledOperations(setup)
  if (ops.length === 0) return []
  switch (setup.grouping) {
    case "single":
      return [{ name: setup.name, operations: ops }]
    case "perOperation":
      return ops.map((op) => ({ name: `${setup.name} - ${op.name}`, operations: [op] }))
    case "perTool": {
      const groups = new Map<string, Operation[]>()
      for (const op of ops) groups.set(op.tool.id, [...(groups.get(op.tool.id) ?? []), op])
      return [...groups.values()].map((operations) => ({ name: `${setup.name} - ${operations[0]!.tool.name}`, operations }))
    }
  }
}

export const planPrograms = (setup: Setup): SetupPlan => {
  const ops = enabledOperations(setup)
  const pockets = assignPockets(ops)
  const table = buildToolTable(ops)
  const warnings = [...table.warnings]
  const programs: PlannedProgram[] = []
  let toolChanges = 0
  groupsOf(setup).forEach((group, index) => {
    const toolNumbers: number[] = []
    let previous: string | undefined
    const seen = new Set<string>()
    for (const op of group.operations) {
      const pocket = pockets.get(op.id)!
      if (!toolNumbers.includes(pocket)) toolNumbers.push(pocket)
      if (previous !== undefined && previous !== op.tool.id) {
        toolChanges++
        // A tool that comes back after another one costs a change that ordering could save.
        if (seen.has(op.tool.id)) warnings.push(`${op.tool.name} is used again after another tool in ${group.name}: ordering the operations by tool saves a tool change`)
      }
      seen.add(op.tool.id)
      previous = op.tool.id
    }
    programs.push({ name: group.name, programNumber: setup.post.programNumberBase + index, toolNumbers, operations: group.operations.map((op) => op.id) })
  })
  return { programs, toolTable: table.entries, toolLoads: programs.length + toolChanges, toolChanges, warnings: [...new Set(warnings)] }
}
