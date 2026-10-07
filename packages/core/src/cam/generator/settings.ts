/**
 * Settings helpers of the toolpath generator: machine / material presets, cutting statistics,
 * operation descriptions, material properties and the deterministic "AI" suggestions.
 *
 * Ports the legacy `gCodeGenerationUtils`, `operationDescriptions` and `materialProperties`
 * libraries and the panel's preset effects. The settings model itself lives in `schema.ts`.
 */
import {
  DEFAULT_SETTINGS,
  type LatheOperationType,
  type MachineType,
  type MaterialType,
  type MillOperationType,
  type OperationType,
  type PrinterOperationType,
  type ToolpathSettings
} from "./schema.ts"

export type { AllToolType, GeometryType, LatheOperationType, MachineType, MaterialType, MillOperationType, OperationType, OriginType, PrinterOperationType, ToolType, ToolpathSettings } from "./schema.ts"

/** Section ids in the order the legacy panel renders them, with their initial expanded state. */
export const DEFAULT_EXPANDED: Readonly<Record<string, boolean>> = {
  machine: true,
  operation: true,
  material: true,
  tool: false,
  cutting: false,
  advanced: false,
  ai: false,
  printer: true,
  lathe: false,
  origin: true,
  fixedCycles: false
}

export const MILL_OPERATIONS: ReadonlyArray<MillOperationType> =
  ["contour", "pocket", "drill", "engrave", "profile", "threading", "3d_surface", "probing"]
export const LATHE_OPERATIONS: ReadonlyArray<LatheOperationType> =
  ["facing", "turning", "boring", "threading", "grooving", "parting", "knurling"]
export const PRINTER_OPERATIONS: ReadonlyArray<PrinterOperationType> =
  ["standard", "vase", "support", "infill", "raft", "brim"]

export const operationsFor = (machine: MachineType): ReadonlyArray<OperationType> =>
  machine === "mill" ? MILL_OPERATIONS : machine === "lathe" ? LATHE_OPERATIONS : PRINTER_OPERATIONS

/** Feed / plunge / rpm applied when the material select changes. `undefined` = keep the current values. */
export const MATERIAL_PRESETS: Readonly<Partial<Record<MaterialType, { feedrate: number; plungerate: number; rpm: number }>>> = {
  aluminum: { feedrate: 800, plungerate: 300, rpm: 12000 },
  steel: { feedrate: 400, plungerate: 150, rpm: 8000 },
  wood: { feedrate: 1200, plungerate: 500, rpm: 15000 },
  plastic: { feedrate: 600, plungerate: 200, rpm: 10000 },
  brass: { feedrate: 600, plungerate: 200, rpm: 10000 },
  titanium: { feedrate: 200, plungerate: 100, rpm: 6000 }
}

/** Patch applied when the machine type changes and the current operation does not belong to it. */
export const withMachineDefaults = (settings: ToolpathSettings): ToolpathSettings => {
  const valid = operationsFor(settings.machineType) as ReadonlyArray<string>
  if (valid.includes(settings.operationType)) return settings
  switch (settings.machineType) {
    case "mill": return { ...settings, operationType: "contour", toolType: "endmill" }
    case "lathe": return { ...settings, operationType: "turning", toolType: "turning" }
    case "3dprinter": return { ...settings, operationType: "standard", toolType: "standard" }
  }
}

export const withMaterialDefaults = (settings: ToolpathSettings): ToolpathSettings => {
  const preset = MATERIAL_PRESETS[settings.material]
  return preset ? { ...settings, ...preset } : settings
}

// -- cutting statistics (legacy `gCodeGenerationUtils`) -------------------------------------

export interface CuttingStatistics {
  readonly cuttingSpeed: number
  readonly chipLoad: number
  readonly materialRemovalRate: number
  readonly effectiveStepover: number
}

const CHIP_LOAD: Readonly<Record<string, number>> = {
  aluminum: 0.033, steel: 0.018, wood: 0.076, plastic: 0.038, brass: 0.033, titanium: 0.013, composite: 0.025, other: 0.02
}

export const calculateOptimalChipLoad = (material: string, toolDiameter: number, _flutes: number): number =>
  (CHIP_LOAD[material] || 0.02) * Math.pow(toolDiameter / 6, 0.3)

