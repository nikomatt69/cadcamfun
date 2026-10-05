/**
 * Shared circular-arc helpers: angle normalisation, sweeps and DXF-style
 * bulge conversion. Everything is in radians; arcs are described by a centre,
 * a radius, a start angle and a signed sweep (positive = counter-clockwise).
 */
import { TAU, type Vec2 } from "./vec.ts"

/** Normalises an angle to `[0, 2π)`. Guards against `-1e-17 mod 2π === 2π`. */
export const normalizeAngle = (a: number): number => {
  const r = a % TAU
  const n = r < 0 ? r + TAU : r
  return n >= TAU ? 0 : n
}

/**
 * Unsigned angular extent of an arc in `(0, 2π]`.
 * A zero extent (start === end) is interpreted as a full circle.
 */
export const arcSweep = (startAngle: number, endAngle: number, clockwise: boolean): number => {
  const raw = clockwise ? normalizeAngle(startAngle - endAngle) : normalizeAngle(endAngle - startAngle)
  return raw === 0 ? TAU : raw
}

/** Signed sweep: positive counter-clockwise, negative clockwise. */
export const signedSweep = (startAngle: number, endAngle: number, clockwise: boolean): number => {
  const s = arcSweep(startAngle, endAngle, clockwise)
  return clockwise ? -s : s
}

/** Whether `angle` lies within the arc (inclusive, with angular tolerance `eps`). */
export const angleInArc = (
  angle: number,
  startAngle: number,
  endAngle: number,
  clockwise: boolean,
  eps = 1e-9
): boolean => {
  const sweep = arcSweep(startAngle, endAngle, clockwise)
  if (sweep >= TAU - eps) return true
  const rel = clockwise ? normalizeAngle(startAngle - angle) : normalizeAngle(angle - startAngle)
  return rel <= sweep + eps || rel >= TAU - eps
}

/** Point on a circle at `angle`. */
export const pointOnCircle = (center: Vec2, radius: number, angle: number): Vec2 => ({
  x: center.x + radius * Math.cos(angle),
  y: center.y + radius * Math.sin(angle)
})

export interface BulgeArc {
  readonly center: Vec2
  readonly radius: number
  /** Angle of the segment start point, in `[0, 2π)`. */
  readonly startAngle: number
  /** Signed sweep, positive = counter-clockwise. `|sweep|` is `4 * atan(|bulge|)`. */
  readonly sweep: number
}

/**
 * Converts a DXF bulge segment (`bulge = tan(sweep / 4)`, positive = CCW) to
 * its circular arc. Returns `undefined` for a straight segment (bulge ≈ 0) or a
 * degenerate chord.
 */
export const bulgeToArc = (p0: Vec2, p1: Vec2, bulge: number): BulgeArc | undefined => {
  if (Math.abs(bulge) < 1e-12) return undefined
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const chord = Math.hypot(dx, dy)
  if (chord < 1e-12) return undefined
  const sweep = 4 * Math.atan(bulge)
  const radius = chord / (2 * Math.sin(Math.abs(sweep) / 2))
  // Distance from the chord midpoint to the centre, signed along the left normal.
  const h = chord / 2 / Math.tan(sweep / 2)
  const mx = (p0.x + p1.x) / 2
  const my = (p0.y + p1.y) / 2
  const center = { x: mx - (dy / chord) * h, y: my + (dx / chord) * h }
  return {
    center,
    radius,
    startAngle: normalizeAngle(Math.atan2(p0.y - center.y, p0.x - center.x)),
    sweep
  }
}

/** Bulge value for a signed sweep (inverse of the `4 * atan` relation). */
export const sweepToBulge = (sweep: number): number => Math.tan(sweep / 4)

/** Number of chords needed so that a circular arc of `radius` and `sweep` stays within `tolerance`. */
export const arcSegmentCount = (radius: number, sweep: number, tolerance: number, minSegments = 1): number => {
  const MAX_PER_TURN = 65536
  const ratio = Math.min(1, Math.max(0, tolerance / radius))
  // Chord sag = r (1 - cos(d/2)); solve for the largest chord angle d.
  const maxStep = 2 * Math.acos(1 - ratio)
  const n = maxStep <= 0 ? MAX_PER_TURN : Math.ceil(Math.abs(sweep) / maxStep - 1e-12)
  const cap = Math.max(1, Math.ceil((MAX_PER_TURN * Math.abs(sweep)) / TAU))
  return Math.max(minSegments, Math.min(cap, n))
}
