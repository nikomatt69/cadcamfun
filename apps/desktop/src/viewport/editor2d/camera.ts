/**
 * 2D viewport camera: world millimetres <-> screen pixels.
 *
 * A plain, immutable value with pure functions, so pan/zoom/zoom-to-fit are unit
 * tested without a canvas. The renderer only reads it; the editor produces new
 * values on every gesture. Screen Y grows downwards, world Y grows upwards, which
 * is the only place the flip is applied.
 */
import { type Bounds2D, boxCenter, boxIsEmpty, boxWidth, boxHeight, inflateBox } from "@cadcamfun/core"

/** Wheel/pinch zoom limits, as a scale factor per notch. */
export const ZOOM_STEP = 1.15
export const MIN_SCALE = 0.001
export const MAX_SCALE = 100_000

export interface Camera {
  /** World point at the centre of the viewport. */
  readonly center: { readonly x: number; readonly y: number }
  /** Screen pixels per world millimetre. */
  readonly scale: number
  readonly width: number
  readonly height: number
}

/** Fraction of the viewport kept as margin when zooming to a box. */
export const FIT_MARGIN = 0.1

export const createCamera = (
  center = { x: 0, y: 0 },
  scale = 1,
  width = 800,
  height = 600
): Camera => ({ center: { ...center }, scale, width, height })

const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

/** World -> screen, with the top-left corner as the screen origin. */
export const worldToScreen = (camera: Camera, point: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number } => ({
  x: (point.x - camera.center.x) * camera.scale + camera.width / 2,
  y: (camera.center.y - point.y) * camera.scale + camera.height / 2
})

/** Screen -> world. */
export const screenToWorld = (
  camera: Camera,
  point: { readonly x: number; readonly y: number }
): { readonly x: number; readonly y: number } => ({
  x: (point.x - camera.width / 2) / camera.scale + camera.center.x,
  y: camera.center.y - (point.y - camera.height / 2) / camera.scale
})

/** Screen rectangle covered by the visible world, for culling. */
export const visibleBounds = (camera: Camera): Bounds2D => {
  const halfW = camera.width / 2 / camera.scale
  const halfH = camera.height / 2 / camera.scale
  return {
    minX: camera.center.x - halfW,
    minY: camera.center.y - halfH,
    maxX: camera.center.x + halfW,
    maxY: camera.center.y + halfH
  }
}

/** Pans by a screen-space delta, keeping the world point under the cursor fixed. */
export const pan = (camera: Camera, dxScreen: number, dyScreen: number): Camera => ({
  ...camera,
  center: {
    x: camera.center.x - dxScreen / camera.scale,
    y: camera.center.y + dyScreen / camera.scale
  }
})

/**
 * Zooms by `factor` about a screen anchor (cursor position, pinch midpoint), so
 * the world point under the cursor stays under the cursor.
 */
export const zoomAt = (camera: Camera, factor: number, anchor: { readonly x: number; readonly y: number }): Camera => {
  const scale = clampScale(camera.scale * factor)
  if (scale === camera.scale) return camera
  const before = screenToWorld(camera, anchor)
  const next: Camera = { ...camera, scale }
  const after = screenToWorld(next, anchor)
  return {
    ...next,
    center: { x: camera.center.x + (before.x - after.x), y: camera.center.y + (before.y - after.y) }
  }
}

/** Multiplies the scale; `factor` may be a wheel notch (`1 / ZOOM_STEP^n`). */
export const zoom = (camera: Camera, factor: number): Camera =>
  zoomAt(camera, factor, { x: camera.width / 2, y: camera.height / 2 })

/** Camera that shows the whole box, with `FIT_MARGIN` of breathing room. */
export const cameraForBounds = (bounds: Bounds2D, width: number, height: number): Camera => {
  if (boxIsEmpty(bounds)) return createCamera({ x: 0, y: 0 }, 1, width, height)
  const padded = inflateBox(bounds, Math.max(boxWidth(bounds), boxHeight(bounds)) * FIT_MARGIN + 1e-6)
  const spanX = Math.max(boxWidth(padded), 1e-6)
  const spanY = Math.max(boxHeight(padded), 1e-6)
  const scale = clampScale(Math.min(width / spanX, height / spanY))
  return { center: boxCenter(padded), scale, width, height }
}

/** Resizes the viewport, keeping the world point at the centre. */
export const resize = (camera: Camera, width: number, height: number): Camera => ({ ...camera, width, height })

/**
 * Grid step for the current zoom: the smallest of a 1-2-5 ladder of subdivisions
 * that keeps dots at least `minPixels` apart. Keeps the grid readable at every
 * zoom level, which is what "major spacing" means in practice.
 */
export const gridStep = (scale: number, major = 10, minPixels = 8): number => {
  const base = Math.max(major, 1e-6)
  const target = minPixels / Math.max(scale, 1e-12)
  const decade = Math.pow(10, Math.floor(Math.log10(target / base)))
  let step = base * decade
  for (const m of [1, 2, 5]) {
    if (m * decade * base >= target) return m * decade * base
  }
  return step * 10
}

/** Ruler tick positions in world units, from `from` to `to` in multiples of `step`. */
export const ticksBetween = (from: number, to: number, step: number): number[] => {
  if (!(step > 0) || !Number.isFinite(from) || !Number.isFinite(to)) return []
  const out: number[] = []
  const first = Math.ceil(from / step) * step
  // Guard against a pathological step producing an unbounded array.
  if ((to - first) / step > 10_000) return []
  for (let t = first; t <= to + step * 1e-9; t += step) {
    out.push(Math.abs(t) < step * 1e-9 ? 0 : t)
  }
  return out
}