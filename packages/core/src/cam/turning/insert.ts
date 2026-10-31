/**
 * Turning inserts and holders (spec 52 T1/T2): the ISO 1832 designation read into shape, point angle, inscribed circle, thickness
 * and nose radius; the holder's approach angle; the directions of the insert's two edges from the nose; and from them the contour
 * slopes the tool can generate without a flank touching the part (the "limit angles" of a holder catalogue).
 *
 * Geometry. The nose is the origin. The main edge leaves the nose at angle `180° - κ` from +z (towards +r, leaning back to +z when
 * `κ > 90°`), the other edge at `180° - κ - ε` where ε is the insert's point angle. A contour direction of travel `v` has the air on
 * its right (external) or left (internal); an edge `e` clears it when `e . n_air >= 0`. That gives, for longitudinal turning towards
 * the chuck, a largest slope down towards the chuck of `180° - κ - ε` and a largest slope up of `κ`.
 *
 * Source of the designation tables: ISO 1832:2017 (indexable inserts for cutting tools, designation), shape letter -> point angle,
 * clearance letter -> flank angle, thickness code -> mm, nose radius code -> tenths of a millimetre.
 */
import type { RZ } from "./geometry.ts"

/** ISO 1832 shape letters: point angle at the cutting corner, degrees (R is round: no corner). */
export const INSERT_SHAPES: Readonly<Record<string, { readonly angle: number; readonly name: string }>> = {
  C: { angle: 80, name: "rhombic 80" }, D: { angle: 55, name: "rhombic 55" }, E: { angle: 75, name: "rhombic 75" }, F: { angle: 50, name: "rhombic 50" },
  H: { angle: 120, name: "hexagonal" }, K: { angle: 55, name: "parallelogram 55" }, L: { angle: 90, name: "rectangular" }, M: { angle: 86, name: "rhombic 86" },
  O: { angle: 135, name: "octagonal" }, P: { angle: 108, name: "pentagonal" }, R: { angle: 180, name: "round" }, S: { angle: 90, name: "square" },
  T: { angle: 60, name: "triangular" }, V: { angle: 35, name: "rhombic 35" }, W: { angle: 80, name: "trigon 80" }
}

/** ISO 1832 clearance (relief) letters, degrees. */
export const CLEARANCE_ANGLES: Readonly<Record<string, number>> = { A: 3, B: 5, C: 7, D: 15, E: 20, F: 25, G: 30, N: 0, P: 11 }
/** ISO 1832 thickness codes, mm. */
export const THICKNESS: Readonly<Record<string, number>> = { "01": 1.59, "02": 2.38, T0: 3.97, T1: 1.98, T2: 2.38, T3: 3.97, "03": 3.18, "04": 4.76, "05": 5.56, "06": 6.35, "07": 7.94, "09": 9.52 }

/** Inscribed circle for the size code of a shape (ISO 1832: the size number is the circle diameter for C, S, R; the edge length for the others). */
const INSCRIBED: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  C: { "06": 6.35, "09": 9.525, "12": 12.7, "16": 15.875, "19": 19.05, "25": 25.4 },
  S: { "06": 6.35, "09": 9.525, "12": 12.7, "15": 15.875, "19": 19.05, "25": 25.4 },
  R: { "06": 6.0, "08": 8.0, "10": 10.0, "12": 12.0, "16": 16.0 },
  D: { "07": 6.35, "11": 9.525, "15": 12.7, "19": 15.875 },
  K: { "11": 6.35, "16": 9.525, "22": 12.7 },
  T: { "11": 6.35, "16": 9.525, "22": 12.7, "27": 15.875 },
  V: { "11": 6.35, "16": 9.525, "22": 12.7 },
  W: { "04": 6.35, "06": 9.525, "08": 12.7, "10": 15.875 }
}

export interface InsertDesignation {
  readonly code: string
  readonly shape: string
  /** Point angle at the cutting corner, degrees. */
  readonly angle: number
  readonly clearanceLetter: string
  /** Flank (relief) angle, degrees. */
  readonly clearance: number
  readonly tolerance: string
  readonly size: string
  /** Inscribed circle diameter, mm. */
  readonly inscribedCircle: number
  readonly thickness: number
  readonly noseRadius: number
}

/** Reads an ISO 1832 designation such as `CNMG120408` (the chip-breaker suffix after a dash is ignored). */
export const parseInsert = (designation: string): InsertDesignation => {
  const code = designation.trim().toUpperCase().split(/[-\s]/)[0]!
  const m = /^([A-Z])([A-Z])([A-Z])([A-Z])(\d{2})(T\d|\d{2})(\d{2})$/.exec(code)
  if (m === null) throw new RangeError(`'${designation}' is not an ISO 1832 insert designation such as CNMG120408`)
  const [, shape, clearanceLetter, tolerance, , size, thick, radius] = m as unknown as string[]
  const s = INSERT_SHAPES[shape!]
  if (s === undefined) throw new RangeError(`unknown ISO 1832 shape letter '${shape}'`)
  const clearance = CLEARANCE_ANGLES[clearanceLetter!]
  if (clearance === undefined) throw new RangeError(`unknown ISO 1832 clearance letter '${clearanceLetter}'`)
  const ic = INSCRIBED[shape!]?.[size!]
  if (ic === undefined) throw new RangeError(`size code ${size} is not in the table of shape ${shape}`)
  const thickness = THICKNESS[thick!]
  if (thickness === undefined) throw new RangeError(`unknown thickness code ${thick}`)
  return { code, shape: shape!, angle: s.angle, clearanceLetter: clearanceLetter!, clearance, tolerance: tolerance!, size: size!, inscribedCircle: ic, thickness, noseRadius: Number(radius) / 10 }
}

