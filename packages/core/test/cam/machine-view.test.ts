/**
 * Spec 31: the machine-aware toolpath view's core — interpreter words of lathes and printers, the motion track, the display
 * frames, the bodies, the live turned profile, the printer deposits, the set-up checks and the machine inference.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "../../src/index.ts"
import { interpretGcode, PLANE_ARC_SAGITTA, type GSegment } from "../../src/cam/testing/gcode-interpreter.ts"

/** The segments that move (dwells have no end points). */
const moved = (result: { readonly segments: ReadonlyArray<GSegment> }): Array<Exclude<GSegment, { kind: "dwell" }>> => result.segments.flatMap((s) => (s.kind === "dwell" ? [] : [s]))

const g = cam.generator
const v = cam.viewer
const settings = (patch: Record<string, unknown> = {}) => g.decodeSettings({ ...patch }) as cam.generator.ToolpathSettings
const lathe = (patch: Record<string, unknown> = {}) => g.withMachineDefaults(settings({ machineType: "lathe", ...patch }))
const timelineOf = (gcode: string) => {
  const a = g.analyseGcode(gcode)
  return v.buildTimeline(a.program, a.motion)
}

describe("interpreter: lathe and printer words (spec 31 §4.4)", () => {
  test("G18 arcs are chords on the true circle, sense seen from +Y", () => {
    const ccw = interpretGcode("G18 G90\nG0 X0 Z10\nG3 X10 Z0 K-10 I0 F100", { track: true })
    const cw = interpretGcode("G18 G90\nG0 X0 Z10\nG2 X10 Z0 K-10 I0 F100")
    expect(ccw.errors).toEqual([])
    for (const s of moved(ccw).slice(1)) {
      expect(Math.hypot(s.to.x, s.to.z)).toBeCloseTo(10, 9)
      expect(s.to.y).toBe(0)
      // Each chord stays within the sagitta of the arc.
      const mid = { x: (s.from.x + s.to.x) / 2, z: (s.from.z + s.to.z) / 2 }
      expect(10 - Math.hypot(mid.x, mid.z)).toBeLessThanOrEqual(PLANE_ARC_SAGITTA + 1e-9)
    }
    expect(ccw.end).toEqual({ x: 10, y: 0, z: 0 })
    // G3 is the quarter through X > 0; G2 goes the long way round, through X = -10.
    expect(Math.min(...moved(ccw).map((s) => s.to.x))).toBeGreaterThanOrEqual(-1e-9)
    expect(Math.min(...moved(cw).map((s) => s.to.x))).toBeCloseTo(-10, 2)
    expect(ccw.states!.every((s) => s.plane === 18)).toBe(true)
  })

  test("R arcs in G18 and G19, full circles, missing centre", () => {
    const r = interpretGcode("G18\nG0 X20 Z0\nG2 X20 Z-20 R10 F100")
    expect(r.errors).toEqual([])
    expect(r.end).toEqual({ x: 20, y: 0, z: -20 })
    // Clockwise seen from +Y with Z to the right and X up: from the right end of the half circle down through X10.
    expect(Math.min(...moved(r).map((s) => s.to.x))).toBeCloseTo(10, 2)
    expect(moved(interpretGcode("G18\nG0 X20 Z0\nG3 X20 Z-20 R10 F100")).reduce((m, s) => Math.max(m, s.to.x), 0)).toBeCloseTo(30, 2)
    const yz = interpretGcode("G19\nG0 Y10 Z0\nG3 Y10 Z0 J-10 K0 F100")
    // A full circle of radius 10 at a 0.01 mm sagitta: ceil(2π / (2 acos(1 - 0.001))) = 71 chords, all on the circle.
    expect(moved(yz).length).toBe(1 + 71)
    for (const s of moved(yz).slice(1)) expect(Math.hypot(s.to.y, s.to.z + 0)).toBeCloseTo(10, 6)
    expect(yz.end).toEqual({ x: 0, y: 10, z: 0 })
    expect(interpretGcode("G18\nG2 X10 Z5 F100").errors).toEqual(["line 2: arc without I/K/R"])
  })

  test("G32 threads feed at pitch x rpm; G95 feeds per revolution", () => {
    const t = interpretGcode("G97 S500 M3\nG0 X20 Z2\nG32 Z-20 F1.5", { track: true })
    expect(t.errors).toEqual([])
    expect(moved(t)[1]).toMatchObject({ kind: "linear", feed: 750, to: { x: 20, y: 0, z: -20 } })
    const rev = interpretGcode("G95 G97 S1000 M3\nG1 X10 F0.2")
    expect(moved(rev)[0]!.feed).toBeCloseTo(200, 9)
    // Without a turning spindle there is no rpm to multiply: F is kept as written.
    expect(moved(interpretGcode("G95\nG1 X10 F0.2"))[0]!.feed).toBeCloseTo(0.2, 9)
  })

  test("G96 rpm follows the diameter within the G50 limit; X0 does not divide by zero", () => {
    const states = interpretGcode("G50 S2000\nG96 S200 M3\nG0 X50 Z2\nG1 X10 F100\nG1 X0", { track: true }).states!
    expect(states[0]!.rpm).toBeCloseTo((1000 * 200) / (Math.PI * 50), 6)
    expect(states[1]!.rpm).toBe(2000)
    expect(states[2]!.rpm).toBe(2000)
    expect(interpretGcode("G96 S200 M3\nG0 X1", { track: true }).states![0]!.rpm).toBe(4000)
    // Radius mode (G8): X is a radius, the diameter twice it.
    expect(interpretGcode("G8 G96 S200 M3\nG0 X25 Z1", { track: true }).states![0]!.rpm).toBeCloseTo((1000 * 200) / (Math.PI * 50), 6)
  })

  test("G92 / G50 coordinate setting keeps the tool where it is; G92.1 cancels; G92 E only resets the extruder", () => {
    const r = interpretGcode("G0 X10 Y10\nG92 X0 Y0\nG0 X5 Y0\nG92.1\nG0 X5")
    expect(r.errors).toEqual([])
    expect(moved(r).map((s) => s.to)).toEqual([{ x: 10, y: 10, z: 0 }, { x: 15, y: 10, z: 0 }, { x: 5, y: 10, z: 0 }])
    const l = interpretGcode("G0 X50 Z10\nG50 X0 Z0\nG1 Z-5 F100")
    expect(moved(l)[1]!.to).toEqual({ x: 50, y: 0, z: 5 })
    const e = interpretGcode("G1 X10 E5 F100\nG92 E0\nG1 X20 E1", { track: true })
    expect(moved(e).map((s) => s.to.x)).toEqual([10, 20])
    expect(e.states!.map((s) => s.extrude)).toEqual([5, 1])
  })

  test("extrusion: absolute and relative, retraction, travel, homing", () => {
    const a = interpretGcode("G28\nM82\nG92 E0\nG1 X10 Z0.2 E1 F1200\nG1 X20 E2\nG0 X0 Y10\nG1 E1.5\nG1 E2\nG1 X10 Y10 E3", { track: true })
    expect(a.errors).toEqual([])
    expect(a.states!.map((s) => s.extrude)).toEqual([1, 1, 0, 1])
    expect(a.states!.map((s) => s.retract)).toEqual([false, false, false, true])
    expect(a.states![0]!.home).toBe(true)
    const rel = interpretGcode("M83\nG1 X10 E0.5 F100\nG1 X20 E0.5", { track: true })
    expect(rel.states!.map((s) => s.extrude)).toEqual([0.5, 0.5])
    // G91 makes E relative too (Marlin), M82 after it makes it absolute again.
    expect(interpretGcode("G91\nG1 X10 E1 F100\nG1 X10 E1", { track: true }).states!.map((s) => s.extrude)).toEqual([1, 1])
    // An arc's filament is spread over its chords by length.
    const arc = interpretGcode("G18\nG0 X0 Z10\nG3 X10 Z0 K-10 I0 E3 F100", { track: true })
    expect(arc.states!.slice(1).reduce((sum, s) => sum + s.extrude, 0)).toBeCloseTo(3, 9)
  })

  test("spindle, coolant, tool and plane states; S of a temperature is not a speed", () => {
    const s = interpretGcode("T1 M6\nM3 S9000\nM8\nG1 X1 F100\nM5\nG1 X2\nM4 S300\nG1 X3\nM104 S210\nG1 X4", { track: true }).states!
    expect(s.map((x) => x.spindle)).toEqual(["cw", "off", "ccw", "ccw"])
    expect(s.map((x) => x.rpm)).toEqual([9000, 0, 300, 300])
    expect(s[0]).toMatchObject({ coolant: "flood", tool: 1, plane: 17, xMode: "diameter", feedMode: "min", line: 4 })
  })
})

