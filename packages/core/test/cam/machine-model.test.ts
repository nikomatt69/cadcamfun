/**
 * Spec 32 P5: the machine around the part — its links moved by the joints, in the part frame (the part still) and in the
 * machine frame (the base still), for every machine class; the head machines' tool axis; travel and rotary limits.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "../../src/index.ts"
import type { Vec3 } from "../../src/cad/vec.ts"

const v = cam.viewer
const g = cam.generator
const settings = (patch: Record<string, unknown> = {}) => g.withMachineDefaults(g.decodeSettings(patch) as cam.generator.ToolpathSettings)
const stock: cam.generator.Stock = { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
const mill = v.setupOf("mill", settings(), stock) as cam.viewer.MillSetup
const close = (a: Vec3, b: Vec3, digits = 9) => { expect(a.x).toBeCloseTo(b.x, digits); expect(a.y).toBeCloseTo(b.y, digits); expect(a.z).toBeCloseTo(b.z, digits) }
const origin = { x: 0, y: 0, z: 0 }
const rotary = (layout: cam.viewer.MachineRotaryLayout, coordinates: "part" | "machine" = "part"): cam.viewer.RotarySetup => ({ layout, pivot: { x: 0, y: 0, z: -40 }, coordinates, assumed: false, reasons: [] })

describe("machine model", () => {
  test("the preset follows the set-up's rotary layout", () => {
    expect(v.presetFor(mill)).toBe("vmc-3")
    for (const [layout, preset] of [["table-AC", "trunnion-ac"], ["table-BC", "trunnion-bc"], ["head-table-BC", "head-table-bc"], ["head-head-AC", "head-head-ac"]] as const) {
      expect(v.presetFor({ ...mill, axes: 5, rotary: rotary(layout) })).toBe(preset)
    }
    expect(v.presetFor({ ...mill, axes: 4, rotary: rotary("table-AC") })).toBe("vmc-4a")
    for (const p of v.MACHINE_PRESETS) {
      const model = v.machineModelOf(mill, { preset: p.id })!
      expect(model.bodies.some((b) => b.link === "spindle"), p.id).toBe(true)
      expect(model.assumed, p.id).toContain("travel")
    }
    expect(v.machineModelOf(v.latheSetupOf(settings({ machineType: "lathe" })))).toBeUndefined()
  })

  test("VMC, part frame: the table still, the spindle nose `gauge` above the tip; machine frame: the table travels X/Y", () => {
    const model = v.machineModelOf(mill)!
    const p = { x: 30, y: -10, z: -4 }
    const part = v.machinePose(model, p, {}, undefined, 80, "part")
    close(part.tip, p)
    close(v.apply4(part.links.spindle, origin), { x: 30, y: -10, z: 76 })
    close(v.apply4(part.links.table, { x: 5, y: 5, z: 5 }), { x: 5, y: 5, z: 5 })
    // The column moves with the tool relative to a still part (the table really moves under it).
    close(v.apply4(part.links.column, origin), { x: 30, y: -10, z: 0 })
    const machine = v.machinePose(model, p, {}, undefined, 80, "machine")
    close(machine.tip, { x: 0, y: 0, z: -4 })
    close(v.apply4(machine.part, p), machine.tip)
    close(v.apply4(machine.links.column, origin), origin)
    expect(machine.joints).toEqual({ x: 30, y: -10, z: -4 })
  })

  test("trunnion A/C: the machine frame turns the part as indexing.ts does, the tip stays under the head", () => {
    const model = v.machineModelOf({ ...mill, axes: 5, rotary: rotary("table-AC") })!
    const p = { x: 20, y: 10, z: 0 }, angles = { a: 30, c: 90 }
    const pose = v.machinePose(model, p, angles, rotary("table-AC"), 60, "machine")
    const turned = cam.partToMachine(p, { a: 30, c: 90 }, "table-AC", { x: 0, y: 0, z: -40 })
    close(pose.joints, turned)
    // The table carries Y: the part is turned, then moved by -Y; the tool tip is where the turned point went.
    close(v.apply4(pose.part, p), { x: turned.x, y: 0, z: turned.z })
    close(pose.tip, { x: turned.x, y: 0, z: turned.z })
    close(pose.axis, { x: 0, y: 0, z: 1 })
    // Part frame: the part still, the tool leaning along R^T Z.
    const still = v.machinePose(model, p, angles, rotary("table-AC"), 60, "part")
    close(still.tip, p)
    close(still.axis, v.toolAxisInPart(angles, rotary("table-AC")))
    close(v.apply4(still.links.spindle, origin), { x: p.x + 60 * still.axis.x, y: p.y + 60 * still.axis.y, z: p.z + 60 * still.axis.z })
  })

  test("head machines: the head turns, the nose follows the tool axis", () => {
    const bc = rotary("head-table-BC")
    const axis = v.toolAxisInMachine({ b: 30 }, bc)
    close(axis, { x: Math.sin(Math.PI / 6), y: 0, z: Math.cos(Math.PI / 6) })
    // B and C: the part sees the head's lean turned back by the table.
    close(v.toolAxisInPart({ b: 30, c: 90 }, bc), { x: 0, y: -Math.sin(Math.PI / 6), z: Math.cos(Math.PI / 6) })
    const model = v.machineModelOf({ ...mill, axes: 5, rotary: bc })!
    const pose = v.machinePose(model, { x: 10, y: 0, z: 0 }, { b: 30, c: 0 }, bc, 100, "part")
    close(v.apply4(pose.links.spindle, origin), { x: 10 + 100 * axis.x, y: 0, z: 100 * axis.z })
    const ac = rotary("head-head-AC")
    close(v.toolAxisInMachine({ a: 90, c: 90 }, ac), { x: 1, y: 0, z: 0 })
    // A fork head does not turn the part.
    const fork = v.machinePose(v.machineModelOf({ ...mill, axes: 5, rotary: ac })!, { x: 5, y: 5, z: 5 }, { a: 45, c: 30 }, ac, 50, "machine")
    close(v.apply4(fork.part, { x: 5, y: 5, z: 5 }), { x: 5, y: 5, z: 5 })
  })

  test("the trunnions' rotary maths is unchanged by the head layouts", () => {
    for (const layout of ["table-AC", "table-BC"] as const) {
      const r = rotary(layout)
      const R = cam.tableRotation({ a: 20, b: 20, c: 70 }, layout)
      expect(v.toolAxisInPart({ a: 20, b: 20, c: 70 }, r)).toEqual({ x: R[6]! * 0 + R[6]!, y: R[7]!, z: R[8]! })
    }
  })
})

describe("travel and rotary limits", () => {
  const timelineOf = (gcode: string) => { const a = g.analyseGcode(gcode); return { a, t: v.buildTimeline(a.program, a.motion) } }

  test("a move past an entered travel is an error at its line; an assumed travel a warning", () => {
    const { t } = timelineOf("G21 G90\nG0 X0 Y0 Z5\nG1 Z-2 F100\nG1 X400 F800\nG1 X0\nM30")
    const entered = v.machineModelOf(mill, { travel: { x: 500, y: 400, z: 400 } })!
    const found = v.checkLimits(entered, t, undefined, () => 60)
    expect(found.map((f) => [f.code, f.severity, f.line, f.count])).toEqual([["TRAVEL_X", "error", 4, 1]])
    const assumed = v.checkLimits(v.machineModelOf(mill)!, t, undefined, () => 60)
    expect(assumed.every((f) => f.severity === "warning" && f.assumed)).toBe(true)
    // The spindle nose must stay under the top of the Z travel: a long tool at a high Z leaves it.
    const tall = v.checkLimits(entered, timelineOf("G21 G90\nG0 X0 Y0 Z300\nM30").t, undefined, () => 200)
    expect(tall.map((f) => f.code)).toEqual(["TRAVEL_Z"])
  })

  test("a tilt past the rotary range is reported", () => {
    const { a, t } = timelineOf("G21 G90\n(TABLE-AC)\nG0 X0 Y0 Z50 A0 C0\nG1 A130 C10 F500\nM30")
    const r = v.rotaryOfProgram(a.program, "(TABLE-AC)")!
    const model = v.machineModelOf({ ...mill, axes: 5, rotary: r }, { tilt: [-120, 120], travel: { x: 800, y: 800, z: 800 } })!
    expect(v.checkLimits(model, t, r, () => 60).map((f) => [f.code, f.severity])).toEqual([["ROTARY_A", "error"]])
  })
})

describe("singularities and C unwinding", () => {
  const timelineOf = (gcode: string) => { const a = g.analyseGcode(gcode); return { a, t: v.buildTimeline(a.program, a.motion) } }
  test("C spinning at A≈0 is a singularity; a C turn over 180° in one move unwinds the long way", () => {
    const program = "(TABLE-AC)\nG21 G90\nG43.4 H1\nG0 X0 Y0 Z50 A0 C0\nG1 X10 A0.5 C90 F500\nG1 A30 C100\nG1 C350\nG1 A-10 C340\nM30"
    const { a, t } = timelineOf(program)
    const r = v.rotaryOfProgram(a.program, program)!
    const model = v.machineModelOf({ ...mill, axes: 5, rotary: r }, { tilt: [-120, 120], travel: { x: 800, y: 800, z: 800 } })!
    const found = v.checkLimits(model, t, r, () => 60)
    expect(found.map((f) => [f.code, f.line])).toEqual([["SINGULARITY", 5], ["C_UNWIND", 7]])
    // A30 -> A-10 crosses the pole but C barely turns: not reported.
    expect(found.find((f) => f.code === "SINGULARITY")!.count).toBe(1)
  })
})
