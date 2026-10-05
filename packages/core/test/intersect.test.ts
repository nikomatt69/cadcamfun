import { describe, expect, test } from "bun:test"
import { type Entity, baseEntity, isClosedShape } from "../src/cad/entities.ts"
import { intersect, intersectCircles, intersectSegmentCircle, intersectSegments } from "../src/cad/intersect.ts"
import { tessellate } from "../src/cad/tessellate.ts"
import type { Vec2 } from "../src/cad/vec.ts"
import { makeRng, pointSeg } from "./cam/fixtures.ts"

const e = (extra: Record<string, unknown>): Entity => ({ ...baseEntity("x"), ...extra }) as Entity

const distanceToCurve = (p: Vec2, entity: Entity): number => {
  let best = Infinity
  const closed = isClosedShape(entity)
  for (const ring of tessellate(entity, 1e-5)) {
    const n = closed ? ring.length : ring.length - 1
    for (let i = 0; i < n; i++) best = Math.min(best, pointSeg(p, ring[i]!, ring[(i + 1) % ring.length]!))
  }
  return best
}

/** Brute-force crossings between the fine tessellations of two entities. */
const bruteForce = (a: Entity, b: Entity): Vec2[] => {
  const chains = (entity: Entity): Array<[Vec2, Vec2]> => {
    const out: Array<[Vec2, Vec2]> = []
    const closed = isClosedShape(entity)
    for (const ring of tessellate(entity, 1e-3)) {
      const n = closed ? ring.length : ring.length - 1
      for (let i = 0; i < n; i++) out.push([ring[i]!, ring[(i + 1) % ring.length]!])
    }
    return out
  }
  const hits: Vec2[] = []
  for (const [p, q] of chains(a)) for (const [r, s] of chains(b)) hits.push(...intersectSegments({ a: p, b: q }, { a: r, b: s }, 1e-9))
  return hits
}

describe("intersect kernels", () => {
  test("a segment that ends inside the circle reports only the hits within its extent", () => {
    // The infinite line would cut the circle twice; the segment from x=-10 to x=0 only once.
    const hits = intersectSegmentCircle({ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 5)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.x).toBeCloseTo(-5, 9)
    // A segment entirely inside the circle never touches it.
    expect(intersectSegmentCircle({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, 5)).toHaveLength(0)
    // A segment that stops short of the circle misses it.
    expect(intersectSegmentCircle({ x: -20, y: 0 }, { x: -10, y: 0 }, { x: 0, y: 0 }, 5)).toHaveLength(0)
  })

  test("a line entity does not hit a circle beyond its ends", () => {
    const circle = e({ _tag: "Circle", center: { x: 0, y: 0 }, radius: 5 })
    expect(intersect(circle, e({ _tag: "Line", start: { x: 6, y: 0 }, end: { x: 20, y: 0 } }))).toHaveLength(0)
    expect(intersect(circle, e({ _tag: "Line", start: { x: -20, y: 0 }, end: { x: 0, y: 0 } }))).toHaveLength(1)
  })

  test("tangency within EPS is one point, even with rounding noise", () => {
    expect(intersectSegmentCircle({ x: -10, y: 5 + 1e-12 }, { x: 10, y: 5 + 1e-12 }, { x: 0, y: 0 }, 5)).toHaveLength(1)
    expect(intersectCircles({ x: 0, y: 0 }, 5, { x: 10 + 1e-12, y: 0 }, 5)).toHaveLength(1)
    expect(intersectCircles({ x: 0, y: 0 }, 5, { x: 2, y: 0 }, 3)).toHaveLength(1) // internal tangency
  })

  test("a polyline arc segment (bulge) is intersected as an arc", () => {
    // Semicircle from (0,0) to (10,0) bowing downwards (positive bulge is counter-clockwise).
    const pl = e({ _tag: "Polyline", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false, bulge: [1, 0] })
    const line = e({ _tag: "Line", start: { x: 5, y: -10 }, end: { x: 5, y: 10 } })
    const hits = intersect(pl, line)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.y).toBeCloseTo(-5, 9)
  })

  test("blocks are flattened at their base point", () => {
    const block = e({ _tag: "Block", name: "b", basePoint: { x: 10, y: 0 }, entities: [e({ _tag: "Line", start: { x: 0, y: -1 }, end: { x: 0, y: 1 } })] })
    const hits = intersect(block, e({ _tag: "Line", start: { x: 0, y: 0 }, end: { x: 20, y: 0 } }))
    expect(hits).toEqual([{ x: 10, y: 0 }])
  })
})

describe("intersect property tests", () => {
  const rng = makeRng(31337)
  const r = (lo: number, hi: number): number => lo + (hi - lo) * rng()
  const pt = (): Vec2 => ({ x: r(-10, 10), y: r(-10, 10) })
  const random = (): Entity => {
    switch (Math.floor(rng() * 6)) {
      case 0:
        return e({ _tag: "Line", start: pt(), end: pt() })
      case 1:
        return e({ _tag: "Circle", center: pt(), radius: r(1, 9) })
      case 2:
        return e({ _tag: "Arc", center: pt(), radius: r(1, 9), startAngle: r(0, 6.2), endAngle: r(0, 6.2), clockwise: rng() < 0.5 })
      case 3:
        return e({ _tag: "Polyline", points: [pt(), pt(), pt()], closed: rng() < 0.5, bulge: [r(-1, 1), 0, r(-1, 1)] })
      case 4:
        return e({ _tag: "Rectangle", corner1: pt(), corner2: pt() })
      default:
        return e({ _tag: "Ellipse", center: pt(), radiusX: r(2, 9), radiusY: r(1, 4), rotation: r(0, 6) })
    }
  }

  test("every reported point lies on both curves", () => {
    for (let i = 0; i < 300; i++) {
      const a = random()
      const b = random()
      for (const p of intersect(a, b)) {
        expect(distanceToCurve(p, a)).toBeLessThanOrEqual(1e-4)
        expect(distanceToCurve(p, b)).toBeLessThanOrEqual(1e-4)
      }
    }
  })

  test("every crossing found by brute force is reported", () => {
    for (let i = 0; i < 150; i++) {
      const a = random()
      const b = random()
      const found = intersect(a, b)
      for (const h of bruteForce(a, b)) {
        const near = found.some((p) => Math.hypot(p.x - h.x, p.y - h.y) <= 5e-3)
        expect(near).toBe(true)
      }
    }
  })
})