export const calculateCuttingStatistics = (s: ToolpathSettings): CuttingStatistics => {
  const chipLoad = s.feedrate / (s.rpm * s.flutes)
  const cuttingSpeed = (Math.PI * s.toolDiameter * s.rpm) / 1000
  const effectiveStepover = (s.stepover / 100) * s.toolDiameter
  const materialRemovalRate = (s.feedrate * effectiveStepover * s.stepdown) / 1000
  return {
    cuttingSpeed: parseFloat(cuttingSpeed.toFixed(1)),
    chipLoad: parseFloat(chipLoad.toFixed(3)),
    materialRemovalRate: parseFloat(materialRemovalRate.toFixed(2)),
    effectiveStepover: parseFloat(effectiveStepover.toFixed(2))
  }
}

export const calculateRecommendedPlungeRate = (feedrate: number): number => Math.round(feedrate * 0.4)

export const isFeedRateOptimal = (s: ToolpathSettings): boolean => {
  const optimal = calculateOptimalChipLoad(s.material, s.toolDiameter, s.flutes)
  const actual = s.feedrate / (s.rpm * s.flutes)
  return actual >= optimal * 0.85 && actual <= optimal * 1.15
}

const MATERIAL_IT: Readonly<Record<string, string>> = {
  aluminum: "alluminio", steel: "acciaio", wood: "legno", brass: "ottone", plastic: "plastica", titanium: "titanio", composite: "composito"
}

export const getCuttingFeedback = (s: ToolpathSettings): string => {
  const actual = s.feedrate / (s.rpm * s.flutes)
  const optimal = calculateOptimalChipLoad(s.material, s.toolDiameter, s.flutes)
  if (isFeedRateOptimal(s)) return `✓ Avanzamento ottimale per ${MATERIAL_IT[s.material] ?? "questo materiale"}`
  if (actual < optimal * 0.85) return `⚠️ Avanzamento troppo basso per ${s.material}. Prova ad aumentarlo.`
  return `⚠️ Avanzamento troppo alto per ${s.material}. Considera di ridurlo.`
}

// -- operation descriptions (legacy `operationDescriptions`) --------------------------------

export interface OperationDescription { readonly title: string; readonly description: string }

const OPERATION_DESCRIPTIONS: Readonly<Record<string, OperationDescription>> = {
  contour: { title: "Contouring", description: "Contouring - Follows the external or internal profile of the part while maintaining vertical walls." },
  pocket: { title: "Pocket Clearing", description: "Pocket Clearing - Removes material inside a closed profile creating a cavity." },
  drill: { title: "Drilling", description: "Drilling - Creates vertical holes of a defined depth." },
  engrave: { title: "Engraving", description: "Engraving - Traces shallow lines following a path." },
  profile: { title: "3D Profile", description: "3D Profile - Follows a three-dimensional profile varying the working depth." },
  threading: { title: "Threading", description: "Threading - Creates internal or external threads with a milling cutter or tap." },
  "3d_surface": { title: "3D Surface", description: "3D Surface - Works on complex three-dimensional surfaces with optimized paths." },
  probing: { title: "Probing", description: "Probing - A touch probe or tool setter finds the work zero (surface, edge, corner, bore, boss) or a tool length and writes it to the work offset. The spindle stays off." },
  turning: { title: "Turning", description: "Turning - Creates external cylindrical surfaces by removing material radially." },
  facing: { title: "Facing", description: "Facing - Creates flat surfaces perpendicular to the axis of rotation." },
  boring: { title: "Boring", description: "Boring - Widens or precisely finishes holes or internal surfaces." },
  standard: { title: "Standard Printing", description: "Standard Printing - Prints with normal parameters for balanced quality and speed." },
  vase: { title: "Vase (Spiral)", description: "Vase (Spiral) - Prints in continuous spiral mode without seams for hollow objects." }
}

export const getOperationDescription = (operationType: string): OperationDescription =>
  OPERATION_DESCRIPTIONS[operationType] ?? { title: "Custom Operation", description: "Custom operation with user-defined parameters." }

// -- material properties (legacy `materialProperties`) --------------------------------------

export interface MaterialPropertyDetail {
  readonly density: string
  readonly hardness: string
  readonly thermalBehavior: string
  readonly chipType: string
  readonly coolant: string
  readonly recommendedToolCoating?: string
  readonly machinability?: string
  readonly feedrateModifier?: number
  readonly speedModifier?: number
}

