import { describe, expect, test } from "bun:test"
import type { Vec3 } from "../../cad/vec.ts"
import { DEFAULT_PROBE_SETTINGS, deviceOfSettings } from "./device.ts"
import { calibrateRotary, rotaryRoutine } from "./rotary-cal.ts"
import { runProbeMoves, type SimMachine } from "./simulate.ts"
import { sphereWorld } from "./world.ts"
import type { ProbeContext } from "./types.ts"

const DEG = Math.PI / 180
const probe = deviceOfSettings({ ...DEFAULT_PROBE_SETTINGS, stylusDiameter: 4 })
const ctx: ProbeContext = { probe, safeZ: 40, clearance: 3, search: 6, prefix: "rc" }
const assumed = { layout: "table-AC" as const, pivot: { x: 50, y: 40, z: 0 } }
const ball = { centre: { x: 80, y: 30, z: 10 }, diameter: 16 }

const measure = (axis: "A" | "C", angles: ReadonlyArray<number>, truth: { truePivot?: Vec3; trueAxes?: Partial<Record<"A" | "B" | "C", Vec3>> }, noise = 0) => {
  const r = rotaryRoutine({ kind: "rotary-axis", axis, sphere: ball, angles }, ctx, assumed)
  if ("refused" in r) throw new Error(r.refused)
  const machine: SimMachine = {
    offsets: { entries: {} }, active: { kind: "g5x", code: "G54" }, probe, start: { x: 0, y: 0, z: 40 },
    kinematics: { layout: "table-AC", pivot: assumed.pivot, ...truth }
  }
  let seed = 3
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5 }
  const out = runProbeMoves(r.moves, sphereWorld(ball.centre, ball.diameter / 2), { ...machine, ...(noise > 0 ? { truth: { noise: () => noise * rnd() * 2 } } : {}) })
  expect(out.stopped).toBeUndefined()
  const values = out.reports[0]!.values
  const centres = angles.map((_, i) => ({ x: values[`x${i}`]!, y: values[`y${i}`]!, z: values[`z${i}`]! }))
  return { routine: r, out, centres }
}

describe("rotary axis calibration", () => {
  test("the C pivot is recovered to 1e-6 (noise free)", () => {
    const angles = [0, 50, 110, 170, 240, 300].map((d) => d * DEG)
    const truePivot = { x: 50.03, y: 39.98, z: 0.05 }
    const { centres } = measure("C", angles, { truePivot })
    const cal = calibrateRotary(centres, angles, assumed, "C")
    if ("refused" in cal) throw new Error(cal.refused)
    expect(cal.pivot.x).toBeCloseTo(truePivot.x, 6)
    expect(cal.pivot.y).toBeCloseTo(truePivot.y, 6)
    expect(cal.pivotError.x).toBeCloseTo(0.03, 6)
    expect(cal.pivotError.y).toBeCloseTo(-0.02, 6)
    expect(cal.pivotError.z).toBeCloseTo(0, 6)
    expect(cal.axisTilt).toBeLessThan(1e-7)
    expect(cal.axisDirection.z).toBeCloseTo(1, 9)
    expect(cal.radius).toBeCloseTo(Math.hypot(ball.centre.x - truePivot.x, ball.centre.y - truePivot.y), 6)
    expect(cal.rms).toBeLessThan(1e-7)
  })

  test("a tilted C axis (0.01 degrees) and the pivot together", () => {
    const angles = [0, 60, 120, 180, 250, 320].map((d) => d * DEG)
    const tilt = 0.01 * DEG
    const trueAxes = { C: { x: Math.sin(tilt), y: 0, z: Math.cos(tilt) } }
    const { centres } = measure("C", angles, { truePivot: { x: 50.03, y: 39.98, z: 0.05 }, trueAxes })
    const cal = calibrateRotary(centres, angles, assumed, "C")
    if ("refused" in cal) throw new Error(cal.refused)
    expect(cal.axisTilt / DEG).toBeCloseTo(0.01, 5)
    expect(cal.axisDirection.x).toBeCloseTo(Math.sin(tilt), 7)
  })

  test("the A axis: pivot error in Y and Z", () => {
    const angles = [-40, -15, 10, 35, 60].map((d) => d * DEG)
    const { centres } = measure("A", angles, { truePivot: { x: 50, y: 40.04, z: 0.03 } })
    const cal = calibrateRotary(centres, angles, assumed, "A")
    if ("refused" in cal) throw new Error(cal.refused)
    expect(cal.pivotError.y).toBeCloseTo(0.04, 6)
    expect(cal.pivotError.z).toBeCloseTo(0.03, 6)
    expect(cal.pivotError.x).toBeCloseTo(0, 6)
    expect(cal.axisDirection.x).toBeCloseTo(1, 9)
  })

  test("with 1 micrometre of noise the pivot is within three sigma of the fit's own scatter", () => {
    const angles = [0, 45, 90, 135, 180, 225, 270, 315].map((d) => d * DEG)
    const truePivot = { x: 50.03, y: 39.98, z: 0 }
    const { centres } = measure("C", angles, { truePivot }, 0.001)
    const cal = calibrateRotary(centres, angles, assumed, "C")
    if ("refused" in cal) throw new Error(cal.refused)
    expect(Math.hypot(cal.pivot.x - truePivot.x, cal.pivot.y - truePivot.y)).toBeLessThan(3 * 0.001)
    expect(cal.rms).toBeLessThan(3 * 0.001)
  })

  test("refusals: an axis the machine lacks, too few or equal angles, a narrow span, collinear centres", () => {
    const base = { kind: "rotary-axis" as const, sphere: ball }
    expect(rotaryRoutine({ ...base, axis: "B", angles: [0, 1, 2] }, ctx, assumed)).toEqual({ refused: expect.stringMatching(/no B axis/) })
    expect(rotaryRoutine({ ...base, axis: "C", angles: [0, 1] }, ctx, assumed)).toEqual({ refused: expect.stringMatching(/three/) })
    expect(rotaryRoutine({ ...base, axis: "C", angles: [0, 1, 1] }, ctx, assumed)).toEqual({ refused: expect.stringMatching(/three|differ/) })
    expect(rotaryRoutine({ ...base, axis: "C", angles: [0, 0.1, 0.2] }, ctx, assumed)).toEqual({ refused: expect.stringMatching(/20 degrees/) })
    expect("refused" in calibrateRotary([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }], [0, 1, 2], assumed, "C")).toBe(true)
    expect("refused" in calibrateRotary([{ x: 0, y: 0, z: 0 }], [0], assumed, "C")).toBe(true)
  })
})