/** Holder side: where the tool points when it turns towards the chuck. */
export type HolderHand = "right" | "left" | "neutral"

export interface TurningTool {
  readonly id: string
  /** Turret station. */
  readonly number: number
  /** Offset register (default: the station). */
  readonly offset?: number
  readonly kind: "turning" | "boring" | "grooving" | "threading" | "parting"
  /** ISO 1832 designation of the insert (turning, boring, threading); a grooving or parting blade uses `bladeWidth`. */
  readonly insert?: string
  /** Nose radius, mm (default: from the designation). */
  readonly noseRadius?: number
  /** Holder approach angle κ, degrees (95 for a PCLNR, 93 for a DDJNR, 107.5 for a DVJNR). Default 95. */
  readonly approach?: number
  readonly hand?: HolderHand
  /** Grooving / parting blade: cutting width and projecting length, mm. */
  readonly bladeWidth?: number
  readonly bladeLength?: number
  /** Boring bar: diameter and overhang, mm (the smallest bore it enters is a little more than the diameter). */
  readonly barDiameter?: number
  readonly overhang?: number
  /** Thread insert pitch range or profile angle, degrees (default 60). */
  readonly profileAngle?: number
}

/** The directions (angle from +z towards +r, degrees) of the two edges that meet at the nose of an insert held at approach `kappa`. */
export const edgeDirections = (angle: number, kappa: number): { readonly main: number; readonly end: number } => ({ main: 180 - kappa, end: 180 - kappa - angle })

export interface ToolLimits {
  /** Largest slope (degrees from the z axis) the tool can generate going towards the chuck while the radius falls. */
  readonly maxDescend: number
  /** Largest slope the tool can generate going towards the chuck while the radius rises (a shoulder at 90, an undercut beyond). */
  readonly maxClimb: number
}

/** Limit angles of an external right-hand tool turning towards the chuck, from the insert's point angle and the holder's approach angle. */
export const toolLimits = (angle: number, kappa: number): ToolLimits => {
  const e = edgeDirections(angle, kappa)
  return { maxDescend: e.end, maxClimb: kappa }
}

/**
 * The silhouette of the cutting corner, in (z, r) about the nose centre: the main edge, the nose arc and the end edge as a polyline.
 * The sharp corner lies `r / sin(ε/2)` from the nose centre against the bisector of the two edges; the arc is tangent to both.
 */
export const insertSilhouette = (angle: number, kappa: number, noseRadius: number, length: number): RZ[] => {
  const rad = (d: number): number => (d * Math.PI) / 180
  const u = (d: number): RZ => ({ z: Math.cos(rad(d)), r: Math.sin(rad(d)) })
  if (angle >= 180) return Array.from({ length: 37 }, (_, k) => ({ z: noseRadius * Math.cos(rad(k * 10)), r: noseRadius * Math.sin(rad(k * 10)) }))
  const e = edgeDirections(angle, kappa)
  const bisector = (e.main + e.end) / 2
  const back = noseRadius / Math.sin(rad(angle / 2))
  const corner = { z: -back * Math.cos(rad(bisector)), r: -back * Math.sin(rad(bisector)) }
  const out: RZ[] = [{ z: corner.z + length * u(e.main).z, r: corner.r + length * u(e.main).r }]
  const start = e.main + 90
  const steps = 12
  for (let k = 0; k <= steps; k++) {
    const a = start + ((180 - angle) * k) / steps
    out.push({ z: noseRadius * Math.cos(rad(a)), r: noseRadius * Math.sin(rad(a)) })
  }
  out.push({ z: corner.z + length * u(e.end).z, r: corner.r + length * u(e.end).r })
  return out
}

/** A library of common turning inserts (all ISO 1832 designations, for the checks of `insert.test.ts`). */
export const INSERT_LIBRARY: ReadonlyArray<string> = [
  "CNMG120408", "CCMT09T304", "DNMG150608", "DCMT11T304", "VNMG160408", "VBMT160404", "TNMG160408", "WNMG080408", "SNMG120408", "RCMT100300"
]

export interface ProfileCheck {
  /** Contour segments (by index) whose slope the tool cannot generate. */
  readonly violations: ReadonlyArray<{ readonly segment: number; readonly slope: number; readonly limit: number; readonly kind: "descend" | "climb" }>
  /** Smallest concave corner radius of the contour the nose radius cannot follow (the contour's corner radius is below the nose radius). */
  readonly ok: boolean
}

/**
 * Checks an external contour (face to chuck) against a tool: every segment whose slope is steeper than the tool's limit is reported
 * (`maxDescend`: a taper falling towards the chuck steeper than the end edge allows, `maxClimb`: a shoulder leaning back past the
 * main edge). A vertical shoulder is a climb of 90 degrees.
 */
export const checkContour = (contour: ReadonlyArray<RZ>, limits: ToolLimits): ProfileCheck => {
  const violations: Array<{ segment: number; slope: number; limit: number; kind: "descend" | "climb" }> = []
  for (let i = 1; i < contour.length; i++) {
    const dz = contour[i]!.z - contour[i - 1]!.z, dr = contour[i]!.r - contour[i - 1]!.r
    if (Math.hypot(dz, dr) < 1e-9) continue
    // Travel towards the chuck has dz < 0. Slope: angle from the -z direction towards +r (climb) or -r (descend).
    const toward = -dz
    const slope = (Math.atan2(Math.abs(dr), toward) * 180) / Math.PI
    if (dr < 0 && slope > limits.maxDescend + 1e-9) violations.push({ segment: i - 1, slope, limit: limits.maxDescend, kind: "descend" })
    if (dr > 0 && slope > limits.maxClimb + 1e-9) violations.push({ segment: i - 1, slope, limit: limits.maxClimb, kind: "climb" })
  }
  return { violations, ok: violations.length === 0 }
}
