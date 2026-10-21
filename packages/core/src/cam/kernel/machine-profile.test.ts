/**
 * The machine profile: the one place that reads a machine configuration, in whichever shape it was written. The shapes
 * are the ones the app really has: the Resources form, the assistant's record and the canonical profile. A field that is
 * absent says the machine does not say, never a default the kernel would plan against.
 */
import { describe, expect, test } from "bun:test"
import { configOfProfile, profileOfConfig } from "./machine-profile.ts"
import { kernelMachineOfConfig, kernelMachineOfProfile } from "./machine-config.ts"
import { powerLimitAt } from "./cutting-data.ts"

describe("the machine profile reads every shape a configuration was written in", () => {
  test("the Resources form's shape: the work volume, the ceilings and the controller", () => {
    const profile = profileOfConfig({ workVolume: { x: 800, y: 500, z: 500 }, maxSpindleSpeed: 12000, maxFeedRate: 10000, controller: "Fanuc 0i-MD" })
    expect(profile.kind).toBe("mill")
    expect(profile.workVolume).toEqual({ x: 800, y: 500, z: 500 })
    expect(profile.spindle?.maxRpm).toBe(12000)
    expect(profile.feed?.max).toBe(10000)
    expect(profile.controller).toBe("Fanuc 0i-MD")
    // The post follows the controller: the dialect is the control's.
    expect(profile.post).toBe("fanuc")
  })

  test("the assistant's shape: the per-axis kinematics, the ceilings and the post processor", () => {
    const profile = profileOfConfig({
      kinematics: { x: { min: 0, max: 762 }, y: { min: 0, max: 406 }, z: { min: -508, max: 0 } },
      postProcessor: "fanuc", workOffsets: ["G54", "G55"], maxRPM: 8100, maxFeed: 16500
    })
    expect(profile.spindle?.maxRpm).toBe(8100)
    expect(profile.feed?.max).toBe(16500)
    expect(profile.post).toBe("fanuc")
    expect(profile.workOffsets?.available).toEqual(["G54", "G55"])
    // The axes carry the travel: the box the moves are checked against comes from them.
    expect(profile.axisTable).toHaveLength(3)
    expect(profile.travel).toEqual({ minX: 0, maxX: 762, minY: 0, maxY: 406, minZ: -508, maxZ: 0 })
  })

  test("the canonical shape is read as itself", () => {
    const profile = profileOfConfig({
      kind: "mill", controller: "Heidenhain TNC7", post: "heidenhain", axes: 5,
      axisTable: [
        { id: "X", kind: "linear", min: -175, max: 175, sense: 1 },
        { id: "Y", kind: "linear", min: -110, max: 110, sense: 1 },
        { id: "Z", kind: "linear", min: -250, max: 250, sense: 1 },
        { id: "B", kind: "rotary", min: -110, max: 110, sense: 1 },
        { id: "C", kind: "rotary", min: -180, max: 180, sense: 1, continuous: true }
      ],
      spindle: { maxRpm: 50000, minRpm: 1000, powerKw: 6, torqueNm: 1.6, powerCurve: [{ rpm: 20000, kW: 6 }, { rpm: 50000, kW: 4 }] },
      feed: { max: 60000, rapid: 60000 },
      rigidity: "heavy",
      rotary: { layout: "table-BC", tilt: { min: -110, max: 110 }, pivot: { x: 0, y: 0, z: -100 }, tcp: "control" },
      toolChanger: { type: "carousel", capacity: 30, changeSeconds: 3 },
      workOffsets: { available: ["G54", "G55"], default: "G54" },
      coolant: { modes: ["flood", "mist"] },
      accuracy: { positioningMm: 0.005 },
      reference: { source: "https://example.invalid/kern", notes: "Pivot calibrated" }
    })
    expect(profile.kind).toBe("mill")
    expect(profile.axes).toBe(5)
    expect(profile.axisTable?.[4]).toEqual({ id: "C", kind: "rotary", min: -180, max: 180, sense: 1, continuous: true })
    expect(profile.spindle?.powerCurve).toHaveLength(2)
    expect(profile.rigidity).toBe("heavy")
    expect(profile.rotary?.layout).toBe("table-BC")
    expect(profile.toolChanger?.capacity).toBe(30)
    expect(profile.coolant?.modes).toEqual(["flood", "mist"])
    expect(profile.accuracy?.positioningMm).toBe(0.005)
    expect(profile.reference?.source).toBe("https://example.invalid/kern")
  })

  test("what a configuration does not say stays absent: the profile never fills a gap", () => {
    const profile = profileOfConfig({ maxSpindleSpeed: 12000, maxFeedRate: 10000 })
    expect(profile.spindle?.powerKw).toBeUndefined()
    expect(profile.spindle?.minRpm).toBeUndefined()
    expect(profile.rigidity).toBeUndefined()
    expect(profile.travel).toBeUndefined()
    expect(profile.accuracy).toBeUndefined()
    expect(profile.coolant).toBeUndefined()
  })

  test("the kind comes from the configuration, else from the row's own type", () => {
    expect(profileOfConfig({ kind: "lathe" }).kind).toBe("lathe")
    expect(profileOfConfig({}, "lathe").kind).toBe("lathe")
    expect(profileOfConfig({}, "3Dprinter").kind).toBe("printer")
    expect(profileOfConfig({ kind: "printer" }, "mill").kind).toBe("printer")
  })

  test("the profile is written back in the canonical shape, keeping what it did not name", () => {
    const profile = profileOfConfig({ maxSpindleSpeed: 12000, maxFeedRate: 10000, additionalSettings: { shopField: "kept" } })
    const config = configOfProfile(profile)
    expect(config["spindle"]).toEqual({ maxRpm: 12000 })
    expect(config["feed"]).toEqual({ max: 10000 })
    expect(config["additionalSettings"]).toEqual({ shopField: "kept" })
  })
})

