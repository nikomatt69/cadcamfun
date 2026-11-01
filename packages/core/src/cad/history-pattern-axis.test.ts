import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { patternAxis, rebuild, type Feature, type History } from "./history.ts"
import { rebuildExact } from "./history-brep.ts"
import { massProperties } from "./brep/index.ts"
import { meshVolume } from "./solid.ts"

setDefaultTimeout(60_000)

const history = (features: Feature[]): History => ({ parameters: {}, features })

/** A flange turned about Y: radius 40 and 8 thick, a hub of radius 15 up to 30. A hole on its top face, 30 mm from the axis. */
const flange = (pattern: Partial<Extract<Feature, { type: "pattern" }>>): History => history([
  { id: "p", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "pr", kind: "polyline", points: [[0, 0], [40, 0], [40, 8], [15, 8], [15, 30], [0, 30]] }] } },
  { id: "rev", type: "revolve", sketch: "p", axis: "y", angle: 360, operation: "new" },
  { id: "bolt", type: "hole", plane: "ZX", offset: 8, at: [30 * Math.cos(Math.PI / 12), 30 * Math.sin(Math.PI / 12)], diameter: 6, depth: 20, targets: ["rev"] },
  { id: "pat", type: "pattern", feature: "bolt", kind: "circular", count: 6, centre: [0, 0], ...pattern } as Feature
])

const solidVolume = (h: History): number => {
  const bodies = rebuildExact(h).bodies
  expect(bodies).toHaveLength(1)
  return massProperties(bodies[0]!.brep!).volume
}

describe("circular pattern about any axis", () => {
  // Analytic: the flange pi 40^2 x 8 plus the hub pi 15^2 x 22; a hole is pi 3^2 x 8.
  const whole = Math.PI * (40 * 40 * 8 + 15 * 15 * 22), hole = Math.PI * 9 * 8

  test("the axis is a line through the centre, cyclic in the two other coordinates", () => {
    expect(patternAxis(undefined, [2, 3])).toEqual({ dir: { x: 0, y: 0, z: 1 }, through: { x: 2, y: 3, z: 0 } })
    expect(patternAxis("x", [2, 3])).toEqual({ dir: { x: 1, y: 0, z: 0 }, through: { x: 0, y: 2, z: 3 } })
    expect(patternAxis("y", [2, 3])).toEqual({ dir: { x: 0, y: 1, z: 0 }, through: { x: 3, y: 0, z: 2 } })
  })

  test("a bolt circle about the flange's own axis takes out six holes, exactly", () => {
    const v = solidVolume(flange({ axis: "y" }))
    expect(Math.abs(v - (whole - 6 * hole))).toBeLessThan(0.5)
  })

  test("the mesh rebuild agrees with the exact one", () => {
    const rebuilt = rebuild(flange({ axis: "y" }))
    expect(rebuilt.issues.filter((i) => i.severity === "error")).toEqual([])
    const volume = rebuilt.bodies.reduce((sum, b) => sum + meshVolume(b.mesh), 0)
    // The mesh is faceted (chords lie inside a circle), so it is within a fraction of a percent, not exact.
    expect(Math.abs(volume - (whole - 6 * hole))).toBeLessThan(0.005 * whole)
  })

  test("without an axis the pattern still turns about Z, as every stored history did", () => {
    const rebuilt = rebuild(history([
      { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [-20, -20], width: 40, height: 40 }] } },
      { id: "b", type: "extrude", sketch: "s", depth: 10, operation: "new" },
      { id: "h", type: "hole", plane: "XY", offset: 10, at: [12, 0], diameter: 4, depth: 10, targets: ["b"] },
      { id: "p", type: "pattern", feature: "h", kind: "circular", count: 4, centre: [0, 0] }
    ]))
    const volume = rebuilt.bodies.reduce((sum, b) => sum + meshVolume(b.mesh), 0)
    expect(volume).toBeCloseTo(40 * 40 * 10 - 4 * Math.PI * 4 * 10, -1)
  })
})

describe("open polyline", () => {
  const withPath = (points: number[][], closed?: boolean): History => history([
    { id: "path", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "pp", kind: "polyline", points: points as never, ...(closed === undefined ? {} : { closed }) }] } }
  ])

  test("closed:false is a chain of lines, one fewer than its points", () => {
    const r = rebuild(withPath([[0, 0], [10, 0], [10, 10]], false))
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
  })

  test("a two-point chain is allowed open and refused closed", () => {
    expect(rebuild(withPath([[0, 0], [10, 0]], false)).issues.filter((i) => i.severity === "error")).toEqual([])
    expect(rebuild(withPath([[0, 0], [10, 0]])).issues.map((i) => i.message).join()).toContain("at least three points")
  })

  test("a pipe sweeps along an open polyline path with a bend, and its volume is the section times the path length", () => {
    const h = history([
      { id: "path", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "pp", kind: "polyline", points: [[0, 0], [50, 0], [50, 50]], closed: false }] } },
      { id: "prof", type: "sketch", plane: "YZ", sketch: { entities: [], constraints: [], shapes: [{ id: "o", kind: "circle", at: [0, 0], diameter: 10 }, { id: "i", kind: "circle", at: [0, 0], diameter: 7 }] } },
      { id: "sw", type: "sweep", profile: "prof", path: "path", operation: "new", bendRadius: 15 }
    ])
    const v = solidVolume(h)
    const centreLine = 2 * (50 - 15) + (Math.PI / 2) * 15
    expect(v).toBeGreaterThan(Math.PI * (25 - 12.25) * centreLine * 0.98)
    expect(v).toBeLessThan(Math.PI * (25 - 12.25) * centreLine * 1.02)
  })
})
