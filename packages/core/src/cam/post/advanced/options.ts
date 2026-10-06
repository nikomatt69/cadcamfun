/**
 * Options, results and presets of the text-level ("advanced") post-processor.
 *
 * This is the port of the legacy `advanced-post-processor.ts` contract: G-code text in, optimised or converted
 * G-code text out, plus statistics and a validation report. It works on text (not on the toolpath IR), so it can
 * post-process a program the user pasted or edited by hand.
 */

export type ControllerType = "fanuc" | "heidenhain" | "siemens" | "haas" | "mazak" | "okuma" | "generic"

export const CONTROLLER_TYPES: ReadonlyArray<ControllerType> = ["fanuc", "heidenhain", "siemens", "haas", "mazak", "okuma", "generic"]

export interface FanucOptions {
  readonly useDecimalFormat: boolean
  readonly useModalGCodes: boolean
  /** AI Contour Control. */
  readonly useAI: boolean
  readonly useNanoSmoothing: boolean
  readonly useCornerRounding: boolean
  readonly useHighPrecisionMode: boolean
  readonly useCompactGCode: boolean
}

export interface HeidenhainOptions {
  readonly useConversationalFormat: boolean
  readonly useFunctionBlocks: boolean
  readonly useCycleDefine: boolean
  readonly useParameterProgramming: boolean
  /** TCPM mode. */
  readonly useTCP: boolean
  readonly useRadiusCompensation3D: boolean
  readonly useSmartTurning: boolean
}

export interface OptimizationOptions {
  readonly removeRedundantMoves: boolean
  readonly removeRedundantCodes: boolean
  readonly optimizeRapidMoves: boolean
  readonly optimizeToolpaths: boolean
  readonly optimizeFeedrates: boolean
  readonly useHighSpeedMode: boolean
  readonly useLookAhead: boolean
  /** Tool Center Point, for 5-axis machines. */
  readonly useTCPMode: boolean
  readonly useArcOptimization: boolean
  readonly consolidateGCodes: boolean
  readonly removeEmptyLines: boolean
  readonly removeComments: boolean
  readonly minimizeAxisMovement: boolean
  readonly safetyChecks: boolean
  readonly controllerSpecific: {
    readonly fanuc: FanucOptions
    readonly heidenhain: HeidenhainOptions
  }
}

/** A deep-partial form of {@link OptimizationOptions}, as accepted by the processor. */
export type OptimizationOptionsInput = Partial<Omit<OptimizationOptions, "controllerSpecific">> & {
  readonly controllerSpecific?: {
    readonly fanuc?: Partial<FanucOptions>
    readonly heidenhain?: Partial<HeidenhainOptions>
  }
}

export interface Validation {
  readonly isValid: boolean
  readonly errors: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<string>
}

export interface OptimizationStats {
  readonly originalLines: number
  readonly optimizedLines: number
  readonly reductionPercent: number
  readonly estimatedTimeReduction: number
  readonly minorWarnings: ReadonlyArray<string>
  readonly majorWarnings: ReadonlyArray<string>
}

export interface OptimizationResult {
  readonly code: string
  readonly improvements: ReadonlyArray<string>
  readonly stats: OptimizationStats
  readonly validation: Validation
}

export const DEFAULT_OPTIONS: OptimizationOptions = {
  removeRedundantMoves: true,
  removeRedundantCodes: true,
  optimizeRapidMoves: true,
  optimizeToolpaths: true,
  optimizeFeedrates: true,
  useHighSpeedMode: false,
  useLookAhead: true,
  useTCPMode: false,
  useArcOptimization: true,
  consolidateGCodes: true,
  removeEmptyLines: true,
  removeComments: false,
  minimizeAxisMovement: true,
  safetyChecks: true,
  controllerSpecific: {
    fanuc: {
      useDecimalFormat: true,
      useModalGCodes: true,
      useAI: false,
      useNanoSmoothing: false,
      useCornerRounding: false,
      useHighPrecisionMode: false,
      useCompactGCode: true
    },
    heidenhain: {
      useConversationalFormat: true,
      useFunctionBlocks: true,
      useCycleDefine: true,
      useParameterProgramming: false,
      useTCP: false,
      useRadiusCompensation3D: false,
      useSmartTurning: true
    }
  }
}

/** Overlays `input` on the defaults, one level deep per controller block (the legacy merge). */
export const mergeOptions = (input: OptimizationOptionsInput = {}): OptimizationOptions => ({
  ...DEFAULT_OPTIONS,
  ...input,
  controllerSpecific: {
    fanuc: { ...DEFAULT_OPTIONS.controllerSpecific.fanuc, ...input.controllerSpecific?.fanuc },
    heidenhain: { ...DEFAULT_OPTIONS.controllerSpecific.heidenhain, ...input.controllerSpecific?.heidenhain }
  }
})

export type OptimizationPreset = "basic" | "speed" | "quality" | "advanced"

export const OPTIMIZATION_PRESETS: ReadonlyArray<OptimizationPreset> = ["basic", "speed", "quality", "advanced"]

type General = Omit<OptimizationOptions, "controllerSpecific">

