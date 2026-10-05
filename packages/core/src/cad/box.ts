/**
 * Axis-aligned 2D boxes. Kept in their own module so `bounds.ts`, `offset.ts`
 * and the viewport can share them without an import cycle.
 */
import { type Vec2 } from "./vec.ts"

export interface Bounds2D {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/** An inverted box, so that unioning anything into it is a no-op. */
export const emptyBounds = (): Bounds2D => ({
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity
})

/** Bounds of a single point (zero area). */
export const pointBounds = (p: Vec2): Bounds2D => ({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y })

export const boundsOfPoints = (points: ReadonlyArray<Vec2>): Bounds2D => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

/** Smallest box containing both inputs; empty inputs are absorbed. */
export const unionBox = (a: Bounds2D, b: Bounds2D): Bounds2D => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY)
})

export const boxIsEmpty = (b: Bounds2D): boolean => b.maxX < b.minX || b.maxY < b.minY

export const boxWidth = (b: Bounds2D): number => (boxIsEmpty(b) ? 0 : b.maxX - b.minX)
export const boxHeight = (b: Bounds2D): number => (boxIsEmpty(b) ? 0 : b.maxY - b.minY)

export const boxCenter = (b: Bounds2D): Vec2 => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 })

export const boxCorners = (b: Bounds2D): ReadonlyArray<Vec2> => [
  { x: b.minX, y: b.minY },
  { x: b.maxX, y: b.minY },
  { x: b.maxX, y: b.maxY },
  { x: b.minX, y: b.maxY }
]

/** Whether a point lies inside or on the border of a box. */
export const boxContains = (b: Bounds2D, p: Vec2, eps = 1e-9): boolean =>
  p.x >= b.minX - eps && p.x <= b.maxX + eps && p.y >= b.minY - eps && p.y <= b.maxY + eps

/** Grows a box by a uniform margin (may be negative). */
export const inflateBox = (b: Bounds2D, margin: number): Bounds2D => ({
  minX: b.minX - margin,
  minY: b.minY - margin,
  maxX: b.maxX + margin,
  maxY: b.maxY + margin
})

/** Box as `{ origin, size }`, the form the solid/CAM layers consume. */
export const boxFromPoints = (a: Vec2, b: Vec2): Bounds2D => ({
  minX: Math.min(a.x, b.x),
  minY: Math.min(a.y, b.y),
  maxX: Math.max(a.x, b.x),
  maxY: Math.max(a.y, b.y)
})