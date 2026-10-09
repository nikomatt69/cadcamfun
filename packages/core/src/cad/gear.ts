/**
 * A spur gear's outline: the real involute profile of ISO 53 / DIN 867 teeth, not a circle with bumps.
 *
 * Pitch radius `m z / 2`, tip radius `+ m`, root radius `- 1.25 m`, flanks the involute of the base circle `rp cos(alpha)`.
 * The outline is a simple counter-clockwise ring about the origin (tooth 0 centred on +X) that the editor extrudes, the CAM model
 * meshes and the assistant measures, so all three see the same gear. Pure; lengths in millimetres, the pressure angle in degrees.
 */
import type { Vec2 } from "./vec.ts"

export interface GearSpec {
  /** Module in millimetres: pitch diameter / teeth. */
  readonly moduleValue: number
  readonly teeth: number
  /** Pressure angle in degrees (20 is standard). */
  readonly pressureAngle?: number
}

export interface GearDimensions {
  readonly pitchRadius: number
  readonly baseRadius: number
  /** Outside radius: where the teeth end. */
  readonly tipRadius: number
  /** Radius of the gaps between the teeth. */
  readonly rootRadius: number
}

/** Fewest teeth the profile is defined for: below this the flanks undercut the base circle and the teeth overlap. */
export const MIN_GEAR_TEETH = 6

const involute = (alpha: number): number => Math.tan(alpha) - alpha

export const gearDimensions = (spec: GearSpec): GearDimensions => {
  const alpha = ((spec.pressureAngle ?? 20) * Math.PI) / 180
  const pitchRadius = (spec.moduleValue * spec.teeth) / 2
  return {
    pitchRadius,
    baseRadius: pitchRadius * Math.cos(alpha),
    tipRadius: pitchRadius + spec.moduleValue,
    rootRadius: pitchRadius - 1.25 * spec.moduleValue
  }
}

/**
 * The closed outline, one point ring. `flankPoints` points per flank (at least 2). The tip is pulled in when the teeth would
 * come to a point before the tip circle (few teeth, a large pressure angle).
 */
export const gearOutline = (spec: GearSpec, flankPoints = 8): ReadonlyArray<Vec2> => {
  const { teeth, moduleValue } = spec
  if (!(moduleValue > 0) || !Number.isInteger(teeth) || teeth < MIN_GEAR_TEETH) throw new RangeError(`A gear needs a module > 0 and at least ${MIN_GEAR_TEETH} whole teeth`)
  const alpha = (((spec.pressureAngle ?? 20) * Math.PI) / 180)
  if (!(alpha > 0 && alpha < Math.PI / 4)) throw new RangeError("The pressure angle must be between 0 and 45 degrees")
  const { pitchRadius, baseRadius, rootRadius } = gearDimensions(spec)
  let tip = gearDimensions(spec).tipRadius
  /** Half the tooth's angular thickness at radius r. */
  const half = (r: number): number => Math.PI / (2 * teeth) + involute(alpha) - involute(Math.acos(Math.min(1, baseRadius / r)))
  // Pull the tip in to where the tooth is still 2% of a pitch wide.
  const minHalf = (Math.PI / teeth) * 0.02
  if (half(tip) < minHalf) {
    let lo = pitchRadius, hi = tip
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (half(mid) < minHalf) hi = mid; else lo = mid }
    tip = lo
  }
  const start = Math.max(baseRadius, rootRadius)
  const n = Math.max(2, Math.floor(flankPoints))
  const flank = Array.from({ length: n }, (_, k) => {
    const r = start + ((tip - start) * k) / (n - 1)
    return { r, phi: half(r) }
  })
  const pitch = (2 * Math.PI) / teeth
  const ring: Vec2[] = []
  const put = (r: number, angle: number) => ring.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) })
  for (let i = 0; i < teeth; i++) {
    const c = i * pitch
    // Up the trailing flank, over the tip, down the leading flank, then along the root to the next tooth.
    if (rootRadius < start) put(rootRadius, c - flank[0]!.phi)
    for (const { r, phi } of flank) put(r, c - phi)
    const top = flank[flank.length - 1]!
    for (let k = 1; k < 3; k++) put(top.r, c - top.phi + (2 * top.phi * k) / 3)
    for (const { r, phi } of [...flank].reverse()) put(r, c + phi)
    if (rootRadius < start) put(rootRadius, c + flank[0]!.phi)
    // The root arc between two teeth, a few points so the gap is round, not a chord.
    const from = c + flank[0]!.phi, to = c + pitch - flank[0]!.phi
    for (let k = 1; k <= 2; k++) put(Math.min(start, rootRadius), from + ((to - from) * k) / 3)
  }
  return ring
}
