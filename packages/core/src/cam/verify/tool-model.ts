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
  /** Every holder section from the holder face up (the first is `holderStart` / `holderRadius`); empty without a holder. */
  readonly holderTiers: ReadonlyArray<{ readonly from: number; readonly to: number; readonly radius: number }>
  /** Solid envelope used against fixtures. */
  readonly zones: ReadonlyArray<ToolZone>
}

const DRILL_POINT_ANGLE = 118
const DEFAULT_VBIT_ANGLE = 60

/**
 * Lower envelope of a half-section polyline: for each radius the least height at which the solid exists, as a lookup with linear
 * interpolation between the polyline's own radii (dense on arcs). Vertical segments (steps) contribute their lower end.
 */
const lowerEnvelope = (pts: ReadonlyArray<{ readonly r: number; readonly z: number }>): { readonly profile: (r: number) => number; readonly radius: number } => {
  const radii = [...new Set(pts.map((p) => p.r))].sort((a, b) => a - b)
  const zAt = (r: number): number => {
    let best = Infinity
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!, b = pts[i + 1]!
      const lo = Math.min(a.r, b.r), hi = Math.max(a.r, b.r)
      if (r < lo - 1e-12 || r > hi + 1e-12) continue
      const z = hi - lo < 1e-12 ? Math.min(a.z, b.z) : a.z + ((b.z - a.z) * (r - a.r)) / (b.r - a.r)
      if (z < best) best = z
    }
    return best
  }
  const z = radii.map(zAt)
  const profile = (r: number): number => {
    if (r <= radii[0]!) return z[0]!
    const last = radii.length - 1
    if (r >= radii[last]!) return z[last]!
    let lo = 0, hi = last
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (radii[mid]! <= r) lo = mid; else hi = mid }
    const t = (r - radii[lo]!) / (radii[hi]! - radii[lo]!)
    return z[lo]! + (z[hi]! - z[lo]!) * t
  }
  return { profile, radius: radii[radii.length - 1]! }
}

export const toolModel = (tool: VerifyTool): ToolModel => {
  const swept = tool.profile !== undefined && tool.profile.length >= 2 ? lowerEnvelope(tool.profile) : undefined
  const radius = swept?.radius ?? tool.diameter / 2
  const kind = tool.kind ?? "endmill"
  const corner = kind === "ballnose" ? radius : Math.min(tool.tipRadius ?? 0, radius)
  const cone = (angle: number): ((r: number) => number) => {
    const slope = Math.tan((angle * Math.PI) / 360)
    return (r) => r / slope
  }
  let profile: (r: number) => number
  let flat = false
  if (swept !== undefined) profile = swept.profile
  else if (kind === "vbit") profile = cone(tool.angle ?? DEFAULT_VBIT_ANGLE)
  else if (kind === "drill") profile = cone(tool.angle ?? DRILL_POINT_ANGLE)
  else if (corner > 0) {
    const inner = radius - corner
    profile = (r) => (r <= inner ? 0 : corner - Math.sqrt(Math.max(0, corner * corner - (r - inner) * (r - inner))))
  } else {
    profile = () => 0
    flat = true
  }
  if (swept !== undefined) flat = false

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
  const holderTiers: Array<{ from: number; to: number; radius: number }> = []
  if (holderRadius !== undefined && holderStart !== undefined) {
    let from = holderStart
    for (const section of [{ diameter: holderRadius * 2, length: tool.holderLength ?? 40 }, ...(tool.holderSteps ?? [])]) {
      holderTiers.push({ from, to: from + section.length, radius: section.diameter / 2 })
      zones.push(...(holderTiers.length > 1 ? [{ radius: section.diameter / 2, from, to: from + section.length, part: "holder" as const }] : []))
      from += section.length
    }
  }
  return { radius, flat, profile, fluteLength, shankRadius, holderStart, holderRadius, holderTiers, zones }
}
