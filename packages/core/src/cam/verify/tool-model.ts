/**
 * Geometric model of a cutter, shank and holder, as a stack of coaxial zones measured from the tip.
 *
 *   tip ── flutes (cutting profile) ── shank ── holder
 *
 * The flutes remove material; the shank and the holder must never touch it.
 */
import type { VerifyTool } from "./schema.ts"

export interface ToolZone {
  readonly radius: number
  /** Height range above the tip, mm. */
  readonly from: number
  readonly to: number
  readonly part: "flutes" | "shank" | "holder"
}

export interface ToolModel {
  readonly radius: number
  /** `true` when the cutting profile is flat, so the stamp needs no square root. */
  readonly flat: boolean
  /** Height of the cutting surface above the tip at radial distance `r` (0 ≤ r ≤ radius). */
  readonly profile: (r: number) => number
  /** Flute length, or `undefined` when unknown (then no shank check is possible). */
  readonly fluteLength: number | undefined
  readonly shankRadius: number
  /** Holder face above the tip, or `undefined`. */
  readonly holderStart: number | undefined
  readonly holderRadius: number | undefined
  /** Solid envelope used against fixtures. */
  readonly zones: ReadonlyArray<ToolZone>
}

const DRILL_POINT_ANGLE = 118
const DEFAULT_VBIT_ANGLE = 60

export const toolModel = (tool: VerifyTool): ToolModel => {
  const radius = tool.diameter / 2
  const kind = tool.kind ?? "endmill"
  const corner = kind === "ballnose" ? radius : Math.min(tool.tipRadius ?? 0, radius)
  const cone = (angle: number): ((r: number) => number) => {
    const slope = Math.tan((angle * Math.PI) / 360)
    return (r) => r / slope
  }
  let profile: (r: number) => number
  let flat = false
  if (kind === "vbit") profile = cone(tool.angle ?? DEFAULT_VBIT_ANGLE)
  else if (kind === "drill") profile = cone(tool.angle ?? DRILL_POINT_ANGLE)
  else if (corner > 0) {
    const inner = radius - corner
    profile = (r) => (r <= inner ? 0 : corner - Math.sqrt(Math.max(0, corner * corner - (r - inner) * (r - inner))))
  } else {
    profile = () => 0
    flat = true
  }

  const fluteLength = tool.cuttingLength
  const shankRadius = (tool.shankDiameter ?? tool.diameter) / 2
  const holderStart = tool.holderDiameter !== undefined ? (tool.stickout ?? fluteLength) : undefined
  const holderRadius = tool.holderDiameter !== undefined ? tool.holderDiameter / 2 : undefined

  // Envelope: unknown lengths fall back to a few diameters so the cutter still has a body.
  const fluteTo = fluteLength ?? tool.stickout ?? 4 * tool.diameter
  const shankTo = tool.stickout ?? fluteTo
  const zones: ToolZone[] = [{ radius, from: 0, to: fluteTo, part: "flutes" }]
  if (shankTo > fluteTo) zones.push({ radius: shankRadius, from: fluteTo, to: shankTo, part: "shank" })
  if (holderRadius !== undefined && holderStart !== undefined) {
    zones.push({ radius: holderRadius, from: holderStart, to: holderStart + (tool.holderLength ?? 40), part: "holder" })
  }
  return { radius, flat, profile, fluteLength, shankRadius, holderStart, holderRadius, zones }
}
