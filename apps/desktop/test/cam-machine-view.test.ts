/**
 * Spec 31 in the desktop: which machine the CAM preview shows, and the Three.js machine scene it mounts — vise and table for
 * a mill (the tool turns), chuck, jaws and the turned bar for a lathe (the part turns), bed, nozzle and growing deposits for a
 * printer. No WebGL: the scene is plain Three.js objects.
 */
import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import { cam } from "@cadcamfun/core"
import { createMachineScene, DEFAULT_MACHINE_DISPLAY, machineSpatial } from "../src/viewport/view3d/machine-scene.ts"
import { buildPlayback } from "../src/viewport/view3d/playback.ts"
import { toolObject } from "../src/viewport/view3d/tool-object.ts"
import { previewSetup, resolveMachineKind } from "../src/features/cam/lib/machine-view.ts"

const g = cam.generator
const v = cam.viewer
const settings = (patch: Record<string, unknown> = {}) => g.withMachineDefaults(g.decodeSettings(patch) as cam.generator.ToolpathSettings)
const stock = { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
const parsed = (gcode: string) => g.analyseGcode(gcode)
const scene = (setup: cam.viewer.MachineSetup, gcode: string, display = DEFAULT_MACHINE_DISPLAY, tool?: cam.viewer.ToolEnvelope) => {
  const a = parsed(gcode)
  return createMachineScene({ setup, program: a.program, motion: a.motion, display, scale: 100, ...(tool ? { tool } : {}) })
}
const names = (o: THREE.Object3D): string[] => { const out: string[] = []; o.traverse((c) => { if (c.name) out.push(c.name) }); return out }

describe("which machine the preview shows (spec 31 §4.5)", () => {
  const lathe = cam.inferMachineKind(g.generateLatheGCode(settings({ machineType: "lathe" })))
  test("the pick wins, then the producer, then clear words, then the setting", () => {
    expect(resolveMachineKind({ override: "3dprinter", produced: { kind: "mill", source: "kernel" }, inferred: lathe, setting: "mill" })).toMatchObject({ kind: "3dprinter", source: "override" })
    expect(resolveMachineKind({ produced: { kind: "lathe", source: "generator" }, inferred: lathe, setting: "lathe" })).toEqual({ kind: "lathe", source: "generator" })
    expect(resolveMachineKind({ inferred: lathe, setting: "mill" })).toEqual({ kind: "lathe", source: "inferred" })
    expect(resolveMachineKind({ inferred: { kind: "lathe", confidence: "weak", reasons: [] }, setting: "mill" })).toEqual({ kind: "mill", source: "settings" })
    expect(resolveMachineKind({ setting: "3dprinter" })).toEqual({ kind: "3dprinter", source: "settings" })
  })

  test("a program whose words belong to another machine is flagged, not switched", () => {
    const choice = resolveMachineKind({ produced: { kind: "mill", source: "generator" }, inferred: lathe, setting: "mill" })
    expect(choice.kind).toBe("mill")
    expect(choice.mismatch?.inferred).toBe("lathe")
    expect(choice.mismatch?.reasons.length).toBeGreaterThan(0)
  })

  test("the set-up follows the machine: the kernel's stock and table for its program", () => {
    expect(previewSetup("lathe", settings({ machineType: "lathe" }), stock).kind).toBe("lathe")
    expect(previewSetup("3dprinter", settings(), stock).kind).toBe("3dprinter")
    const mill = previewSetup("mill", settings(), stock, { machineId: "haas-vf2" })
    expect(mill.kind === "mill" && mill.table).toEqual({ length: 762, width: 406 })
    expect(mill.kind === "mill" && mill.assumed).toEqual(["workholding"])
  })
})

describe("playback carries the move it plays (motion track index)", () => {
  test("each segment names its toolpath and expanded move; arcs keep one index for all their pieces", () => {
    const a = parsed("M3 S1000\nG0 X10 Y0\nG3 X10 Y0 I-10 J0 F100\nG1 X20")
    const p = buildPlayback(a.program)
    expect(p.segments[0]).toMatchObject({ path: 0, index: 0 })
    const arc = p.segments.filter((s) => s.index === 1)
    expect(arc.length).toBeGreaterThan(10)
    expect(p.segments[p.segments.length - 1]).toMatchObject({ path: 0, index: 2 })
    // The same clock as the core timeline the machine scene plays.
    expect(v.buildTimeline(a.program, a.motion).duration).toBeCloseTo(p.duration, 9)
  })
})

describe("mill: the part is clamped, the tool turns", () => {
  const setup = v.millSetupOf(settings({ workholdingConfigured: true }), stock)
  test("vise jaws, parallels, base and table; the RGB triad with the spindle arrow", () => {
    const s = scene(setup, "M3 S6000\nG0 X0 Y0 Z5\nG1 Z-2 F100")
    const all = names(s.root)
    for (const n of ["jaw:jaw-fixed", "jaw:jaw-moving", "parallel:parallel-1", "vise-base:vise-base", "table:table (assumed)", "axis:X", "axis:Y", "axis:Z", "rotary:S"]) expect(all).toContain(n)
    expect(all.some((n) => n.startsWith("stock:"))).toBe(false)
    s.dispose()
    expect(s.root.children).toHaveLength(0)
  })

  test("assumed workholding is translucent; hidden when switched off", () => {
    const s = scene(v.millSetupOf(settings(), stock), "M3 S6000\nG1 X1 F100")
    const jaw = s.root.getObjectByName("jaw:jaw-fixed (assumed)") as THREE.Mesh
    expect((jaw.material as THREE.MeshStandardMaterial).opacity).toBeCloseTo(0.45)
    expect(jaw.getObjectByName("edges")).toBeDefined()
    const hidden = scene(setup, "M3 S6000\nG1 X1 F100", { ...DEFAULT_MACHINE_DISPLAY, showWorkholding: false })
    expect(names(hidden.root).some((n) => n.startsWith("jaw:"))).toBe(false)
  })

  test("a cut into the jaws is listed and drawn red", () => {
    const s = scene(setup, "M3 S9000\nG0 X-55 Y-33 Z5\nG1 Z-18 F200\nG1 X55\nG0 Z5", DEFAULT_MACHINE_DISPLAY, { radius: 3, length: 40 })
    expect(s.findings.map((f) => f.code)).toContain("MILL_INTO_VISE")
    expect(s.root.getObjectByName("collisions")).toBeDefined()
  })

  test("the spindle angle turns clockwise from above with M3 and stops with M5", () => {
    const s = scene(setup, "M3 S60\nG1 X60 F60\nM5\nG1 X120")
    expect(s.spinAngle(30)).toBeCloseTo(-30 * 2 * Math.PI, 6)
    expect(s.spinAngle(90)).toBeCloseTo(s.spinAngle(60), 9)
    expect(scene(setup, "M3 S60\nG1 X60 F60", { ...DEFAULT_MACHINE_DISPLAY, spin: false }).spinAngle(30)).toBe(0)
  })
})

describe("lathe: the part turns in the chuck, the tool moves in X and Z", () => {
  const program = "G18 G90\nM3 S60\nG0 X52 Z2\nG0 X44\nG1 Z-40 F60\nG0 X52\nG0 Z2\nM30"
  const setup = v.latheSetupOf(settings({ machineType: "lathe" }))
  test("chuck, jaws and the turned bar turn together, positively about the spindle axis with M3; no Y in the triad", () => {
    const s = scene(setup, program)
    const spindle = s.root.getObjectByName("spindle")!
    for (const n of ["chuck:chuck (assumed)", "jaw:jaw-1 (assumed)", "turned-part", "spindle-marker"]) expect(names(spindle)).toContain(n)
    expect(names(s.root)).not.toContain("axis:Y")
    expect(names(s.root)).toContain("rotary:C")
    s.update(10)
    expect(spindle.rotation.x).toBeGreaterThan(0)
    expect(spindle.rotation.x).toBeCloseTo(s.spinAngle(10), 9)
  })

  test("the tool is at the program point mapped onto the lathe (Z along x, radius up for a rear turret)", () => {
    const s = scene(setup, program)
    const cut = s.timeline.moves.find((m) => m.kind === "feed")!
    s.update(cut.start + cut.duration / 2)
    const tool = s.root.getObjectByName("lathe-tool")!
    // Half-way along G1 Z-40 from Z2.
    expect(tool.position.x).toBeCloseTo(-19, 6)
    expect(tool.position.z).toBeCloseTo(22, 6)
    const front = scene(v.latheSetupOf(settings({ machineType: "lathe", latheTurret: "front" })), program)
    front.update(cut.start + cut.duration / 2)
    const ft = front.root.getObjectByName("lathe-tool")!
    expect(ft.position.z).toBeCloseTo(-22, 6)
    expect(ft.scale.z).toBe(-1)
  })

  test("the turned part shrinks where the tool has passed", () => {
    const s = scene(setup, program)
    const radiusOf = () => { const m = s.root.getObjectByName("turned-part") as THREE.Mesh; m.geometry.computeBoundingBox(); return m.geometry.boundingBox! }
    s.update(0)
    const before = radiusOf().max.y
    s.update(s.timeline.duration)
    const mesh = s.root.getObjectByName("turned-part") as THREE.Mesh
    const pos = mesh.geometry.getAttribute("position")
    // The turned length (Z -40..0) is one band at radius 22; nothing between its ends is left at the bar's 25.
    let turned = false, leftover = false
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), r = Math.hypot(pos.getY(i), pos.getZ(i))
      if (Math.abs(r - 22) < 1e-3 && x > -40.1 && x < 0.1) turned = true
      if (Math.abs(r - 25) < 1e-3 && x > -39.9 && x < -0.1) leftover = true
    }
    expect(before).toBeCloseTo(25, 3)
    expect(turned).toBe(true)
    expect(leftover).toBe(false)
  })

  test("a turn into the jaws is a set-up finding", () => {
    const s = scene(v.latheSetupOf(settings({ machineType: "lathe", workholdingConfigured: true })), "G18 M3 S500\nG0 X52 Z2\nG0 X44\nG1 Z-95 F100\nG0 X52")
    expect(s.findings[0]).toMatchObject({ code: "LATHE_INTO_CHUCK", severity: "error" })
  })
})

