import { describe, expect, test } from "bun:test"
import { PRINT_MAX_LAYERS, PRINT_WORK_LIMIT, printWorkIssue, slicePrint } from "./index.ts"
import { DEFAULT_PRINTER_EXTRAS, DEFAULT_SETTINGS, printerSettingsOf } from "../generator/index.ts"

const box = (w: number, d: number, h: number) => {
  const x = w / 2, y = d / 2
  return {
    positions: new Float64Array([-x, -y, 0, x, -y, 0, x, y, 0, -x, y, 0, -x, -y, h, x, -y, h, x, y, h, -x, y, h]),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7])
  }
}
const settings = (patch: Record<string, unknown> = {}) => printerSettingsOf({ ...DEFAULT_SETTINGS, machineType: "3dprinter", ...patch } as never, DEFAULT_PRINTER_EXTRAS)

describe("a print too large to slice is refused before any layer is cut", () => {
  test("the estimate names the layers and the way out", () => {
    expect(printWorkIssue(100, 400, 0.4, 0.2)).toBeUndefined()
    expect(printWorkIssue(PRINT_MAX_LAYERS + 1, 400, 0.4, 0.001)).toMatch(/use a thicker layer/)
    expect(printWorkIssue(10_000, 160_000, 0.4, 0.05)).toMatch(/too large to slice in one job.*thicker layer or a wider nozzle/)
    expect(PRINT_WORK_LIMIT).toBeGreaterThan(1e9)
  })

  test("a hair-thin layer on a tall part throws at once, not after minutes", () => {
    const started = performance.now()
    expect(() => slicePrint([box(20, 20, 100)], settings({ layerHeight: 0.001 }))).toThrow(/thicker layer/)
    expect(performance.now() - started).toBeLessThan(2000)
  })

  test("a normal part still slices", () => {
    const r = slicePrint([box(20, 20, 10)], settings())
    expect(r.stats.layers).toBeGreaterThan(10)
    expect(r.checks.every((c) => c.status === "passed")).toBe(true)
  })
})
