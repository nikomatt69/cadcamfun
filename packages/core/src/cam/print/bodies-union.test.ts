import { describe, expect, test } from "bun:test"
import { printBodies } from "./bodies.ts"
import { slicePrint } from "./index.ts"
import { meshVolume } from "./slice.ts"

const cube = (id: string, x: number, y: number, z: number, w: number, h: number, d: number) => ({ id, type: "cube", x, y, z, width: w, height: h, depth: d })
const settings = { layerHeight: 0.2, printSpeed: 60, printTemperature: 200, bedTemperature: 60, extrusionWidth: 0.4, filamentDiameter: 1.75, infillDensity: 15, infillPattern: "lines", shellCount: 2, supportType: "none", nozzleDiameter: 0.4, bedWidth: 220, bedDepth: 220 }

describe("print bodies that meet face to face", () => {
  test("a stem standing on a head is one united body with the sum of the volumes", () => {
    const bodies = printBodies([cube("stem", 0, 0, 7, 6, 6, 14), cube("head", 0, 0, 15.5, 24, 6, 3)] as never)
    expect(bodies.errors).toEqual([])
    expect(bodies.meshes).toHaveLength(1)
    expect(Math.abs(meshVolume(bodies.meshes[0]!))).toBeCloseTo(6 * 6 * 14 + 24 * 6 * 3, 3)
  })

  test("the united T prints with every check passed (it was a no-spill failure when sliced as two islands)", () => {
    const meshes = printBodies([cube("stem", 0, 0, 7, 6, 6, 14), cube("head", 0, 0, 15.5, 24, 6, 3)] as never).meshes
    const r = slicePrint(meshes, settings as never)
    expect(r.checks.filter((c) => c.status !== "passed")).toEqual([])
  })

  test("solids that are apart stay separate", () => {
    const bodies = printBodies([cube("a", 0, 0, 5, 10, 10, 10), cube("b", 30, 0, 5, 10, 10, 10)] as never)
    expect(bodies.meshes).toHaveLength(2)
  })
})
