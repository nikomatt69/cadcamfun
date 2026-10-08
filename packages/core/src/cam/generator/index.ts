/**
 * Toolpath generator (WP2 extension): the legacy `ToolpathGenerator` panel's logic as a pure core module.
 *
 *   request { settings, geometry (+ stock, selected elements), printer }
 *     -> `generateToolpath` -> { gcode, cycles, warnings, stats, program }
 *
 * The sidecar's `toolpathGenerator` HTTP group and the UI both go through `generateToolpath`;
 * nothing here reads a store, a file or the clock.
 *
 * Where the output deliberately differs from the legacy panel (each is a legacy bug, covered by a test):
 *  - Z levels run from `-stepdown` to exactly `-depth` (legacy: first pass at Z0, last pass one step short);
 *  - an inside tool offset shrinks rectangles / slices (legacy: grew them), and sphere / hemisphere slices apply
 *    the offset it computed but never used; a rapid at depth is preceded by a retract;
 *  - a circular pocket steps out in rings (legacy: arcs that ended at the centre); G2/G3 labels match the code;
 *  - a cube is `width` (X) x `height` (Y) x `depth` (Z), as the CAD scene draws it (legacy mixed the two);
 *  - arc fitting uses the circumcentre and only fits circular runs; the compensation approach point is found;
 *  - lathe threading counts passes as `round(depth / 0.1)` (legacy float accumulation dropped the last one);
 *  - composite 3D prints shrink their shells and clip the infill to the outline (legacy grew the shells and
 *    drew the bounding box without travelling to line starts);
 *  - a `component` is sliced as one unified geometry (`unified-geometry.ts`, the legacy `unifiedGeometryCalculator`; its
 *    boolean step was a no-op there too, so overlapping members keep their own contours); pocket / drill / engrave and
 *    the other containers are machined member by member, and a group is machined (legacy: "Invalid component element");
 *  - unknown element types get the generic contour without the nested program header the legacy wrapper added.
 */
import { adaptFeeds, convertLinesToArcs, optimizeToolpath } from "./postpass.ts"
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
export { adaptFeeds, convertLinesToArcs, optimizeToolpath } from "./postpass.ts"
export * from "./cycles.ts"
export {
  calculate3DComponentDetails,
  calculateComponentDimensions,
  calculateElementZLevelIntersection,
  calculateMeshZIntersection,
  calculateZLevelIntersection,
  calculateZLevels,
  combineElementDimensions,
  convertToolpathToGcode,
  generateOptimizedToolpath,
  isUnifiedSolid,
  splitUnifiedMembers,
  toComponent3D,
  unifiedGcode,
  type Component3D,
  type ElementIntersection,
  type ToolpathSegment,
  type ZLevelIntersection
} from "./unified-geometry.ts"

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
  nozzleDiameter: settings.nozzleDiameter,
  bedWidth: settings.bedWidth,
  bedDepth: settings.bedDepth,
  centerOnBed: settings.centerOnBed,
  bedOrigin: settings.bedOrigin
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
  // Feed that follows the path is a mill's concern: a printer or a lathe has its own feed model.
  if (settings.useAdaptiveFeeds && settings.machineType === "mill") gcode = adaptFeeds(gcode, settings.toolDiameter)
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