const PRESETS: Readonly<Record<OptimizationPreset, { readonly general: General; readonly fanuc: FanucOptions; readonly heidenhain: HeidenhainOptions }>> = {
  basic: {
    general: {
      removeRedundantMoves: true, removeRedundantCodes: true, optimizeRapidMoves: true, optimizeToolpaths: false,
      optimizeFeedrates: true, useHighSpeedMode: false, useLookAhead: false, useTCPMode: false, useArcOptimization: true,
      consolidateGCodes: true, removeEmptyLines: true, removeComments: false, minimizeAxisMovement: false, safetyChecks: true
    },
    fanuc: { useDecimalFormat: true, useModalGCodes: true, useAI: false, useNanoSmoothing: false, useCornerRounding: false, useHighPrecisionMode: false, useCompactGCode: true },
    heidenhain: { useConversationalFormat: true, useFunctionBlocks: false, useCycleDefine: true, useParameterProgramming: false, useTCP: false, useRadiusCompensation3D: false, useSmartTurning: false }
  },
  speed: {
    general: {
      removeRedundantMoves: true, removeRedundantCodes: true, optimizeRapidMoves: true, optimizeToolpaths: true,
      optimizeFeedrates: true, useHighSpeedMode: true, useLookAhead: true, useTCPMode: false, useArcOptimization: true,
      consolidateGCodes: true, removeEmptyLines: true, removeComments: true, minimizeAxisMovement: true, safetyChecks: true
    },
    fanuc: { useDecimalFormat: true, useModalGCodes: true, useAI: true, useNanoSmoothing: true, useCornerRounding: true, useHighPrecisionMode: false, useCompactGCode: true },
    heidenhain: { useConversationalFormat: true, useFunctionBlocks: true, useCycleDefine: true, useParameterProgramming: false, useTCP: true, useRadiusCompensation3D: false, useSmartTurning: true }
  },
  quality: {
    general: {
      removeRedundantMoves: true, removeRedundantCodes: true, optimizeRapidMoves: true, optimizeToolpaths: true,
      optimizeFeedrates: true, useHighSpeedMode: false, useLookAhead: true, useTCPMode: true, useArcOptimization: true,
      consolidateGCodes: true, removeEmptyLines: true, removeComments: false, minimizeAxisMovement: false, safetyChecks: true
    },
    fanuc: { useDecimalFormat: true, useModalGCodes: true, useAI: false, useNanoSmoothing: false, useCornerRounding: false, useHighPrecisionMode: true, useCompactGCode: false },
    heidenhain: { useConversationalFormat: true, useFunctionBlocks: true, useCycleDefine: true, useParameterProgramming: true, useTCP: true, useRadiusCompensation3D: true, useSmartTurning: true }
  },
  advanced: {
    general: {
      removeRedundantMoves: true, removeRedundantCodes: true, optimizeRapidMoves: true, optimizeToolpaths: true,
      optimizeFeedrates: true, useHighSpeedMode: true, useLookAhead: true, useTCPMode: true, useArcOptimization: true,
      consolidateGCodes: true, removeEmptyLines: true, removeComments: false, minimizeAxisMovement: true, safetyChecks: true
    },
    fanuc: { useDecimalFormat: true, useModalGCodes: true, useAI: true, useNanoSmoothing: true, useCornerRounding: true, useHighPrecisionMode: true, useCompactGCode: true },
    heidenhain: { useConversationalFormat: true, useFunctionBlocks: true, useCycleDefine: true, useParameterProgramming: true, useTCP: true, useRadiusCompensation3D: true, useSmartTurning: true }
  }
}

/** The legacy panel's "Basic / Speed / Quality / Advanced" buttons: every option is set by the preset. */
export const applyPreset = (preset: OptimizationPreset, base: OptimizationOptions = DEFAULT_OPTIONS): OptimizationOptions => {
  const p = PRESETS[preset]
  return {
    ...base,
    ...p.general,
    controllerSpecific: {
      ...base.controllerSpecific,
      fanuc: { ...base.controllerSpecific.fanuc, ...p.fanuc },
      heidenhain: { ...base.controllerSpecific.heidenhain, ...p.heidenhain }
    }
  }
}

/** The "Specific optimizations ..." blurb the panel shows under the controller select. */
export const controllerDescription = (controller: ControllerType): string => {
  switch (controller) {
    case "fanuc":
      return "Specific optimizations for Fanuc controllers include support for High-Speed modes, AICC (AI Contour Control), Nano Smoothing, and corner rounding for smoother paths."
    case "heidenhain":
      return "Specific optimizations for Heidenhain controllers include conversational format, function blocks, advanced cycles, parameter programming, and TCPM support."
    case "siemens":
      return "Specific optimizations for Siemens/Sinumerik controllers include code compaction, look-ahead optimization, and support for advanced cycles."
    case "haas":
      return "Specific optimizations for Haas controllers include support for Haas-specific macros and cycles."
    case "mazak":
      return "Specific optimizations for Mazak controllers include SMOOTH mode and support for advanced cycles."
    case "okuma":
      return "Specific optimizations for Okuma controllers include OSP syntax and advanced cycles."
    default:
      return "Generic optimizations compatible with most CNC controllers."
  }
}

export const capitalise = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)
