/**
 * What the explorer's per-element assignments mean for the generator (legacy `CAMElementExplorer.handleGenerateToolpath`).
 *
 * The explorer lets the user pick a tool, a material and a few parameters for each CAD element. Generating for that
 * element merges them into the job's settings exactly as the legacy handler did: the tool sets type and diameter, the
 * material scales feed and plunge by its `feedrateFactor`, the element type picks the operation (rectangle / circle
 * are pocketed, points are drilled, everything else is contoured). Pure functions over plain values, so the rules are
 * testable without the stores or the sidecar.
 */
import { cam } from "@cadcamfun/core"
import { toJsonSafeRecord } from "../../../shared/state/json-safe.ts"
import { EXPLORER_MATERIALS, EXPLORER_TOOLS } from "./explorer.ts"
import type { CadElement, Stock } from "./job.ts"

export type ToolpathSettings = cam.generator.ToolpathSettings

/** The parameter fields of the explorer's "Toolpath Parameters" block. */
export interface ElementParams {
  readonly depth: number
  readonly stepover: number
  readonly feedrate: number
  readonly plungerate: number
}

export interface ElementAssignment {
  readonly toolId: string
  readonly materialId: string
  readonly params: ElementParams
}

/** Legacy `defaultToolpathParams` (the part the generator reads). */
export const LEGACY_DEFAULTS = { tolerance: 0.01, spindleSpeed: 12000, coolant: false } as const

/** Explorer material id → the generator's material type. */
export const MATERIAL_TYPES: Readonly<Record<string, ToolpathSettings["material"]>> = {
  "wood-oak": "wood",
  "wood-maple": "wood",
  "aluminum": "aluminum",
  "acrylic": "plastic"
}

/** Operation for an element type, as the legacy handler chose it. */
export const operationForElement = (type: string): ToolpathSettings["operationType"] =>
  type === "rectangle" || type === "circle" ? "pocket" : type === "point" ? "drill" : "contour"

/** The alert the legacy explorer showed when generation was asked without both picks (or with an unknown id). */
export const assignmentProblem = (toolId: string, materialId: string): string | undefined => {
  if (!toolId || !materialId) return "Please assign both tool and material first"
  if (EXPLORER_TOOLS[toolId] === undefined || EXPLORER_MATERIALS[materialId] === undefined) return "Invalid tool or material"
  return undefined
}

const round2 = (value: number): number => Math.round(value * 100) / 100

/**
 * The job settings for one element: `base` (the generator panel's settings: machine, origin, coolant, ...) with the
 * element's tool, material and parameters laid over it. Feed and plunge are scaled by the material factor.
 */
export const settingsForElement = (base: ToolpathSettings, element: CadElement, assignment: ElementAssignment): ToolpathSettings => {
  const tool = EXPLORER_TOOLS[assignment.toolId]
  const material = EXPLORER_MATERIALS[assignment.materialId]
  if (tool === undefined || material === undefined) throw new Error(assignmentProblem(assignment.toolId, assignment.materialId) ?? "Invalid tool or material")
  const depth = assignment.params.depth
  return {
    ...base,
    machineType: "mill",
    operationType: operationForElement(String(element["type"])),
    toolType: tool.type === "v-bit" ? "vbit" : tool.type,
    toolDiameter: tool.diameter,
    material: MATERIAL_TYPES[assignment.materialId] ?? base.material,
    depth,
    stepdown: Math.min(base.stepdown, depth),
    stepover: assignment.params.stepover,
    feedrate: round2(assignment.params.feedrate * material.feedrateFactor),
    plungerate: round2(assignment.params.plungerate * material.feedrateFactor),
    tolerance: LEGACY_DEFAULTS.tolerance,
    rpm: LEGACY_DEFAULTS.spindleSpeed,
    coolant: LEGACY_DEFAULTS.coolant
  }
}

/** A generate request that machines exactly one CAD element. */
export const requestForElement = (input: {
  readonly element: CadElement
  readonly settings: ToolpathSettings
  readonly stock: Stock
  readonly printer?: cam.generator.PrinterExtras
}): cam.generator.GenerateRequest => ({
  settings: input.settings,
  geometry: { ...cam.generator.DEFAULT_GEOMETRY, geometryType: "selected", selectedElements: [toJsonSafeRecord(input.element)], stock: toJsonSafeRecord(input.stock) } as never,
  printer: input.printer ?? cam.generator.DEFAULT_PRINTER_EXTRAS
})
