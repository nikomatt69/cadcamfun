/** Resolve imported program tools without borrowing unrelated generator settings. */
import type { Program } from "./ir.ts"
import type { MachineKind } from "./machine.ts"
import type { MotionTrack } from "./viewer/motion-track.ts"
import { trackFor } from "./viewer/motion-track.ts"
import { turnMillPathIsMilling } from "./viewer/turn-mill-view.ts"
import { headerTools } from "./testing/header-tools.ts"
import { latheToolModels, toolOperationIssues, type ToolOperationIssue } from "./operation-tools.ts"
import { toolModelOf, toolTypeIn, type ToolModel } from "./tool-model.ts"

export interface ProgramTool {
  readonly toolId: string
  readonly model: ToolModel
  readonly source: "header" | "inferred" | "assumed"
  readonly operations: ReadonlyArray<string>
  readonly issues: ReadonlyArray<ToolOperationIssue>
}

/** Only controller words with an unambiguous operation meaning count as evidence. */
const cycleTool = (word: string): { readonly operation: string; readonly type: string } | undefined => {
  if (/^G0*(81|82|83|73)$/.test(word)) return { operation: "mill/drill", type: "drill" }
  if (/^G0*(84|74)$/.test(word)) return { operation: "mill/tap", type: "tap" }
  if (/^G0*(85|86|87|88|89|76)$/.test(word)) return { operation: "mill/bore", type: "boringbar" }
  if (/^G0*38\.[2345]$/.test(word)) return { operation: "mill/probing", type: "probe" }
  return undefined
}

/**
 * One physical model per tool id, even when reused by several paths. Declared tools
 * are never replaced to hide an incompatible operation. Dimensions absent from NC
 * remain in the model's `assumed` list.
 */
export const programTools = (program: Program, motion: MotionTrack | undefined, gcode: string, kind: MachineKind = "mill"): ReadonlyMap<string, ProgramTool> => {
  const track = trackFor(program, motion)
  const headers = headerTools(gcode)
  const lines = gcode.split(/\r?\n/).map((line) => line.replace(/\([^)]*\)/g, " ").replace(/;.*$/, "").toUpperCase())
  const turning = kind === "lathe" ? latheToolModels(program, track, gcode) : undefined
  const grouped = new Map<string, { number: number | undefined; kind: MachineKind; operations: Map<string, string> }>()
  program.toolpaths.forEach((path, index) => {
    const own = track.paths[index]
    let group = grouped.get(path.toolId)
    if (group === undefined) {
      const number = /^T\d+$/i.test(path.toolId) ? Number(path.toolId.slice(1)) : own?.runs.find((run) => run.tool !== undefined)?.tool
      group = { number, kind: kind === "lathe" && turnMillPathIsMilling(program, index) ? "mill" : kind, operations: new Map() }
      grouped.set(path.toolId, group)
    }
    if (group.kind !== "mill") return
    for (const line of new Set(own?.lines ?? [])) {
      for (const match of (lines[line - 1] ?? "").matchAll(/G\s*(\d+(?:\.\d+)?)(?![\d.])/g)) {
        const evidence = cycleTool(`G${match[1]}`)
        if (evidence !== undefined) group.operations.set(evidence.operation, evidence.type)
      }
    }
    if (own?.runs.some((run) => run.probe)) group.operations.set("mill/probing", "probe")
  })
  const out = new Map<string, ProgramTool>()
  const singleDescription = grouped.size === 1 ? /[(;]\s*Tool:\s*([^\n)]+)/i.exec(gcode.slice(0, 20_000))?.[1] : undefined
  for (const [toolId, group] of grouped) {
    const header = group.number !== undefined ? headers.byTool.get(group.number) : undefined
    const description = header?.description ?? singleDescription
    const declaredType = description !== undefined ? group.kind === "3dprinter"
      ? /\b(brass|hardened|ruby|standard|nozzle)\b/i.exec(description)?.[1]?.toLowerCase()
      : toolTypeIn(description) : undefined
    const inferredType = group.operations.values().next().value
    const fallbackType = group.kind === "3dprinter" ? "nozzle" : "endmill"
    let model = declaredType === undefined && group.kind === "lathe" && turning?.has(toolId) ? turning.get(toolId)!
      : toolModelOf({ type: declaredType ?? inferredType ?? fallbackType, diameter: header?.diameter ?? (grouped.size === 1 ? headers.single ?? 0 : 0), ...(header?.cornerRadius !== undefined ? { cornerRadius: header.cornerRadius } : {}) }, group.kind)
    if (declaredType === undefined && !model.assumed.includes("type")) model = { ...model, assumed: [...model.assumed, "type"] }
    if (header === undefined && !(headers.single !== undefined && grouped.size === 1)) model = { ...model, assumed: [...model.assumed, "diameter"] }
    const operations = [...group.operations.keys()]
    const issues = operations.flatMap((key) => {
      if (key === "mill/tap" || key === "mill/bore") {
        const expected = key === "mill/tap" ? "tap" : "boringBar"
        return model.family === "mill" && model.shape === expected ? [] : [{ code: "TOOL_CANNOT_DO_OPERATION" as const, severity: "error" as const, message: `Tool ${toolId} cannot perform ${key.slice(5)}: the program needs a ${expected}.` }]
      }
      return toolOperationIssues(key, model)
    })
    out.set(toolId, { toolId, model, source: declaredType !== undefined ? "header" : inferredType !== undefined || group.kind === "lathe" && turning?.has(toolId) ? "inferred" : "assumed", operations, issues })
  }
  return out
}
