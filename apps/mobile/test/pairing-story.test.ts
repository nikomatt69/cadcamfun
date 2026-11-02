import { describe, expect, test } from "bun:test"
import { BEATS, POSTER, STORY_MS, storyAt } from "../lib/pairing-story"

describe("pairing story", () => {
  test("starts and ends empty so the loop seam is invisible", () => {
    expect(storyAt(0)).toEqual({ connected: 0, rowA: 0, rowB: 0 })
    expect(storyAt(STORY_MS - 1).rowB).toBeLessThan(0.001)
    expect(storyAt(STORY_MS)).toEqual(storyAt(0))
  })

  test("beats arrive in order and the payoff holds untouched", () => {
    expect(BEATS.searchEnd).toBeLessThanOrEqual(BEATS.connected[0])
    expect(BEATS.connected[1]).toBeLessThanOrEqual(BEATS.rowA[0] + 300)
    expect(BEATS.rowA[0]).toBeLessThan(BEATS.rowB[0])
    expect(storyAt(2000).rowA).toBeGreaterThan(storyAt(2000).rowB)
    for (const t of [3000, 5000, BEATS.hold - 1]) expect(storyAt(t)).toEqual(POSTER)
    expect(BEATS.hold).toBeLessThan(BEATS.drop[1])
    expect(BEATS.drop[1]).toBeLessThan(STORY_MS)
  })

  test("the drop folds every layer back together", () => {
    const mid = storyAt((BEATS.drop[0] + BEATS.drop[1]) / 2)
    expect(mid.connected).toBeCloseTo(0.5, 5)
    expect(mid.rowA).toBeCloseTo(0.5, 5)
    expect(mid.rowB).toBeCloseTo(0.5, 5)
  })
})
