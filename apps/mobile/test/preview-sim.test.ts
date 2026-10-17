import { describe, expect, test } from "bun:test"
import {
  DEFAULT_RAPID_FEED,
  FALLBACK_CUT_FEED,
  boundsSize,
  cumulativeTimes,
  formatDuration,
  formatSize,
  indexAtTime,
  modalFeeds,
  partBounds,
  pathTotals,
  segmentDurations,
  startTimeOf,
  type SimSegment,
} from "../lib/preview-sim"

const segment = (kind: SimSegment["kind"], line: number, from: [number, number, number], to: [number, number, number]): SimSegment => ({ kind, line, from, to })

describe("feeds from the program", () => {
  test("the modal F word carries forward and comments are ignored", () => {
    const feeds = modalFeeds("G21\nG0 X0 Y0 (F9999 in a comment)\nG1 X10 F600\nG1 Y10\n; F1 note\nG1 X0 F1200\nG1 F0 X5")
    expect(feeds.slice(1)).toEqual([undefined, undefined, 600, 600, 600, 1200, 1200])
  })
  test("lowercase words and decimals parse", () => {
    expect(modalFeeds("g1 x1 f250.5")[1]).toBe(250.5)
  })
})

describe("simulation clock", () => {
  const segments = [
    segment("rapid", 1, [0, 0, 10], [0, 0, 0]),
    segment("linear", 2, [0, 0, 0], [60, 0, 0]),
    segment("linear", 3, [60, 0, 0], [60, 30, 0]),
  ]
  const feeds = modalFeeds("G0 Z0\nG1 X60 F600\nG1 Y30")
  const durations = segmentDurations(segments, feeds)
  const ends = cumulativeTimes(durations)

  test("each move lasts its length over the feed in effect", () => {
    expect(durations[0]).toBeCloseTo((10 / DEFAULT_RAPID_FEED) * 60, 9)
    expect(durations[1]).toBeCloseTo(6, 9)
    expect(durations[2]).toBeCloseTo(3, 9)
    expect(segmentDurations([segment("linear", 1, [0, 0, 0], [FALLBACK_CUT_FEED, 0, 0])], [])[0]).toBeCloseTo(60, 9)
  })
  test("time maps to the running block and a scrub resumes from its start", () => {
    expect(indexAtTime(ends, 0)).toBe(0)
    expect(indexAtTime(ends, 0.5)).toBe(1)
    expect(indexAtTime(ends, ends[1]! + 0.01)).toBe(2)
    expect(indexAtTime(ends, 1e9)).toBe(2)
    expect(indexAtTime([], 5)).toBe(0)
    expect(startTimeOf(ends, 2)).toBe(ends[1]!)
    expect(startTimeOf(ends, 0)).toBe(0)
  })
  test("totals split cutting from rapid travel", () => {
    const totals = pathTotals(segments, durations)
    expect(totals.cutLength).toBeCloseTo(90, 9)
    expect(totals.rapidLength).toBeCloseTo(10, 9)
    expect(totals.seconds).toBeCloseTo(ends[2]!, 9)
  })
  test("durations format like a machine clock", () => {
    expect(formatDuration(7)).toBe("0:07")
    expect(formatDuration(724)).toBe("12:04")
    expect(formatDuration(3909)).toBe("1:05:09")
    expect(formatDuration(Number.NaN)).toBe("0:00")
  })
})

describe("measurements", () => {
  test("bounds size reads in millimetres", () => {
    const bounds = { min: [-10, 0, 0] as const, max: [110, 80.25, 2.5] as const }
    expect(boundsSize(bounds)).toEqual([120, 80.25, 2.5])
    expect(formatSize(bounds)).toBe("120 × 80.3 × 2.5 mm")
  })
  test("part bounds cover only that part's triangles and skip invalid indices", () => {
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5, 6, 5, 5, 5, 6, 7]
    const indices = [0, 1, 2, 3, 4, 5, 3, 4, 99]
    expect(partBounds(positions, indices, { triangleStart: 1, triangleCount: 2 })).toEqual({ min: [5, 5, 5], max: [6, 6, 7] })
    expect(partBounds(positions, indices, { triangleStart: 0, triangleCount: 1 })).toEqual({ min: [0, 0, 0], max: [1, 1, 0] })
    expect(partBounds(positions, indices, { triangleStart: 10, triangleCount: 1 })).toBeUndefined()
  })
})
