/**
 * Engineering reference data for the design rules: ISO metric fasteners (ISO 262 / ISO 273 / ISO 4762 / ISO 7046 / DIN 974),
 * keyways (DIN 6885 form A) and the rules of thumb a designer applies when placing holes. Lengths are millimetres.
 *
 * The assistant and the recipes read the same tables, so a hole sized "for an M8 screw" is the same number everywhere.
 */

export type ClearanceFit = "fine" | "medium" | "coarse"

export interface MetricThread {
  /** `M8`. */
  readonly name: string
  /** Nominal (major) diameter. */
  readonly d: number
  /** Coarse pitch (ISO 262). */
  readonly pitch: number
  /** Tapping drill for the coarse thread (6H, ~75 % thread depth). */
  readonly tapDrill: number
  /** Clearance hole diameters (ISO 273 series). */
  readonly clearance: Readonly<Record<ClearanceFit, number>>
  /** Socket head cap screw (ISO 4762): head diameter and height. */
  readonly headDiameter: number
  readonly headHeight: number
  /** Counterbore for the socket head (DIN 974-1): diameter and depth. */
  readonly counterboreDiameter: number
  readonly counterboreDepth: number
  /** Countersunk head (ISO 7046) head diameter; the cone is 90 degrees. */
  readonly countersinkDiameter: number
}

const t = (
  d: number, pitch: number, tapDrill: number, fine: number, medium: number, coarse: number,
  headDiameter: number, headHeight: number, counterboreDiameter: number, counterboreDepth: number, countersinkDiameter: number
): MetricThread => ({
  name: `M${d}`, d, pitch, tapDrill, clearance: { fine, medium, coarse },
  headDiameter, headHeight, counterboreDiameter, counterboreDepth, countersinkDiameter
})

export const METRIC_THREADS: ReadonlyArray<MetricThread> = [
  t(2, 0.4, 1.6, 2.2, 2.4, 2.6, 3.8, 2, 4.5, 2.4, 4),
  t(2.5, 0.45, 2.05, 2.7, 2.9, 3.1, 4.5, 2.5, 5.5, 3, 5),
  t(3, 0.5, 2.5, 3.2, 3.4, 3.6, 5.5, 3, 6.5, 3.4, 6),
  t(4, 0.7, 3.3, 4.3, 4.5, 4.8, 7, 4, 8, 4.6, 8),
  t(5, 0.8, 4.2, 5.3, 5.5, 5.8, 8.5, 5, 10, 5.7, 10),
  t(6, 1, 5, 6.4, 6.6, 7, 10, 6, 11, 6.8, 12),
  t(8, 1.25, 6.8, 8.4, 9, 10, 13, 8, 15, 9, 16),
  t(10, 1.5, 8.5, 10.5, 11, 12, 16, 10, 18, 11, 20),
  t(12, 1.75, 10.2, 13, 13.5, 14.5, 18, 12, 20, 13, 24),
  t(14, 2, 12, 15, 15.5, 16.5, 21, 14, 24, 15, 27),
  t(16, 2, 14, 17, 17.5, 18.5, 24, 16, 26, 17.5, 30),
  t(20, 2.5, 17.5, 21, 22, 24, 30, 20, 33, 21.5, 36),
  t(24, 3, 21, 25, 26, 28, 36, 24, 40, 25.5, 43),
  t(30, 3.5, 26.5, 31, 33, 35, 45, 30, 50, 32, 54)
]

/** `M8`, `m8`, `8` or `8mm`: the thread of that size, if the table has it. */
export const metricThread = (size: string | number): MetricThread | undefined => {
  const d = typeof size === "number" ? size : Number(String(size).trim().replace(/^m/i, "").replace(/mm$/i, ""))
  return Number.isFinite(d) ? METRIC_THREADS.find((m) => Math.abs(m.d - d) < 1e-9) : undefined
}

/** The thread of that size, or an error that lists the sizes the table has. */
export const requireThread = (size: string | number): MetricThread => {
  const found = metricThread(size)
  if (found === undefined) throw new RangeError(`Unknown metric thread '${String(size)}'. Known: ${METRIC_THREADS.map((m) => m.name).join(", ")}`)
  return found
}

export const clearanceHole = (size: string | number, fit: ClearanceFit = "medium"): number => requireThread(size).clearance[fit]

export const tapDrill = (size: string | number): number => requireThread(size).tapDrill

/** Minimum engaged thread length for full strength: 1.0 d in steel, 1.5 d in aluminium, 2.0 d in cast iron / plastic. */
export const threadEngagement = (size: string | number, material: "steel" | "aluminium" | "cast" | "plastic" = "steel"): number => {
  const d = requireThread(size).d
  return d * (material === "steel" ? 1 : material === "aluminium" ? 1.5 : 2)
}

