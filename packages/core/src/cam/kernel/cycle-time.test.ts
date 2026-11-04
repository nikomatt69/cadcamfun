import { describe, expect, test } from "bun:test"
import type { Move, Toolpath } from "../ir.ts"
import { interpretGcode } from "../testing/gcode-interpreter.ts"
import { dynamicCycleTime, dynamicCycleTimeOfSegments, ramp, type MachineDynamics } from "./cycle-time.ts"

const tp = (moves: Move[]): Toolpath => ({ id: "t", name: "t", toolId: "1", spindleRpm: 1000, coolant: "off", moves })
const line = (x: number, y: number, feed = 6000): Move => ({ _tag: "Linear", to: { x, y, z: 0 }, feed })
const home: Move = { _tag: "Rapid", to: { x: 0, y: 0, z: 0 } }
const trap: MachineDynamics = { acceleration: 1000, rapidFeed: 12000 }

describe("cycle time with dynamics (spec 61 Z7, spec 69 G2)", () => {
  test("a straight move equals the analytic trapezoid: cruise 100 mm/s over 100 mm at a = 1000 takes v/a + l/v", () => {
    const r = dynamicCycleTime([tp([home, line(100, 0)])], trap)
    expect(r.seconds).toBeCloseTo(100 / 1000 + 100 / 100, 9)
    expect(r.kinematicSeconds).toBeCloseTo(1, 9)
    expect(r.calibrated).toBe(false)
  })
  test("a move too short to reach the feed is a triangle: 2 sqrt(l / a)", () => {
    const r = dynamicCycleTime([tp([home, line(5, 0)])], trap)
    expect(r.seconds).toBeCloseTo(2 * Math.sqrt(5 / 1000), 6)
  })
  test("jerk lengthens the ramps by a / j each, and an unlimited jerk is the trapezoid", () => {
    const a = 1000
    const j = 10_000
    expect(ramp(0, 100, a, j).t).toBeCloseTo(0.2, 9) // dv = a^2 / j: the two branches agree
    expect(ramp(0, 300, a, j).t).toBeCloseTo(300 / a + a / j, 9)
    expect(ramp(0, 300, a, Infinity).t).toBeCloseTo(0.3, 12)
    const withJerk = dynamicCycleTime([tp([home, line(100, 0, 18000)])], { ...trap, jerk: j })
    const without = dynamicCycleTime([tp([home, line(100, 0, 18000)])], trap)
    expect(withJerk.seconds).toBeGreaterThan(without.seconds)
  })
  test("look-ahead keeps the speed through collinear blocks; exact stop does not", () => {
    const moves: Move[] = [home]
    for (let i = 1; i <= 10; i++) moves.push(line(i * 10, 0))
    const stop = dynamicCycleTime([tp(moves)], trap).seconds
    const look = dynamicCycleTime([tp(moves)], { ...trap, lookAhead: 20 }).seconds
    const one = dynamicCycleTime([tp([home, line(100, 0)])], trap).seconds
    expect(look).toBeCloseTo(one, 6)
    expect(stop).toBeGreaterThan(look * 1.2)
  })
  test("a window shorter than the run takes the unplanned junction at rest", () => {
    const moves: Move[] = [home]
    for (let i = 1; i <= 10; i++) moves.push(line(i * 10, 0))
    const small = dynamicCycleTime([tp(moves)], { ...trap, lookAhead: 2 }).seconds
    const big = dynamicCycleTime([tp(moves)], { ...trap, lookAhead: 20 }).seconds
    expect(small).toBeGreaterThan(big)
  })
  test("a right angle is slower than a straight run, and a reversal is no faster than the corner", () => {
    const d = { ...trap, lookAhead: 5 }
    const straight = dynamicCycleTime([tp([home, line(50, 0), line(100, 0)])], d).seconds
    const corner = dynamicCycleTime([tp([home, line(50, 0), line(50, 50)])], d).seconds
    const reversal = dynamicCycleTime([tp([home, line(50, 0), line(0, 0)])], d).seconds
    expect(corner).toBeGreaterThan(straight)
    expect(reversal).toBeGreaterThanOrEqual(corner)
  })
  test("an arc is limited by the centripetal speed sqrt(a r)", () => {
    const arc: Move = { _tag: "Arc", to: { x: 0, y: 0, z: 0 }, center: { x: -1, y: 0 }, clockwise: false, feed: 60000 }
    const r = dynamicCycleTime([tp([home, arc])], trap)
    // r = 1 mm: v = sqrt(1000) = 31.6 mm/s over 2 pi mm, far slower than the 1000 mm/s feed
    expect(r.seconds).toBeGreaterThan((2 * Math.PI) / Math.sqrt(1000))
    expect(r.seconds).toBeGreaterThan(r.kinematicSeconds * 10)
  })
  test("dwells add their seconds and break the look-ahead", () => {
    const r = dynamicCycleTime([tp([home, line(100, 0), { _tag: "Dwell", seconds: 2 }])], trap)
    expect(r.seconds).toBeCloseTo(1.1 + 2, 9)
  })

  const fixtures: ReadonlyArray<{ readonly name: string; readonly nc: string; readonly moves: Move[] }> = [
    { name: "line", nc: "G21 G90\nG0 X0 Y0 Z0\nG1 X80 F3000\n", moves: [home, line(80, 0, 3000)] },
    { name: "square", nc: "G21 G90\nG0 X0 Y0 Z0\nG1 X40 F6000\nG1 Y40\nG1 X0\nG1 Y0\n", moves: [home, line(40, 0), line(40, 40), line(0, 40), line(0, 0)] },
    { name: "zigzag", nc: "G21 G90\nG0 X0 Y0 Z0\nG1 X30 F4000\nG1 Y3\nG1 X0\nG1 Y6\nG1 X30\n", moves: [home, line(30, 0, 4000), line(30, 3, 4000), line(0, 3, 4000), line(0, 6, 4000), line(30, 6, 4000)] },
    { name: "arc", nc: "G21 G90\nG0 X0 Y0 Z0\nG0 X10\nG3 X-10 Y0 I-10 J0 F2000\nG1 X-10 Y-20\n", moves: [home, { _tag: "Rapid", to: { x: 10, y: 0, z: 0 } }, { _tag: "Arc", to: { x: -10, y: 0, z: 0 }, center: { x: 0, y: 0 }, clockwise: false, feed: 2000 }, line(-10, -20, 2000)] },
    { name: "dwell", nc: "G21 G90\nG0 X0 Y0 Z0\nG1 X20 F3000\nG4 P1\nG1 X0\n", moves: [home, line(20, 0, 3000), { _tag: "Dwell", seconds: 1 }, line(0, 0, 3000)] }
  ]
  const dyn: MachineDynamics = { acceleration: 1500, jerk: 30_000, lookAhead: 10, rapidFeed: 20000 }
  for (const f of fixtures) {
    test(`fixture ${f.name}: the model over the IR equals the model over the interpreted NC, and dynamics never beat length over feed`, () => {
      const ir = dynamicCycleTime([tp(f.moves)], dyn)
      const nc = dynamicCycleTimeOfSegments(interpretGcode(f.nc).segments, dyn)
      expect(Math.abs(ir.seconds - nc.seconds)).toBeLessThan(0.01 * ir.seconds + 1e-6)
      expect(ir.seconds).toBeGreaterThanOrEqual(ir.kinematicSeconds - 1e-9)
    })
  }
})
