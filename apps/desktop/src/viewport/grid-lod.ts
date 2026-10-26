/**
 * Level of detail of the viewport grid, as plain numbers (the three.js side is `adaptive-grid.ts`).
 *
 * The grid is three decades of lines at once: `minor` is the decade whose cells are about as wide as the zoom wants and fades
 * out while the view moves toward the next decade, `mid` and `major` are the two coarser ones. A step is always a power of
 * ten, so the lines of one decade are lines of the next and the grid never shows two unrelated spacings. When the view
 * crosses a decade `mid` becomes `minor` at full strength: nothing jumps.
 */

export interface GridLevels {
  readonly minor: number
  readonly mid: number
  readonly major: number
  /** 1 when `minor` is exactly the spacing the zoom asks for, 0 when the next decade has taken over. */
  readonly minorAlpha: number
}

/** About this many `minor` cells across the viewport's shorter side. */
export const GRID_CELLS_ACROSS = 24
/** The smallest step drawn: a hundredth of a millimetre. */
export const GRID_MIN_STEP = 0.01
/** The largest: ten metres, beyond any machine envelope. */
export const GRID_MAX_STEP = 10000

/** World length across the viewport's shorter side for a perspective camera `distance` from what it looks at. */
export const perspectiveSpan = (distance: number, fovDegrees: number, aspect: number): number => {
  const height = 2 * Math.max(distance, 1e-6) * Math.tan((fovDegrees * Math.PI) / 360)
  return Math.min(height, height * Math.max(aspect, 1e-6))
}

/** The same for an orthographic camera of the given frustum extents and zoom. */
export const orthographicSpan = (width: number, height: number, zoom: number): number => Math.min(Math.abs(width), Math.abs(height)) / Math.max(zoom, 1e-6)

export const gridLevels = (span: number): GridLevels => {
  const wanted = Math.max(Number.isFinite(span) ? span : 1, 1e-6) / GRID_CELLS_ACROSS
  const exponent = Math.log10(wanted)
  const decade = Math.floor(exponent)
  const clamp = (step: number): number => Math.min(GRID_MAX_STEP, Math.max(GRID_MIN_STEP, step))
  const minor = clamp(10 ** decade), mid = clamp(10 ** (decade + 1)), major = clamp(10 ** (decade + 2))
  // Past the limits the clamped decades coincide: a minor level equal to `mid` would only draw the same lines twice.
  const minorAlpha = minor === mid ? 0 : exponent < Math.log10(GRID_MIN_STEP) ? 1 : 1 - (exponent - decade)
  return { minor, mid, major, minorAlpha }
}

/** Distance from what the camera looks at past which the grid has faded out entirely. */
export const gridReach = (span: number): number => Math.max(span, 1e-3) * 1.5
