import { expect, test } from "bun:test"
import { GRID_CELLS_ACROSS, GRID_MAX_STEP, GRID_MIN_STEP, gridLevels, gridReach, orthographicSpan, perspectiveSpan } from "./grid-lod.ts"

test("the levels are three consecutive decades and the minor cell is about the width the zoom asks for", () => {
  for (const span of [0.5, 3, 24, 100, 777, 2400]) {
    const levels = gridLevels(span)
    const wanted = span / GRID_CELLS_ACROSS
    expect(levels.minor).toBeLessThanOrEqual(wanted * (1 + 1e-9))
    expect(levels.minor * 10).toBeGreaterThan(wanted)
    expect(levels.mid).toBeCloseTo(levels.minor * 10, 9)
    expect(levels.major).toBeCloseTo(levels.minor * 100, 9)
  }
})

test("a decade boundary hands over without a jump: minor fades to zero as mid becomes the next minor at full strength", () => {
  const below = gridLevels(GRID_CELLS_ACROSS * 10 * (1 - 1e-9))
  const above = gridLevels(GRID_CELLS_ACROSS * 10)
  expect(below.minor).toBe(1)
  expect(below.minorAlpha).toBeLessThan(1e-6)
  expect(above.minor).toBe(10)
  expect(above.minorAlpha).toBe(1)
  expect(below.mid).toBe(above.minor)
})

test("zooming in strengthens the minor lines monotonically within a decade", () => {
  const alphas = [30, 60, 120, 200].map((span) => gridLevels(span).minorAlpha)
  for (let i = 1; i < alphas.length; i++) expect(alphas[i]!).toBeLessThan(alphas[i - 1]!)
})

test("steps stay inside the drawn range and never repeat a level", () => {
  const tiny = gridLevels(1e-9), huge = gridLevels(1e12), nonsense = gridLevels(Number.NaN)
  expect(tiny.minor).toBeGreaterThanOrEqual(GRID_MIN_STEP)
  expect(huge.major).toBeLessThanOrEqual(GRID_MAX_STEP)
  expect(huge.minorAlpha).toBe(0)
  expect(Number.isFinite(nonsense.minor)).toBe(true)
})

test("the span follows the shorter side of the viewport, for both camera kinds", () => {
  expect(perspectiveSpan(100, 90, 2)).toBeCloseTo(200, 6)
  expect(perspectiveSpan(100, 90, 0.5)).toBeCloseTo(100, 6)
  expect(orthographicSpan(200, 100, 2)).toBeCloseTo(50, 9)
  expect(gridReach(100)).toBeCloseTo(150, 9)
})
