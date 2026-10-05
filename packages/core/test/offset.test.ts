import { describe, expect, test } from "bun:test"
import { offsetPolyline, offsetRings } from "../src/cad/offset.ts"
import { signedArea } from "../src/cad/shapes.ts"
import type { Vec2 } from "../src/cad/vec.ts"
import { makeRng, pointSeg, randomStar } from "./cam/fixtures.ts"

const minDistance = (p: Vec2, ring: ReadonlyArray<Vec2>): number => {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) best = Math.min(best, pointSeg(p, ring[i]!, ring[(i + 1) % ring.length]!))
  return best
}

const inside = (p: Vec2, ring: ReadonlyArray<Vec2>): boolean => {
  let r = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!
    const b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) r = !r
  }
  return r
}

describe("offsetRings / robust offsetting", () => {
  const L: Vec2[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 4 },
    { x: 4, y: 4 },
    { x: 4, y: 10 },
    { x: 0, y: 10 }
  ]

  test("an L-shape shrinks to the inset L-shape (concave corner handled)", () => {
    const loops = offsetPolyline(L, -1, true)
    expect(loops).toHaveLength(1)
    expect(Math.abs(signedArea(loops[0]!))).toBeCloseTo(8 * 2 + 2 * 6, 6) // 8x2 arm + 2x6 arm
  })

  test("an L-shape grows with a mitred reflex corner", () => {
    const loops = offsetPolyline(L, 1, true)
    expect(loops).toHaveLength(1)
    expect(loops[0]).toContainEqual({ x: 5, y: 5 })
  })

  test("a dumbbell splits into two loops when the neck collapses", () => {
    const dumbbell: Vec2[] = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 20, y: 4 }, { x: 20, y: 0 }, { x: 30, y: 0 },
      { x: 30, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 6 }, { x: 10, y: 6 }, { x: 10, y: 10 }, { x: 0, y: 10 }
    ]
    expect(offsetPolyline(dumbbell, -1.5, true)).toHaveLength(2)
    expect(offsetPolyline(dumbbell, -0.5, true)).toHaveLength(1)
  })

  test("a pocket boundary and its island offset together", () => {
    const boundary: Vec2[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 0, y: 30 }].reverse()
    const island: Vec2[] = [{ x: 15, y: 10 }, { x: 15, y: 20 }, { x: 25, y: 20 }, { x: 25, y: 10 }].reverse()
    const rings = (d: number) =>
      offsetRings([{ points: boundary, closed: true }, { points: island, closed: true }], d, { keep: "inside" })
    expect(rings(3)).toHaveLength(2) // boundary loop and island loop
    expect(rings(6)).toHaveLength(2) // two disconnected side strips
    expect(rings(8)).toHaveLength(0)
  })

  test("an open polyline offsets to its right with a mitre at the bend", () => {
    const loops = offsetRings([{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: false }], 1)
    expect(loops).toHaveLength(1)
    expect(loops[0]!.closed).toBe(false)
    expect(loops[0]!.points[0]).toEqual({ x: 0, y: -1 })
    expect(loops[0]!.points.at(-1)).toEqual({ x: 11, y: 10 })
  })

  test("property: outward offsets of random simple polygons keep their distance and stay outside", () => {
    const rng = makeRng(20260601)
    for (let trial = 0; trial < 60; trial++) {
      const ring = randomStar(rng, 0, 0, 8, 30)
      const d = 0.5 + rng() * 3
      const loops = offsetPolyline(ring, d, true, { mitreLimit: 2, joinFallback: "round" })
      expect(loops.length).toBeGreaterThan(0)
      for (const loop of loops) {
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i]!
          const b = loop[(i + 1) % loop.length]!
          for (const p of [a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]) {
            expect(minDistance(p, ring)).toBeGreaterThanOrEqual(d - 1e-6)
            expect(inside(p, ring)).toBe(false)
          }
        }
      }
    }
  })

  test("property: inward offsets stay inside and keep their distance", () => {
    const rng = makeRng(77)
    for (let trial = 0; trial < 60; trial++) {
      const ring = randomStar(rng, 0, 0, 10, 30)
      const d = 0.3 + rng() * 2
      for (const loop of offsetPolyline(ring, -d, true, { mitreLimit: 2, joinFallback: "round" })) {
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i]!
          const b = loop[(i + 1) % loop.length]!
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          expect(inside(mid, ring)).toBe(true)
          expect(minDistance(mid, ring)).toBeGreaterThanOrEqual(d - 1e-6)
        }
      }
    }
  })

  test("round joins never come closer than the offset distance", () => {
    const spike: Vec2[] = [{ x: 0, y: 0 }, { x: 20, y: 2 }, { x: 0, y: 4 }]
    const d = 1
    const loops = offsetPolyline(spike, d, true, { arcJoins: true })
    expect(loops).toHaveLength(1)
    for (let i = 0; i < loops[0]!.length; i++) {
      const a = loops[0]![i]!
      const b = loops[0]![(i + 1) % loops[0]!.length]!
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      expect(minDistance(mid, spike)).toBeGreaterThanOrEqual(d - 1e-6)
    }
  })
})
