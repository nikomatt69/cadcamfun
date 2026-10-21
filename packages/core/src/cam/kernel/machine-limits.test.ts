/**
 * The machine's ceilings in the cutting data: the power the spindle can deliver at the speed the cut runs at, and the
 * rigidity that scales the depth and the feed the cut may take.
 */
import { describe, expect, test } from "bun:test"
import { cuttingData, findMaterial, powerLimitAt, type MachineLimits } from "./index.ts"
import { DEFAULT_CUTTERS } from "./cutters.ts"

const material = findMaterial("6061")!
const endmill = DEFAULT_CUTTERS.find((tool) => tool.id === "flat-6") ?? DEFAULT_CUTTERS[0]!
const facemill = DEFAULT_CUTTERS.find((tool) => tool.kind === "facemill")!

const limits = (over: Partial<MachineLimits> = {}): MachineLimits => ({
  maxRpm: 24000, maxFeed: 20000, powerKw: 11, torqueNm: 70, efficiency: 0.8, ...over
})

describe("the spindle's power curve in the cutting data", () => {
  test("the power available at the speed the cut runs at is the curve's, not the flat rating", () => {
    // The same cut on a spindle that holds its rated power and on one whose power falls with the speed.
    const flat = cuttingData({ material, cutter: facemill, cut: "face", depth: 8, machine: limits() })
    const curved = cuttingData({
      material, cutter: facemill, cut: "face", depth: 8,
      machine: limits({ powerCurve: [{ rpm: 8000, kW: 1 }, { rpm: 24000, kW: 1 }] })
    })
    // The curve bounds the cut more tightly, so the feed falls and the reason is written down.
    expect(flat.limitedBy).not.toContain("spindle power")
    expect(curved.limitedBy).toContain("spindle power")
    expect(curved.feed).toBeLessThan(flat.feed)
  })

  test("the curve never raises the rated power", () => {
    const data = cuttingData({
      material, cutter: facemill, cut: "face", depth: 8,
      machine: limits({ powerKw: 5, powerCurve: [{ rpm: 8000, kW: 11 }, { rpm: 24000, kW: 9 }] })
    })
    expect(data.powerKw).toBeLessThanOrEqual(5 / 0.8 + 1e-9)
  })

  test("the power limit is read at the speed the cut actually runs at", () => {
    const machine = limits({ powerCurve: [{ rpm: 8000, kW: 11 }, { rpm: 24000, kW: 5 }] })
    expect(powerLimitAt(machine, 2000)).toBe(11)
    expect(powerLimitAt(machine, 8000)).toBe(11)
    // Between the points the power falls with the speed, the way a constant torque does.
    expect(powerLimitAt(machine, 16000)).toBeCloseTo(8, 6)
    expect(powerLimitAt(machine, 24000)).toBe(5)
  })
})

describe("the machine's rigidity in the cutting data", () => {
  test("the rigidity scales the depth and the feed the cut may take", () => {
    const light = cuttingData({ material, cutter: endmill, cut: "rough-side", machine: limits({ rigidity: "light" }) })
    const standard = cuttingData({ material, cutter: endmill, cut: "rough-side", machine: limits({ rigidity: "standard" }) })
    const heavy = cuttingData({ material, cutter: endmill, cut: "rough-side", machine: limits({ rigidity: "heavy" }) })
    // The factors are the traceable statement of what the rigidity did: a light frame takes less, a heavy one more.
    expect(light.reference.factors.rigidityFeed!).toBeLessThan(standard.reference.factors.rigidityFeed!)
    expect(light.reference.factors.rigidityDepth!).toBeLessThan(standard.reference.factors.rigidityDepth!)
    expect(standard.reference.factors.rigidityDepth!).toBeLessThan(heavy.reference.factors.rigidityDepth!)
  })
})