describe("analysis and motion track", () => {
  test("generated lathe and printer programs replay without unsupported words; the track aligns with the program", () => {
    for (const op of ["turning", "facing", "threading", "boring", "grooving", "parting"] as const) {
      const a = g.analyseGcode(g.generateLatheGCode(lathe({ operationType: op })))
      expect(a.warnings.filter((w) => /G18|G32|G96|G97/.test(w))).toEqual([])
      expect(v.trackFits(a.motion, a.program)).toBe(true)
      expect(a.motion.paths[0]!.runs.some((r) => r.plane === 18 && r.spindle === "cw")).toBe(true)
    }
    const p = g.withMachineDefaults(settings({ machineType: "3dprinter" }))
    const code = g.generate3DPrinterGCodeForElement({ id: "c", type: "cube", x: 0, y: 0, z: 5, width: 20, height: 20, depth: 10 }, g.printerSettingsOf(p, g.DEFAULT_PRINTER_EXTRAS))
    const a = g.analyseGcode(code)
    expect(a.warnings).toEqual([])
    const extrude = a.motion.paths[0]!.extrude!
    expect(extrude.filter((e) => e > 0).length).toBe(400)
    expect(extrude.filter((e) => e === 0).length).toBeGreaterThan(50)
  })

  test("a stale track is not used: the program's own spindle stands in", () => {
    const a = g.analyseGcode("M3 S1000\nG1 X10 F100\nG1 X20")
    const other = cam.makeProgram("p", [{ id: "a", name: "a", toolId: "t", spindleRpm: 0, coolant: "off", moves: [{ _tag: "Linear", to: { x: 1, y: 0, z: 0 }, feed: 100 }] }])
    expect(v.trackFits(a.motion, other)).toBe(false)
    expect(v.stateAt(v.trackFor(other, a.motion), 0, 0).spindle).toBe("off")
    expect(v.stateAt(v.trackFor(a.program, a.motion), 0, 1)).toMatchObject({ spindle: "cw", rpm: 1000, line: 3 })
    expect(v.stateAt(a.motion, 0, 99).spindle).toBe("off")
  })

  test("programs from the kernel or the assistant: per toolpath spindle, cycles expanded", () => {
    const program = cam.makeProgram("p", [
      { id: "a", name: "a", toolId: "t1", spindleRpm: 8000, coolant: "flood", moves: [{ _tag: "Rapid", to: { x: 0, y: 0, z: 5 } }, { _tag: "Cycle", cycle: "drill", to: { x: 5, y: 5, z: -3 }, feed: 100, peckDepth: 0, dwellSeconds: 0, retractHeight: 2 }] },
      { id: "b", name: "b", toolId: "t2", spindleRpm: 0, coolant: "off", moves: [{ _tag: "Linear", to: { x: 1, y: 0, z: 0 }, feed: 100 }] }
    ])
    const track = v.motionTrackFromProgram(program)
    expect(v.trackFits(track, program)).toBe(true)
    expect(track.paths[0]!.count).toBe(cam.expandMoves(program.toolpaths[0]!.moves, { x: 0, y: 0, z: 0 }).length)
    expect(v.stateAt(track, 0, 1)).toMatchObject({ spindle: "cw", rpm: 8000, coolant: "flood" })
    expect(v.stateAt(track, 1, 0).spindle).toBe("off")
  })
})

