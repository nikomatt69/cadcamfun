import { describe, expect, test } from "bun:test"
import type { Vec2 } from "../../src/cad/vec.ts"
import { PocketParams, generatePocket } from "../../src/cam/operations/pocket.ts"
import { cuttingSegments, invariantViolations, run, sampleSegment } from "./helpers.ts"
import { makeRng, pointSeg, randomStar, stock100, tool3, tool6 } from "./fixtures.ts"

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 }
]
const params = (over: Record<string, unknown> = {}) => new PocketParams({ totalDepth: 4, stepdown: 2, ...over } as never)

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

/** Distance from `p` to the nearest cutting segment at the floor depth. */
const distanceToFloorPath = (p: Vec2, floorZ: number, segs: ReturnType<typeof cuttingSegments>): number => {
  let best = Infinity
  for (const s of segs) {
    if (s.kind === "dwell" || Math.abs(s.from.z - floorZ) > 1e-6 || Math.abs(s.to.z - floorZ) > 1e-6) continue
    best = Math.min(best, pointSeg(p, s.from, s.to))
  }
  return best
}

describe("Pocket", () => {
  const boundary = rect(20, 20, 80, 60)

  test("is a sound program and stays one radius inside the walls", () => {
    const tp = generatePocket(params(), boundary, tool6, stock100)
    expect(invariantViolations(tp, { stock: stock100, tool: tool6, totalDepth: 4 })).toEqual([])
    const { result } = run(tp)
    for (const s of cuttingSegments(result, -1e-9)) {
      if (s.kind === "dwell") continue
      for (const p of [s.from, s.to]) {
        expect(inRing(p, boundary)).toBe(true)
        expect(ringDistance(p, boundary)).toBeGreaterThanOrEqual(3 - 1e-6)
      }
    }
  })

  test("clears the whole tool-centre region: every reachable point is within a radius of the floor path", () => {
    const tp = generatePocket(params({ stepover: 50 }), boundary, tool6, stock100)
    const { result } = run(tp)
    const segs = cuttingSegments(result, -1e-9)
    for (let x = 23; x <= 77; x += 1.5) {
      for (let y = 23; y <= 57; y += 1.5) {
        expect(distanceToFloorPath({ x, y }, -4, segs)).toBeLessThanOrEqual(3 + 1e-6)
      }
    }
  })

  test("islands are never entered and keep a radius of clearance", () => {
    const island = rect(40, 30, 60, 50)
    const tp = generatePocket(params(), { boundary, islands: [island] }, tool6, stock100)
    expect(invariantViolations(tp, { stock: stock100, tool: tool6, totalDepth: 4 })).toEqual([])
    const { result } = run(tp)
    for (const s of cuttingSegments(result, -1e-9)) {
      if (s.kind === "dwell") continue
      for (let k = 0; k <= 4; k++) {
        const p = { x: s.from.x + ((s.to.x - s.from.x) * k) / 4, y: s.from.y + ((s.to.y - s.from.y) * k) / 4 }
        expect(inRing(p, island)).toBe(false)
        expect(ringDistance(p, island)).toBeGreaterThanOrEqual(3 - 1e-6)
      }
    }
  })

  test("a plain list of rings uses the largest as boundary and nested rings as islands", () => {
    const tp = generatePocket(params(), [rect(40, 30, 60, 50), boundary] as never, tool6, stock100)
    const { result } = run(tp)
    for (const s of cuttingSegments(result, -1e-9)) {
      if (s.kind === "dwell") continue
      expect(inRing(s.from, rect(40, 30, 60, 50))).toBe(false)
    }
  })

  test("enters with a helix when it fits, otherwise ramps; entry is within the pocket", () => {
    const tp = generatePocket(params({ entry: "helix" }), boundary, tool6, stock100)
    expect(tp.moves.some((m) => m._tag === "Arc")).toBe(true)
    const ramp = generatePocket(params({ entry: "ramp" }), boundary, tool6, stock100)
    expect(ramp.moves.some((m) => m._tag === "Arc")).toBe(false)
    expect(invariantViolations(ramp, { stock: stock100, tool: tool6, totalDepth: 4 })).toEqual([])
    const plunge = generatePocket(params({ entry: "plunge" }), boundary, tool6, stock100)
    expect(invariantViolations(plunge, { stock: stock100, tool: tool6, totalDepth: 4 })).toEqual([])
  })

  test("a narrow slot just wider than the tool still gets cleared", () => {
    const tp = generatePocket(params({ totalDepth: 2, stepdown: 2 }), rect(20, 40, 80, 47), tool6, stock100)
    expect(invariantViolations(tp, { stock: stock100, tool: tool6, totalDepth: 2 })).toEqual([])
    expect(cuttingSegments(run(tp).result, -1e-9).length).toBeGreaterThan(0)
  })

  test("a pocket narrower than the tool produces no cut", () => {
    const tp = generatePocket(params(), rect(20, 40, 80, 45), tool6, stock100)
    expect(tp.moves.every((m) => m._tag !== "Linear" && m._tag !== "Arc")).toBe(true)
  })

  test("a finishing pass leaves the wall pass at full depth, one radius from the wall", () => {
    const tp = generatePocket(params({ allowance: 0.4, finishPass: true }), boundary, tool6, stock100)
    expect(invariantViolations(tp, { stock: stock100, tool: tool6, totalDepth: 4 })).toEqual([])
    const { result } = run(tp)
    const floor = cuttingSegments(result, -1e-9).filter((s) => s.kind !== "dwell" && Math.abs(s.to.z + 4) < 1e-9 && Math.abs(s.from.z + 4) < 1e-9)
    const closest = Math.min(...floor.flatMap((s) => (s.kind === "dwell" ? [] : [ringDistance(s.to, boundary)])))
    expect(closest).toBeCloseTo(3, 6)
  })

  test("climb direction keeps the wall on the left: the boundary loop runs clockwise", () => {
    const tp = generatePocket(params({ totalDepth: 2, stepdown: 2, stepover: 100, entry: "plunge" }), rect(20, 20, 40, 40), tool6, stock100)
    const pts = tp.moves.flatMap((m) => (m._tag === "Linear" && m.to.z === -2 ? [{ x: m.to.x, y: m.to.y }] : []))
    const area = pts.reduce((a, p, i) => a + (p.x * pts[(i + 1) % pts.length]!.y - pts[(i + 1) % pts.length]!.x * p.y), 0)
    expect(area).toBeLessThan(0)
  })

  test("works with the smaller tool and the deterministic result is identical between runs", () => {
    const a = generatePocket(params({ stepover: 30 }), boundary, tool3, stock100)
    const b = generatePocket(params({ stepover: 30 }), boundary, tool3, stock100)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  test("property: random polygons are cleared without leaving the pocket or its wall clearance", () => {
    const rng = makeRng(2024)
    for (let trial = 0; trial < 20; trial++) {
      const ring = randomStar(rng, 50, 50, 14, 32)
      const entry = (["helix", "ramp", "plunge"] as const)[trial % 3]!
      const tp = generatePocket(params({ totalDepth: 3, stepdown: 1.5, entry }), ring, tool3, stock100)
      expect(invariantViolations(tp, { stock: stock100, tool: tool3, totalDepth: 3 })).toEqual([])
      const { result } = run(tp)
      for (const s of cuttingSegments(result, -1e-9)) {
        for (const p of sampleSegment(s, 12)) {
          expect(inRing(p, ring)).toBe(true)
          expect(ringDistance(p, ring)).toBeGreaterThanOrEqual(1.5 - 1e-6)
        }
      }
    }
  })
})
