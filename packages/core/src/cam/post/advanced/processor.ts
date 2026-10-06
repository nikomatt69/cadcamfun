/**
 * The advanced post-processor entry point: `processGCode(controller, code, options)`.
 *
 * Routing (as in the legacy class): Fanuc -> Fanuc pipeline; Haas -> Fanuc pipeline plus a note; Heidenhain ->
 * conversational conversion; Siemens / Mazak / Okuma / Generic -> the dialect-neutral pipeline with a banner.
 * The pass order inside each pipeline is the legacy order, so the same inputs give the same text.
 */
import { addGenericHeader, consolidateGCodes, optimizeRapidMovements, removeComments, removeExcessEmptyLines, validateGeneric } from "./common.ts"
import {
  applyAdvancedFanucOptimizations,
  applyFanucCornerRounding,
  applyFanucHighSpeedMode,
  fanucBasicOptimize,
  validateFanuc
} from "./fanuc.ts"
import {
  applyAdvancedHeidenhainOptimizations,
  applyHeidenhainFunctionBlocks,
  applyHeidenhainTCPMode,
  convertToHeidenhain,
  validateHeidenhain
} from "./heidenhain.ts"
import { capitalise, mergeOptions, type ControllerType, type OptimizationOptions, type OptimizationOptionsInput, type OptimizationResult } from "./options.ts"
import { lineCount } from "./text.ts"

export interface ProcessOptions {
  readonly options?: OptimizationOptionsInput
  /** Clock for the generic banner's date line (tests pin it). */
  readonly now?: Date
}

const percent = (original: number, optimized: number): number => parseFloat((((original - optimized) / original) * 100).toFixed(2))

const processFanuc = (code: string, options: OptimizationOptions): OptimizationResult => {
  const basic = fanucBasicOptimize(code)
  let processed = basic.code
  const improvements = [...basic.improvements]

  if (options.useHighSpeedMode) {
    processed = applyFanucHighSpeedMode(processed, options)
    improvements.push("Applicata modalità di alta velocità (AICC/Nano Smoothing)")
  }
  if (options.controllerSpecific.fanuc.useAI) improvements.push("Applicato AI Contour Control per movimenti più fluidi")
  if (options.controllerSpecific.fanuc.useCornerRounding) {
    processed = applyFanucCornerRounding(processed)
    improvements.push("Ottimizzato raccordi e angoli per una lavorazione più fluida")
  }
  processed = applyAdvancedFanucOptimizations(processed, options)

  const originalLines = lineCount(code)
  const optimizedLines = lineCount(processed)
  return {
    code: processed,
    improvements,
    stats: {
      originalLines,
      optimizedLines,
      reductionPercent: percent(originalLines, optimizedLines),
      estimatedTimeReduction: basic.stats.estimatedTimeReduction * 1.2, // +20% with the advanced passes
      minorWarnings: [],
      majorWarnings: []
    },
    validation: validateFanuc(processed)
  }
}

const processHeidenhain = (code: string, options: OptimizationOptions): OptimizationResult => {
  const heidenhain = options.controllerSpecific.heidenhain
  const improvements: string[] = []

  let processed = convertToHeidenhain(code)
  improvements.push("Convertito al formato Heidenhain")

  if (heidenhain.useConversationalFormat) improvements.push("Applicato formato conversazionale Heidenhain")
  if (heidenhain.useTCP) {
    processed = applyHeidenhainTCPMode(processed)
    improvements.push("Aggiunto supporto TCPM per lavorazioni avanzate")
  }
  if (heidenhain.useFunctionBlocks) {
    processed = applyHeidenhainFunctionBlocks(processed)
    improvements.push("Ottimizzato con Function Blocks per ridurre la complessità del programma")
  }
  if (heidenhain.useCycleDefine) improvements.push("Ottimizzati cicli di lavorazione")

  processed = applyAdvancedHeidenhainOptimizations(processed)
  improvements.push("Applicate ottimizzazioni avanzate specifiche Heidenhain")

  const originalLines = lineCount(code)
  const optimizedLines = lineCount(processed)
  return {
    code: processed,
    improvements,
    stats: {
      originalLines,
      optimizedLines,
      reductionPercent: percent(originalLines, optimizedLines),
      estimatedTimeReduction: (originalLines - optimizedLines) * 0.015,
      minorWarnings: [],
      majorWarnings: []
    },
    validation: validateHeidenhain(processed)
  }
}

const processGeneric = (code: string, options: OptimizationOptions, controllerName: string, now: Date): OptimizationResult => {
  const improvements: string[] = []
  let processed = code

  if (options.removeEmptyLines) {
    processed = removeExcessEmptyLines(processed)
    improvements.push("Rimosse righe vuote in eccesso")
  }
  if (options.removeComments) {
    processed = removeComments(processed)
    improvements.push("Rimossi commenti")
  }
  if (options.optimizeRapidMoves) {
    processed = optimizeRapidMovements(processed)
    improvements.push("Ottimizzati movimenti rapidi")
  }
  if (options.consolidateGCodes) {
    processed = consolidateGCodes(processed)
    improvements.push("Consolidati G-code ridondanti")
  }
  processed = addGenericHeader(processed, controllerName, now)

  const originalLines = lineCount(code)
  const optimizedLines = lineCount(processed)
  return {
    code: processed,
    improvements,
    stats: {
      originalLines,
      optimizedLines,
      reductionPercent: percent(originalLines, optimizedLines),
      estimatedTimeReduction: (originalLines - optimizedLines) * 0.01,
      minorWarnings: [],
      majorWarnings: []
    },
    validation: validateGeneric(processed)
  }
}

/** Optimises / converts `code` for `controller`. Never throws: a failure comes back as an invalid result. */
export const processGCode = (controller: ControllerType, code: string, input: ProcessOptions = {}): OptimizationResult => {
  const options = mergeOptions(input.options)
  const now = input.now ?? new Date()
  try {
    switch (controller) {
      case "fanuc":
        return processFanuc(code, options)
      case "heidenhain":
        return processHeidenhain(code, options)
      case "haas": {
        const result = processFanuc(code, options)
        return { ...result, improvements: [...result.improvements, "Adattato per controller Haas"] }
      }
      case "siemens":
        return processGeneric(code, options, "Siemens", now)
      case "mazak":
        return processGeneric(code, options, "Mazak", now)
      case "okuma":
        return processGeneric(code, options, "Okuma", now)
      default:
        return processGeneric(code, options, capitalise("generic"), now)
    }
  } catch (error) {
    const lines = lineCount(code)
    return {
      code,
      improvements: ["Errore durante il post-processing"],
      stats: { originalLines: lines, optimizedLines: lines, reductionPercent: 0, estimatedTimeReduction: 0, minorWarnings: [], majorWarnings: [`Error: ${error}`] },
      validation: { isValid: false, errors: [`Processing error: ${error}`], warnings: [] }
    }
  }
}
