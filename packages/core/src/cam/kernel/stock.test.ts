import { describe, expect, test } from "bun:test"
import { carryHeightField, remainingVolume, removeTipPath, voxelStock, type Cutter } from "./index.ts"
import { HeightField } from "../verify/heightfield.ts"

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

  test("explicit +Z axes give exactly the same stock as the default axis", () => {
    const up = { x: 0, y: 0, z: 1 }
    const path = [{ x: -5, y: 20, z: 5 }, { x: 45, y: 20, z: 5 }, { x: 45, y: 30, z: 5 }]
    const a = voxelStock({ x: 0, y: 0, z: 0 }, { x: 40, y: 40, z: 10 }, 1)
    const b = voxelStock({ x: 0, y: 0, z: 0 }, { x: 40, y: 40, z: 10 }, 1)
    removeTipPath(a, flat, path)
    removeTipPath(b, flat, path, [up, up, up])
    expect(b.removedSure).toEqual(a.removedSure)
    expect(b.removedPossible).toEqual(a.removedPossible)
  })

  test("a tilted tool is bracketed against a dense reference sweep of its own cylinder", () => {
    // Flat Ø10 cutter, flutes 22 mm long, tilted 30° from +Z in the XZ plane, the tip moved along x at z = 10 through a 60 x 40 x 30 block.
    // The reference is the tool's cylinder at every tip position on the 0.25 mm grid (the stock samples at 0.5 mm include it):
    // a voxel whose centre lies in the cylinder at some position must be possibly removed; a voxel whose eight corners lie in it at
    // some position must be surely removed.
    const angle = (30 * Math.PI) / 180
    const d = { x: Math.sin(angle), y: 0, z: Math.cos(angle) }
    const path = [{ x: 5, y: 20, z: 10 }, { x: 55, y: 20, z: 10 }]
    const s = voxelStock({ x: 0, y: 0, z: 0 }, { x: 60, y: 40, z: 30 }, 1)
    removeTipPath(s, flat, path, [d, d])
    const tips: Array<{ x: number; y: number; z: number }> = []
    for (let x = 5; x <= 55 + 1e-9; x += 0.25) tips.push({ x, y: 20, z: 10 })
    const inside = (p: { x: number; y: number; z: number }, t: { x: number; y: number; z: number }): boolean => {
      const vx = p.x - t.x, vy = p.y - t.y, vz = p.z - t.z
      const along = vx * d.x + vy * d.y + vz * d.z
      const rho2 = vx * vx + vy * vy + vz * vz - along * along
      return along >= 0 && along <= 22 && rho2 <= 25
    }
    let missedPossible = 0, missedSure = 0, sure = 0
    for (let k = 0; k < 30; k++) for (let j = 0; j < 40; j++) for (let i = 0; i < 60; i++) {
      const id = (k * 40 + j) * 60 + i
      const c = { x: i + 0.5, y: j + 0.5, z: k + 0.5 }
      if (tips.some((t) => inside(c, t)) && s.removedPossible[id] !== 1) missedPossible++
      if (s.removedSure[id] === 1) {
        sure++
        const corners: Array<{ x: number; y: number; z: number }> = []
        for (const dx of [-0.5, 0.5]) for (const dy of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) corners.push({ x: c.x + dx, y: c.y + dy, z: c.z + dz })
        if (!tips.some((t) => corners.every((p) => inside(p, t)))) missedSure++
      }
    }
    expect(sure).toBeGreaterThan(0)
    expect(missedPossible).toBe(0)
    expect(missedSure).toBe(0)
  })
})

describe("carrying a 3-axis predecessor's removal onto the voxel stock (K5)", () => {
  /** A height field over [0,10]x[0,10] with 1 mm cells, its columns lowered to `top`. */
  const field = (top: number): HeightField => {
    const hf = new HeightField(10, 10, 0, 0, 10, 10, 0, 20)
    hf.top.fill(top)
    return hf
  }

  test("material the predecessor cut away is gone; material it left is untouched", () => {
    // A 20 x 20 x 20 grid of 2 mm voxels, the columns cut down to z = 8 by the 3-axis predecessor.
    const voxels = voxelStock({ x: 0, y: 0, z: 0 }, { x: 20, y: 20, z: 20 }, 2)
    carryHeightField(voxels, field(8))
    const remaining = remainingVolume(voxels)
    // Definitely left: z in [0, 8] over 20 x 20 mm = 3200 mm³. Possibly left: the 6..8 band straddles the cut, so +2 voxels layers.
    expect(remaining.lower).toBeCloseTo(20 * 20 * 8, 6)
    expect(remaining.upper).toBeCloseTo(20 * 20 * 10, 6)
    // Every surely-removed voxel is also possibly removed, and nothing under the cut was touched.
    for (let k = 0; k < voxels.nz; k++) for (let j = 0; j < voxels.ny; j++) for (let i = 0; i < voxels.nx; i++) {
      const id = (k * voxels.ny + j) * voxels.nx + i
      if (voxels.removedSure[id] === 1) expect(voxels.removedPossible[id]).toBe(1)
      // Voxel centres below z = 8 lie under the remaining material and must stay stock in both tests.
      if (voxels.origin.z + (k + 0.5) * 2 <= 8) expect(voxels.removedSure[id]).toBe(0)
    }
  })

  test("the carry only tightens the bracket downwards and never loosens an existing removal", () => {
    const voxels = voxelStock({ x: 0, y: 0, z: 0 }, { x: 20, y: 20, z: 20 }, 2)
    // A rotary cut already removed a layer; carrying a height field must not hand that material back.
    removeTipPath(voxels, flat, [{ x: 10, y: 10, z: 18 }, { x: 10, y: 10, z: 12 }])
    const beforeSure = Uint8Array.from(voxels.removedSure), beforePossible = Uint8Array.from(voxels.removedPossible)
    carryHeightField(voxels, field(14))
    for (let id = 0; id < voxels.material.length; id++) {
      if (beforeSure[id] === 1) expect(voxels.removedSure[id]).toBe(1)
      if (beforePossible[id] === 1) expect(voxels.removedPossible[id]).toBe(1)
    }
    // And the carry never claims more than the height field proved: a voxel that is not sure above every column stays possible-only.
    const remaining = remainingVolume(voxels)
    expect(remaining.lower).toBeLessThanOrEqual(20 * 20 * 14)
    expect(remaining.upper).toBeGreaterThanOrEqual(remaining.lower)
  })

  test("an untouched height field (no 3-axis predecessor) leaves the voxel stock at the raw box", () => {
    // The top of a fresh height field is its ceiling; carrying it marks nothing, so five-axis-only jobs keep their prior bracket.
    const voxels = voxelStock({ x: 0, y: 0, z: 0 }, { x: 20, y: 20, z: 20 }, 2)
    carryHeightField(voxels, field(20))
    expect(remainingVolume(voxels)).toEqual({ lower: 20 * 20 * 20, upper: 20 * 20 * 20 })
  })
})
