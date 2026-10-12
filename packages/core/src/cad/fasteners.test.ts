import { describe, expect, test } from "bun:test"
import {
  KEYWAYS, METRIC_THREADS, clearanceHole, keywayFor, metricThread, minEdgeDistance, minHoleSpacing, requireThread, tapDrill, tappedHoleDepth, threadEngagement, toleranceGrade
} from "./fasteners.ts"

// The expected numbers below are written out from ISO 262 / ISO 273 / DIN 974-1 / DIN 6885 / ISO 286, not read from the table.
describe("metric thread table", () => {
  test("M8: pitch, tap drill, the three ISO 273 clearance series and the DIN 974 counterbore", () => {
    const m8 = requireThread("M8")
    expect(m8.d).toBe(8)
    expect(m8.pitch).toBe(1.25)
    expect(m8.tapDrill).toBe(6.8)
    expect(m8.clearance).toEqual({ fine: 8.4, medium: 9, coarse: 10 })
    expect([m8.counterboreDiameter, m8.counterboreDepth]).toEqual([15, 9])
    expect([m8.headDiameter, m8.headHeight]).toEqual([13, 8])
  })

  test("other spot checks: M10 tap drill 8.5, M12 medium clearance 13.5, M3 / M6 / M16 / M30", () => {
    expect(tapDrill("M10")).toBe(8.5)
    expect(clearanceHole("M12", "medium")).toBe(13.5)
    expect(clearanceHole("M3")).toBe(3.4) // the default fit is medium
    expect(clearanceHole("M6", "fine")).toBe(6.4)
    expect(tapDrill("M6")).toBe(5)
    expect(clearanceHole("M16", "coarse")).toBe(18.5)
    expect(tapDrill("M30")).toBe(26.5)
  })

  test("a tap drill is the major diameter minus the pitch (rounded to the drill series) for every size of the coarse thread", () => {
    for (const m of METRIC_THREADS) expect(Math.abs(m.d - m.pitch - m.tapDrill)).toBeLessThan(0.16)
  })

  test("clearance series grow fine < medium < coarse and all exceed the thread; counterbore exceeds the head", () => {
    for (const m of METRIC_THREADS) {
      expect(m.clearance.fine).toBeGreaterThan(m.d)
      expect(m.clearance.medium).toBeGreaterThanOrEqual(m.clearance.fine)
      expect(m.clearance.coarse).toBeGreaterThan(m.clearance.medium)
      expect(m.counterboreDiameter).toBeGreaterThan(m.headDiameter)
      expect(m.counterboreDepth).toBeGreaterThan(m.headHeight * 0.8)
    }
  })

  test("sizes are found as M8, m8, 8, '8' and 8mm", () => {
    for (const s of ["M8", "m8", "8", "8mm", 8, " M8 "]) expect(metricThread(s)?.name).toBe("M8")
    expect(metricThread("M2.5")?.pitch).toBe(0.45)
  })

  test("an unknown size is undefined, and requireThread names the sizes it knows", () => {
    expect(metricThread("M7")).toBeUndefined()
    expect(metricThread("bolt")).toBeUndefined()
    expect(() => requireThread("M7")).toThrow(/Unknown metric thread 'M7'.*M3.*M8.*M30/)
    expect(() => clearanceHole("M99")).toThrow(RangeError)
    expect(() => tapDrill("x")).toThrow(RangeError)
  })

  test("thread engagement is 1 d in steel, 1.5 d in aluminium, 2 d in cast iron and plastic", () => {
    expect(threadEngagement("M8")).toBe(8)
    expect(threadEngagement("M8", "steel")).toBe(8)
    expect(threadEngagement("M8", "aluminium")).toBe(12)
    expect(threadEngagement("M8", "cast")).toBe(16)
    expect(threadEngagement("M8", "plastic")).toBe(16)
  })

  test("a tapped hole is the thread plus two pitches plus 0.3 d for the drill point", () => {
    expect(tappedHoleDepth("M8", 12)).toBeCloseTo(12 + 2 * 1.25 + 0.3 * 8, 9)
    expect(tappedHoleDepth("M6", 6)).toBeCloseTo(6 + 2 + 1.8, 9)
  })
})

describe("hole placement rules", () => {
  test("centre to edge is 1.5 d in metal and 2 d in cast parts and plastics", () => {
    expect(minEdgeDistance(10)).toBe(15)
    expect(minEdgeDistance(10, "metal")).toBe(15)
    expect(minEdgeDistance(10, "cast")).toBe(20)
    expect(minEdgeDistance(10, "plastic")).toBe(20)
  })

  test("centre to centre is 2.5 x the larger hole, in either order", () => {
    expect(minHoleSpacing(8)).toBe(20)
    expect(minHoleSpacing(8, 12)).toBe(30)
    expect(minHoleSpacing(12, 8)).toBe(30)
  })
})

describe("DIN 6885 keyways", () => {
  test("the boundaries: over 6 up to and including 8, and so on", () => {
    expect(keywayFor(6)).toBeUndefined()
    expect(keywayFor(6.01)).toMatchObject({ b: 2, h: 2, t1: 1.2, t2: 1.0 })
    expect(keywayFor(8)).toMatchObject({ b: 2, h: 2, t1: 1.2 })
    expect(keywayFor(8.01)).toMatchObject({ b: 3, h: 3, t1: 1.8 })
    expect(keywayFor(22)).toMatchObject({ b: 6, h: 6, t1: 3.5 })
    expect(keywayFor(22.01)).toMatchObject({ b: 8, h: 7, t1: 4.0, t2: 3.3 })
    expect(keywayFor(30)).toMatchObject({ b: 8, h: 7, t1: 4.0 })
    expect(keywayFor(50)).toMatchObject({ b: 14, h: 9, t1: 5.5 })
    expect(keywayFor(75)).toMatchObject({ b: 20, h: 12, t1: 7.5, t2: 4.9 })
    expect(keywayFor(76)).toBeUndefined()
    expect(keywayFor(5)).toBeUndefined()
  })

  test("the ranges are contiguous and ordered, and shaft slot + hub slot is the key height plus a small clearance", () => {
    KEYWAYS.forEach((k, i) => {
      if (i > 0) expect(k.over).toBe(KEYWAYS[i - 1]!.upTo)
      expect(k.t1 + k.t2).toBeGreaterThan(k.h) // the key sits in both slots with a clearance
      expect(k.t1 + k.t2).toBeLessThan(k.h + 1)
    })
  })
})

describe("ISO 286 tolerance grades", () => {
  test("IT7 at 25 mm is 21 micrometres, IT6 at 25 mm 13, IT8 at 25 mm 33, IT11 at 100 mm 220", () => {
    expect(toleranceGrade(7, 25)).toBe(21)
    expect(toleranceGrade(6, 25)).toBe(13)
    expect(toleranceGrade(8, 25)).toBe(33)
    expect(toleranceGrade(11, 100)).toBe(220)
  })

  test("a range upper bound belongs to that range; IT5 at 3 mm is 4", () => {
    expect(toleranceGrade(5, 3)).toBe(4)
    expect(toleranceGrade(5, 3.01)).toBe(5)
    expect(toleranceGrade(7, 30)).toBe(21)
    expect(toleranceGrade(7, 30.01)).toBe(25)
  })

  test("a coarser grade is wider, and the table stops at 250 mm", () => {
    expect(toleranceGrade(9, 40)).toBeGreaterThan(toleranceGrade(8, 40))
    expect(toleranceGrade(7, 250)).toBe(46)
    expect(() => toleranceGrade(7, 251)).toThrow(RangeError)
  })
})
