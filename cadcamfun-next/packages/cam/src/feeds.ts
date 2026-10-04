import type { Machine } from "./machine"
import type { Material } from "./material"
import type { Tool } from "./tool"

export interface Feeds {
  /** Spindle speed, rev/min. */
  readonly rpm: number
  /** Cutting feed, mm/min. */
  readonly feed: number
  /** Plunge feed, mm/min. */
  readonly plunge: number
  /** Recommended max depth per pass, mm. */
  readonly stepDown: number
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * Classic feeds & speeds: rpm = Vc·1000 / (π·D), feed = rpm · flutes · chipLoad.
 * Chip load scales with diameter; HSS runs at ~40% of the carbide cutting speed.
 */
export const compute = (tool: Tool, material: Material, machine: Machine): Feeds => {
  const vc = material.cuttingSpeed * (tool.material === "hss" ? 0.4 : 1)
  const maxRpm = Math.min(machine.maxRpm, tool.maxRpm ?? Infinity)
  const rpm = Math.round(clamp((vc * 1000) / (Math.PI * tool.diameter), machine.minRpm, maxRpm))
  const chipLoad = material.chipLoad * (tool.diameter / 6)
  const feed = Math.round(clamp(rpm * tool.flutes * chipLoad, 10, machine.maxFeed))
  const plunge = Math.round(feed * (tool.kind === "drill" ? 0.5 : 0.3))
  const stepDown = Math.min(tool.fluteLength, tool.diameter * material.maxDepthRatio)
  return { rpm, feed, plunge, stepDown: Math.round(stepDown * 100) / 100 }
}
