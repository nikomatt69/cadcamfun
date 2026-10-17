import { describe, expect, test } from "bun:test"
import {
  boxEdges,
  cameraBasis,
  changeComponentPrompt,
  defineComponentPrompt,
  dot,
  fitOrbit,
  hitMeshPart,
  frameOrbit,
  isDoubleTap,
  MAX_PITCH,
  niceStep,
  viewOrbit,
  mvpOf,
  normalize,
  orbitDrag,
  rayFromScreen,
  segmentIndexForLine,
  sub,
  transformPoint,
} from "../lib/preview-math"

describe("preview camera", () => {
  const bounds = { min: [0, 0, 0] as const, max: [10, 10, 10] as const }

  test("fit frames the centre and the centre ray looks at it", () => {
    const orbit = fitOrbit(bounds)
    expect(orbit.target).toEqual([5, 5, 5])
    expect(orbit.distance).toBeGreaterThan(1)
    const { eye, forward } = cameraBasis(orbit)
    const toward = normalize(sub(orbit.target, eye))
    expect(dot(toward, forward)).toBeGreaterThan(0.999)
    const ray = rayFromScreen(orbit, 1, 0, 0)
    expect(dot(normalize(sub(orbit.target, ray.origin)), ray.direction)).toBeGreaterThan(0.999)
    const projected = transformPoint(mvpOf(orbit, 1), orbit.target)
    expect(Math.abs(projected.x)).toBeLessThan(1e-5)
    expect(Math.abs(projected.y)).toBeLessThan(1e-5)
  })

  test("drag clamps the pitch", () => {
    const orbit = fitOrbit(bounds)
    expect(orbitDrag(orbit, 0, 10_000).pitch).toBeLessThanOrEqual(MAX_PITCH)
    expect(orbitDrag(orbit, 0, -10_000).pitch).toBeGreaterThanOrEqual(-MAX_PITCH)
  })
})

describe("preview picking and toolpath sync", () => {
  test("a ray through a triangle names its part and misses empty space", () => {
    const positions = [0, 0, 0, 2, 0, 0, 0, 2, 0]
    const indices = [0, 1, 2]
    const parts = [{ id: "plate", triangleStart: 0, triangleCount: 1 }]
    const hit = hitMeshPart({ origin: [0.2, 0.2, 1], direction: [0, 0, -1] }, positions, indices, parts)
    expect(hit).toBe("plate")
    expect(hitMeshPart({ origin: [5, 5, 1], direction: [0, 0, -1] }, positions, indices, parts)).toBeUndefined()
  })

  test("a G-code row maps onto the segment that owns it", () => {
    const segments = [{ line: 2 }, { line: 4 }]
    expect(segmentIndexForLine(segments, 4)).toBe(1)
    expect(segmentIndexForLine(segments, 3)).toBe(0)
    expect(segmentIndexForLine([], 1)).toBe(0)
  })

  test("the stock box is twelve edges", () => {
    expect(boxEdges({ min: [0, 0, 0], max: [1, 1, 1] })).toHaveLength(12)
  })

  test("define prompts name the selection and stay on an ai branch", () => {
    expect(defineComponentPrompt({ id: "d1", name: "Plate" }, ["e1", "e2"])).toContain("e1, e2")
    expect(defineComponentPrompt({ id: "d1", name: "Plate" }, [])).toContain("whole design")
    expect(changeComponentPrompt({ id: "c1", name: "Bracket" })).toContain("ai/ branch")
  })
})

describe("standard views and grid spacing", () => {
  const bounds = { min: [0, 0, 0] as const, max: [100, 40, 20] as const }
  test("view-cube faces look along the desktop axes with Z up", () => {
    const front = cameraBasis(viewOrbit(bounds, "front")).forward
    const right = cameraBasis(viewOrbit(bounds, "right")).forward
    const top = cameraBasis(viewOrbit(bounds, "top"))
    expect(front[1]).toBeCloseTo(1, 6)
    expect(right[0]).toBeCloseTo(-1, 6)
    expect(top.forward[2]).toBeLessThan(-0.99)
    // Top view keeps X to the right and Y up on screen, like the desktop.
    expect(top.right[0]).toBeCloseTo(1, 3)
    expect(top.up[1]).toBeGreaterThan(0.99)
    expect(viewOrbit(bounds, "iso")).toEqual(fitOrbit(bounds))
  })
  test("grid steps are 1, 2 or 5 times a power of ten", () => {
    expect(niceStep(100, 10)).toBe(10)
    expect(niceStep(130, 10)).toBe(20)
    expect(niceStep(31, 10)).toBe(5)
    expect(niceStep(0.07, 10)).toBeCloseTo(0.01, 12)
  })
})

describe("framing and taps", () => {
  test("framing a part keeps the viewing direction and centres on the part", () => {
    const orbit = { yaw: 1, pitch: 0.3, distance: 500, target: [0, 0, 0] as const }
    const framed = frameOrbit(orbit, { min: [10, 10, 0], max: [12, 14, 2] })
    expect([framed.yaw, framed.pitch]).toEqual([1, 0.3])
    expect(framed.target).toEqual([11, 12, 1])
    expect(framed.distance).toBeLessThan(orbit.distance)
  })
  test("a double tap is two near taps inside the window", () => {
    const first = { x: 100, y: 100, at: 1_000 }
    expect(isDoubleTap(undefined, first)).toBe(false)
    expect(isDoubleTap(first, { x: 110, y: 104, at: 1_200 })).toBe(true)
    expect(isDoubleTap(first, { x: 110, y: 104, at: 1_400 })).toBe(false)
    expect(isDoubleTap(first, { x: 200, y: 100, at: 1_100 })).toBe(false)
  })
})
