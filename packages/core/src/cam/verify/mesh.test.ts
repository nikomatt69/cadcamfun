import { describe, expect, test } from "bun:test"
import { meshTopology } from "../../cad/mesh-topology.ts"
import { stockMeshFromPreview } from "./mesh.ts"
import type { VerifyResponse } from "./schema.ts"

const field = (nx: number, ny: number, cell: number, at: (i: number, j: number) => number): VerifyResponse["preview"] => {
  const heights: number[] = []
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) heights.push(at(i, j))
  return { nx, ny, minX: 10, minY: -5, cellX: cell, cellY: cell, minZ: Math.min(...heights), maxZ: Math.max(...heights), heights, gouge: [] }
}

describe("stockMeshFromPreview", () => {
  test("an uncut block is a closed solid with the volume of the box", () => {
    const mesh = stockMeshFromPreview(field(8, 6, 2, () => 20), { floor: 0 })
    const t = meshTopology(mesh)
    expect(t.solid).toBe(true)
    expect(t.volume).toBeCloseTo(16 * 12 * 20, 6)
    expect(mesh.thinCells).toBe(0)
  })

  test("a stepped pocket stays watertight and wound outward", () => {
    const mesh = stockMeshFromPreview(field(10, 10, 1, (i, j) => (i >= 3 && i < 7 && j >= 3 && j < 7 ? 8 : 20)), { floor: 5 })
    const t = meshTopology(mesh)
    expect(t.solid).toBe(true)
    // Averaging the corners keeps the integral: the volume is the sum of the cell columns, 100 x 15 minus the 16 x 12 pocket.
    expect(t.volume).toBeCloseTo(10 * 10 * 15 - 16 * 12, 6)
  })

  test("a planar ramp has exactly the volume under it", () => {
    const mesh = stockMeshFromPreview(field(12, 4, 1, (i) => 10 + i + 0.5), { floor: 0 })
    // Heights at cell centres 10.5 .. 21.5; the corner nodes average neighbours, so a plane stays a plane in the interior.
    const t = meshTopology(mesh)
    expect(t.solid).toBe(true)
    expect(t.volume).toBeCloseTo(4 * (12 * 10 + (12 * 12) / 2), 0)
  })

  test("cells at the floor are reported, not hidden", () => {
    const mesh = stockMeshFromPreview(field(4, 4, 1, (i, j) => (i === 1 && j === 1 ? 0 : 6)), { floor: 0 })
    expect(mesh.thinCells).toBe(1)
  })

  test("the mesh sits at the field's position", () => {
    const mesh = stockMeshFromPreview(field(4, 2, 3, () => 7), { floor: 1 })
    const xs = Array.from({ length: mesh.positions.length / 3 }, (_, k) => mesh.positions[k * 3]!)
    expect(Math.min(...xs)).toBe(10)
    expect(Math.max(...xs)).toBe(22)
  })

  test("refuses a field whose size and heights disagree", () => {
    expect(() => stockMeshFromPreview({ ...field(3, 3, 1, () => 1), heights: [1, 2] }, { floor: 0 })).toThrow(RangeError)
  })
})
