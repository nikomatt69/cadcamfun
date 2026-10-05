import { describe, expect, test } from "bun:test"
import { circle, line, polyline } from "../../src/cad/testing.ts"
import { ProfileParams, generateProfile } from "../../src/cam/operations/profile.ts"
import type { Vec2 } from "../../src/cad/vec.ts"
import { cuttingSegments, invariantViolations, run, sampleSegment } from "./helpers.ts"
import { makeRng, pointSeg, randomStar, segSegDistance, square40, stock100, tool3, tool6 } from "./fixtures.ts"

const params = (over: Record<string, unknown> = {}) =>
  new ProfileParams({ totalDepth: 4, stepdown: 2, ...over } as never)

const ringDistance = (p: Vec2, ring: ReadonlyArray<Vec2>): number => {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) best = Math.min(best, pointSeg(p, ring[i]!, ring[(i + 1) % ring.length]!))
  return best
}
const inRing = (p: Vec2, ring: ReadonlyArray<Vec2>): boolean => {
  let r = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) r = !r
  }
  return r
}

const cutPoints = (toolpath: ReturnType<typeof generateProfile>): Vec2[] => {
  const { result } = run(toolpath)
  const pts: Vec2[] = []
  for (const s of cuttingSegments(result, -1e-9)) {
    if (s.kind === "dwell") continue
    pts.push({ x: s.from.x, y: s.from.y }, { x: s.to.x, y: s.to.y })
  }
  return pts
}

