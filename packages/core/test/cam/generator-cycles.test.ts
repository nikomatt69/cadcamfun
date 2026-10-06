import { describe, expect, test } from "bun:test"
import {
  FixedCycleType,
  calculateOptimal3DPrintSettings,
  cycleParameterFields,
  cycleTitle,
  detectFixedCycles,
  drillingCycleAt,
  estimateMaterialUsage,
  estimatePrintTime,
  extractElementDimensions,
  generateFixedCycleGCode,
  isFixedCycle,
  parseFixedCycle,
  removeFixedCycles,
  replaceFixedCycles
} from "../../src/cam/generator/index.ts"

describe("fixed cycles", () => {
  test("recognises cycle words per line, not plain moves after a cycle", () => {
    expect(isFixedCycle("G81 X1 Y2 Z-5 R2 F100")).toBe(true)
    expect(isFixedCycle("N10 G83 X1 Y2 Z-5 R2 Q1 F100")).toBe(true)
    expect(isFixedCycle("G73 X1 Y2 Z-5 R2 Q1")).toBe(true)
    expect(isFixedCycle("G1 X5 Y5 F100")).toBe(false) // the stateful legacy parser answered true here after a G81
    expect(isFixedCycle("G80")).toBe(false)
    expect(isFixedCycle("; G81 in a comment")).toBe(false)
  })

  test("parses parameters and the cycle type", () => {
    const result = parseFixedCycle("G83 X1.5 Y-2 Z-10 R2 Q3 P0.5 F150 ; peck")!
    expect(result.type).toBe(FixedCycleType.PECK_DRILLING)
    expect(result.params).toEqual({ x: 1.5, y: -2, z: -10, r: 2, q: 3, p: 0.5, f: 150 })
    expect(parseFixedCycle("G0 X1")).toBeNull()
    expect(parseFixedCycle("G84 Z-8 R2 S500 F200")!.params.s).toBe(500)
  })

  test("parameter forms per cycle", () => {
    const names = (type: FixedCycleType) => cycleParameterFields(type).map(f => f.name).join("")
    expect(names(FixedCycleType.DRILLING)).toBe("xyzrf")
    expect(names(FixedCycleType.DRILLING_DWELL)).toBe("xyzrfp")
    expect(names(FixedCycleType.PECK_DRILLING)).toBe("xyzrfqp")
    expect(names(FixedCycleType.RIGHT_TAPPING)).toBe("xyzrfps")
    expect(names(FixedCycleType.BACK_BORING)).toBe("xyzrfijk")
    expect(cycleTitle(FixedCycleType.PECK_DRILLING)).toBe("Peck Drilling")
  })

  test("writes a line back, round-tripping what it parsed", () => {
    const line = "G83 X1.000 Y2.000 Z-10.000 R2.000 Q3.000 P0.500 F150"
    const parsed = parseFixedCycle(line)!
    expect(generateFixedCycleGCode(parsed.type, parsed.params)).toBe(line)
    expect(generateFixedCycleGCode(FixedCycleType.RIGHT_TAPPING, { z: -8, r: 2, f: 200, s: 500 })).toBe("G84 Z-8.000 R2.000 F200 S500")
    expect(drillingCycleAt(1, 2, 6, 300)).toBe("G81 X1.000 Y2.000 Z-6.000 R2.000 F300 ; Drilling cycle")
  })

  test("replace and remove", () => {
    const program = "G0 X0 Y0\nG81 X1 Y1 Z-5 R2 F100\nG80\nM30"
    expect(detectFixedCycles(program)).toEqual([{ gcode: "G81 X1 Y1 Z-5 R2 F100" }])
    expect(removeFixedCycles(program)).toBe("G0 X0 Y0\nM30")
    expect(replaceFixedCycles(program, "G83 X2 Y2 Z-9 R2 Q2 F100")).toBe("G0 X0 Y0\nM30\nG83 X2 Y2 Z-9 R2 Q2 F100\nG80 ; Cancel fixed cycle")
    expect(replaceFixedCycles("G0 X0", "G81 X1 Y1")).toBe("G0 X0\nG81 X1 Y1\nG80 ; Cancel fixed cycle")
  })
})

describe("3D print estimates", () => {
  test("dimensions and volume", () => {
    expect(extractElementDimensions({ type: "cube", width: 10, height: 20, depth: 30 })).toEqual({ width: 10, height: 20, depth: 30, volume: 6000 })
    expect(extractElementDimensions({ type: "sphere", radius: 5 }).volume).toBeCloseTo((4 / 3) * Math.PI * 125, 6)
    expect(extractElementDimensions(null)).toEqual({ width: 0, height: 0, depth: 0, volume: 0 })
    expect(extractElementDimensions({ type: "mystery" })).toMatchObject({ width: 50, height: 50, depth: 10 })
  })

  test("suggested settings follow the model size", () => {
    expect(calculateOptimal3DPrintSettings({ type: "cube", width: 20, height: 20, depth: 20 })).toMatchObject({ layerHeight: 0.1, infillDensity: 30 })
    expect(calculateOptimal3DPrintSettings({ type: "cube", width: 200, height: 200, depth: 10 })).toMatchObject({ layerHeight: 0.3, infillDensity: 15, supportType: "none" })
  })

  test("time has a floor of ten minutes and grows with infill", () => {
    const cube = { type: "cube", width: 10, height: 10, depth: 10 }
    expect(estimatePrintTime(cube, {}, { infillDensity: 20, supportType: "none", layerHeight: 0.2 })).toBe(10)
    const big = { type: "cube", width: 100, height: 100, depth: 100 }
    const sparse = estimatePrintTime(big, {}, { infillDensity: 10, supportType: "none", layerHeight: 0.2 })
    const dense = estimatePrintTime(big, {}, { infillDensity: 80, supportType: "full", layerHeight: 0.2 })
    expect(dense).toBeGreaterThan(sparse)
  })

  test("material weight has a floor of one gram and depends on the material", () => {
    expect(estimateMaterialUsage({ type: "cube", width: 1, height: 1, depth: 1 }, { infillDensity: 20, shellCount: 2, supportType: "none", material: "plastic" })).toBe(1)
    const cube = { type: "cube", width: 50, height: 50, depth: 50 }
    const pla = estimateMaterialUsage(cube, { infillDensity: 20, shellCount: 2, supportType: "none", material: "plastic" })
    const alu = estimateMaterialUsage(cube, { infillDensity: 20, shellCount: 2, supportType: "none", material: "aluminum" })
    expect(alu).toBeGreaterThan(pla)
  })
})
