/**
 * Small builders used by tests and by the UI fixtures. Keeping them in `src`
 * (rather than in each test file) lets the desktop app generate the same
 * reference geometry the CAM tests use, so both agree on the inputs.
 *
 * Each builder returns the narrow entity type, so callers can read the geometry
 * fields without narrowing the `Entity` union by hand.
 */
import { type Vec2 } from "./vec.ts"
import { normalizeAngle } from "./arc-math.ts"
import {
  type ArcEntity,
  type CircleEntity,
  type EllipseEntity,
  type LineEntity,
  type PolylineEntity,
  type SplineEntity
} from "./entities.ts"
import { DEFAULT_SNAP_SETTINGS, type SnapSettings } from "./snap.ts"

export const line = (
  id: string,
  start: Vec2,
  end: Vec2,
  layerId = "layer-0"
): LineEntity => ({ _tag: "Line", id, layerId, visible: true, locked: false, start, end })

export const circle = (id: string, center: Vec2, radius: number, layerId = "layer-0"): CircleEntity => ({
  _tag: "Circle",
  id,
  layerId,
  visible: true,
  locked: false,
  center,
  radius
})

export const arc = (
  id: string,
  center: Vec2,
  radius: number,
  startAngle: number,
  endAngle: number,
  clockwise = false,
  layerId = "layer-0"
): ArcEntity => ({
  _tag: "Arc",
  id,
  layerId,
  visible: true,
  locked: false,
  center,
  radius,
  startAngle: normalizeAngle(startAngle),
  endAngle: normalizeAngle(endAngle),
  clockwise
})

export const polyline = (
  id: string,
  points: ReadonlyArray<Vec2>,
  closed = false,
  layerId = "layer-0"
): PolylineEntity => ({
  _tag: "Polyline",
  id,
  layerId,
  visible: true,
  locked: false,
  points: points.map((p) => ({ ...p })),
  closed
})

export const ellipse = (
  id: string,
  center: Vec2,
  radiusX: number,
  radiusY: number,
  rotation = 0,
  layerId = "layer-0"
): EllipseEntity => ({
  _tag: "Ellipse",
  id,
  layerId,
  visible: true,
  locked: false,
  center,
  radiusX,
  radiusY,
  rotation
})

export const spline = (
  id: string,
  controlPoints: ReadonlyArray<Vec2>,
  degree = 3,
  closed = false,
  layerId = "layer-0"
): SplineEntity => ({
  _tag: "Spline",
  id,
  layerId,
  visible: true,
  locked: false,
  controlPoints: controlPoints.map((p) => ({ ...p })),
  degree,
  closed
})

/** Regular closed ring, useful for offset and CAM property tests. */
export const roundRing = (center: Vec2, radius: number, segments = 64): Vec2[] => {
  const pts: Vec2[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) })
  }
  return pts
}

/** Snap settings with overrides applied to the defaults. */
export const snapSettings = (overrides: Partial<SnapSettings> = {}): SnapSettings => ({
  ...DEFAULT_SNAP_SETTINGS,
  ...overrides
})

/** Tolerance below which a self-intersecting offset loop is treated as degenerate. */
export const SELF_TOLERANCE = 1e-7

/** Default surface-finish allowance (mm) a profile operation leaves behind. */
export const TEXTURE_REL = 0.02