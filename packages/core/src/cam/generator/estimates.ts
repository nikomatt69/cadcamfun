/**
 * 3D-print estimates of the legacy panel (`3DPrinterToolpathHelpers`): bounding dimensions, a suggested
 * parameter set, print time and material weight. Rough by design; they size expectations, not the G-code.
 */
import type { CadElement } from "./schema.ts"

export interface PrintDimensions { readonly width: number; readonly height: number; readonly depth: number; readonly volume: number }

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0)

export const extractElementDimensions = (e: CadElement | null | undefined): PrintDimensions => {
  if (!e) return { width: 0, height: 0, depth: 0, volume: 0 }
  switch (e["type"]) {
    case "cube": {
      const width = num(e["width"]), height = num(e["height"]), depth = num(e["depth"])
      return { width, height, depth, volume: width * height * depth }
    }
    case "sphere": {
      const r = num(e["radius"])
      return { width: r * 2, height: r * 2, depth: r * 2, volume: (4 / 3) * Math.PI * r ** 3 }
    }
    case "cylinder": {
      const r = num(e["radius"]), h = num(e["height"])
      return { width: r * 2, height: h, depth: r * 2, volume: Math.PI * r ** 2 * h }
    }
    case "cone": {
      const r = num(e["radius"]), h = num(e["height"])
      return { width: r * 2, height: h, depth: r * 2, volume: (1 / 3) * Math.PI * r ** 2 * h }
    }
    case "rectangle": return { width: num(e["width"]), height: num(e["height"]), depth: 0, volume: 0 }
    case "circle": case "polygon": return { width: num(e["radius"]) * 2, height: num(e["radius"]) * 2, depth: 0, volume: 0 }
    default: {
      const width = num(e["width"]) || num(e["size"]) || 50
      const height = num(e["height"]) || num(e["size"]) || 50
      const depth = num(e["depth"]) || num(e["size"]) || 10
      return { width, height, depth, volume: width * height * depth * 0.7 }
    }
  }
}

export const calculateOptimal3DPrintSettings = (e: CadElement | null | undefined) => {
  const { width, height, depth } = extractElementDimensions(e)
  const max = Math.max(width, height, depth)
  return {
    layerHeight: max < 30 ? 0.1 : max > 150 ? 0.3 : 0.2,
    infillDensity: max < 30 ? 30 : max > 150 ? 15 : 20,
    shellCount: 3,
    printSpeed: 60,
    supportType: depth > width / 2 ? ("minimal" as const) : ("none" as const)
  }
}

export interface PrintTimeOptions { readonly infillDensity: number; readonly supportType: "none" | "minimal" | "full"; readonly layerHeight: number }

/** Minutes, at least 10. */
export const estimatePrintTime = (e: CadElement | null | undefined, settings: { readonly printSpeed?: number }, options: PrintTimeOptions): number => {
  const { width, height, depth } = extractElementDimensions(e)
  const layers = Math.ceil(height / options.layerHeight)
  const layerArea = width * depth
  const infill = options.infillDensity / 100
  const support = options.supportType === "none" ? 0 : options.supportType === "minimal" ? 0.2 : 0.4
  const speed = settings.printSpeed || 60
  const perimeter = (2 * (width + depth) * layers) / (speed * 60)
  const infillTime = (layerArea * layers * infill) / (speed * 1.5 * 60)
  const supportTime = (layerArea * layers * support) / (speed * 2 * 60)
  return Math.max(10, Math.round((perimeter + infillTime + supportTime) * 1.2))
}

export interface MaterialOptions { readonly infillDensity: number; readonly shellCount: number; readonly supportType: "none" | "minimal" | "full"; readonly material: string }

/** Grams, at least 1. */
export const estimateMaterialUsage = (e: CadElement | null | undefined, options: MaterialOptions): number => {
  const { width, height, depth, volume } = extractElementDimensions(e)
  const density = options.material === "plastic" ? 1.24 : options.material === "aluminum" ? 2.7 : options.material === "wood" ? 0.8 : 1.24
  const shell = 2 * (width * depth + width * height + depth * height) * options.shellCount * 0.4
  const infill = (volume - shell) * (options.infillDensity / 100)
  const support = volume * (options.supportType === "none" ? 0 : options.supportType === "minimal" ? 0.15 : 0.3)
  const totalCm3 = (shell + infill + support) / 1000
  return Math.max(1, Math.round(totalCm3 * density * 10) / 10)
}
