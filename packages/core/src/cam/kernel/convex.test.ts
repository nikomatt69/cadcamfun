import { describe, expect, test } from "bun:test"
import { boxVertices, cylinderPrism, hullDistance } from "./convex.ts"

const unit = { x: 0, y: 0, z: 1 }
describe("exact convex distance", () => {
  test("a point is at its exact distance from a box", () => {
    const box = boxVertices({ x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 }) // [0, 10]^3
    const d = hullDistance([{ x: 13, y: 14, z: 15 }], box)
    expect(d.overlap).toBe(false)
    expect(d.distance).toBeCloseTo(Math.sqrt(9 + 16 + 25), 8) // the corner (10, 10, 10)
  })

  test("two parallel faces are at the exact gap between them", () => {
    const box = boxVertices({ x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 })
    // The upper box spans z in [11, 15]: its underside is one millimetre above the lower box's top at z = 10.
    const above = boxVertices({ x: 5, y: 5, z: 13 }, { x: 2, y: 2, z: 2 })
    expect(hullDistance(above, box).distance).toBeCloseTo(1, 8)
  })

  test("an edge-to-edge closest pair is found, not only vertex-to-face ones", () => {
    const box = boxVertices({ x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 }) // edge x = 10, z = 10 along y
    const bar = [{ x: 13, y: -3, z: 13 }, { x: 13, y: 20, z: 13 }] // parallel to that edge
    expect(hullDistance(bar, box).distance).toBeCloseTo(Math.hypot(3, 3), 8)
  })

  test("overlapping hulls are reported as overlapping", () => {
    const box = boxVertices({ x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 })
    expect(hullDistance([{ x: 5, y: 5, z: 5 }], box).overlap).toBe(true)
  })

  test("a prism's flat end is exact: a disc above a box is measured to its face, not to a rounded end", () => {
    const box = boxVertices({ x: 0, y: 0, z: -10 }, { x: 50, y: 50, z: 5 }) // top at z = -5
    const prism = cylinderPrism({ x: 0, y: 0, z: 0 }, unit, 2, 8, 6, 32) // bottom at z = 2, radius 6
    expect(hullDistance(prism, box).distance).toBeCloseTo(7, 6)
  })

  test("a prism's circumscribed radius is never under-estimated against a side wall", () => {
    const box = boxVertices({ x: 30, y: 0, z: 0 }, { x: 5, y: 50, z: 50 }) // wall at x = 25
    const prism = cylinderPrism({ x: 0, y: 0, z: 0 }, unit, 0, 10, 10, 32)
    const d = hullDistance(prism, box).distance
    expect(d).toBeLessThanOrEqual(15 + 1e-9)
    expect(d).toBeGreaterThan(14.9)
  })
})
