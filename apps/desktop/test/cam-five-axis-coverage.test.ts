/**
 * Five-axis coverage of the CAM preview beyond the mill: the rotary printer's machine model, limits and collisions with its
 * tilted bed, a library machine's rotary profile, layers on a tilted bed, the probe overlay on a turning table, a probe cycle on
 * a lathe and what the assistant is told.
 */
import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import { cam } from "@cadcamfun/core"
import { createMachineScene, DEFAULT_MACHINE_DISPLAY, machineSpatial } from "../src/viewport/view3d/machine-scene.ts"
import { createProbeOverlay, probeOverlayModel } from "../src/viewport/view3d/probe-overlay.ts"
import { previewSetup, previewSummary } from "../src/features/cam/lib/machine-view.ts"
import type { ProbeSimOutcome } from "../src/features/cam/lib/probing/contract.ts"

const g = cam.generator
const v = cam.viewer
const settings = (patch: Record<string, unknown> = {}) => g.withMachineDefaults(g.decodeSettings(patch) as cam.generator.ToolpathSettings)
const stock = { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
const printer = settings({ machineType: "3dprinter", bedWidth: 220, bedDepth: 220, bedOrigin: "corner" })
const printerOf = (gcode: string, profile?: cam.viewer.ProfileRotary) => {
  const a = g.analyseGcode(gcode)
  const setup = previewSetup("3dprinter", printer, stock, { program: a.program, gcode, rotaryProfile: profile })
  const timeline = v.buildTimeline(a.program, a.motion, v.DEFAULT_RAPID_RATE, v.programStart("3dprinter", a.program))
  return { a, setup, timeline }
}

describe("a rotary printer's machine, limits and collisions", () => {
  test("its machine model: gantry, carriage, trunnion and cradle on the tilt axis; travels from the bed", () => {
    const { setup } = printerOf("G1 X110 Y110 Z10 E1 F1200\nG1 B30 C10")
    const model = v.machineModelOf(setup)!
    expect(model.preset).toBe("printer-5axis")
    expect(model.layout).toBe("table-BC")
    for (const id of ["frame", "beam", "carriage", "hot-end", "cradle", "trunnion-front", "trunnion-back", "tilt-shaft"]) expect(model.bodies.some((b) => b.id === id), id).toBe(true)
    expect(model.travel).toEqual({ x: [0, 220], y: [0, 220], z: [0, printer.buildHeight] })
    expect(model.rotaryLimits.b).toEqual(v.PRINTER_TILT_ASSUMED)
    expect(model.assumed).toEqual(["travel", "rotary limits"])
    // A planar print has no machine model: nothing turns.
    expect(v.machineModelOf(v.printerSetupOf(printer))).toBeUndefined()
  })

  test("a tilt past the assumed range is a warning; past the machine's stated range an error", () => {
    const gcode = "G1 X110 Y110 Z40 F3000\nG1 B100 F1200\nG1 B0"
    const assumed = printerOf(gcode)
    const warn = v.checkLimits(v.machineModelOf(assumed.setup)!, assumed.timeline, v.setupRotary(assumed.setup), () => 0).find((f) => f.code === "ROTARY_B")
    expect(warn).toMatchObject({ severity: "warning", assumed: true, line: 2 })
    const stated = printerOf("G1 X110 Y110 Z40 F3000\nG1 B60 F1200\nG1 B0", { layout: "table-BC", tilt: { min: -45, max: 45 } })
    const error = v.checkLimits(v.machineModelOf(stated.setup)!, stated.timeline, v.setupRotary(stated.setup), () => 0).find((f) => f.code === "ROTARY_B")
    expect(error).toMatchObject({ severity: "error", assumed: false, range: [-45, 45] })
  })

  test("the nozzle into the bed and the tilted bed into the carriage are collisions", () => {
    const into = printerOf("G28\nG1 X100 Y100 Z5 F3000\nG1 B10 F1200\nG1 X100 Y100 Z-2 E1 F600")
    const events = v.checkCollisions({ setup: into.setup, timeline: into.timeline, reachOf: () => undefined })
    expect(events.map((e) => e.code)).toContain("MACHINE_COLLISION")
    expect(events[0]!.message).toContain("into the tilted bed")
    expect(events[0]!.line).toBe(4)
    // B60 raises the bed's edge 48 mm above the pivot within the carriage's footprint: above the nozzle tip at Z1 + 30 mm.
    const head = printerOf("G28\nG1 X110 Y110 Z60 F3000\nG1 B60 F1200\nG1 X110 Y110 Z1 E0.5 F600")
    const found = v.checkSetup(head.setup, head.timeline).map((f) => f.code)
    expect(found).toContain("PRINTER_HEAD_INTO_BED")
    expect(found).not.toContain("PRINTER_INTO_BED")
    // Upright, the same moves are clear.
    const flat = printerOf("G28\nG1 X110 Y110 Z60 F3000\nG1 B0 F1200\nG1 X110 Y110 Z1 E0.5 F600")
    expect(v.checkCollisions({ setup: flat.setup, timeline: flat.timeline, reachOf: () => undefined })).toEqual([])
  })

  test("the machine is drawn round a rotary print when it is shown, with its limits", () => {
    const { a, setup } = printerOf("G1 X110 Y110 Z40 F3000\nG1 X120 Y110 Z40 E1 F1200\nG1 B100 F1200")
    const scene = createMachineScene({ setup, program: a.program, motion: a.motion, display: { ...DEFAULT_MACHINE_DISPLAY, showMachine: true, frame: "machine" }, scale: 100, gaugeOf: () => 0 })
    expect(scene.model?.preset).toBe("printer-5axis")
    for (const link of ["base", "column", "head", "spindle", "cradle"]) expect(scene.root.getObjectByName(`machine-link:${link}`), link).toBeDefined()
    expect(scene.limits.map((f) => f.code)).toContain("ROTARY_B")
    const spatial = machineSpatial(setup, scene, scene.timeline.duration)
    expect(spatial).toMatchObject({ kinematics: "table-BC", coordinates: "machine", frame: "machine", rotary: { b: 100 } })
    scene.dispose()
  })

  test("layers of a print made on a turning bed are its heights above the bed", () => {
    // The second bead is printed after B90 at machine Z30: 10 mm above the turned bed, the first bead's layer.
    const { a, setup } = printerOf("G28\nG1 X110 Y110 Z10 F3000\nG1 X120 Y110 Z10 E1 F1200\nG1 B90 F1200\nG1 X120 Y110 Z30 E2 F1200")
    const scene = createMachineScene({ setup, program: a.program, motion: a.motion, display: DEFAULT_MACHINE_DISPLAY, scale: 100 })
    expect(scene.layers).toEqual([10])
    const flat = v.printerDeposits(scene.timeline, 0.2)
    expect(flat.layers).toEqual([10, 30])
    scene.dispose()
  })
})

describe("a library machine's rotary table", () => {
  test("layout, calibrated pivot, TCP and ranges replace what the program's words let the preview assume", () => {
    const gcode = "G1 X10 Y10 Z5 B10 C20 F600"
    const a = g.analyseGcode(gcode)
    const profile = { layout: "table-AC" as const, tilt: { min: -30, max: 110 }, rotation: { min: -360, max: 360 }, pivot: { x: 1, y: 2, z: 3 }, calibration: { pivotMeasured: { x: 1.02, y: 2, z: 2.99 } }, tcp: "program" as const }
    const mill = v.setupRotary(previewSetup("mill", settings(), stock, { program: a.program, gcode, rotaryProfile: profile }))!
    expect(mill).toMatchObject({ layout: "table-AC", pivot: { x: 1.02, y: 2, z: 2.99 }, coordinates: "machine", assumed: false, limits: { tilt: [-30, 110], rotation: [-360, 360] } })
    expect(mill.reasons.join("; ")).toContain("rotary calibration")
    const model = v.machineModelOf(previewSetup("mill", settings(), stock, { program: a.program, gcode, rotaryProfile: profile }))!
    expect(model.rotaryLimits).toEqual({ a: [-30, 110], c: [-360, 360] })
    const print = v.setupRotary(previewSetup("3dprinter", printer, stock, { program: a.program, gcode, rotaryProfile: { tcp: "control" } }))!
    expect(print.coordinates).toBe("part")
    // A 3-axis program stays 3-axis whatever the machine can do.
    const flat = g.analyseGcode("G1 X10 Y10 Z5 F600")
    expect(v.setupRotary(previewSetup("mill", settings(), stock, { program: flat.program, gcode: "G1 X10 Y10 Z5 F600", rotaryProfile: profile }))).toBeUndefined()
  })
})

describe("probing on a rotary or a turning machine", () => {
  const outcome: ProbeSimOutcome = {
    contacts: [{ name: "z", tip: { x: 0, y: 0, z: -5 }, moveIndex: 1, line: 4 }, { name: "x", tip: { x: -20, y: 0, z: 10 }, moveIndex: 6, line: 9 }],
    variables: {}, results: {}, offsets: {}, updates: [], tools: [], inspections: [], alarms: [], reports: [], path: []
  }
  test("contacts and deviations are drawn on the part, mapped by the angles at their time", () => {
    const model = probeOverlayModel({ outcome, deviationScale: 1, times: [1, 4], expected: [{ name: "z", expected: { x: 0, y: 0, z: -4.9 }, direction: { x: 0, y: 0, z: -1 } }] })
    const overlay = createProbeOverlay(model, { toPart: (p, time) => ({ ...p, y: p.y + (time ?? 0) }) })
    expect(overlay.part.getObjectByName("probe:contact:0")!.position.y).toBe(1)
    expect(overlay.part.getObjectByName("probe:contact:1")!.position.y).toBe(4)
    const line = overlay.part.getObjectByName("probe:deviation:0") as THREE.Line
    expect((line.geometry.getAttribute("position") as THREE.BufferAttribute).getY(0)).toBe(1)
  })

  test("the table-AC probe cycle: its contact after A45 C90 is turned back onto the part", () => {
    const gcode = "(TABLE-AC)\nG90 G54\nG0 X0 Y0 Z50 A0 C0\nG31 Z-5 F150\nG0 Z50\nG0 A45 C90\nG0 X-40 Y0 Z10\nG31 X-20 F150"
    const a = g.analyseGcode(gcode)
    const setup = previewSetup("mill", settings(), stock, { program: a.program, gcode })
    const rotary = v.setupRotary(setup)!
    const machineFrame = { ...rotary, coordinates: "machine" as const }
    const timeline = v.buildTimeline(a.program, a.motion, v.DEFAULT_RAPID_RATE, v.programStart("mill", a.program))
    const angles = v.poseAt(timeline, timeline.duration).angles
    expect(angles).toMatchObject({ a: 45, c: 90 })
    // What View3D does for a machine-coordinate program: the touch lands where the turned part was.
    const onPart = v.partPointOf({ x: -20, y: 0, z: 10 }, angles, machineFrame)
    expect(Math.hypot(onPart.x, onPart.y, onPart.z)).toBeCloseTo(Math.hypot(20, 10), 6)
    expect(onPart).not.toEqual({ x: -20, y: 0, z: 10 })
  })

  test("a probe cycle on a lathe plays the probe, not the turning insert", () => {
    const a = g.analyseGcode("G18 G21 G90\nT99\nG0 X60 Z2\nG31 X30 F100\nG0 X60")
    const setup = previewSetup("lathe", settings({ machineType: "lathe" }), stock, { program: a.program, gcode: "" })
    const probe = cam.toolModelOf({ type: "probe", diameter: 6 })
    const scene = createMachineScene({ setup, program: a.program, motion: a.motion, display: DEFAULT_MACHINE_DISPLAY, scale: 100, pathTools: [probe] })
    scene.update(scene.timeline.duration)
    const shown = scene.root.children.filter((c) => c.userData.tool !== undefined && c.visible)
    expect(shown.map((c) => c.userData.tool)).toEqual([cam.describeTool(probe)])
    scene.dispose()
  })
})

test("the assistant is told how the preview plays the rotary axes", () => {
  const gcode = "G28\nG1 X110 Y110 Z10 E1 F1200\nG1 B45 C30 F1200\nG1 X120 Y110 Z30 E2"
  const program = g.analyseGcode(gcode).program
  const summary = previewSummary({ gcode, generatorGcode: "", settings: printer, override: "3dprinter", program })!
  expect(summary["multiAxis"]).toMatchObject({ kinematics: "5-axis printer, tilting bed", layout: "table-BC", coordinates: "machine", pivot: { x: 110, y: 110, z: 0 } })
  const planar = previewSummary({ gcode: "G1 X10 Y10 Z0.2 E1", generatorGcode: "", settings: printer, override: "3dprinter", program: g.analyseGcode("G1 X10 Y10 Z0.2 E1").program })!
  expect(planar["multiAxis"]).toBeNull()
})
