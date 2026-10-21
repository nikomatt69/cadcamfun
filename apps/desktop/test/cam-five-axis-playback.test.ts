import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { buildPlayback, playbackSegments, positionAt, TOOL_COLORS, toolColors } from "../src/viewport/view3d/playback.ts"
import * as THREE from "three"
import { createMachineScene, DEFAULT_MACHINE_DISPLAY } from "../src/viewport/view3d/machine-scene.ts"
import { pathBuffers } from "../src/viewport/view3d/toolpath-colors.ts"

const v = cam.viewer
const program = (moves: cam.Move[]): cam.Program => ({ name: "Five axes", units: "mm", workOffset: "G54", toolpaths: [{ id: "op", name: "op", toolId: "tool", spindleRpm: 1000, coolant: "off", moves }] })
const origin = { x: 0, y: 0, z: 0 }

describe("five-axis playback shares the timeline clock", () => {
  test("stationary B/C moves take time and interpolate both axes, including complete C turns", () => {
    const p = program([{ _tag: "Rapid", to: origin, rotary: { b: 90, c: 360 } }])
    const timeline = v.buildTimeline(p), packed = buildPlayback(p)
    expect(timeline.duration).toBe(6)
    expect(packed.duration).toBe(timeline.duration)
    expect(v.poseAt(timeline, 3).angles).toMatchObject({ b: 45, c: 180 })
    expect(positionAt(packed, 3)).toEqual(origin)
    expect(v.poseAt(timeline, 6).angles.c).toBe(360)
  })

  test("indexed orientation is replayed at the safe position before the next cut", () => {
    const p = program([
      { _tag: "Rapid", to: { x: 0, y: 0, z: 10 } },
      { _tag: "Orient", b: 90, c: 180 },
      { _tag: "Linear", to: { x: 0, y: 0, z: -10 }, feed: 600 }
    ])
    const timeline = v.buildTimeline(p), packed = buildPlayback(p)
    expect(timeline.moves).toHaveLength(3)
    const index = timeline.moves[1]!
    expect(index.duration).toBe(3)
    expect(v.poseAt(timeline, index.start + 1.5)).toMatchObject({ point: { z: 10 }, angles: { b: 45, c: 90 } })
    expect(packed.duration).toBeCloseTo(timeline.duration, 9)
    expect([...playbackSegments(packed)].some((m) => m.index === 1)).toBe(true)
  })

  test("simultaneous motion waits for the slower linear or rotary axis; partial words remain modal", () => {
    const p = program([
      { _tag: "Linear", to: { x: 1, y: 0, z: 0 }, rotary: { b: 60, c: 180 }, feed: 600 },
      { _tag: "Linear", to: { x: 11, y: 0, z: 0 }, rotary: { c: 360 }, feed: 60 },
      { _tag: "Dwell", seconds: 2 }
    ])
    const timeline = v.buildTimeline(p)
    expect(timeline.moves.map((m) => m.duration)).toEqual([3, 10, 2])
    expect(buildPlayback(p).duration).toBe(15)
    expect(v.poseAt(timeline, 8).angles).toMatchObject({ b: 60, c: 270 })
    expect(v.poseAt(timeline, 14).angles).toMatchObject({ b: 60, c: 360 })
  })

  test("three-axis timing and dwells retain their exact duration", () => {
    const p = program([{ _tag: "Linear", to: { x: 10, y: 0, z: 0 }, feed: 60 }, { _tag: "Dwell", seconds: 2 }])
    expect(v.buildTimeline(p).duration).toBe(12)
    expect(buildPlayback(p).duration).toBe(12)
  })
})