/** Depth of a drilled hole that is tapped to `threadLength`: the thread plus the drill point and chip room (about 2 pitches + 0.3 d). */
export const tappedHoleDepth = (size: string | number, threadLength: number): number => {
  const m = requireThread(size)
  return threadLength + 2 * m.pitch + 0.3 * m.d
}

/** Smallest centre-to-edge distance of a hole: 1.5 d of the hole (2 d in cast parts and plastics, where the edge breaks out). */
export const minEdgeDistance = (holeDiameter: number, material: "metal" | "cast" | "plastic" = "metal"): number =>
  holeDiameter * (material === "metal" ? 1.5 : 2)

/** Smallest centre-to-centre distance of two holes: 2.5 d of the larger, so the web between them keeps 1.5 d. */
export const minHoleSpacing = (a: number, b: number = a): number => Math.max(a, b) * 2.5

export interface Keyway {
  /** Shaft diameter range this key serves, mm (over .. up to). */
  readonly over: number
  readonly upTo: number
  /** Key width and height. */
  readonly b: number
  readonly h: number
  /** Depth of the keyway in the shaft and in the hub. */
  readonly t1: number
  readonly t2: number
}

/** DIN 6885 form A (ISO 773) parallel keys. */
export const KEYWAYS: ReadonlyArray<Keyway> = [
  { over: 6, upTo: 8, b: 2, h: 2, t1: 1.2, t2: 1.0 },
  { over: 8, upTo: 10, b: 3, h: 3, t1: 1.8, t2: 1.4 },
  { over: 10, upTo: 12, b: 4, h: 4, t1: 2.5, t2: 1.8 },
  { over: 12, upTo: 17, b: 5, h: 5, t1: 3.0, t2: 2.3 },
  { over: 17, upTo: 22, b: 6, h: 6, t1: 3.5, t2: 2.8 },
  { over: 22, upTo: 30, b: 8, h: 7, t1: 4.0, t2: 3.3 },
  { over: 30, upTo: 38, b: 10, h: 8, t1: 5.0, t2: 3.3 },
  { over: 38, upTo: 44, b: 12, h: 8, t1: 5.0, t2: 3.3 },
  { over: 44, upTo: 50, b: 14, h: 9, t1: 5.5, t2: 3.8 },
  { over: 50, upTo: 58, b: 16, h: 10, t1: 6.0, t2: 4.3 },
  { over: 58, upTo: 65, b: 18, h: 11, t1: 7.0, t2: 4.4 },
  { over: 65, upTo: 75, b: 20, h: 12, t1: 7.5, t2: 4.9 }
]

export const keywayFor = (shaftDiameter: number): Keyway | undefined => KEYWAYS.find((k) => shaftDiameter > k.over && shaftDiameter <= k.upTo)

/**
 * Preferred ISO 286 hole/shaft fits with the typical use, so a part can be dimensioned from the function instead of a guess:
 * the allowance is the nominal-size tolerance band in micrometres for a 6..30 mm diameter.
 */
export const FITS = {
  H7_h6: { kind: "location (sliding)", useCase: "parts that are assembled by hand and located precisely, sliding spigots, guide bushings" },
  H7_g6: { kind: "close running", useCase: "precise guiding of moving parts, spindles, slide valves" },
  H7_f7: { kind: "running", useCase: "plain bearings, shafts in general machine building" },
  H7_k6: { kind: "transition", useCase: "gears, pulleys and bearing inner rings that are driven on with a light press" },
  H7_n6: { kind: "interference (light press)", useCase: "bushings and hubs pressed in; no key needed for small torque" },
  H7_p6: { kind: "interference (press)", useCase: "permanent press fit of bushings in housings" }
} as const

export type FitName = keyof typeof FITS

/** Standard tolerance grade width IT, micrometres, for a nominal size range (ISO 286-1). */
export const toleranceGrade = (grade: 5 | 6 | 7 | 8 | 9 | 10 | 11, nominal: number): number => {
  const ranges: ReadonlyArray<readonly [number, ReadonlyArray<number>]> = [
    // upTo, IT5..IT11
    [3, [4, 6, 10, 14, 25, 40, 60]],
    [6, [5, 8, 12, 18, 30, 48, 75]],
    [10, [6, 9, 15, 22, 36, 58, 90]],
    [18, [8, 11, 18, 27, 43, 70, 110]],
    [30, [9, 13, 21, 33, 52, 84, 130]],
    [50, [11, 16, 25, 39, 62, 100, 160]],
    [80, [13, 19, 30, 46, 74, 120, 190]],
    [120, [15, 22, 35, 54, 87, 140, 220]],
    [180, [18, 25, 40, 63, 100, 160, 250]],
    [250, [20, 29, 46, 72, 115, 185, 290]]
  ]
  const row = ranges.find(([upTo]) => nominal <= upTo)
  if (row === undefined) throw new RangeError(`No tolerance grade table above 250 mm (got ${nominal})`)
  return row[1][grade - 5]!
}
