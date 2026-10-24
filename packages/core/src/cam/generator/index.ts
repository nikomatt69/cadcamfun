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
import { programRecord } from "./evidence.ts"
import { generateLatheGCode } from "./lathe.ts"
import { turnedProfileOf } from "./history-features.ts"
import { generateMillGCode } from "./mill.ts"
import { multiaxisProgram } from "./multiaxis.ts"
import { generate3DPrinterProgram, type PrinterSettings } from "./printer.ts"
import { adjustSettingsForElement, outsideStock, suggestMachiningParameters } from "./elements.ts"
import { calculateCuttingStatistics, getCuttingFeedback, getOperationDescription, aiSuggestionsFor } from "./settings.ts"
import type { GenerateRequest, GenerateResponse, GeometryInput, PrinterExtras, ToolpathSettings } from "./schema.ts"
import type { PrintStats } from "../print/types.ts"
import type { PrintCheck } from "../print/verify.ts"
import type { PrintRequirement } from "../kernel/contracts.ts"
import type { SuggestResponseSchema } from "./schema.ts"

export * from "./schema.ts"
export * from "./settings.ts"
export * from "./elements.ts"
export * from "./analysis.ts"
export * from "./estimates.ts"
export * from "./machine-config.ts"
export { cutLevels, applyOriginOffset, type GenerateOptions } from "./common.ts"
export { orderPoints, pocketShape, elementOperation } from "./actions.ts"
export { selectedToolpath, millToolpath, originShift, stockComment, stockInWork, withinStock } from "./dispatch.ts"
export { generateMillGCode } from "./mill.ts"
export { generateLatheGCode } from "./lathe.ts"
export { elementToolpath } from "./element-paths.ts"
export { generate3DPrinterGCodeForElement, generate3DPrinterProgram, calculateExtrusion, type PrinterProgram, type PrinterSettings } from "./printer.ts"
export { adaptFeeds, convertLinesToArcs, optimizeToolpath } from "./postpass.ts"
export * from "./cycles.ts"
export { programRecord, targetMeshesFor, reliefsFor, firstHorizontalRapidZ, type Relief } from "./evidence.ts"
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

export const printerSettingsOf = (settings: ToolpathSettings, extras: PrinterExtras): PrinterSettings => {
  const operation = settings.operationType
  return {
    layerHeight: settings.layerHeight,
    printSpeed: settings.printSpeed,
    travelSpeed: extras.travelSpeed,
    printTemperature: settings.printTemperature,
    bedTemperature: settings.bedTemperature,
    extrusionWidth: settings.extrusionWidth || settings.nozzleDiameter,
    filamentDiameter: settings.filamentDiameter,
    retractionDistance: extras.retractionDistance,
    retractionSpeed: extras.retractionSpeed,
    retractMinTravel: extras.retractMinTravel,
    zHop: extras.zHop,
    // An infill operation prints the part solid.
    infillDensity: operation === "infill" ? 100 : extras.infillDensity,
    infillPattern: operation === "infill" ? "lines" : extras.infillPattern,
    shellCount: extras.shellCount,
    topLayers: extras.topLayers,
    bottomLayers: extras.bottomLayers,
    firstLayerHeight: extras.firstLayerHeight,
    firstLayerSpeed: extras.firstLayerSpeed,
    outerWallSpeed: extras.outerWallSpeed,
    infillSpeed: extras.infillSpeed,
    bridgeSpeed: extras.bridgeSpeed,
    supportSpeed: extras.supportSpeed,
    fanSpeed: extras.fanSpeed,
    fanFromLayer: extras.fanFromLayer,
    minLayerTime: extras.minLayerTime,
    flow: extras.flow,
    seam: extras.seam,
    outerWallFirst: extras.outerWallFirst,
    // A support operation prints with supports under every overhang, whatever the panel's choice was.
    supportType: operation === "support" && extras.supportType === "none" ? "minimal" : extras.supportType,
    supportOverhangAngle: extras.supportAngle,
    supportDensity: extras.supportDensity,
    supportXYGap: extras.supportXYGap,
    supportZGap: extras.supportZGap,
    supportInterfaceLayers: extras.supportInterfaceLayers,
    // The operation can ask for the adhesion on its own (a raft or a brim operation), whatever the panel says.
    adhesion: operation === "raft" ? "raft" : operation === "brim" && extras.adhesion === "none" ? "brim" : extras.adhesion,
    raftLayers: extras.raftLayers,
    brimWidth: extras.brimWidth,
    skirtLoops: extras.skirtLoops,
    skirtDistance: extras.skirtDistance,
    vase: operation === "vase",
    flavor: extras.flavor,
    relativeExtrusion: extras.relativeExtrusion,
    pressureAdvance: extras.pressureAdvance,
    acceleration: extras.acceleration,
    autoOrient: extras.printOrientation === "auto-optimal",
    material: extras.filament,
    nozzleDiameter: settings.nozzleDiameter,
    bedWidth: settings.bedWidth,
    bedDepth: settings.bedDepth,
    buildHeight: settings.buildHeight,
    centerOnBed: settings.centerOnBed,
    bedOrigin: settings.bedOrigin,
    ...(extras.startGcode !== undefined ? { startGcode: extras.startGcode } : {}),
    ...(extras.endGcode !== undefined ? { endGcode: extras.endGcode } : {})
  }
}

