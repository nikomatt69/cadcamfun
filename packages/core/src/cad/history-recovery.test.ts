import { describe, expect, test } from "bun:test"
import { historyToStep, rebuildExact } from "./history-brep.ts"
import { model } from "./script.ts"
import { readStepBreps, validateBrep } from "./brep/index.ts"

const plate = (tangent: boolean) => {
  const m = model()
  m.extrude(m.sketch("XY").rectangle([0, 0], 10, 10), { depth: 10, id: "plate" })
  m.hole({ plane: "XY", offset: 10, at: [tangent ? 2 : 5, 5], diameter: 4, depth: 10, id: "bore" })
  return m.build()
}

describe("parametric Boolean recovery provenance", () => {
  test("a tangent hole retains the contact note (kept in place, nothing displaced) with its feature id", () => {
    const result = rebuildExact(plate(true))
    expect(result.bodies[0]!.brep).toBeDefined()
    expect(validateBrep(result.bodies[0]!.brep!).valid).toBe(true)
    expect(result.warnings.some((warning) => warning.startsWith("bore:") && warning.includes("kept in place"))).toBe(true)
    expect(result.warnings).toEqual(rebuildExact(plate(true)).warnings)
  })

  test("STEP export retains recovery warnings alongside a valid exported body", () => {
    const result = historyToStep(plate(true), "tangent plate")
    expect(result.exported).toEqual(["tangent plate"])
    expect(result.skipped).toEqual([])
    expect(result.warnings.some((warning) => warning.includes("bore:") && warning.includes("kept in place"))).toBe(true)
    const imported = readStepBreps(result.step!).parts
    expect(imported).toHaveLength(1)
    expect(validateBrep(imported[0]!.brep).valid).toBe(true)
  })

  test("a regular hole does not invent a recovery warning or leak another replay's warning", () => {
    rebuildExact(plate(true))
    expect(rebuildExact(plate(false)).warnings).toEqual([])
    expect(historyToStep(plate(false)).warnings).toEqual([])
  })
})
