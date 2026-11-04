import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { deviceOfSettings, deviceProblems, effectiveRadius, resolveProbe, validateSettings, DEFAULT_PROBE_SETTINGS, type ProbeDevice } from "./device.ts"
import { CharacteristicSchema, ProbeActionSchema, ProbeCycleSchema, ProbeDeviceSchema } from "./schema.ts"
import { translateCycle } from "./transform.ts"
import { configOfProfile, profileOfConfig } from "../kernel/machine-profile.ts"
import { kernelMachineOfProfile } from "../kernel/machine-config.ts"
import { kernelProbingOfProfile, settingsFromMachine, withWorkOffsetTable, workOffsetTableOf } from "../kernel/machine-probing.ts"

const D2R = Math.PI / 180
const device: ProbeDevice = { ...deviceOfSettings(DEFAULT_PROBE_SETTINGS), calibration: { ballDiameter: 6, effectiveRadius: 2.99, directional: [{ angle: 0, radius: 2.98 }, { angle: Math.PI / 2, radius: 2.99 }, { angle: Math.PI, radius: 3 }, { angle: 1.5 * Math.PI, radius: 2.99 }] } }

describe("probe device", () => {
  test("effective radius interpolates by direction and wraps", () => {
    expect(effectiveRadius(device, { x: 1, y: 0 })).toBeCloseTo(2.98, 12)
    expect(effectiveRadius(device, { x: -1, y: 0 })).toBeCloseTo(3, 12)
    expect(effectiveRadius(device, { x: 1, y: 1 })).toBeCloseTo(2.985, 12)
    expect(effectiveRadius(device, { x: 1, y: -1 })).toBeCloseTo(2.985, 12)
    expect(effectiveRadius(device, { x: 0, y: 0, z: -1 } as never)).toBeCloseTo(2.99, 12)
    expect(effectiveRadius(deviceOfSettings(DEFAULT_PROBE_SETTINGS), { x: 0, y: 1 })).toBe(3)
  })

  test("problems and resolution", () => {
    expect(deviceProblems(device)).toEqual([])
    expect(deviceProblems({ ...device, feeds: { ...device.feeds, touch: 99_999 } }).join()).toMatch(/maximum/)
    expect(validateSettings({ ...DEFAULT_PROBE_SETTINGS, feed: 0 }).join()).toMatch(/feed/)
    const m = { probes: [device, { ...device, id: "second" }], macroStyle: "inline", skipFrame: "work", tiltedPlane: false, offsets: {}, calibrationSource: "baked" } as const
    expect(resolveProbe(m)?.id).toBe("probe")
    expect(resolveProbe(m, "second")?.id).toBe("second")
    expect(resolveProbe(m, "nope")).toBeUndefined()
  })
})

describe("schemas", () => {
  test("cycle angles are degrees on the wire", () => {
    const decode = Schema.decodeUnknownSync(ProbeCycleSchema)
    const pocket = decode({ kind: "pocket", centre: { x: 1, y: 2 }, width: 20, angle: 90, depth: 3 })
    expect(pocket.kind === "pocket" && pocket.angle).toBeCloseTo(Math.PI / 2, 12)
    const bore = decode({ kind: "bore", centre: { x: 0, y: 0 }, diameter: 20, depth: 3, angles: [0, 120, 240] })
    expect(bore.kind === "bore" && bore.angles![1]!).toBeCloseTo(120 * D2R, 12)
    expect(Schema.encodeSync(ProbeCycleSchema)(bore)).toEqual({ kind: "bore", centre: { x: 0, y: 0 }, diameter: 20, depth: 3, angles: [0, 120, 240] })
    expect(() => decode({ kind: "edge", at: { x: 0, y: 0, z: -3 }, normal: { x: 1, y: 1 } })).toThrow()
    expect(() => decode({ kind: "plane", points: [{ x: 0, y: 0 }], expectedZ: 0 })).toThrow()
  })

  test("an angle characteristic converts, a size does not", () => {
    const decode = Schema.decodeUnknownSync(CharacteristicSchema)
    const a = decode({ name: "rot", kind: "angle", result: "rotation", nominal: 0, lower: -0.5, upper: 0.5 })
    expect(a.upper).toBeCloseTo(0.5 * D2R, 12)
    const s = decode({ name: "dia", kind: "size", result: "diameter", nominal: 20, lower: -0.02, upper: 0.02 })
    expect(s.upper).toBe(0.02)
    expect(() => decode({ name: "x", kind: "size", result: "d", nominal: 1, lower: 1, upper: 0 })).toThrow()
    const act = Schema.decodeUnknownSync(ProbeActionSchema)({ kind: "set-offset", ref: { kind: "g5x", code: "G54" }, axes: { X: "x", Y: "y" }, policy: { mode: "update-within-tolerance", tolerance: 0.5, angleTolerance: 1 } })
    expect(act.kind === "set-offset" && act.policy.angleTolerance).toBeCloseTo(D2R, 12)
  })

  test("device orientation is degrees on the wire", () => {
    const wire = { ...device, orientSpindle: 90, calibration: { ...device.calibration!, directional: [{ angle: 90, radius: 2.99 }] } }
    const d = Schema.decodeUnknownSync(ProbeDeviceSchema)(wire)
    expect(d.orientSpindle).toBeCloseTo(Math.PI / 2, 12)
    expect(d.calibration!.directional![0]!.angle).toBeCloseTo(Math.PI / 2, 12)
  })

  test("translateCycle moves points and heights only", () => {
    expect(translateCycle({ kind: "bore", centre: { x: 1, y: 2 }, diameter: 10, depth: 3 }, 5, 6, 1)).toEqual({ kind: "bore", centre: { x: 6, y: 8 }, diameter: 10, depth: 3, top: 1 })
    expect(translateCycle({ kind: "tool-length", tool: 3 }, 5, 6, 1)).toEqual({ kind: "tool-length", tool: 3 })
  })
})

