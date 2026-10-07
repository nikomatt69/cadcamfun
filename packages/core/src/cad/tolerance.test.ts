import { describe, expect, test } from "bun:test"
import { MAX_CURVE_SEGMENTS, chordError, decimalsForTolerance, isTolerance, segmentsFor } from "./tolerance.ts"

describe("tolerance", () => {
  test("the chord never deviates more than asked, and one segment fewer would", () => {
    for (const [radius, tolerance] of [[50, 0.001], [50, 0.01], [3, 0.0005], [250, 0.002], [10, 0.1], [0.5, 0.0001]] as const) {
      const n = segmentsFor(radius, tolerance)
      expect(chordError(radius, n)).toBeLessThanOrEqual(tolerance * (1 + 1e-9))
      if (n > 8) expect(chordError(radius, n - 1)).toBeGreaterThan(tolerance)
    }
  })

  test("limits: at least 8, at most the cap, nonsense input stays safe", () => {
    expect(segmentsFor(1, 5)).toBe(8)
    expect(segmentsFor(0, 0.001)).toBe(8)
    expect(segmentsFor(-4, 0.001)).toBe(8)
    expect(segmentsFor(50, 0.001, 64)).toBe(64)
    expect(segmentsFor(1e6, 1e-4)).toBe(MAX_CURVE_SEGMENTS)
    expect(segmentsFor(50, 0.001)).toBe(497)
  })

  test("decimals show the tolerance, and the range check rejects junk", () => {
    expect([0.1, 0.05, 0.01, 0.002, 0.001, 0.0005, 0.0001].map(decimalsForTolerance)).toEqual([1, 2, 2, 3, 3, 4, 4])
    expect(decimalsForTolerance(0)).toBe(3)
    for (const ok of [0.0001, 0.001, 1, 10]) expect(isTolerance(ok)).toBe(true)
    for (const bad of [0, -1, 11, NaN, Infinity, "0.01", undefined]) expect(isTolerance(bad)).toBe(false)
  })
})