describe("the kernel machine carries the profile's figures", () => {
  const machine = (over: Record<string, unknown> = {}) => kernelMachineOfProfile(profileOfConfig({
    kind: "mill", controller: "fanuc",
    spindle: { maxRpm: 12000, minRpm: 500, powerKw: 11, torqueNm: 70, efficiency: 0.85, powerCurve: [{ rpm: 8000, kW: 11 }, { rpm: 12000, kW: 7 }] },
    feed: { max: 12000, rapid: 30000 },
    rigidity: "heavy",
    travel: { minX: -400, maxX: 400, minY: -300, maxY: 300, minZ: -500, maxZ: 100 },
    table: { length: 1000, width: 500, gap: 30 },
    workOffsets: { available: ["G54", "G55"], default: "G54" },
    coolant: { modes: ["flood"] },
    accuracy: { positioningMm: 0.01 },
    toolChanger: { capacity: 20, changeSeconds: 6 },
    ...over
  }), "row-1", "Shop VMC")

  test("the ceilings, the rigidity and the efficiency reach the limits", () => {
    const m = machine()
    expect(m?.limits.maxRpm).toBe(12000)
    expect(m?.limits.minRpm).toBe(500)
    expect(m?.limits.maxFeed).toBe(12000)
    expect(m?.limits.powerKw).toBe(11)
    expect(m?.limits.torqueNm).toBe(70)
    expect(m?.limits.efficiency).toBe(0.85)
    expect(m?.limits.rigidity).toBe("heavy")
    expect(m?.limits.powerCurve).toHaveLength(2)
  })

  test("the travel, the table, the offsets, the coolant and the accuracy reach the machine", () => {
    const m = machine()
    expect(m?.travel).toEqual({ minX: -400, maxX: 400, minY: -300, maxY: 300, minZ: -500, maxZ: 100 })
    expect(m?.table).toEqual({ length: 1000, width: 500, gap: 30 })
    expect(m?.workOffsets?.available).toEqual(["G54", "G55"])
    expect(m?.workOffsets?.default).toBe("G54")
    expect(m?.coolant?.modes).toEqual(["flood"])
    expect(m?.accuracy?.positioningMm).toBe(0.01)
    expect(m?.toolCapacity).toBe(20)
    expect(m?.toolChangeSeconds).toBe(6)
    expect(m?.rapidFeed).toBe(30000)
  })

  test("a configuration the kernel cannot machine is still refused, never guessed", () => {
    expect(kernelMachineOfConfig({ id: "r", name: "n", type: "printer", config: { maxSpindleSpeed: 1, maxFeedRate: 1 } })).toBeUndefined()
    expect(kernelMachineOfConfig({ id: "r", name: "n", type: "mill", config: { maxFeedRate: 1 } })).toBeUndefined()
    expect(kernelMachineOfConfig({ id: "r", name: "n", type: "mill", config: { maxSpindleSpeed: 1 } })).toBeUndefined()
  })
})

describe("the spindle's power by speed band", () => {
  test("the curve falls the way a constant-torque spindle does, bounded by the rated power", () => {
    const limits = { maxRpm: 12000, maxFeed: 10000, powerKw: 11, powerCurve: [{ rpm: 8000, kW: 11 }, { rpm: 12000, kW: 7 }] }
    // Below the first point the spindle holds its power; at the point it is the power named.
    expect(powerLimitAt(limits, 1000)).toBe(11)
    expect(powerLimitAt(limits, 8000)).toBe(11)
    // Between the points the power falls with the speed, the way a constant torque does.
    expect(powerLimitAt(limits, 10000)).toBeCloseTo(9, 6)
    expect(powerLimitAt(limits, 12000)).toBe(7)
  })

  test("the curve never raises the rated power", () => {
    const limits = { maxRpm: 12000, maxFeed: 10000, powerKw: 5, powerCurve: [{ rpm: 8000, kW: 11 }, { rpm: 12000, kW: 7 }] }
    expect(powerLimitAt(limits, 1000)).toBe(5)
    expect(powerLimitAt(limits, 12000)).toBe(5)
  })

  test("without a curve the flat ceiling stands", () => {
    expect(powerLimitAt({ maxRpm: 12000, maxFeed: 10000, powerKw: 11 }, 10000)).toBe(11)
    expect(powerLimitAt({ maxRpm: 12000, maxFeed: 10000 }, 10000)).toBeUndefined()
  })
})