describe("machine profile probing", () => {
  const config = {
    kind: "mill", controller: "Fanuc 0i-MF", spindle: { maxRpm: 10000 }, feed: { max: 10000 },
    rotary: { layout: "table-AC", tilt: { min: -120, max: 30 }, pivot: { x: 0, y: 0, z: -100 }, calibration: { pivotMeasured: { x: 0.03, y: -0.02, z: -99.95 }, at: "2026-11-04T10:00:00Z" } },
    workOffsets: { available: ["G54", "G55"], default: "G55" },
    probing: { stylusDiameter: 4, stylusRadius: 3, feed: 80, feeds: { fast: 400, positioning: 1500 }, orientSpindle: 90, calibration: { effectiveRadius: 1.985, directional: [{ angle: 0, radius: 1.98 }] }, bogus: 1, backoff: "x" },
    toolSetter: { kind: "contact", position: { x: -300, y: -200, z: -400 }, triggerZ: -380, maxToolDiameter: 40, feeds: { fast: 300, touch: 30 }, brokenTolerance: 0.2 },
    workOffsetTable: { entries: { G54: { x: 100, y: 50, z: -200, rotation: 0.5 } }, bySetup: { s2: { G54: { x: 101, y: 50, z: -200 } } } }
  }

  test("reads the extended block, keeps the legacy fields and drops what does not read", () => {
    const p = profileOfConfig(config)
    expect(p.probing?.stylusDiameter).toBe(4)
    expect(p.probing?.stylusRadius).toBe(3)
    expect((p.probing as Record<string, unknown>)["backoff"]).toBeUndefined()
    expect(p.toolSetter?.triggerZ).toBe(-380)
    expect(p.rotary?.calibration?.pivotMeasured?.x).toBe(0.03)
    const back = profileOfConfig(configOfProfile(p))
    expect(back.probing).toEqual(p.probing!)
    expect(back.workOffsetTable).toEqual(p.workOffsetTable!)
    expect(back.toolSetter).toEqual(p.toolSetter!)
  })

  test("settingsFromMachine: diameter over radius, machine over defaults, request over machine", () => {
    const p = profileOfConfig(config)
    const s = settingsFromMachine(p)
    expect([s.stylusDiameter, s.feed, s.fastFeed, s.positioningFeed, s.effectiveRadius, s.workOffset]).toEqual([4, 80, 400, 1500, 1.985, { kind: "g5x", code: "G55" }])
    expect(s.orientSpindle).toBeCloseTo(Math.PI / 2, 12)
    expect(settingsFromMachine(p, { feed: 50, safeZ: undefined as unknown as number }).feed).toBe(50)
    expect(settingsFromMachine(p, { safeZ: undefined as unknown as number }).safeZ).toBe(25)
    const legacy = settingsFromMachine(profileOfConfig({ kind: "mill", probing: { stylusRadius: 2.5, feed: 60 } }))
    expect([legacy.stylusDiameter, legacy.feed]).toEqual([5, 60])
    expect(settingsFromMachine(undefined)).toEqual(DEFAULT_PROBE_SETTINGS)
  })

  test("kernel machine: probing and the measured pivot", () => {
    const p = profileOfConfig(config)
    const m = kernelMachineOfProfile(p, "m1", "M1")!
    expect(m.probing?.probes[0]?.stylus.ballDiameter).toBe(4)
    expect(m.probing?.toolSetter?.brokenTolerance).toBe(0.2)
    expect(m.probing?.skipFrame).toBe("work")
    expect(m.fiveAxis?.pivot).toEqual({ x: 0.03, y: -0.02, z: -99.95 })
    expect(kernelProbingOfProfile({})).toBeUndefined()
  })

  test("work offset table per setup, radians in the core", () => {
    const p = profileOfConfig(config)
    const machine = workOffsetTableOf(p)
    expect(machine.entries["G54"]!.rotation).toBeCloseTo(0.5 * D2R, 12)
    expect(workOffsetTableOf(p, "s2").entries["G54"]!.x).toBe(101)
    const stored = withWorkOffsetTable(p.workOffsetTable, { entries: { G55: { x: 1, y: 2, z: 3, rotation: Math.PI } } }, "s3")
    expect(stored.entries).toEqual(p.workOffsetTable!.entries)
    expect(stored.bySetup?.["s3"]?.["G55"]?.rotation).toBeCloseTo(180, 9)
  })
})