/**
 * The panel's print profile as the kernel takes it (`PrintRequirement`): the same choices `printerSettingsOf` gives the generator,
 * so the verified print and the quick one slice the same way. Speeds and temperatures are the panel's; the kernel limits them to
 * what the chosen printer can do.
 */
export const printRequirementOf = (settings: ToolpathSettings, extras: PrinterExtras): PrintRequirement => {
  const operation = settings.operationType
  const adhesion = operation === "raft" ? "raft" : operation === "brim" && extras.adhesion === "none" ? "brim" : extras.adhesion
  const supports = operation === "support" && extras.supportType === "none" ? "minimal" : extras.supportType
  return {
    layerHeight: settings.layerHeight,
    ...(extras.firstLayerHeight > 0 ? { firstLayerHeight: extras.firstLayerHeight } : {}),
    walls: extras.shellCount, topLayers: extras.topLayers, bottomLayers: extras.bottomLayers,
    infillDensity: operation === "infill" ? 100 : extras.infillDensity,
    infillPattern: operation === "infill" ? "lines" : extras.infillPattern,
    supports: supports === "none" ? "none" : supports === "full" ? "everywhere" : "buildplate",
    supportAngle: extras.supportAngle,
    adhesion, brimWidth: extras.brimWidth,
    printSpeed: settings.printSpeed, nozzleTemperature: settings.printTemperature, bedTemperature: settings.bedTemperature,
    fan: extras.fanSpeed, vase: operation === "vase",
    orientation: extras.printOrientation === "auto-optimal" ? "auto" : "as-designed",
    seam: extras.seam, retractionDistance: extras.retractionDistance, zHop: extras.zHop, flow: extras.flow, relativeExtrusion: extras.relativeExtrusion
  }
}

const warningsIn = (gcode: string): string[] =>
  gcode.split("\n").filter(line => line.startsWith("; Warning:")).map(line => line.slice("; Warning:".length).trim())