describe("machine inference (spec 31 §4.5)", () => {
  test("each generator's output is recognised", () => {
    expect(cam.inferMachineKind(g.generateLatheGCode(lathe()))).toMatchObject({ kind: "lathe", confidence: "strong" })
    const p = g.withMachineDefaults(settings({ machineType: "3dprinter" }))
    expect(cam.inferMachineKind(g.generate3DPrinterGCodeForElement({ id: "c", type: "cube", x: 0, y: 0, z: 5, width: 20, height: 20, depth: 10 }, g.printerSettingsOf(p, g.DEFAULT_PRINTER_EXTRAS)))).toMatchObject({ kind: "3dprinter", confidence: "strong" })
    expect(cam.inferMachineKind("G90 G17 G21\nT1 M6\nG43 H1\nM3 S9000\nG0 X0 Y0 Z5\nG1 Z-1 F100\nG1 X10 Y10")).toMatchObject({ kind: "mill", confidence: "strong" })
  })

  test("conflicting words are weak and say why; a mill side arc in G18 stays a mill; no motion is undefined", () => {
    const mixed = cam.inferMachineKind("G18\nM104 S200\nG1 X10 Z1 E1 F100")!
    expect(mixed.confidence).toBe("weak")
    expect(mixed.reasons.some((r) => r.startsWith("also words of a"))).toBe(true)
    expect(cam.inferMachineKind("G17\nG0 X0 Y0 Z5\nG18\nG2 X10 Z0 R5 F100\nG17\nG1 Y20")!.kind).toBe("mill")
    expect(cam.inferMachineKind("M3 S100\nM5")).toBeUndefined()
    expect(cam.inferMachineKind("G1 X10 F100")).toMatchObject({ kind: "mill", confidence: "weak" })
  })
})

