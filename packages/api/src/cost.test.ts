import { describe, expect, test } from "bun:test"
import { SYSTEM_DEFAULT_SETTINGS, calculateEstimate } from "./cost.ts"

const toolpath = (data: unknown) => ({ id: "tp", data, toolId: "t1", materialId: "m1" })

describe("calculateEstimate (legacy golden values)", () => {
  test("no path and no stock: only the setup cost (30 min at 50+30 EUR/h)", () => {
    const r = calculateEstimate({ toolpath: toolpath({}), settings: SYSTEM_DEFAULT_SETTINGS, toolWear: null, materialCost: null })
    expect(r.setupCost).toBeCloseTo(40, 10)
    expect(r.machineTime).toBe(0)
    expect(r.operatorTimeCost).toBeCloseTo(15, 10) // 30 min of operator time at 30/h
    expect(r.totalCost).toBeCloseTo(55, 10)
    expect(r.currencyCode).toBe("EUR")
    expect(r.details.sourceSettingsId).toBeUndefined()
  })

  test("full example: path length, feed, tool wear, material with waste", () => {
    const r = calculateEstimate({
      toolpath: toolpath({ operations: [{ pathLength: 3000 }, { pathLength: 1000 }, { pathLength: "x" }], stockDimensions: { x: 100, y: 100, z: 50 }, parameters: { feedrate: 500 } }),
      settings: { ...SYSTEM_DEFAULT_SETTINGS, id: "S1" },
      toolWear: { wearRatePerMeter: 2, replacementCost: 40 },
      materialCost: { costPerUnit: 20000, wasteFactor: 10, minimumCharge: 0 }
    })
    expect(r.details.calculatedValues).toMatchObject({ totalPathLengthMm: 4000, materialVolumeM3: 0.0005, feedRateMmMin: 500, machineTimeMinutes: 8 })
    expect(r.toolWearCost).toBeCloseTo(((4 * 2) / 100) * 40, 10) // 3.2
    expect(r.materialCost).toBeCloseTo(0.0005 * 1.1 * 20000, 10) // 11
    expect(r.machineTimeCost).toBeCloseTo((8 / 60) * 50, 10)
    expect(r.operatorTime).toBe(38)
    expect(r.operatorTimeCost).toBeCloseTo((38 / 60) * 30, 10)
    expect(r.totalCost).toBeCloseTo(r.materialCost + r.toolWearCost + r.machineTimeCost + r.operatorTimeCost + r.setupCost, 10)
    expect(r.details.sourceSettingsId).toBe("S1")
    expect(r.details.costBreakdown.setup).toBeCloseTo(40, 10)
  })

  test("minimum charge wins; feed rate 0 falls back to 1000", () => {
    const r = calculateEstimate({
      toolpath: toolpath({ operations: [{ pathLength: 1000 }], stockDimensions: { x: 10, y: 10, z: 10 }, parameters: { feedrate: 0 } }),
      settings: SYSTEM_DEFAULT_SETTINGS, toolWear: null,
      materialCost: { costPerUnit: 1, wasteFactor: null, minimumCharge: 7.5 }
    })
    expect(r.materialCost).toBe(7.5)
    expect(r.details.calculatedValues.feedRateMmMin).toBe(1000)
    expect(r.machineTime).toBe(1)
  })
})