export const materialProperties: Readonly<Record<string, MaterialPropertyDetail>> = {
  aluminum: { density: "2.7 g/cm³", hardness: "Medium-low", thermalBehavior: "High thermal conductivity", chipType: "Long and continuous chips", coolant: "Recommended", recommendedToolCoating: "TiAlN, AlTiN", machinability: "Excellent", feedrateModifier: 1.0, speedModifier: 1.0 },
  steel: { density: "7.85 g/cm³", hardness: "Medium-high", thermalBehavior: "Medium thermal conductivity", chipType: "Ribbon or segmented chips", coolant: "Required", recommendedToolCoating: "TiCN, AlTiN", machinability: "Good", feedrateModifier: 0.6, speedModifier: 0.5 },
  wood: { density: "0.4-1.2 g/cm³", hardness: "Variable", thermalBehavior: "Low thermal conductivity", chipType: "Fibrous chips", coolant: "Not required", recommendedToolCoating: "Not required", machinability: "Excellent", feedrateModifier: 1.2, speedModifier: 1.2 },
  plastic: { density: "0.9-2.2 g/cm³", hardness: "Low", thermalBehavior: "Heat sensitive", chipType: "Melted or curled chips", coolant: "Compressed air", recommendedToolCoating: "Not required", machinability: "Good", feedrateModifier: 0.8, speedModifier: 0.9 },
  brass: { density: "8.4-8.7 g/cm³", hardness: "Medium", thermalBehavior: "High thermal conductivity", chipType: "Short chips", coolant: "Recommended", recommendedToolCoating: "TiN", machinability: "Excellent", feedrateModifier: 1.0, speedModifier: 0.8 },
  titanium: { density: "4.5 g/cm³", hardness: "High", thermalBehavior: "Low thermal conductivity", chipType: "Segmented chips", coolant: "High pressure required", recommendedToolCoating: "AlTiN, TiAlN", machinability: "Difficult", feedrateModifier: 0.3, speedModifier: 0.2 },
  composite: { density: "1.0-2.0 g/cm³", hardness: "Variable", thermalBehavior: "Low thermal conductivity", chipType: "Abrasive chips", coolant: "Recommended", recommendedToolCoating: "Diamond", machinability: "Moderate", feedrateModifier: 0.7, speedModifier: 0.6 },
  other: { density: "Variable", hardness: "Variable", thermalBehavior: "Variable", chipType: "Variable", coolant: "Consult specifications", machinability: "Variable" }
}

// -- AI suggestions (legacy `generateAISuggestions`, deterministic text) ---------------------

export const aiSuggestionsFor = (s: ToolpathSettings): ReadonlyArray<string> => {
  switch (s.machineType) {
    case "mill":
      return [
        `For ${s.material} with a ${s.toolDiameter}mm cutter, a feed rate of ${s.material === "aluminum" ? 800 : s.material === "steel" ? 400 : 600} mm/min is recommended.`,
        `With a depth of ${s.depth}mm, we suggest increments of ${Math.min(s.toolDiameter / 4, 1).toFixed(1)}mm for better results.`,
        `To optimize tool life on ${s.material}, consider ${s.material === "steel" || s.material === "titanium" ? "high-pressure coolant" : "standard coolant"}.`
      ]
    case "lathe":
      return [
        `For turning ${s.material}, the recommended feed rate is ${s.material === "aluminum" ? 0.2 : s.material === "steel" ? 0.15 : 0.25} mm/rev.`,
        `Recommended depth of cut: ${s.material === "aluminum" ? 1.5 : s.material === "steel" ? 0.8 : 1.0}mm for roughing.`,
        `Optimal cutting speed: ${s.material === "aluminum" ? 300 : s.material === "steel" ? 150 : 200} m/min.`
      ]
    case "3dprinter":
      return [
        `The recommended temperature for ${s.material === "plastic" ? "PLA" : s.material} is ${s.material === "plastic" ? "200-220°C" : "240-260°C"}.`,
        `For a layer height of ${s.layerHeight}mm, a print speed of ${s.printSpeed}mm/s is optimal.`,
        `Recommended bed temperature: ${s.material === "plastic" ? "60°C for PLA, 80°C for PETG" : "100-110°C for ABS/ASA"}.`
      ]
  }
}
