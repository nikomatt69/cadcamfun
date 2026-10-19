/**
 * Spec 32 P7: collisions on the playback timeline — rapids into the stock, shank and holder deeper than the tool reaches,
 * the machine's head against the part side — each at its time, move and line, and none on a sound program.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "../../src/index.ts"

const v = cam.viewer
const g = cam.generator
const settings = (patch: Record<string, unknown> = {}) => g.withMachineDefaults(g.decodeSettings(patch) as cam.generator.ToolpathSettings)
// A 100 x 60 x 20 stock, top at Z0, centred on the origin, on plain clamps (no vise jaws in the way).
const stock: cam.generator.Stock = { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
const setup = v.setupOf("mill", settings({ workholding: "plate" }), stock) as cam.viewer.MillSetup
const timelineOf = (gcode: string) => { const a = g.analyseGcode(gcode); return v.buildTimeline(a.program, a.motion) }
const reach: cam.viewer.ToolReach = { flute: 15, stickout: 40, shank: 3, holder: 15 }
const check = (gcode: string, extra: Partial<cam.viewer.CollisionInput> = {}) => v.checkCollisions({ setup, timeline: timelineOf(gcode), reachOf: () => reach, ...extra })

describe("collisions", () => {
  test("a sound program has none", () => {
    expect(check("G21 G90\nG0 X-60 Y0 Z5\nG1 Z-10 F200\nG1 X60 F800\nG0 Z5\nM30")).toEqual([])
  })

  test("a rapid below the top inside the stock, at its line", () => {
    const found = check("G21 G90\nG0 X0 Y0 Z5\nG0 Z-4\nM30")
    expect(found.map((e) => [e.code, e.severity, e.line])).toEqual([["RAPID_INTO_STOCK", "error", 3]])
    expect(found[0]!.depth).toBeCloseTo(4, 9)
    // Outside the stock it is only air.
    expect(check("G21 G90\nG0 X80 Y0 Z5\nG0 Z-4\nM30")).toEqual([])
  })

  test("deeper than the cutting length: the shank; deeper than the stickout: the holder", () => {
    const shank = check("G21 G90\nG0 X-60 Y0 Z5\nG1 Z-18 F200\nG1 X60 F800\nM30")
    // The plunge at X-60 is beside the stock; the pass across it is too deep.
    expect(shank.map((e) => [e.code, e.severity, e.count])).toEqual([["SHANK_IN_STOCK", "warning", 1]])
    const holder = check("G21 G90\nG0 X0 Y0 Z5\nG1 Z-19 F200\nM30", { reachOf: () => ({ ...reach, stickout: 12 }) })
    expect(holder.map((e) => e.code)).toEqual(["HOLDER_IN_STOCK"])
    // No tool known: no reach checks.
    expect(check("G21 G90\nG0 X0 Y0 Z5\nG1 Z-19 F200\nM30", { reachOf: () => undefined })).toEqual([])
  })

  test("the machine: a spindle housing that comes down onto the stock with a too short tool", () => {
    const model = v.machineModelOf(setup)!
    const program = "G21 G90\nG0 X0 Y0 Z5\nG1 Z-15 F200\nG0 Z50\nM30"
    const short = v.checkCollisions({ setup, timeline: timelineOf(program), reachOf: () => undefined, model, gaugeOf: () => 10 })
    expect(short.map((e) => [e.code, e.bodies?.[0], e.bodies?.[1], e.line])).toEqual([["MACHINE_COLLISION", "spindle", "stock", 3]])
    expect(short[0]!.severity).toBe("warning")
    const long = v.checkCollisions({ setup, timeline: timelineOf(program), reachOf: () => undefined, model, gaugeOf: () => 90 })
    expect(long).toEqual([])
  })

  test("the reach of a mill model; none for a lathe insert", () => {
    // The holder's flange (1.25 x its radius) is its widest point.
    expect(v.toolReachOf(cam.toolModelOf({ type: "endmill", diameter: 10, cuttingLength: 22, stickout: 40, shankDiameter: 10, holderDiameter: 32 }, "mill"))).toEqual({ flute: 22, stickout: 40, shank: 5, holder: 20 })
    expect(v.toolReachOf(cam.toolModelOf({ type: "turning", diameter: 3 }, "lathe"))).toBeUndefined()
  })
})

describe("collisions against the stock left, and near misses", () => {
  const flat10 = cam.toolModelOf({ type: "endmill", diameter: 10, cuttingLength: 20, stickout: 40 }, "mill")
  const live = { toolOf: () => flat10, cell: 0.5 }
  const liveCheck = (gcode: string, clearance = 2) => v.checkCollisions({ setup, timeline: timelineOf(gcode), reachOf: () => v.toolReachOf(flat10), live, clearance })
  const slot = "G21 G90\nS9000 M3\nG0 X0 Y0 Z5\nG1 Z-5 F300\nG1 X20 F800\nG0 Z5\n"

  test("a rapid back down into the opened slot is not a crash; against the raw box it was", () => {
    const program = slot + "G0 X10 Y0\nG0 Z-3\nG0 Z5\nM30"
    expect(liveCheck(program, 0)).toEqual([])
    expect(v.checkCollisions({ setup, timeline: timelineOf(program), reachOf: () => v.toolReachOf(flat10) }).map((e) => e.code)).toEqual(["RAPID_INTO_STOCK"])
  })

  test("a rapid into a wall still standing is", () => {
    const found = liveCheck(slot + "G0 X10 Y20\nG0 Z-3\nM30", 0)
    expect(found.map((e) => [e.code, e.line])).toEqual([["RAPID_INTO_STOCK", 8]])
  })

  test("a rapid 1 mm over the stock, the holder within the clearance: near misses", () => {
    const pass = "G21 G90\nS9000 M3\nG0 Z50\nG0 X-60 Y0\nG0 Z1\nG0 X60\nM30"
    expect(liveCheck(pass).map((e) => [e.code, e.severity, e.line])).toEqual([["NEAR_MISS", "warning", 6]])
    expect(liveCheck(pass, 0.5)).toEqual([])
  })

  test("the spindle housing passing within the clearance of the stock", () => {
    const model = v.machineModelOf(setup)!
    const found = v.checkCollisions({ setup, timeline: timelineOf("G21 G90\nG0 X0 Y0 Z5\nG1 Z-9 F200\nG0 Z50\nM30"), reachOf: () => undefined, model, gaugeOf: () => 10 })
    expect(found.map((e) => [e.code, e.bodies?.[0], e.bodies?.[1]])).toEqual([["NEAR_MISS", "spindle", "stock"]])
  })
})
