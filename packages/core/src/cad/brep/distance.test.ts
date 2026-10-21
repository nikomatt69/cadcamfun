import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { frame, makeBox, makeCylinder, makeSphere, makeTorus, minimumDistance } from "./index.ts"

setDefaultTimeout(60_000)
const at = (x: number, y: number, z: number, a = { x: 0, y: 0, z: 1 }) => frame({ x, y, z }, a)

describe("minimum distance between solids", () => {
  test("two boxes: the face gap", () => {
    const r = minimumDistance(makeBox(10, 10, 10), makeBox(10, 10, 10, at(13, 2, 3)))
    expect(r.overlap).toBe(false)
    expect(r.distance).toBeCloseTo(3, 9)
  })
  test("two spheres: centre distance minus the radii, to far better than the mesh", () => {
    const r = minimumDistance(makeSphere(5), makeSphere(3, at(20, 0, 0)))
    expect(r.distance).toBeCloseTo(12, 9)
    expect(r.pointA.x).toBeCloseTo(5, 6)
    expect(r.pointB.x).toBeCloseTo(17, 6)
  })
  test("a sphere off-axis from a cylinder", () => {
    const r = minimumDistance(makeCylinder(4, 20, at(0, 0, -10)), makeSphere(2, at(10, 0, 3)))
    expect(r.distance).toBeCloseTo(4, 9)
  })
  test("a sphere in a torus's hole, and one on its tube", () => {
    expect(minimumDistance(makeTorus(10, 2), makeSphere(3)).distance).toBeCloseTo(5, 9)
    expect(minimumDistance(makeTorus(10, 2), makeSphere(1, at(10, 0, 6))).distance).toBeCloseTo(3, 9)
  })
  test("overlapping solids have distance 0 and say so; touching solids are not an overlap", () => {
    const o = minimumDistance(makeBox(10, 10, 10), makeBox(10, 10, 10, at(5, 5, 5)))
    expect(o.overlap).toBe(true)
    expect(o.distance).toBe(0)
    const t = minimumDistance(makeBox(10, 10, 10), makeBox(10, 10, 10, at(10, 0, 0)))
    expect(t.overlap).toBe(false)
    expect(t.distance).toBeLessThan(1e-9)
  })
})
