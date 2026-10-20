import { describe, expect, test } from "bun:test"
import {
  DEFAULT_RAPID_FEED,
  FALLBACK_CUT_FEED,
  MAX_DISPLAY_REV_PER_SECOND,
  boundsSize,
  cumulativeTimes,
  formatDuration,
  formatSize,
  indexAtTime,
  modalFeeds,
  partBounds,
  pathTotals,
  segmentDurations,
  spinIsClockwise,
  spinRateAt,
  startTimeOf,
  type SimSegment,
} from "../lib/preview-sim"
import { DEFAULT_CUTTING_FEEDRATE_MM_MIN, RAPID_FEEDRATE_MM_MIN } from "../../../packages/core/src/cam/viewer/toolpath.ts"

const segment = (kind: SimSegment["kind"], line: number, from: [number, number, number], to: [number, number, number]): SimSegment => ({ kind, line, from, to })

describe("feeds from the program", () => {
  test("the modal F word carries forward and comments are ignored", () => {
    const feeds = modalFeeds("G21\nG0 X0 Y0 (F9999 in a comment)\nG1 X10 F600\nG1 Y10\n; F1 note\nG1 X0 F1200\nG1 F0 X5")
    expect(feeds.slice(1)).toEqual([undefined, undefined, 600, 600, 600, 1200, 1200])
  })
  test("lowercase words and decimals parse", () => {
    expect(modalFeeds("g1 x1 f250.5")[1]).toBe(250.5)
  })
  test("a program with Windows line endings reads the same", () => {
    expect(modalFeeds("G1 X1 F250\r\nG1 X2\r\n")).toEqual([undefined, 250, 250, 250])
  })
  test("an empty program has no lines", () => {
    expect(modalFeeds("")).toEqual([undefined])
  })
})

describe("feeds match the desktop simulator", () => {
  test("rapid and fallback cutting feeds mirror packages/core", () => {
    expect(DEFAULT_RAPID_FEED).toBe(RAPID_FEEDRATE_MM_MIN)
    expect(FALLBACK_CUT_FEED).toBe(DEFAULT_CUTTING_FEEDRATE_MM_MIN)
  })
  test("a 100 mm rapid takes the desktop's 6 seconds", () => {
    expect(segmentDurations([segment("rapid", 1, [0, 0, 0], [100, 0, 0])], [])[0]).toBeCloseTo(6, 9)
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
    expect(indexAtTime(ends, ends[0]! + 0.01)).toBe(1)
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

describe("spindle display", () => {
  const spin = [
    { segment: 2, rate: 1 },
    { segment: 5, rate: 0.5 },
  ]

  test("the last run at or before the playhead is the spin in effect", () => {
    expect(spinRateAt([], 0, true)).toBe(0)
    expect(spinRateAt(spin, 0, true)).toBe(0)
    expect(spinRateAt(spin, 1.9, true)).toBe(0)
    expect(spinRateAt(spin, 2, true)).toBe(1)
    expect(spinRateAt(spin, 4.9, true)).toBe(1)
    expect(spinRateAt(spin, 5, true)).toBe(0.5)
    expect(spinRateAt(spin, 99, true)).toBe(0.5)
  })

  test("a paused or scrubbed preview holds the spindle still", () => {
    expect(spinRateAt(spin, 2, false)).toBe(0)
    expect(spinRateAt([{ segment: 0, rate: 1 }], 0, false)).toBe(0)
  })

  test("rates are clamped to what the display can show and bad numbers stop the spin", () => {
    expect(MAX_DISPLAY_REV_PER_SECOND).toBe(2)
    expect(spinRateAt([{ segment: 0, rate: 10 }], 0, true)).toBe(2)
    expect(spinRateAt([{ segment: 0, rate: -10 }], 0, true)).toBe(-2)
    expect(spinRateAt([{ segment: 0, rate: Number.NaN }], 0, true)).toBe(0)
    expect(spinRateAt([{ segment: 0, rate: 1 }], Number.NaN, true)).toBe(1)
  })

  test("a later run on the same segment replaces the earlier one", () => {
    expect(spinRateAt([{ segment: 0, rate: 1 }, { segment: 0, rate: -1 }], 0, true)).toBe(-1)
  })

  test("clockwise reads as ISO 6983 does for each machine kind", () => {
    expect(spinIsClockwise("lathe", 1)).toBe(true)
    expect(spinIsClockwise("lathe", -1)).toBe(false)
    expect(spinIsClockwise("lathe", 0)).toBe(false)
    expect(spinIsClockwise("mill", -1)).toBe(true)
    expect(spinIsClockwise("mill", 1)).toBe(false)
    expect(spinIsClockwise("3dprinter", 1)).toBe(false)
    expect(spinIsClockwise("3dprinter", -1)).toBe(false)
  })
})
