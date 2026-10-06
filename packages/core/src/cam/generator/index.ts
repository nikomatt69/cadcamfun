/**
 * Toolpath generator (WP2 extension): the legacy `ToolpathGenerator` panel's logic as a pure core module.
 *
 *   request { settings, geometry (+ stock, selected elements), printer }
 *     -> `generateToolpath` -> { gcode, cycles, warnings, stats, program }
 *
 * The sidecar's `toolpathGenerator` HTTP group and the UI both go through `generateToolpath`;
 * nothing here reads a store, a file or the clock.
 */
import { convertLinesToArcs, optimizeToolpath } from "./postpass.ts"
import { detectFixedCycles } from "./cycles.ts"
import { analyseGcode } from "./analysis.ts"
import { generateLatheGCode } from "./lathe.ts"
import { generateMillGCode } from "./mill.ts"
import { generate3DPrinterGCodeForElement, type PrinterSettings } from "./printer.ts"
import { adjustSettingsForElement, outsideStock, suggestMachiningParameters } from "./elements.ts"
import { calculateCuttingStatistics, getCuttingFeedback, getOperationDescription, aiSuggestionsFor } from "./settings.ts"
import type { GenerateRequest, GenerateResponse, GeometryInput, PrinterExtras, ToolpathSettings } from "./schema.ts"
import type { SuggestResponseSchema } from "./schema.ts"

export * from "./schema.ts"
export * from "./settings.ts"
export * from "./elements.ts"
export * from "./analysis.ts"
export * from "./estimates.ts"
export { cutLevels, applyOriginOffset, type GenerateOptions } from "./common.ts"
export { orderPoints, pocketShape, elementOperation } from "./actions.ts"
export { selectedToolpath, millToolpath, originShift, stockComment, withinStock } from "./dispatch.ts"
export { generateMillGCode } from "./mill.ts"
export { generateLatheGCode } from "./lathe.ts"
export { elementToolpath } from "./element-paths.ts"
export { generate3DPrinterGCodeForElement, generateCompositeElement3D, calculateExtrusion, printStartGCode, printEndGCode, type PrinterSettings } from "./printer.ts"
export { convertLinesToArcs, optimizeToolpath } from "./postpass.ts"
export * from "./cycles.ts"

export const printerSettingsOf = (settings: ToolpathSettings, extras: PrinterExtras): PrinterSettings => ({
  layerHeight: settings.layerHeight,
  printSpeed: settings.printSpeed,
  travelSpeed: 150,
  printTemperature: settings.printTemperature,
  bedTemperature: settings.bedTemperature,
  extrusionWidth: settings.extrusionWidth || settings.nozzleDiameter,
  filamentDiameter: settings.filamentDiameter,
  retractionDistance: 2,
  retractionSpeed: 60,
  infillDensity: extras.infillDensity,
  infillPattern: extras.infillPattern,
  shellCount: extras.shellCount,
  supportType: extras.supportType,
  supportOverhangAngle: 45,
  supportDensity: 20,
  raftLayers: 0,
  brimWidth: 0,
  material: settings.material,
  nozzleDiameter: settings.nozzleDiameter
})

const warningsIn = (gcode: string): string[] =>
  gcode.split("\n").filter(line => line.startsWith("; Warning:")).map(line => line.slice("; Warning:".length).trim())

/** Raw text for a request, before the post passes. `error` is set when nothing can be generated. */
const text = (request: GenerateRequest): { gcode: string; error?: string } => {
  const { settings, geometry, printer } = request
  const options = request.stamp !== undefined ? { stamp: request.stamp } : {}
  switch (settings.machineType) {
    case "mill": return { gcode: generateMillGCode(settings, geometry as GeometryInput, options) }
    case "lathe": return { gcode: generateLatheGCode(settings, options) }
    case "3dprinter": {
      const element = geometry.selectedElements[0]
      if (!element) return { gcode: "; Error: No element selected for 3D printing\n", error: "Please select a CAD element for 3D printing." }
      return { gcode: generate3DPrinterGCodeForElement(element as Record<string, any>, printerSettingsOf(settings, printer)) }
    }
  }
}

export interface GenerateOutcome {
  readonly response: GenerateResponse
  /** Set when the request was valid but nothing could be generated (legacy: a toast + an error comment). */
  readonly error?: string
}

export const generateToolpath = (request: GenerateRequest): GenerateOutcome => {
  const { settings } = request
  const generated = text(request)
  let gcode = generated.gcode
  if (settings.optimizePath) gcode = optimizeToolpath(gcode, settings.tolerance)
  if (settings.useArcFitting) gcode = convertLinesToArcs(gcode, settings.tolerance)
  const analysis = analyseGcode(gcode, `${settings.machineType}-${settings.operationType}`)
  return {
    response: {
      gcode,
      cycles: detectFixedCycles(gcode),
      warnings: warningsIn(gcode),
      stats: analysis.stats,
      program: analysis.program
    },
    ...(generated.error !== undefined ? { error: generated.error } : {})
  }
}

export type Suggestions = typeof SuggestResponseSchema.Type

/** Everything the panel shows next to the form: element-driven parameters, cutting feedback, stock warnings. */
export const suggestFor = (settings: ToolpathSettings, geometry: GeometryInput): Suggestions => {
  const element = geometry.selectedElements[0]
  const adjusted = adjustSettingsForElement(element as Record<string, any> | undefined, settings)
  const parameters = element ? suggestMachiningParameters(element as Record<string, any>) : undefined
  const warnings: string[] = []
  const stock = geometry.stock
  if (stock && settings.depth > stock.depth) warnings.push(`Depth ${settings.depth}mm exceeds the stock thickness ${stock.depth}mm: it will be limited`)
  if (adjusted.suggestSmallerTool) warnings.push("The element is small relative to the tool: consider a smaller tool")
  for (const el of geometry.selectedElements) {
    if (outsideStock(el as Record<string, any>, stock)) warnings.push(`${String(el["type"])} leaves the stock rectangle`)
  }
  return {
    ...(parameters ? { parameters: { depth: parameters.depth, stepdown: parameters.stepdown, operationType: parameters.operationType } } : {}),
    suggestions: aiSuggestionsFor(settings),
    feedback: getCuttingFeedback(settings),
    statistics: calculateCuttingStatistics(settings),
    operation: getOperationDescription(settings.operationType),
    warnings
  }
}
