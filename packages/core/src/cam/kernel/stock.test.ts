import { describe, expect, test } from "bun:test"
import { remainingVolume, removeTipPath, voxelStock, type Cutter } from "./index.ts"

const flat: Cutter = { id: "t", name: "t", kind: "flat", diameter: 10, flutes: 3, material: "carbide", coating: "altin", fluteLength: 22, shankDiameter: 10, stickout: 40 }

describe("volumetric stock", () => {
  test("a slot cut by a flat end mill is bracketed by the sure and possible removal of its cubes", () => {
    // A 40 x 40 x 10 block, voxels of 1 mm. The tip runs at z = 5 along y = 20 from x = -5 to 45: the cutter removes the slot
    // x in [0, 40], y in [15, 25], z in [5, 10], an analytic 2000 mm³ of 16000 mm³.
    const s = voxelStock({ x: 0, y: 0, z: 0 }, { x: 40, y: 40, z: 10 }, 1)
    removeTipPath(s, flat, [{ x: -5, y: 20, z: 5 }, { x: 45, y: 20, z: 5 }])
    const r = remainingVolume(s)
    const analytic = 16000 - 2000
    expect(r.lower).toBeLessThanOrEqual(analytic)
    expect(r.upper).toBeGreaterThanOrEqual(analytic)
  })

  test("halving the voxel narrows the bracket and still contains the analytic remainder", () => {
    const run = (voxel: number): { lower: number; upper: number } => {
      const s = voxelStock({ x: 0, y: 0, z: 0 }, { x: 40, y: 40, z: 10 }, voxel)
      removeTipPath(s, flat, [{ x: -5, y: 20, z: 5 }, { x: 45, y: 20, z: 5 }])
      return remainingVolume(s)
    }
    const coarse = run(1), fine = run(0.5)
    expect(fine.lower).toBeLessThanOrEqual(14000)
    expect(fine.upper).toBeGreaterThanOrEqual(14000)
    expect(fine.upper - fine.lower).toBeLessThan(coarse.upper - coarse.lower)
  })

  test("a voxel above the flutes or below the tip is never removed", () => {
    const s = voxelStock({ x: 0, y: 0, z: 0 }, { x: 40, y: 40, z: 40 }, 1)
    removeTipPath(s, flat, [{ x: 0, y: 20, z: 5 }, { x: 40, y: 20, z: 5 }])
    // Above the flute top (z = 5 + 22 = 27, plus the expansion) and below the tip: the upper layers are untouched.
    let touchedAbove = 0, touchedBelow = 0
    for (let k = 0; k < 40; k++) for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) {
      const id = (k * 40 + j) * 40 + i
      if (s.removedPossible[id] === 1 && k + 0.5 > 27 + 1.5) touchedAbove++
      if (s.removedPossible[id] === 1 && k + 0.5 < 5 - 1.5) touchedBelow++
    }
    expect(touchedAbove).toBe(0)
    expect(touchedBelow).toBe(0)
  })

  test("an untouched block keeps all of its volume", () => {
    const s = voxelStock({ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 10 }, 1)
    expect(remainingVolume(s)).toEqual({ lower: 1000, upper: 1000 })
  })
})
