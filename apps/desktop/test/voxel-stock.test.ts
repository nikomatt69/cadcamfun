/**
 * Spec 32 P6 in the viewport: a rotary program's live stock is the core's voxel stock, drawn as its faces, throttled while
 * it keeps changing, and cut by the preview's own tools.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { createVoxelStock } from "../src/viewport/view3d/voxel-stock.ts"

describe("voxel live stock", () => {
  test("the tool the preview draws cuts it; the mesh follows the playhead", () => {
    const program = "(TABLE-AC)\nG21 G90\nG43.4 H1\nS9000 M3\nG0 X0 Y45 Z-10 A90 C0\nG1 Y20 F300\nG0 Y45\nM30"
    const a = cam.generator.analyseGcode(program)
    const timeline = cam.viewer.buildTimeline(a.program, a.motion)
    const rotary = cam.viewer.rotaryOfProgram(a.program, program)!
    const stock = { min: { x: -40, y: -30, z: -20 }, max: { x: 40, y: 30, z: 0 } }
    const tool = cam.toolModelOf({ type: "endmill", diameter: 10, cuttingLength: 30 }, "mill")
    const live = createVoxelStock({ program: a.program, timeline, rotary, stock, tools: { defaultToolModel: tool }, minMs: 0 })
    const faces0 = live.mesh.geometry.getAttribute("position").count
    expect(live.update(timeline.duration, 1000)).toBe(true)
    expect(live.sim.removedVolume()).toBeGreaterThan(Math.PI * 25 * 9)
    // The bore adds its wall faces.
    expect(live.mesh.geometry.getAttribute("position").count).toBeGreaterThan(faces0)
    // Nothing changed: no redraw.
    expect(live.update(timeline.duration, 2000)).toBe(false)
    // Back to the start: the whole block again.
    expect(live.update(0, 3000)).toBe(true)
    expect(live.sim.removedVolume()).toBe(0)
    live.dispose()
  })
})
