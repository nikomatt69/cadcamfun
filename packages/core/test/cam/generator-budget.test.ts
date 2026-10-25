import { describe, expect, setDefaultTimeout, test } from "bun:test"
import {
  DEFAULT_GEOMETRY,
  DEFAULT_PRINTER_EXTRAS,
  DEFAULT_SETTINGS,
  GenerationBudgetError,
  MAX_LEVELS,
  MAX_MOVES,
  cutLevels,
  generateToolpath,
  type GeometryInput,
  type ToolpathSettings
} from "../../src/cam/generator/index.ts"

setDefaultTimeout(60_000)

const settings = (patch: Partial<ToolpathSettings> = {}): ToolpathSettings => ({ ...DEFAULT_SETTINGS, ...patch })
const geometry = (patch: Partial<GeometryInput> = {}): GeometryInput => ({ ...DEFAULT_GEOMETRY, ...patch })
const run = (s: ToolpathSettings, g: GeometryInput = geometry()) => {
  const started = performance.now()
  const outcome = generateToolpath({ settings: s, geometry: g, printer: DEFAULT_PRINTER_EXTRAS })
  return { ...outcome, ms: performance.now() - started }
}

describe("a request too large for the generator is answered with the reason, at once", () => {
  test("a depth over a stepdown that needs millions of levels", () => {
    expect(() => cutLevels(1000, 0.001)).toThrow(GenerationBudgetError)
    expect(() => cutLevels(1000, 0.001)).toThrow(/1,000,000 passes.*raise the stepdown/)
    expect(cutLevels(5, 1)).toEqual([-1, -2, -3, -4, -5])
    const r = run(settings({ operationType: "contour", depth: 1000, stepdown: 0.001 }))
    expect(r.error).toMatch(/passes \(the most is 200,000\)/)
    expect(r.response.gcode).toStartWith("; Error:")
    expect(r.ms).toBeLessThan(1000)
  })

  test("a pocket whose stepover would write billions of moves", () => {
    const r = run(settings({ operationType: "pocket", toolDiameter: 0.1, stepover: 1 }), geometry({ rectangleWidth: 500, rectangleHeight: 500 }))
    expect(r.error).toMatch(/rectangular pocket at this depth and stepover would take the program past 2,000,000 moves/)
    expect(r.ms).toBeLessThan(1000)
  })

  test("a polygon of a hundred thousand sides over many levels", () => {
    const r = run(settings({ operationType: "profile", depth: 200, stepdown: 0.01 }), geometry({ geometryType: "polygon", polygonSides: 100_000, polygonRadius: 300 }))
    expect(r.error).toMatch(/polygon at this depth and stepover would take the program past/)
  })

  test("lathe passes, grooves and threads are bounded too", () => {
    const turning = run(settings({ machineType: "lathe", operationType: "turning", depth: 1_000_000, stepdown: 0.001 }))
    expect(turning.error).toMatch(/needs 1,000,000,000 passes/)
    const grooving = run(settings({ machineType: "lathe", operationType: "grooving", depth: 100_000_000 }))
    expect(grooving.error).toMatch(/groove depth needs 200,000,000 passes/)
    const threading = run(settings({ machineType: "lathe", operationType: "threading", depth: 100_000_000 }))
    expect(threading.error).toMatch(/thread at this depth would take the program past/)
  })

  test("a print with hair-thin layers or a bead too fine for the part is refused before slicing", () => {
    const part = { id: "a", type: "cube", x: 0, y: 0, z: 50, width: 20, height: 20, depth: 100 }
    const thin = run(settings({ machineType: "3dprinter", operationType: "standard", layerHeight: 0.001 }), geometry({ geometryType: "selected", selectedElements: [part] }))
    expect(thin.error).toMatch(/100,000 layers.*thicker layer/)
    const fine = run(settings({ machineType: "3dprinter", operationType: "standard", nozzleDiameter: 0.01, extrusionWidth: 0.01 }), geometry({ geometryType: "selected", selectedElements: [{ ...part, width: 100, height: 100, depth: 10, z: 5 }] }))
    expect(fine.error).toMatch(/too large to slice in one job/)
  })

  test("the budget restarts with every run: a large request that fits is not charged for the one before", () => {
    const big = settings({ operationType: "contour", depth: 30, stepdown: 0.02 })
    for (let i = 0; i < 3; i++) expect(run(big).error).toBeUndefined()
    expect(MAX_LEVELS).toBe(200_000)
    expect(MAX_MOVES).toBe(2_000_000)
  })

  test("an ordinary request is untouched", () => {
    const r = run(settings({ operationType: "pocket" }), geometry({ rectangleWidth: 40, rectangleHeight: 30 }))
    expect(r.error).toBeUndefined()
    expect(r.response.gcode).toContain("Pocket operation")
  })
})
