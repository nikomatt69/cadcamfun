import { describe, expect, test } from "bun:test"
import { projectView } from "../../drawing/project.ts"
import { meshOf } from "../solid.ts"
import { auxiliaryView, brokenView, halfView } from "./views.ts"

const bar = meshOf({ _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: 100, y: 10, z: 10 } })
const front = projectView(bar, "front")
const xs = (segs: ReadonlyArray<{ a: { x: number }; b: { x: number } }>) => segs.flatMap((s) => [s.a.x, s.b.x])

describe("auxiliary view", () => {
  test("looking along the normal of a 45 degree face shows that face at true size", () => {
    // a wedge-like extrude: a plate inclined 45 degrees is a box rotated; use the diagonal viewing direction of a cube
    const cube = meshOf({ _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 10, z: 10 } })
    const aux = auxiliaryView(cube, { x: 0, y: -1, z: 1 })
    // seen along (0,-1,1): the cube's x extent is 10, the diagonal extent is 10*sqrt(2)*... = 10 (z') + 10/sqrt2*2
    const w = aux.view.bounds.maxX - aux.view.bounds.minX
    const h = aux.view.bounds.maxY - aux.view.bounds.minY
    expect(w).toBeCloseTo(10, 6)
    expect(h).toBeCloseTo(20 / Math.SQRT2 * 1, 6)
    expect(() => auxiliaryView(cube, { x: 0, y: 0, z: 0 })).toThrow()
  })
})

describe("half view", () => {
  test("keeps only the low side of the axis and marks the symmetry line", () => {
    const h = halfView(front, "x", 50, "low")
    expect(Math.max(...xs(h.visible))).toBeLessThanOrEqual(50 + 1e-9)
    expect(Math.min(...xs(h.visible))).toBeCloseTo(0, 9)
    expect(h.centreLine.a.x).toBe(50)
    expect(h.symmetryMarks.length).toBe(4)
    // the cut outline edges end exactly on the axis
    expect(xs(h.visible).some((x) => Math.abs(x - 50) < 1e-9)).toBe(true)
  })
})

describe("broken view", () => {
  const b = brokenView(front, "x", 30, 80, 4)
  test("removes the band, closes the gap and reports the removed length", () => {
    expect(b.removed).toBeCloseTo(46, 9)
    const x = xs(b.visible)
    expect(Math.min(...x)).toBeCloseTo(0, 9)
    expect(Math.max(...x)).toBeCloseTo(100 - 46, 9)
    expect(x.every((v) => v <= 30 + 1e-9 || v >= 34 - 1e-9)).toBe(true)
  })
  test("true coordinates survive the break and the gap has none", () => {
    expect(b.trueCoordinate(20)).toBe(20)
    expect(b.trueCoordinate(54)).toBeCloseTo(100, 9)
    expect(b.trueCoordinate(32)).toBeUndefined()
    expect(b.breakLines.length).toBe(16)
  })
  test("a band outside the view or a gap wider than the band is refused", () => {
    expect(() => brokenView(front, "x", -5, 20)).toThrow()
    expect(() => brokenView(front, "x", 30, 40, 10)).toThrow()
  })
})
