import { describe, expect, test } from "bun:test"
import { Surface, cutterOf, type Cutter } from "./surface-field.ts"
import type { Grid } from "../model/dexel.ts"

/** Independent exhaustive footprint, with the same column sampling and arithmetic as the drop-cutter contract. */
const exhaustive = (surface: Surface, cutter: Cutter, x: number, y: number): number => {
  const { nx, ny, minX, minY, cellX, cellY } = surface.grid
  const gx = (x - minX) / cellX, gy = (y - minY) / cellY
  const half = 0.5 * Math.min(cellX, cellY)
  let best = -Infinity
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ox = (i + 0.5 - gx) * cellX, oy = (j + 0.5 - gy) * cellY
    const d = Math.sqrt(ox * ox + oy * oy) - half
    if (d > cutter.radius) continue
    const tip = surface.height[j * nx + i]! - cutter.profile(d > 0 ? d : 0)
    if (tip > best) best = tip
  }
  return best === -Infinity ? best : best + cutter.lift
}

describe("drop-cutter acceleration preserves the exhaustive result", () => {
  test("flat, ball, bull, V and drill profiles over holes, cliffs and non-square cells", () => {
    const grid: Grid = { nx: 25, ny: 31, minX: -3.25, minY: -8, cellX: 0.37, cellY: 0.23 }
    const heights = Float64Array.from({ length: grid.nx * grid.ny }, (_, k) => k % 11 === 0 ? -Infinity : Math.sin(k * 1.7) * 3 + (k % 7))
    const surface = new Surface(grid, heights)
    const cutters = (["endmill", "ballnose", "vbit", "drill"] as const).flatMap((kind) => [0, 0.3].map((a) => cutterOf({ id: kind, name: kind, kind, diameter: 3, flutes: 2, maxRpm: 10000 }, a)))
    cutters.push(cutterOf({ id: "bull", name: "Bull", kind: "endmill", diameter: 3, tipRadius: 0.5, flutes: 2, maxRpm: 10000 }, 0.2))
    for (const cutter of cutters) for (let k = 0; k < 200; k++) {
      const x = grid.minX - 2 + ((k * 37) % 113) / 8
      const y = grid.minY - 2 + ((k * 53) % 127) / 10
      expect(surface.tip(cutter, x, y)).toBe(exhaustive(surface, cutter, x, y))
    }
  })

  test("one nearby column rejects the rest of a flat footprint without changing its height", () => {
    const grid: Grid = { nx: 120, ny: 120, minX: 0, minY: 0, cellX: 0.1, cellY: 0.1 }
    const surface = new Surface(grid, new Float64Array(grid.nx * grid.ny).fill(7))
    let evaluations = 0
    const cutter: Cutter = { radius: 5, flat: true, lift: 0, profile: () => { evaluations++; return 0 } }
    expect(surface.tip(cutter, 6, 6)).toBe(7)
    expect(evaluations).toBe(1)
    expect(new Surface(grid, new Float64Array(grid.nx * grid.ny).fill(-Infinity)).tip(cutter, 6, 6)).toBe(-Infinity)
  })
})