/** Raw text for a request, before the post passes. `error` is set when nothing can be generated. */
const text = (request: GenerateRequest): { gcode: string; error?: string; warnings?: ReadonlyArray<string>; print?: PrintStats; checks?: ReadonlyArray<PrintCheck> } => {
  const { settings, geometry, printer } = request
  const options = request.stamp !== undefined ? { stamp: request.stamp } : {}
  switch (settings.machineType) {
    case "mill": {
      if (settings.operationType === "multiaxis") {
        const outcome = multiaxisProgram(settings, geometry as GeometryInput, request.machine, options)
        return { gcode: outcome.gcode, warnings: outcome.warnings, ...(outcome.error !== undefined ? { error: outcome.error } : {}) }
      }
      return { gcode: generateMillGCode(settings, geometry as GeometryInput, options) }
    }
    case "lathe": {
      if (settings.operationType === "turning" && settings.turningOperation === "external" && geometry.selectedElements.length > 0) {
        const profile = geometry.selectedElements.length === 1 ? turnedProfileOf(geometry.selectedElements as never) : undefined
        if (profile === undefined) return { gcode: "", error: "External turning requires one untransformed parametric part with a full revolution profile." }
        return { gcode: generateLatheGCode(settings, options, profile) }
      }
      return { gcode: generateLatheGCode(settings, options) }
    }
    case "3dprinter": {
      if (geometry.selectedElements.length === 0) return { gcode: "; Error: No element selected for 3D printing\n", error: "Please select a CAD element for 3D printing." }
      const program = generate3DPrinterProgram(geometry.selectedElements, printerSettingsOf(settings, printer))
      return { gcode: program.gcode, ...(program.error !== undefined ? { error: program.error } : {}), ...(program.stats !== undefined ? { print: program.stats } : {}), ...(program.checks !== undefined ? { checks: program.checks } : {}) }
    }
  }
}

export interface GenerateOutcome {
  readonly response: GenerateResponse
  /** Set when the request was valid but nothing could be generated (legacy: a toast + an error comment). */
  readonly error?: string
}

/** The steps a generate run goes through, in order; a step that the request switches off is not reported. */
export type GenerateStage = "toolpath" | "optimize" | "arcs" | "feeds" | "analysis" | "cycles" | "record"

/** Where a generate run is: the step about to start and its place among the steps this request runs. */
export interface GenerateProgress {
  readonly stage: GenerateStage
  readonly step: { readonly index: number; readonly count: number }
}

export interface GenerateRunOptions {
  /** Called before each step. The run is synchronous: a host that wants the callback delivered while it works runs it in a worker. */
  readonly onProgress?: (progress: GenerateProgress) => void
}

export const generateToolpath = (request: GenerateRequest, options: GenerateRunOptions = {}): GenerateOutcome => {
  const { settings } = request
  // Multi-axis text is written by a post (rotary words, TCP codes): the text passes below would not understand B and C.
  const multiaxis = settings.operationType === "multiaxis"
  // The text passes know X Y Z and F, not the extruder: on a printer they would drop extruding moves and write arcs without E.
  const printer = settings.machineType === "3dprinter"
  const optimize = !multiaxis && !printer && settings.optimizePath
  const arcs = !multiaxis && !printer && settings.useArcFitting
  // Feed that follows the path is a mill's concern: a printer or a lathe has its own feed model.
  const feeds = !multiaxis && settings.useAdaptiveFeeds && settings.machineType === "mill"
  const evidence = request.evidence !== false
  const stages: ReadonlyArray<GenerateStage> = [
    "toolpath", ...(optimize ? ["optimize" as const] : []), ...(arcs ? ["arcs" as const] : []), ...(feeds ? ["feeds" as const] : []),
    "analysis", "cycles", ...(evidence ? ["record" as const] : [])
  ]
  const enter = (stage: GenerateStage): void => options.onProgress?.({ stage, step: { index: stages.indexOf(stage), count: stages.length } })
  enter("toolpath")
  const generated = text(request)
  let gcode = generated.gcode
  if (optimize) { enter("optimize"); gcode = optimizeToolpath(gcode, settings.tolerance) }
  if (arcs) { enter("arcs"); gcode = convertLinesToArcs(gcode, settings.tolerance) }
  if (feeds) { enter("feeds"); gcode = adaptFeeds(gcode, settings.toolDiameter) }
  enter("analysis")
  const analysis = analyseGcode(gcode, `${settings.machineType}-${settings.operationType}`)
  enter("cycles")
  const cycles = detectFixedCycles(gcode)
  if (evidence) enter("record")
  return {
    response: {
      gcode,
      cycles,
      warnings: [...warningsIn(gcode), ...(generated.warnings ?? [])],
      stats: analysis.stats,
      program: analysis.program,
      ...(evidence ? { evidence: programRecord(request, gcode, analysis.stats, generated.error, generated.checks) } : {}),
      ...(generated.print !== undefined ? { print: generated.print } : {})
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
