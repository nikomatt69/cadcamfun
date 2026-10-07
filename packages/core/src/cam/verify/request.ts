/**
 * Bridge from a generator request to a verification request: the tool comes from the settings, the
 * stock box from the stock and origin section of the panel, the program from the G-code.
 */
import { analyseGcode } from "../generator/analysis.ts"
import { originShift } from "../generator/dispatch.ts"
import type { GenerateRequest, ToolpathSettings } from "../generator/schema.ts"
import type { VerifyBounds, VerifyRequest, VerifyTool, VerifyToolKind } from "./schema.ts"

/** What a caller may add to (or replace in) what the settings already say. */
export interface VerifyOverrides {
  readonly tool?: Partial<VerifyTool>
  readonly stock?: VerifyBounds
  readonly fixtures?: VerifyRequest["fixtures"]
  readonly target?: VerifyRequest["target"]
  readonly resolution?: number
  readonly tolerance?: number
}

export type VerifyRequestResult =
  | { readonly ok: true; readonly request: VerifyRequest }
  | { readonly ok: false; readonly error: string }

const MILL_TOOLS: Readonly<Record<string, { readonly kind: VerifyToolKind; readonly angle?: number }>> = {
  endmill: { kind: "endmill" },
  ballnose: { kind: "ballnose" },
  drill: { kind: "drill" },
  vbit: { kind: "vbit" },
  chamfer: { kind: "vbit", angle: 90 },
  threadmill: { kind: "endmill" },
  reamer: { kind: "endmill" }
}

/** Tool modelled by the settings, or `undefined` for lathe and printer tools. */
export const verifyToolOf = (settings: ToolpathSettings): VerifyTool | undefined => {
  if (settings.machineType !== "mill") return undefined
  const mapped = MILL_TOOLS[settings.toolType]
  if (mapped === undefined) return undefined
  return { kind: mapped.kind, diameter: settings.toolDiameter, ...(mapped.angle !== undefined ? { angle: mapped.angle } : {}) }
}

/** Stock box of the generator request in the coordinates of its G-code, or `undefined` without stock. */
export const verifyStockOf = (request: GenerateRequest): VerifyBounds | undefined => {
  const stock = request.geometry.stock
  if (stock === undefined) return undefined
  const { dx, dy } = originShift(request.settings, request.geometry as never)
  return {
    minX: stock.x + dx - stock.width / 2,
    maxX: stock.x + dx + stock.width / 2,
    minY: stock.y + dy - stock.height / 2,
    maxY: stock.y + dy + stock.height / 2,
    minZ: stock.topZ - stock.depth,
    maxZ: stock.topZ
  }
}

export const verifyRequestFor = (request: GenerateRequest, gcode: string, overrides: VerifyOverrides = {}): VerifyRequestResult => {
  const base = verifyToolOf(request.settings)
  if (base === undefined) return { ok: false, error: "Verification supports milling operations only" }
  let stock = overrides.stock ?? verifyStockOf(request)
  if (stock === undefined) {
    // No stock in the request: a box around the toolpath, top at Z0, so collisions and removal still make sense.
    const { bounds, minZ } = analyseGcode(gcode).stats
    const margin = request.settings.toolDiameter + 2
    stock = {
      minX: bounds.min.x - margin, maxX: bounds.max.x + margin,
      minY: bounds.min.y - margin, maxY: bounds.max.y + margin,
      minZ: Math.min(minZ, 0) - 5, maxZ: 0
    }
  }
  const tool: VerifyTool = { ...base, ...overrides.tool }
  return {
    ok: true,
    request: {
      gcode,
      stock,
      tool,
      fixtures: overrides.fixtures ?? [],
      ...(overrides.target !== undefined ? { target: overrides.target } : {}),
      ...(overrides.resolution !== undefined ? { resolution: overrides.resolution } : {}),
      tolerance: overrides.tolerance ?? 0.05
    }
  }
}