describe("five-axis scene and trajectory", () => {
  const settings = cam.generator.withMachineDefaults(cam.generator.decodeSettings({ machineType: "lathe", stockDiameter: 50, stockLength: 100, noseRadius: 0 }) as cam.generator.ToolpathSettings)
  const lathe = v.latheSetupOf(settings)
  const code = "G18 G90\nM3 S600\nG0 X40 Y6 Z-10 B0 C0\nG1 B90 C90 F90"
  const analysis = cam.generator.analyseGcode(code)
  const setup = v.withTurnMill(lathe, analysis.program)

  test("the actual cutter and its housing tilt radially while C positions the chuck without free spin", () => {
    const scene = createMachineScene({ setup, program: analysis.program, motion: analysis.motion, scale: 100, display: { ...DEFAULT_MACHINE_DISPLAY, showMachine: true, frame: "machine" } })
    try {
      scene.update(scene.timeline.duration)
      const cutter = scene.root.getObjectByName("tool:flat")!
      expect(cutter.visible).toBe(true)
      expect(cutter.position.toArray()).toEqual([-10, 6, 20])
      const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(cutter.quaternion)
      expect(axis.x).toBeCloseTo(0, 9); expect(axis.z).toBeCloseTo(1, 9)
      const head = scene.root.getObjectByName("turn-mill-b-head")!
      expect(head.visible).toBe(true)
      expect(head.position.z).toBeGreaterThan(cutter.position.z)
      expect(scene.root.getObjectByName("spindle")!.rotation.x).toBeCloseTo(-Math.PI / 2, 9)
      expect(scene.root.getObjectByName("axis-rotation:B")).toBeDefined()
      expect(scene.root.getObjectByName("axis-rotation:C")).toBeDefined()
      expect(scene.root.getObjectByName("machine-model:lathe-bed")).toBeDefined()
      scene.update(0); scene.update(scene.timeline.duration)
      expect(scene.root.getObjectByName("spindle")!.rotation.x).toBeCloseTo(-Math.PI / 2, 9)
    } finally { scene.dispose() }
  })

  test("part frame keeps the chuck indexed at zero and transforms the cutter, carriage and machine together", () => {
    const scene = createMachineScene({ setup, program: analysis.program, motion: analysis.motion, scale: 100, display: { ...DEFAULT_MACHINE_DISPLAY, showMachine: true, frame: "part" } })
    try {
      scene.update(scene.timeline.duration)
      const cutter = scene.root.getObjectByName("tool:flat")!
      expect(cutter.position.y).toBeCloseTo(-20, 9); expect(cutter.position.z).toBeCloseTo(6, 9)
      expect(scene.root.getObjectByName("spindle")!.rotation.x).toBe(0)
      expect(scene.root.getObjectByName("mill-turn-machine")!.rotation.x).toBeCloseTo(Math.PI / 2, 9)
      expect(scene.root.getObjectByName("machine-bodies")!.rotation.x).toBeCloseTo(Math.PI / 2, 9)
    } finally { scene.dispose() }
  })

  test("milling-tool and holder visibility use the same controls as the existing mill", () => {
    const scene = createMachineScene({ setup, program: analysis.program, scale: 100, display: { ...DEFAULT_MACHINE_DISPLAY, showTool: false, showHolder: false } })
    try {
      scene.update(scene.timeline.duration)
      const cutter = scene.root.getObjectByName("tool:flat")!
      expect(cutter.visible).toBe(false)
      cutter.traverse((o) => { if (o.name.startsWith("holder")) expect(o.visible).toBe(false) })
    } finally { scene.dispose() }
  })

  test("stationary XYZ with changing C has a curved trajectory in part coordinates", () => {
    const p = program([
      { _tag: "Rapid", to: { x: 10, y: 0, z: 0 }, rotary: { b: 0, c: 0 } },
      { _tag: "Linear", to: { x: 10, y: 0, z: 0 }, rotary: { c: 90 }, feed: 90 }
    ])
    const timeline = v.buildTimeline(p)
    const rotary: cam.viewer.RotarySetup = { layout: "table-BC", coordinates: "machine", pivot: origin, assumed: false, reasons: [] }
    const packed = buildPlayback(p)
    const buffers = pathBuffers(packed, { mode: "tool", toolColors: toolColors(p), shown: (point, _path, _index, seconds) => v.partPointOf(point, v.poseAt(timeline, seconds ?? 0).angles, rotary) }, TOOL_COLORS)
    const positions = buffers.cut.positions
    expect(positions.length).toBeGreaterThan(6)
    expect(positions[0]).toBeCloseTo(10, 6); expect(positions[1]).toBeCloseTo(0, 6)
    expect(positions[positions.length - 3]).toBeCloseTo(0, 6); expect(positions[positions.length - 2]).toBeCloseTo(-10, 6)
    for (let i = 0; i < positions.length; i += 3) expect(Math.hypot(positions[i]!, positions[i + 1]!)).toBeCloseTo(10, 5)
  })
})
