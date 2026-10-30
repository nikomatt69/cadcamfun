import { describe, expect, test } from "bun:test"
import { printBodies } from "./bodies.ts"
import { slicePrint } from "./index.ts"

const settings = { layerHeight: 0.2, printSpeed: 60, printTemperature: 200, bedTemperature: 60, extrusionWidth: 0.4, filamentDiameter: 1.75, infillDensity: 15, infillPattern: "lines", shellCount: 2, supportType: "none", nozzleDiameter: 0.4, bedWidth: 220, bedDepth: 220, autoOrient: true }

describe("full orientation search in the slicer", () => {
  // A T whose head hangs 15 mm over air each side when printed as designed.
  const tee = () => printBodies([
    { id: "stem", type: "cube", x: 0, y: 0, z: 7, width: 6, height: 6, depth: 14 },
    { id: "head", type: "cube", x: 0, y: 0, z: 14.5, width: 24, height: 6, depth: 3 }
  ] as never).meshes

  test("autoOrient with the full search removes the overhang the designed orientation has", () => {
    const designed = slicePrint(tee(), { ...settings, autoOrient: false })
    expect(designed.warnings.join(" ")).toContain("overhangs more than 45 degrees")
    const full = slicePrint(tee(), settings, { orientSearch: "full" })
    expect(full.orientation).not.toBe("as designed")
    expect(full.warnings.join(" ")).not.toContain("overhangs more than 45 degrees")
    expect(full.gcode).toContain("Part turned onto")
    expect(full.checks.filter((c) => c.status !== "passed")).toEqual([])
  })
})
