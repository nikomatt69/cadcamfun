import { describe, expect, test } from "bun:test"
import { Dexels, gridFor } from "./dexel.ts"
import { buildPartModel } from "./model.ts"

const near = (a: number, b: number, rel: number): void => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.abs(b) * rel + 1e-9)

describe("dexel model from CAD elements", () => {
  test("a cube has the volume of a cube and a flat top; a sphere has the volume of a sphere", () => {
    const cube = buildPartModel([{ id: "a", type: "cube", width: 20, height: 20, depth: 10 }], { cell: 0.2 })!
    near(cube.dexels.volume(), 4000, 0.02)
    const top = cube.dexels.top(0)
    expect(Math.max(...top)).toBeCloseTo(5, 9)
    const sphere = buildPartModel([{ id: "s", type: "sphere", radius: 10 }], { cell: 0.1, tolerance: 0.002 })!
    near(sphere.dexels.volume(), (4 / 3) * Math.PI * 1000, 0.01)
    expect(Math.max(...sphere.dexels.top(-Infinity))).toBeGreaterThan(9.9)
  })

  test("subtract drills a through hole and a blind hole; the top falls to the right height", () => {
    const part = buildPartModel([
      { id: "plate", type: "cube", width: 40, height: 40, depth: 10, x: 0, y: 0, z: 5 },
      { id: "through", type: "cylinder", radius: 4, height: 30, x: -10, y: 0, z: 5 },
      { id: "blind", type: "cylinder", radius: 4, height: 6, x: 10, y: 0, z: 10 },
      { id: "cut", type: "boolean-subtract", operands: ["plate", "through", "blind"] }
    ], { cell: 0.2 })!
    const g = part.grid, top = part.dexels.top(Number.NaN)
    const at = (x: number, y: number) => top[Math.floor((y - g.minY) / g.cellY) * g.nx + Math.floor((x - g.minX) / g.cellX)]!
    expect(at(0, 0)).toBeCloseTo(10, 9)
    expect(Number.isNaN(at(-10, 0))).toBe(true)
    expect(at(10, 0)).toBeCloseTo(7, 9)
    const expected = 40 * 40 * 10 - Math.PI * 16 * 10 - Math.PI * 16 * 3
    near(part.dexels.volume(), expected, 0.01)
    expect(part.skipped).toEqual([])
  })

  test("union and intersect combine exactly; an undercut keeps its two bodies in one column", () => {
    const a = buildPartModel([{ id: "a", type: "cube", width: 10, height: 10, depth: 10 }, { id: "b", type: "cube", width: 10, height: 10, depth: 10, x: 5 }, { id: "u", type: "boolean-union", operands: ["a", "b"] }], { cell: 0.1 })!
    near(a.dexels.volume(), 1500, 0.02)
    const i = buildPartModel([{ id: "a", type: "cube", width: 10, height: 10, depth: 10 }, { id: "b", type: "cube", width: 10, height: 10, depth: 10, x: 5 }, { id: "n", type: "boolean-intersect", operands: ["a", "b"] }], { cell: 0.1 })!
    near(i.dexels.volume(), 500, 0.03)
    // A bridge: two plates one above the other with a gap; the column holds two intervals.
    const bridge = buildPartModel([{ type: "cube", width: 10, height: 10, depth: 2, z: 0 }, { type: "cube", width: 10, height: 10, depth: 2, z: 6 }], { cell: 0.5 })!
    expect(bridge.dexels.cols[Math.floor(bridge.grid.nx * bridge.grid.ny / 2)]!.length).toBe(4)
  })

  test("rotated elements are placed where the scene draws them; unsupported shapes are reported, not faked", () => {
    const part = buildPartModel([{ type: "cube", width: 40, height: 10, depth: 6, rotation: { x: 0, y: 0, z: 90 } }, { type: "spring", name: "G1" }], { cell: 0.2 })!
    expect(part.bounds.max[0] - part.bounds.min[0]).toBeCloseTo(10, 9)
    expect(part.bounds.max[1] - part.bounds.min[1]).toBeCloseTo(40, 9)
    expect(part.skipped).toEqual(['spring "G1"'])
    expect(buildPartModel([{ type: "spring" }])).toBeUndefined()
  })

  test("a huge part is meshed coarser instead of running out of memory, and says so", () => {
    const part = buildPartModel([{ type: "cube", width: 2000, height: 2000, depth: 10 }], { cell: 0.1, maxCells: 100_000 })!
    expect(part.grid.nx * part.grid.ny).toBeLessThanOrEqual(110_000)
    expect(part.warnings.join(" ")).toContain("coarsened")
  })

  test("interval algebra", () => {
    const g = gridFor(0, 0, 1, 1, 1)
    const a = Dexels.slab(g, 0, 10), b = Dexels.slab(g, 4, 6)
    expect(a.subtract(b).cols[0]).toEqual(Float64Array.of(0, 4, 6, 10))
    expect(a.intersect(b).cols[0]).toEqual(Float64Array.of(4, 6))
    expect(a.union(Dexels.slab(g, 9, 12)).cols[0]).toEqual(Float64Array.of(0, 12))
    expect(a.subtract(a).isEmpty()).toBe(true)
  })
})
