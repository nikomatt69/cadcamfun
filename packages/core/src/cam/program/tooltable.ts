/** The tool table of a setup (spec 14 §3): carousel pocket (`T<n>`) -> tool, derived from the operations in order. */
import type { Tool } from "../tool.ts"
import type { Operation } from "./op.ts"

export interface ToolTableEntry {
  readonly pocket: number
  readonly tool: Tool
  readonly operationIds: ReadonlyArray<string>
}

/**
 * The pocket of every operation: its explicit pocket, else the pocket its tool already has (an earlier explicit or automatic one),
 * else the lowest number nobody holds. Numbers are taken in operation order, so a tool keeps one pocket over the whole program.
 */
export const assignPockets = (operations: ReadonlyArray<Operation>): Map<string, number> => {
  const byTool = new Map<string, number>()
  const taken = new Set<number>()
  // Explicit pockets first: an automatic number must not collide with a pocket named further down the list.
  for (const op of operations) {
    if (op.pocket !== undefined && !byTool.has(op.tool.id)) { byTool.set(op.tool.id, op.pocket); taken.add(op.pocket) }
  }
  const out = new Map<string, number>()
  for (const op of operations) {
    let pocket = op.pocket ?? byTool.get(op.tool.id)
    if (pocket === undefined) {
      pocket = 1
      while (taken.has(pocket)) pocket++
      byTool.set(op.tool.id, pocket)
      taken.add(pocket)
    }
    out.set(op.id, pocket)
  }
  return out
}

export const buildToolTable = (operations: ReadonlyArray<Operation>): { readonly entries: ReadonlyArray<ToolTableEntry>; readonly warnings: ReadonlyArray<string> } => {
  const pockets = assignPockets(operations)
  const warnings: string[] = []
  const entries = new Map<number, { tool: Tool; operationIds: string[] }>()
  for (const op of operations) {
    const pocket = pockets.get(op.id)!
    const held = entries.get(pocket)
    if (held === undefined) entries.set(pocket, { tool: op.tool, operationIds: [op.id] })
    else {
      if (held.tool.id !== op.tool.id) warnings.push(`Pocket T${pocket} holds ${held.tool.name} and ${op.tool.name}: ${op.name} would run with the wrong tool`)
      held.operationIds.push(op.id)
    }
  }
  return { entries: [...entries.entries()].sort((a, b) => a[0] - b[0]).map(([pocket, e]) => ({ pocket, tool: e.tool, operationIds: e.operationIds })), warnings }
}
