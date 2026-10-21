import { describe, expect, test } from "bun:test"
import { cam } from "../../src/index.ts"

const v = cam.viewer
const settings = cam.generator.withMachineDefaults(cam.generator.decodeSettings({ machineType: "lathe" }) as cam.generator.ToolpathSettings)
const lathe = v.latheSetupOf(settings)
const point = { x: 40, y: 5, z: -20 }
const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => { expect(a.x).toBeCloseTo(b.x, 9); expect(a.y).toBeCloseTo(b.y, 9); expect(a.z).toBeCloseTo(b.z, 9) }

describe("mill-turn display uses the existing lathe coordinates", () => {
  test("B0 is axial, B90 radial, with diameter X and real Y travel", () => {
    const axial = v.turnMillDisplayPose(lathe, point, { b: 0, c: 0 }, "machine")
    close(axial.tip, { x: -20, y: 5, z: 20 })
    close(axial.axis, { x: 1, y: 0, z: 0 })
    close(v.turnMillDisplayPose(lathe, point, { b: 90 }, "machine").axis, { x: 0, y: 0, z: 1 })
    close(v.turnMillDisplayPose({ ...lathe, turret: "front" }, point, { b: 90 }, "machine").axis, { x: 0, y: 0, z: -1 })
  })

  test("part frame removes C from the workpiece and applies the inverse to the whole machine and tool", () => {
    const machine = v.turnMillDisplayPose(lathe, point, { b: 90, c: 90 }, "machine")
    const part = v.turnMillDisplayPose(lathe, point, { b: 90, c: 90 }, "part")
    expect(machine.chuckAngle).toBeCloseTo(-Math.PI / 2, 9)
    expect(part.chuckAngle).toBe(0)
    close(part.tip, { x: -20, y: -20, z: 5 })
    close(part.axis, { x: 0, y: -1, z: 0 })
    expect(part.machineAngle).toBeCloseTo(Math.PI / 2, 9)
  })

  test("explicit B0 C0 activates five axes and removing rotary words restores the ordinary lathe", () => {
    const a = cam.generator.analyseGcode("G18\nG0 X40 Z2 B0 C0\nG1 Z-20 F100")
    const setup = v.withTurnMill(lathe, a.program)
    expect(setup.kind === "lathe" && setup.turnMill).toBeDefined()
    const plain = cam.generator.analyseGcode("G18\nG0 X40 Z2\nG1 Z-20 F100")
    const restored = v.withTurnMill(setup, plain.program)
    expect(restored.kind === "lathe" && restored.turnMill).toBeUndefined()
  })

  test("a milling operation does not erase a turned band, and the next turning operation still removes material", () => {
    const path = (id: string, moves: cam.Move[]): cam.Toolpath => ({ id, name: id, toolId: id, spindleRpm: 600, coolant: "off", moves })
    const p: cam.Program = { name: "Mixed", units: "mm", workOffset: "G54", toolpaths: [
      path("T1", [{ _tag: "Rapid", to: { x: 40, y: 0, z: 0 }, rotary: { b: 90, c: 90 } }, { _tag: "Linear", to: { x: 30, y: 0, z: -20 }, rotary: { b: 90, c: 90 }, feed: 600 }]),
      path("T2", [{ _tag: "Rapid", to: { x: 40, y: 0, z: 0 } }, { _tag: "Linear", to: { x: 40, y: 0, z: -20 }, feed: 600 }])
    ] }
    const setup = { ...lathe, noseRadius: 0, turnMill: { b: [-120, 120] as const } }
    const timeline = v.buildTimeline(p)
    const next = timeline.moves.find((m) => m.path === 1)!
    const before = v.turnedProfileAt(setup, timeline, next.start)
    expect(Math.min(...before.outer)).toBe(setup.stock.diameter / 2)
    const after = v.turnedProfileAt(setup, timeline, timeline.duration)
    expect(Math.min(...after.outer)).toBe(20)
    const phases = v.turnMillChuckTrack(timeline, [true, false], true)
    expect(v.turnMillChuckAngleAt(timeline, [true, false], phases, next.start)).toBeCloseTo(-Math.PI / 2, 9)
    expect(v.turnMillChuckAngleAt(timeline, [true, false], phases, next.start + 0.05)).toBeGreaterThan(-Math.PI / 2)
  })

  test("a declared turning insert remains an insert even when imported moves carry modal B/C", () => {
    const a = cam.generator.analyseGcode("(T1 D=10. - flat end mill)\n(T2 D=12. - turning)\nG18\nT1 M6\nG0 X40 B90 C90\nG1 Z-10 F100\nT2 M6\nG1 Z-20 F100")
    const tools = v.turnMillToolModels(a.program, a.motion, "(T1 D=10. - flat end mill)\n(T2 D=12. - turning)")
    expect(tools.get("T1")?.family).toBe("mill")
    expect(tools.get("T2")?.family).toBe("lathe")
  })
})
