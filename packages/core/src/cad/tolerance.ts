/**
 * Drawing tolerance and how it shapes curves (millimetres throughout).
 *
 * A tolerance is the largest deviation the model may have from the true shape. For a circle drawn as a polygon the
 * deviation is the chord's sagitta, `r (1 - cos(pi / n))`, so the number of segments follows from the tolerance.
 * One implementation serves the editor's renderer, the assistant's element catalogue and the tests.
 */

/** Tolerances the UI offers, mm, coarse to fine (0.001 mm = 1 micron). */
export const TOLERANCE_PRESETS: ReadonlyArray<number> = [0.1, 0.05, 0.01, 0.005, 0.002, 0.001, 0.0005]

export const MIN_TOLERANCE = 0.0001
export const MAX_TOLERANCE = 10
export const DEFAULT_TOLERANCE = 0.01

export const MIN_CURVE_SEGMENTS = 8
export const MAX_CURVE_SEGMENTS = 2048

/** Whether `value` is usable as a tolerance (finite, within the supported range). */
export const isTolerance = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= MIN_TOLERANCE && value <= MAX_TOLERANCE

/**
 * Segments of a circle of `radius` so the chord deviates from the true circle by at most `tolerance`:
 * the smallest n >= 8 with `radius * (1 - cos(pi / n)) <= tolerance`, limited to `cap`.
 */
export const segmentsFor = (radius: number, tolerance: number, cap = MAX_CURVE_SEGMENTS): number => {
  if (!(radius > 0) || !(tolerance > 0)) return MIN_CURVE_SEGMENTS
  if (tolerance >= radius) return MIN_CURVE_SEGMENTS
  const n = Math.ceil(Math.PI / Math.acos(1 - tolerance / radius))
  return Math.min(cap, Math.max(MIN_CURVE_SEGMENTS, n))
}

/** The deviation of a circle of `radius` drawn with `segments` chords. */
export const chordError = (radius: number, segments: number): number => radius * (1 - Math.cos(Math.PI / segments))

/** Decimals needed to show a length to the tolerance (0.001 -> 3, 0.05 -> 2, 0.5 -> 1), at most 6. */
export const decimalsForTolerance = (tolerance: number): number =>
  tolerance > 0 ? Math.min(6, Math.max(0, Math.ceil(-Math.log10(tolerance) - 1e-9))) : 3