describe("printer: nothing turns, the nozzle deposits layer by layer", () => {
  const setup = v.printerSetupOf(settings({ machineType: "3dprinter" }))
  const code = "M104 S200\nG28\nG92 E0\nG0 X10 Y10 Z0.2\nG1 X20 E1 F600\nG1 X20 Y20 E2\nG0 X10 Y10 Z0.4\nG1 X20 E3\nG1 X20 Y20 E4"
  test("bed, build volume and nozzle; no spindle", () => {
    const s = scene(setup, code)
    for (const n of ["bed:bed", "build-volume:build-volume", "nozzle", "deposits", "travel"]) expect(names(s.root)).toContain(n)
    expect(names(s.root)).not.toContain("rotary:S")
    expect(s.spinAngle(5)).toBe(0)
    expect(s.layers).toEqual([0.2, 0.4])
  })

  test("deposits grow with time; the bead under the nozzle is cut there; all / a layer at a time", () => {
    const s = scene(setup, code)
    const beads = s.root.getObjectByName("deposits") as THREE.LineSegments
    const partial = s.root.getObjectByName("deposit-current") as THREE.Line
    s.update(0)
    expect(beads.geometry.drawRange.count).toBe(0)
    const first = s.timeline.moves.find((m) => m.state.extrude > 0)!
    s.update(first.start + first.duration / 2)
    expect(partial.visible).toBe(true)
    expect(beads.geometry.drawRange.count).toBe(0)
    s.update(s.timeline.duration)
    expect(beads.geometry.drawRange.count).toBe(8)
    expect(partial.visible).toBe(false)
    const all = scene(setup, code, { ...DEFAULT_MACHINE_DISPLAY, depositMode: "all", layer: 0 })
    all.update(0)
    expect((all.root.getObjectByName("deposits") as THREE.LineSegments).geometry.drawRange.count).toBe(4)
    const nozzle = s.root.getObjectByName("nozzle")!
    expect(nozzle.position.toArray()).toEqual([20, 20, 0.4])
  })
})

