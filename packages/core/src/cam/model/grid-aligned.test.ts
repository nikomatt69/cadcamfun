import { describe, expect, test } from "bun:test"
import { gridAligned } from "./dexel.ts"

describe("gridAligned: the part's outer walls lie on cell boundaries", () => {
  const onLattice = (origin: number, cell: number, at: number): boolean => Math.abs((at - origin) / cell - Math.round((at - origin) / cell)) < 1e-9

  test("both walls of a part whose extent is not a multiple of the cell fall on lattice lines, with a whole number of margin cells", () => {
    for (const [min, max] of [[-20, 20], [0, 33.3], [-15, 15], [2.37, 41.91]] as const) {
      const g = gridAligned(min, min, max, max, 17, 0.25)
      expect(onLattice(g.minX, g.cellX, min)).toBe(true)
      expect(onLattice(g.minX, g.cellX, max)).toBe(true)
      expect(g.minX).toBeLessThanOrEqual(min - 17 + 1e-9)
      expect(g.cellX).toBeGreaterThan(0.2)
      expect(g.cellX).toBeLessThan(0.3)
      expect(g.minX + g.nx * g.cellX).toBeGreaterThanOrEqual(max + 17 - 1e-9)
    }
  })

  test("the old stretched grid put the walls inside a cell: this one differs from it exactly there", () => {
    const g = gridAligned(-20, -15, 20, 15, 17.3, 0.25)
    const frac = (x: number) => Math.abs(((x - g.minX) / g.cellX) % 1)
    expect(Math.min(frac(-20), 1 - frac(-20))).toBeLessThan(1e-9)
    // The unaligned layout of the same bounds: cell size = (extent + 2 margin) / ceil(...), wall position inside the cell.
    const w = 40 + 2 * 17.3, n = Math.ceil(w / 0.25), c = w / n
    const old = ((-20 - (-20 - 17.3)) / c) % 1
    expect(Math.min(old, 1 - old)).toBeGreaterThan(1e-3)
  })

  test("a column budget coarsens the cell, never breaks the alignment; a flat part falls back to the plain grid", () => {
    const g = gridAligned(-50, -50, 50, 50, 20, 0.05, 200_000)
    expect((g.nx + 1) * (g.ny + 1)).toBeLessThanOrEqual(200_000)
    expect(onLattice(g.minX, g.cellX, -50)).toBe(true)
    expect(onLattice(g.minX, g.cellX, 50)).toBe(true)
    const flat = gridAligned(0, 0, 0, 10, 1, 0.5)
    expect(flat.nx).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(flat.cellX)).toBe(true)
  })
})
