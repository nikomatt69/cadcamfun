import { describe, expect, test } from "bun:test"
import { MoveBuilder, OperationBudgetError } from "./common.ts"
import { Surface, cutterOf } from "./surface-field.ts"
import type { Grid } from "../model/dexel.ts"

describe("an operation cannot grow past what the kernel can write and check", () => {
  test("the move builder refuses the move past its limit, with what to change", () => {
    const b = new MoveBuilder(5)
    b.rapid({ x: 0, y: 0, z: 10 })
    for (let i = 1; i < 5; i++) b.linear({ x: i, y: 0, z: 0 }, 100)
    expect(b.moves).toHaveLength(5)
    expect(() => b.linear({ x: 9, y: 0, z: 0 }, 100)).toThrow(OperationBudgetError)
    expect(() => b.linear({ x: 9, y: 0, z: 0 }, 100)).toThrow(/stepover, stepdown or tolerance/)
    expect(b.moves).toHaveLength(5)
  })

  test("the drop-cutter refuses the sample past its limit", () => {
    const grid: Grid = { nx: 4, ny: 4, minX: 0, minY: 0, cellX: 1, cellY: 1 }
    const surface = new Surface(grid, new Float64Array(16), 10)
    const cutter = cutterOf({ id: "b", name: "b", kind: "ballnose", diameter: 2, flutes: 2, maxRpm: 10000 }, 0)
    for (let i = 0; i < 10; i++) surface.tip(cutter, 1.5, 1.5)
    expect(() => surface.tip(cutter, 1.5, 1.5)).toThrow(OperationBudgetError)
    expect(() => surface.tip(cutter, 1.5, 1.5)).toThrow(/stepover, the tolerance or the scallop/)
  })
})