describe("what the assistant reads from a CAM frame", () => {
  test("machine, mapping, axes, tool position in program and display coordinates, findings", () => {
    const setup = v.latheSetupOf(settings({ machineType: "lathe" }))
    const a = parsed("G18 G90\nM3 S800\nG0 X52 Z2\nG1 X40 Z-10 F100")
    const s = createMachineScene({ setup, program: a.program, motion: a.motion, display: DEFAULT_MACHINE_DISPLAY, scale: 100 })
    const spatial = machineSpatial(setup, s, s.timeline.duration)
    expect(spatial).toMatchObject({ machine: "lathe", rotates: "workpiece", tool: { program: { x: 40, z: -10 }, display: { x: -10, z: 20 }, spindle: "cw", rpm: 800, line: 4 } })
    expect(String(spatial["mapping"])).toContain("X/2")
    expect((spatial["axes"] as Array<{ name: string }>).map((x) => x.name)).toEqual(["Z", "X"])
  })
})

describe("one 3D object per tool (spec 31): Resources page, CAM preview and machine scene", () => {
  test("every mill type of the Resources: cutting, shank, holder and its flutes", () => {
    for (const type of cam.TOOL_TYPES.mill.filter((t) => t !== "probe" && t !== "toolsetter")) {
      const model = cam.toolModelOf({ type, diameter: 10, numberOfFlutes: 4 }, "mill")
      const object = toolObject(model)
      const all = names(object)
      expect(all, type).toContain("cutting")
      expect(all, type).toContain("shank")
      expect(all.some((n) => n.startsWith("holder")), type).toBe(true)
      expect(all.filter((n) => n === "flute-marker").length, type).toBe(type === "boringbar" ? 1 : 4)
    }
  })

  test("the probe has a ruby ball; the setter stands with its pad top at the origin", () => {
    const probe = toolObject(cam.toolModelOf({ type: "probe", diameter: 4 }))
    const ball = probe.getObjectByName("cutting") as THREE.Mesh
    expect((ball.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xdc2626)
    const setter = toolObject(cam.toolModelOf({ type: "toolsetter", diameter: 30 }))
    const box = new THREE.Box3().setFromObject(setter)
    expect(box.max.z).toBeCloseTo(0, 6)
  })

  test("lathe inserts in the tool plane (a front turret mirrors them), knurling wheels, nozzles by material", () => {
    for (const type of cam.TOOL_TYPES.lathe) {
      const object = toolObject(cam.toolModelOf({ type, diameter: 3 }, "lathe"))
      expect(names(object), type).toContain("lathe-tool:insert")
      expect(new THREE.Box3().setFromObject(object).isEmpty(), type).toBe(false)
    }
    expect(toolObject(cam.toolModelOf({ type: "turning", diameter: 3 }, "lathe"), { turret: "front" }).scale.z).toBe(-1)
    expect(names(toolObject(cam.toolModelOf({ type: "knurling", diameter: 3 }, "lathe"))).filter((n) => n === "lathe-tool:insert")).toHaveLength(2)
    const ruby = toolObject(cam.toolModelOf({ type: "ruby", diameter: 0.6 }))
    expect(names(ruby)).toContain("nozzle:ruby")
    expect((ruby.getObjectByName("nozzle:hardened") ?? null)).toBeNull()
  })

  test("the machine scene draws the lathe insert and the nozzle of the set-up's tool model", () => {
    const groove = v.latheSetupOf(settings({ machineType: "lathe" }), cam.toolModelOf({ type: "grooving", diameter: 4 }, "lathe") as cam.LatheModel)
    const s = scene(groove, "G18 M3 S500\nG0 X52 Z-20\nG1 X40 F50\nG0 X52")
    expect(s.root.getObjectByName("lathe-tool")).toBeDefined()
    expect(groove.toolWidth).toBe(4)
    const printer = { ...v.printerSetupOf(settings({ machineType: "3dprinter" })), tool: cam.toolModelOf({ type: "hardened", diameter: 0.8 }) as cam.NozzleModel }
    expect(names(scene(printer, "M104 S200\nG1 X10 Y10 Z0.2 E1 F600").root)).toContain("nozzle:hardened")
  })
})

describe("the machine model round a mill (spec 32 P5)", () => {
  const program = "(TABLE-AC)\nG21 G90 G17\nG43.4 H1\nG0 X0 Y0 Z60 A0 C0\nG1 X20 Y0 Z0 A30 C90 F800\nG1 X0 Y20 Z0 A130 C180\nM30"
  const a = cam.generator.analyseGcode(program)
  const stock: cam.generator.Stock = { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
  const setup = cam.viewer.withRotary(cam.viewer.setupOf("mill", settings({ axes: 5 }), stock), a.program, program)

  test("its links are drawn only when asked, and replace the set-up's table", () => {
    const off = createMachineScene({ setup, program: a.program, motion: a.motion, display: DEFAULT_MACHINE_DISPLAY, scale: 100 })
    expect(off.model).toBeUndefined()
    expect(off.root.getObjectByName("machine-model")).toBeUndefined()
    off.dispose()
    const on = createMachineScene({ setup, program: a.program, motion: a.motion, display: { ...DEFAULT_MACHINE_DISPLAY, showMachine: true }, scale: 100, gaugeOf: () => 80 })
    expect(on.model?.preset).toBe("trunnion-ac")
    for (const link of ["base", "column", "head", "spindle", "table", "cradle", "platter"]) expect(on.root.getObjectByName(`machine-link:${link}`), link).toBeDefined()
    expect(on.root.getObjectsByProperty("name", "table:table").length + on.root.getObjectsByProperty("name", "table:table (assumed)").length).toBe(0)
    // A130 is past the assumed ±120 tilt: one warning at its line.
    expect(on.limits.map((f) => [f.code, f.severity, f.line])).toEqual([["ROTARY_A", "warning", 6]])
    on.dispose()
  })

  test("the pose moves the links: the spindle nose `gauge` up the tool axis, the platter with the table", () => {
    const scene = createMachineScene({ setup, program: a.program, motion: a.motion, display: { ...DEFAULT_MACHINE_DISPLAY, showMachine: true }, scale: 100, gaugeOf: () => 80 })
    const rotary = setup.kind === "mill" ? setup.rotary : undefined
    const pose = cam.viewer.machinePose(scene.model!, { x: 20, y: 0, z: 0 }, { a: 30, c: 90 }, rotary, 80, "part")
    expect(scene.placeMachine(pose)).toBe(true)
    expect(scene.placeMachine(pose)).toBe(false)
    const spindle = scene.root.getObjectByName("machine-link:spindle")!
    spindle.updateMatrixWorld(true)
    const nose = new THREE.Vector3(0, 0, 0).applyMatrix4(spindle.matrix)
    expect(nose.x).toBeCloseTo(20 + 80 * pose.axis.x, 6)
    expect(nose.z).toBeCloseTo(80 * pose.axis.z, 6)
    const machine = cam.viewer.machinePose(scene.model!, { x: 20, y: 0, z: 0 }, { a: 30, c: 90 }, rotary, 80, "machine")
    scene.placeMachine(machine)
    const platter = scene.root.getObjectByName("machine-link:platter")!
    const m = machine.part
    expect([...platter.matrix.elements]).toEqual([m[0]!, m[4]!, m[8]!, 0, m[1]!, m[5]!, m[9]!, 0, m[2]!, m[6]!, m[10]!, 0, m[3]!, m[7]!, m[11]!, 1])
    scene.dispose()
  })
})
