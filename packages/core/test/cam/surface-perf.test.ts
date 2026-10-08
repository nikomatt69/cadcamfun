import { expect, setDefaultTimeout, test } from "bun:test"
import { DEFAULT_GEOMETRY, DEFAULT_PRINTER_EXTRAS, DEFAULT_SETTINGS, generateToolpath } from "../../src/cam/generator/index.ts"

setDefaultTimeout(120000)

/** A realistic job at the panel's defaults: an 80 x 60 block with a dome, 6 mm ball nose, default tolerance. */
test("a realistic surface job (default tolerance, 80 x 60 mm part) is generated in reasonable time", () => {
  const elements = [
    { id: "block", type: "cube", width: 80, height: 60, depth: 10, x: 0, y: 0, z: -5 },
    { id: "dome", type: "hemisphere", radius: 20, x: 0, y: 0, z: 0 }
  ]
  const stock = { width: 90, height: 70, depth: 30, radius: 0, x: 0, y: 0, topZ: 20, allowance: 1 }
  const settings = { ...DEFAULT_SETTINGS, operationType: "3d_surface" as const, toolType: "ballnose" as const, toolDiameter: 6, depth: 30, stepdown: 4, stepover: 40, surfaceStrategy: "roughing" as const, finishingPass: true, finishingAllowance: 0.3 }
  const started = performance.now()
  const outcome = generateToolpath({ settings, geometry: { ...DEFAULT_GEOMETRY, geometryType: "selected", selectedElements: elements, stock }, printer: DEFAULT_PRINTER_EXTRAS })
  const seconds = (performance.now() - started) / 1000
  console.log(`surface job: ${seconds.toFixed(1)} s, ${outcome.response.stats.lines} lines, warnings: ${outcome.response.warnings.join(" | ")}`)
  expect(outcome.error).toBeUndefined()
  expect(outcome.response.stats.lines).toBeGreaterThan(500)
  expect(seconds).toBeLessThan(30)
})