describe("Profile", () => {
  test("outside: the tool centre stays one radius away, outside the square, corners are mitred", () => {
    const tp = generateProfile(params(), square40, tool6, stock100)
    expect(invariantViolations(tp, { stock: stock100, tool: tool6, totalDepth: 4 })).toEqual([])
    for (const p of cutPoints(tp)) {
      expect(ringDistance(p, square40)).toBeGreaterThanOrEqual(3 - 1e-6)
      expect(inRing(p, square40)).toBe(false)
    }
    const xs = cutPoints(tp).map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(17, 6)
    expect(Math.max(...xs)).toBeCloseTo(63, 6)
  })

  test("inside: the tool centre stays one radius inside", () => {
    const tp = generateProfile(params({ side: "inside" }), square40, tool6, stock100)
    expect(invariantViolations(tp, { stock: stock100, tool: tool6, totalDepth: 4 })).toEqual([])
    for (const p of cutPoints(tp)) {
      expect(inRing(p, square40)).toBe(true)
      expect(ringDistance(p, square40)).toBeGreaterThanOrEqual(3 - 1e-6)
    }
    const xs = cutPoints(tp).map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(23, 6)
  })

  test("onLine follows the geometry itself, allowance 0 is honoured", () => {
    const tp = generateProfile(params({ side: "onLine", allowance: 0 }), square40, tool6, stock100)
    const xs = cutPoints(tp).map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(20, 9)
    expect(Math.max(...xs)).toBeCloseTo(60, 9)
  })

  test("allowance moves the outside path outwards", () => {
    const tp = generateProfile(params({ allowance: 0.5 }), square40, tool6, stock100)
    expect(Math.min(...cutPoints(tp).map((p) => p.x))).toBeCloseTo(16.5, 6)
  })

  test("climb milling travels counter-clockwise outside and clockwise inside; conventional flips it", () => {
    const area = (pts: Vec2[]) => pts.reduce((a, p, i) => a + (p.x * pts[(i + 1) % pts.length]!.y - pts[(i + 1) % pts.length]!.x * p.y), 0)
    const lap = (over: Record<string, unknown>) => {
      const tp = generateProfile(params({ totalDepth: 1, stepdown: 1, ...over }), square40, tool6, stock100)
      const corners = tp.moves.flatMap((m) => (m._tag === "Linear" && m.to.z === -1 ? [{ x: m.to.x, y: m.to.y }] : []))
      return area(corners.slice(0, 4))
    }
    expect(lap({ side: "outside", climb: true })).toBeGreaterThan(0)
    expect(lap({ side: "outside", climb: false })).toBeLessThan(0)
    expect(lap({ side: "inside", climb: true })).toBeLessThan(0)
    expect(lap({ side: "inside", climb: false })).toBeGreaterThan(0)
  })

  test("a circle stays an exact arc at the offset radius", () => {
    const c = circle("c", { x: 50, y: 50 }, 10)
    const tp = generateProfile(params(), c, tool6, stock100)
    expect(tp.moves.some((m) => m._tag === "Arc")).toBe(true)
    expect(tp.moves.every((m) => m._tag !== "Linear" || m.to.z >= -4 - 1e-9)).toBe(true)
    const { result } = run(tp)
    const arcs = result.segments.filter((s) => s.kind === "arc")
    expect(arcs.length).toBeGreaterThan(0)
    for (const a of arcs) {
      if (a.kind === "arc") {
        expect(a.radiusStart).toBeCloseTo(13, 6)
        expect(a.radiusEnd).toBeCloseTo(13, 6)
      }
    }
    expect(invariantViolations(tp, { stock: stock100, tool: tool6, totalDepth: 4 })).toEqual([])
  })

  test("an inside circle smaller than the tool produces nothing", () => {
    const tp = generateProfile(params({ side: "inside" }), circle("c", { x: 50, y: 50 }, 2), tool6, stock100)
    expect(tp.moves.some((m) => m._tag === "Linear")).toBe(false)
  })

  test("an open line is offset to the right and cut in several passes without rapids at depth", () => {
    const l = line("l", { x: 10, y: 50 }, { x: 90, y: 50 })
    const tp = generateProfile(params({ totalDepth: 6, stepdown: 2 }), l, tool6, stock100)
    expect(invariantViolations(tp, { stock: stock100, tool: tool6, totalDepth: 6 })).toEqual([])
    const ys = cutPoints(tp).map((p) => p.y)
    for (const y of ys) expect(y).toBeCloseTo(47, 6)
  })

  test("polylines with bulges are tessellated and offset", () => {
    const pl = { ...polyline("p", [{ x: 20, y: 20 }, { x: 60, y: 20 }, { x: 60, y: 60 }, { x: 20, y: 60 }], true), bulge: [0, 0, 0.5, 0] }
    const tp = generateProfile(params(), pl, tool6, stock100)
    expect(invariantViolations(tp, { stock: stock100, tool: tool6, totalDepth: 4 })).toEqual([])
  })

  test("tabs leave material standing", () => {
    const base = generateProfile(params({ totalDepth: 4, stepdown: 4 }), square40, tool6, stock100)
    const tabbed = generateProfile(
      params({ totalDepth: 4, stepdown: 4, tabs: [{ position: 0.5, width: 8, height: 1.5 }] }),
      square40,
      tool6,
      stock100
    )
    const floorMoves = (tp: typeof base) => tp.moves.filter((m) => m._tag === "Linear" && Math.abs(m.to.z + 4) < 1e-9).length
    expect(floorMoves(tabbed)).toBeLessThan(floorMoves(base) + 3)
    const tabZ = tabbed.moves.filter((m) => m._tag === "Linear" && Math.abs(m.to.z + 2.5) < 1e-9)
    expect(tabZ.length).toBeGreaterThan(0)
    expect(invariantViolations(tabbed, { stock: stock100, tool: tool6, totalDepth: 4 })).toEqual([])
  })

  test("heights must be ordered", () => {
    expect(() => params({ clearanceHeight: 1, safeHeight: 5 })).toThrow()
  })

  test("property: an outside profile of random polygons never enters the polygon", () => {
    const rng = makeRng(4242)
    for (let trial = 0; trial < 40; trial++) {
      const ring = randomStar(rng, 50, 50, 8, 30)
      const r = tool3.diameter / 2
      const tp = generateProfile(params({ totalDepth: 2, stepdown: 1 }), ring, tool3, stock100)
      const { result } = run(tp)
      const segs = cuttingSegments(result, -1e-9)
      expect(segs.length).toBeGreaterThan(0)
      for (const s of segs) {
        if (s.kind !== "linear") continue
        for (let i = 0; i < ring.length; i++) {
          const d = segSegDistance(s.from, s.to, ring[i]!, ring[(i + 1) % ring.length]!)
          expect(d).toBeGreaterThanOrEqual(r - 1e-6)
        }
        expect(inRing({ x: s.from.x, y: s.from.y }, ring)).toBe(false)
      }
    }
  })

  test("property: lead-ins (helix, arc, ramp) never gouge the part either", () => {
    const rng = makeRng(777)
    for (let trial = 0; trial < 30; trial++) {
      const ring = randomStar(rng, 50, 50, 10, 30)
      const r = tool3.diameter / 2
      for (const leadIn of ["direct", "ramp", "helix", "arc"] as const) {
        const tp = generateProfile(params({ totalDepth: 2, stepdown: 1, leadIn }), ring, tool3, stock100)
        const { result } = run(tp)
        for (const s of cuttingSegments(result, -1e-9)) {
          for (const p of sampleSegment(s)) {
            expect(inRing(p, ring)).toBe(false)
            expect(ringDistance(p, ring)).toBeGreaterThanOrEqual(r - 1e-6)
          }
        }
        expect(invariantViolations(tp, { stock: stock100, tool: tool3, totalDepth: 2 })).toEqual([])
      }
    }
  })

  test("inside profiles of random polygons stay inside with every lead-in", () => {
    const rng = makeRng(778)
    for (let trial = 0; trial < 30; trial++) {
      const ring = randomStar(rng, 50, 50, 14, 30)
      const r = tool3.diameter / 2
      for (const leadIn of ["direct", "ramp", "helix", "arc"] as const) {
        const tp = generateProfile(params({ totalDepth: 2, stepdown: 1, leadIn, side: "inside" }), ring, tool3, stock100)
        const { result } = run(tp)
        for (const s of cuttingSegments(result, -1e-9)) {
          for (const p of sampleSegment(s)) {
            expect(inRing(p, ring)).toBe(true)
            expect(ringDistance(p, ring)).toBeGreaterThanOrEqual(r - 1e-6)
          }
        }
      }
    }
  })
})
