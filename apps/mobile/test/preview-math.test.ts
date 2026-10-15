import { describe, expect, test } from "bun:test"
import {
  boxEdges,
  cameraBasis,
  changeComponentPrompt,
  defineComponentPrompt,
  dot,
  fitOrbit,
  hitMeshPart,
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
    expect(orbitDrag(orbit, 0, 10_000).pitch).toBeLessThanOrEqual(1.2)
    expect(orbitDrag(orbit, 0, -10_000).pitch).toBeGreaterThanOrEqual(-1.2)
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