describe("display frames and rotation (spec 31 §4.2, §5.7)", () => {
  const rear = v.latheSetupOf(lathe())
  const front = v.latheSetupOf(lathe({ latheTurret: "front" }))
  test("lathe: Z along display x, the radius up for a rear turret and down for a front one", () => {
    expect(v.displayPoint(rear, { x: 50, y: 0, z: -10 })).toEqual({ x: -10, y: 0, z: 25 })
    expect(v.displayPoint(front, { x: 50, y: 0, z: -10 })).toEqual({ x: -10, y: 0, z: -25 })
    expect(v.displayPoint(rear, { x: 25, y: 0, z: -10 }, "radius")).toEqual({ x: -10, y: 0, z: 25 })
    // The facing overshoot past the axis is drawn past it, not refused.
    expect(v.displayPoint(rear, { x: -1, y: 0, z: 0 }).z).toBe(-0.5)
    for (const p of [{ x: 37.5, y: 0, z: -12.25 }, { x: 0, y: 0, z: 3 }]) {
      expect(v.programPoint(rear, v.displayPoint(rear, p))).toEqual(p)
      expect(v.programPoint(front, v.displayPoint(front, p, "radius"), "radius")).toEqual(p)
    }
  })

  test("mill and printer draw the program as written", () => {
    const mill = v.millSetupOf(settings(), { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 })
    for (let i = 0; i < 200; i++) {
      const p = { x: Math.sin(i) * 300, y: Math.cos(i * 1.3) * 200, z: Math.sin(i * 0.7) * 50 }
      expect(v.displayPoint(mill, p)).toBe(p)
    }
    expect(v.displayPoint(v.printerSetupOf(settings({ machineType: "3dprinter" })), { x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 3 })
  })

  test("triads: RGB colours, no Y on a lathe, what turns", () => {
    const l = v.displayAxes(rear)
    expect(l.axes.map((a) => a.name)).toEqual(["Z", "X"])
    expect(l.axes[1]!.label).toBe("X Ø")
    expect(l.rotary).toMatchObject({ name: "C", turns: "workpiece" })
    const m = v.displayAxes(v.millSetupOf(settings(), { width: 10, height: 10, depth: 10, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }))
    expect(m.axes.map((a) => [a.name, a.color])).toEqual([["X", 0xef4444], ["Y", 0x22c55e], ["Z", 0x3b82f6]])
    expect(m.rotary).toMatchObject({ name: "S", turns: "tool" })
    expect(v.displayAxes(v.printerSetupOf(settings())).rotary).toBeUndefined()
  })

  test("ISO 6983 senses: M3 is negative about +Z on a mill, positive about the spindle axis on a lathe", () => {
    expect(v.spinSense("mill", "cw")).toBe(-1)
    expect(v.spinSense("mill", "ccw")).toBe(1)
    expect(v.spinSense("lathe", "cw")).toBe(1)
    expect(v.spinSense("lathe", "ccw")).toBe(-1)
    expect(v.spinSense("lathe", "off")).toBe(0)
    expect(v.spinSense("3dprinter", "cw")).toBe(0)
    expect(v.displaySpinRate(12000)).toBe(v.MAX_DISPLAY_REV_PER_SECOND)
    expect(v.displaySpinRate(60)).toBe(1)
  })

  test("the spin angle is a pure function of time and stops with the spindle", () => {
    const tl = timelineOf("M3 S60\nG1 X60 F60\nM5\nG1 X120\nM4 S60\nG1 X180")
    const table = v.spinTable(tl, "mill")
    const at = (t: number) => v.spinAngleAt(tl, "mill", table, t)
    // 1 rev/s for 60 s clockwise (negative), still for 60 s, then back the other way.
    expect(at(60)).toBeCloseTo(-60 * 2 * Math.PI, 6)
    expect(at(90)).toBeCloseTo(at(60), 9)
    expect(at(180)).toBeCloseTo(0, 6)
    expect(at(30)).toBeCloseTo(at(30), 12)
    expect(at(-5)).toBe(0)
  })
})

describe("bodies and validation (spec 31 §4.3)", () => {
  const stock = { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
  test("a vise along X grips the bottom of the stock across Y; assumed until configured", () => {
    const setup = v.millSetupOf(settings(), stock)
    const bodies = v.machineBodies(setup)
    const fixed = bodies.find((b) => b.id === "jaw-fixed")!, moving = bodies.find((b) => b.id === "jaw-moving")!
    expect(fixed.shape).toMatchObject({ type: "box", min: { y: 30 }, max: { y: 50, z: -20 + 20 / 3 } })
    expect(moving.shape).toMatchObject({ type: "box", min: { y: -50 }, max: { y: -30 } })
    expect(fixed.assumed).toBe(true)
    expect(v.fixtureBoxes(setup)).toEqual([])
    const configured = v.millSetupOf(settings({ workholdingConfigured: true, clampDepth: 5 }), stock)
    expect(v.fixtureBoxes(configured).map((f) => f.id)).toEqual(["jaw-fixed", "jaw-moving", "parallel-1", "parallel-2", "vise-base"])
    expect(v.fixtureBoxes(configured)[0]!.bounds.maxZ).toBe(-15)
  })

  test("jaws along Y, clamps, plate and none", () => {
    const y = v.machineBodies(v.millSetupOf(settings({ viseJawAxis: "y" }), stock))
    expect(y.find((b) => b.id === "jaw-fixed")!.shape).toMatchObject({ min: { x: 50 }, max: { x: 70 } })
    expect(v.machineBodies(v.millSetupOf(settings({ workholding: "clamps" }), stock)).filter((b) => b.role === "clamp")).toHaveLength(2)
    expect(v.machineBodies(v.millSetupOf(settings({ workholding: "plate" }), stock)).map((b) => b.role)).toEqual(["stock", "table"])
    expect(v.machineBodies(v.millSetupOf(settings({ workholding: "none" }), stock)).map((b) => b.role)).toEqual(["stock"])
  })

  test("validation: jaws over the stock, stock wider than the vise, grip too long, stickout, bore", () => {
    expect(v.validateMachineSetup(v.millSetupOf(settings({ clampDepth: 25 }), stock)).map((p) => p.code)).toContain("VISE_ABOVE_STOCK")
    expect(v.validateMachineSetup(v.millSetupOf(settings(), { ...stock, height: 200 })).map((p) => p.code)).toContain("STOCK_WIDER_THAN_VISE")
    expect(v.validateMachineSetup(v.millSetupOf(settings(), stock))).toEqual([])
    expect(v.validateMachineSetup(v.latheSetupOf(lathe({ gripLength: 100 }))).map((p) => p.code)).toContain("GRIP_TOO_LONG")
    expect(v.validateMachineSetup(v.latheSetupOf(lathe({ stockDiameter: 10, stockLength: 100 }))).map((p) => p.code)).toContain("LATHE_STICKOUT")
    expect(v.validateMachineSetup(v.latheSetupOf(lathe({ stockDiameter: 10, stockLength: 100, tailstock: true }))).map((p) => p.code)).not.toContain("LATHE_STICKOUT")
    expect(v.clampDepthOf(0, 3)).toBe(1.5)
    expect(v.clampDepthOf(0, 60)).toBe(10)
    expect(v.clampDepthOf(7, 60)).toBe(7)
  })

  test("lathe: bar, chuck and jaws turn together; face and chuck zeros place the bar", () => {
    const face = v.machineBodies(v.latheSetupOf(lathe()))
    expect(face.find((b) => b.id === "stock")!.shape).toMatchObject({ type: "cylinder-x", x0: -100, x1: 0, radius: 25 })
    expect(face.filter((b) => b.role === "jaw")).toHaveLength(3)
    expect(face.filter((b) => b.spins).map((b) => b.role)).toEqual(["stock", "chuck", "jaw", "jaw", "jaw"])
    const chuck = v.machineBodies(v.latheSetupOf(lathe({ latheZero: "chuck", chuckType: "4-jaw", tailstock: true })))
    expect(chuck.find((b) => b.id === "stock")!.shape).toMatchObject({ x0: 0, x1: 100 })
    expect(chuck.filter((b) => b.role === "jaw")).toHaveLength(4)
    expect(chuck.some((b) => b.role === "tailstock" && !b.spins)).toBe(true)
    expect(v.machineBodies(v.latheSetupOf(lathe({ chuckType: "collet" }))).some((b) => b.role === "collet")).toBe(true)
  })

  test("printer bed from its origin", () => {
    const corner = v.machineBodies(v.printerSetupOf(settings()))
    expect(corner[0]!.shape).toMatchObject({ min: { x: 0, y: 0 }, max: { x: 220, y: 220, z: 0 } })
    const center = v.machineBodies(v.printerSetupOf(settings({ bedOrigin: "center" })))
    expect(center[0]!.shape).toMatchObject({ min: { x: -110, y: -110 } })
  })
})

describe("the generator's stock is drawn where its program is (spec 31 D7)", () => {
  const element = { id: "r", type: "rectangle", x: 50, y: 20, z: 0, width: 40, height: 30, depth: 5 }
  const stock = { width: 60, height: 50, depth: 10, radius: 0, x: 50, y: 20, topZ: 0, allowance: 0 }
  for (const originType of ["workpiece-center", "workpiece-corner", "custom"] as const) {
    test(originType, () => {
      const s = settings({ operationType: "contour", originType, originX: 5, originY: -3, offset: "outside", toolDiameter: 4 })
      const response = g.generateToolpath({ settings: s, geometry: { ...g.DEFAULT_GEOMETRY, geometryType: "selected", selectedElements: [element], stock }, printer: g.DEFAULT_PRINTER_EXTRAS, evidence: false } as never).response
      // The cutting moves (the replay's bounds also hold the assumed start point at the origin).
      const cuts = response.program.toolpaths.flatMap((tp) => tp.moves).flatMap((m) => (m._tag === "Linear" && m.to.z < 0 ? [m.to] : []))
      const b = { min: { x: Math.min(...cuts.map((p) => p.x)), y: Math.min(...cuts.map((p) => p.y)) }, max: { x: Math.max(...cuts.map((p) => p.x)), y: Math.max(...cuts.map((p) => p.y)) } }
      const box = v.millSetupOf(s, stock).stock
      // The contour (element + tool radius) lies inside the stock box in the program's own coordinates.
      expect(b.min.x).toBeGreaterThanOrEqual(box.min.x - 1e-9)
      expect(b.max.x).toBeLessThanOrEqual(box.max.x + 1e-9)
      expect(b.min.y).toBeGreaterThanOrEqual(box.min.y - 1e-9)
      expect(b.max.y).toBeLessThanOrEqual(box.max.y + 1e-9)
      expect((b.min.x + b.max.x) / 2).toBeCloseTo((box.min.x + box.max.x) / 2, 6)
    })
  }
})

describe("live turned part (spec 31 §5.3)", () => {
  const setup = v.latheSetupOf(lathe())
  const radiusAt = (p: cam.viewer.TurnedProfile, x: number) => p.outer[Math.floor((x - p.x0) / p.bin)]!
  test("a turning pass leaves its radius where it went and the bar elsewhere; half-way, half of it", () => {
    const tl = timelineOf("G18 M3 S800\nG0 X52 Z2\nG0 X48\nG1 Z-50 F200\nG0 X52\nM30")
    const end = v.turnedProfileAt(setup, tl, tl.duration)
    expect(radiusAt(end, -25)).toBe(24)
    expect(radiusAt(end, -75)).toBe(25)
    const cut = tl.moves.find((m) => m.kind === "feed")!
    const half = v.turnedProfileAt(setup, tl, cut.start + cut.duration / 2)
    expect(radiusAt(half, -10)).toBe(24)
    expect(radiusAt(half, -40)).toBe(25)
    expect(v.turnedProfileAt(setup, tl, 0).outer.every((r) => r === 25)).toBe(true)
  })

  test("facing past the axis cuts the end off; parting drops the rest", () => {
    const tl = timelineOf("M3 S800\nG0 X52 Z-2\nG1 X-1 F100\nG0 X52")
    const p = v.turnedProfileAt(setup, tl, tl.duration)
    expect(radiusAt(p, -3)).toBe(25)
    expect(radiusAt(p, -1)).toBe(0)
    const runs = v.profileRuns(p)
    expect(runs[runs.length - 1]!.x1).toBeCloseTo(-2, 1)
  })

  test("a boring bar opens the bore; a stopped spindle removes nothing; a grooving blade cuts its width", () => {
    const bored = v.latheSetupOf(lathe({ stockBore: 10, toolType: "boring", operationType: "boring" }))
    const tl = timelineOf("M3 S500\nG0 X10 Z2\nG1 X16 F100\nG1 Z-30")
    const p = v.turnedProfileAt(bored, tl, tl.duration)
    expect(p.inner[Math.floor((-15 - p.x0) / p.bin)]).toBe(8)
    expect(p.inner[Math.floor((-40 - p.x0) / p.bin)]).toBe(5)
    const off = timelineOf("G0 X52 Z2\nG0 X48\nG1 Z-50 F200")
    expect(v.turnedProfileAt(setup, off, off.duration).outer.every((r) => r === 25)).toBe(true)
    const groove = v.latheSetupOf(lathe({ toolType: "grooving", operationType: "grooving", toolDiameter: 3 }))
    const gt = timelineOf("M3 S500\nG0 X52 Z-20\nG1 X40 F50\nG0 X52")
    const gp = v.turnedProfileAt(groove, gt, gt.duration)
    expect(radiusAt(gp, -20.5)).toBe(20)
    expect(radiusAt(gp, -21.4)).toBe(20)
    expect(radiusAt(gp, -22)).toBe(25)
  })
})

describe("printer deposits (spec 31 §5.4)", () => {
  const p = g.withMachineDefaults(settings({ machineType: "3dprinter" }))
  const code = g.generate3DPrinterGCodeForElement({ id: "c", type: "cube", x: 0, y: 0, z: 5, width: 20, height: 20, depth: 10 }, g.printerSettingsOf(p, g.DEFAULT_PRINTER_EXTRAS))
  const tl = timelineOf(code)
  const d = v.printerDeposits(tl)
  test("50 layers of 0.2 mm, beads only where filament is pushed", () => {
    expect(d.layers).toHaveLength(50)
    expect(d.layers[0]).toBeCloseTo(0.2, 6)
    expect(d.layers[49]).toBeCloseTo(10, 6)
    expect(d.beads.every((b) => tl.moves[b.move]!.state.extrude > 0)).toBe(true)
    expect(d.travels.length).toBeGreaterThan(0)
  })

  test("deposited grows with time, cut at the nozzle, and stops at a chosen layer", () => {
    expect(v.depositedAt(d, tl, 0)).toEqual([])
    expect(v.depositedAt(d, tl, tl.duration)).toHaveLength(d.beads.length)
    const first = d.beads[0]!
    const mid = v.depositedAt(d, tl, (first.start + first.end) / 2)
    expect(mid).toHaveLength(1)
    expect(mid[0]!.to.x).toBeCloseTo((first.from.x + first.to.x) / 2, 6)
    expect(v.depositedAt(d, tl, tl.duration, 0).every((b) => b.layer === 0)).toBe(true)
  })

  test("a spiral (vase) is quantised to layers", () => {
    let text = "M104 S200\nG92 E0\n"
    for (let i = 1; i <= 6000; i++) text += `G1 X${(50 + 10 * Math.cos(i / 10)).toFixed(3)} Y${(50 + 10 * Math.sin(i / 10)).toFixed(3)} Z${(i * 0.002).toFixed(4)} E${(i * 0.05).toFixed(3)} F1200\n`
    const vase = v.printerDeposits(timelineOf(text), 0.2)
    expect(vase.layers.length).toBeLessThanOrEqual(61)
    expect(vase.layers.length).toBeGreaterThanOrEqual(59)
  })
})

describe("set-up checks (spec 31 §6)", () => {
  const stock = { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
  test("a full-depth outside contour runs into the vise jaws; a pocket does not", () => {
    const setup = v.millSetupOf(settings({ workholdingConfigured: true }), stock)
    const outside = timelineOf("M3 S9000\nG0 X-55 Y-33 Z5\nG1 Z-18 F200\nG1 X55\nG1 Y33\nG0 Z5")
    const findings = v.checkSetup(setup, outside, { radius: 3, length: 40 })
    expect(findings.map((f) => f.code)).toContain("MILL_INTO_VISE")
    expect(findings.find((f) => f.code === "MILL_INTO_VISE")).toMatchObject({ severity: "error", assumed: false, line: 3 })
    const pocket = timelineOf("M3 S9000\nG0 X-20 Y-10 Z5\nG1 Z-10 F200\nG1 X20\nG1 Y10\nG1 X-20\nG0 Z5")
    expect(v.checkSetup(setup, pocket, { radius: 3, length: 40 })).toEqual([])
    // Above the jaws the outside contour is fine.
    expect(v.checkSetup(setup, timelineOf("M3 S9000\nG0 X-55 Y-33 Z5\nG1 Z-5 F200\nG1 X55\nG0 Z5"), { radius: 3, length: 40 })).toEqual([])
    // An assumed vise warns instead of failing.
    expect(v.checkSetup(v.millSetupOf(settings(), stock), outside, { radius: 3, length: 40 }).every((f) => f.severity === "warning" && f.assumed)).toBe(true)
    expect(v.collidingMoves(setup, outside, { radius: 3, length: 40 }).size).toBeGreaterThan(0)
  })

  test("a through cut over a parallel and below the table", () => {
    const setup = v.millSetupOf(settings({ workholdingConfigured: true }), stock)
    const codes = v.checkSetup(setup, timelineOf("M3 S9000\nG0 X0 Y-26 Z5\nG1 Z-22 F100\nG0 Z5\nG0 X0 Y0\nG1 Z-200 F100"), { radius: 2, length: 40 }).map((f) => f.code)
    expect(codes).toContain("MILL_INTO_PARALLEL")
    expect(codes).toContain("MILL_INTO_TABLE")
  })

  test("lathe: turning into the chuck jaws, the tailstock; within the stickout is clean", () => {
    const setup = v.latheSetupOf(lathe({ workholdingConfigured: true, tailstock: true }))
    const deep = v.checkSetup(setup, timelineOf("G18 M3 S800\nG0 X52 Z2\nG0 X48\nG1 Z-95 F200\nG0 X52"))
    expect(deep[0]).toMatchObject({ code: "LATHE_INTO_CHUCK", severity: "error" })
    expect(v.checkSetup(setup, timelineOf("G18 M3 S800\nG0 X52 Z2\nG0 X48\nG1 Z-70 F200\nG0 X52\nG0 Z2"))).toEqual([])
    expect(v.checkSetup(setup, timelineOf("G18 M3 S800\nG0 X52 Z60\nG0 X10\nG1 Z45 F100")).map((f) => f.code)).toContain("LATHE_INTO_TAILSTOCK")
  })

  test("printer: off the bed, above the volume, first layer too high", () => {
    const corner = v.printerSetupOf(settings({ bedWidth: 100, bedDepth: 100, buildHeight: 5 }))
    const codes = v.checkSetup(corner, timelineOf("M104 S200\nG0 X10 Y10 Z1\nG1 X120 E1 F1000\nG1 Z6 E2")).map((f) => f.code)
    expect(codes).toEqual(["PRINTER_FIRST_LAYER_HIGH", "PRINTER_OFF_BED", "PRINTER_ABOVE_VOLUME"])
    const center = v.printerSetupOf(settings({ bedOrigin: "center" }))
    expect(v.checkSetup(center, timelineOf("G0 X110 Y110 Z0.2\nG1 X120 E1 F1000")).map((f) => f.code)).toEqual(["PRINTER_OFF_BED"])
    expect(v.checkSetup(v.printerSetupOf(settings()), timelineOf("G0 X110 Y110 Z0.2\nG1 X120 E1 F1000"))).toEqual([])
  })
})

describe("lathe tools", () => {
  test("each tool type has an insert at the programmed point and a shank away from the axis", () => {
    for (const type of ["turning", "facing", "threading", "grooving", "parting", "boring"]) {
      const outlines = v.latheToolOutlines(type, 3)
      const insert = outlines.find((o) => o.part === "insert")!
      expect(insert.points.some((p) => Math.abs(p.x) < 2 && Math.abs(p.z) < 1e-9)).toBe(true)
      expect(outlines.some((o) => o.part === "shank")).toBe(true)
    }
    expect(v.latheToolOutlines("turning", 0).find((o) => o.part === "shank")!.points.every((p) => p.z > 0)).toBe(true)
  })
})
