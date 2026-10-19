/**
 * Spec 32 P6: the stock of a rotary program as voxels — the tool cuts along its own axis (the rotary angles), the playhead
 * goes back and forth deterministically, and the volume matches the analytic cut within the voxel size.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "../../src/index.ts"

const g = cam.generator, v = cam.viewer
const timelineOf = (gcode: string) => { const a = g.analyseGcode(gcode); return { a, t: v.buildTimeline(a.program, a.motion) } }
const flat10 = cam.toolModelOf({ type: "endmill", diameter: 10, cuttingLength: 30, stickout: 50 }, "mill")
const stock = { min: { x: -40, y: -30, z: -20 }, max: { x: 40, y: 30, z: 0 } }
const at = (sim: cam.sim.VoxelSim, p: { x: number; y: number; z: number }) =>
  sim.material[(Math.floor((p.z - sim.origin.z) / sim.voxel) * sim.ny + Math.floor((p.y - sim.origin.y) / sim.voxel)) * sim.nx + Math.floor((p.x - sim.origin.x) / sim.voxel)]

describe("voxel stock of a rotary program", () => {
  test("a vertical slot removes its volume (within the voxel size)", () => {
    const { t } = timelineOf("G21 G90\nS9000 M3\nG0 X-25 Y0 Z5\nG1 Z-5 F300\nG1 X25 F800\nG0 Z5\nM30")
    const sim = cam.sim.createVoxelSim({ timeline: t, stock, voxel: 0.5, toolOf: () => flat10 })
    sim.advanceTo(t.duration)
    const exact = (50 * 10 + Math.PI * 25) * 5
    expect(Math.abs(sim.removedVolume() - exact) / exact).toBeLessThan(0.05)
    expect(at(sim, { x: 0, y: 0, z: -2 })).toBe(0)
    expect(at(sim, { x: 0, y: 8, z: -2 })).toBe(1)
  })

  test("A90 on a trunnion: the tool comes in along +Y in the part and bores sideways, the top stays", () => {
    const program = "(TABLE-AC)\nG21 G90\nG43.4 H1\nS9000 M3\nG0 X0 Y45 Z-10 A90 C0\nG1 Y20 F300\nG0 Y45\nM30"
    const { a, t } = timelineOf(program)
    const rotary = v.rotaryOfProgram(a.program, program)!
    expect(v.toolAxisInPart({ a: 90, c: 0 }, rotary).y).toBeCloseTo(1, 9)
    const sim = cam.sim.createVoxelSim({ timeline: t, rotary, stock, voxel: 0.5, toolOf: () => flat10 })
    sim.advanceTo(t.duration)
    expect(at(sim, { x: 0, y: 25, z: -10 })).toBe(0)
    expect(at(sim, { x: 0, y: 25, z: -10 + 7 })).toBe(1)
    expect(at(sim, { x: 0, y: 25, z: -0.3 })).toBe(1)
    // A hole Ø10 from the face at Y30 to Y20: 10 deep.
    const exact = Math.PI * 25 * 10
    expect(Math.abs(sim.removedVolume() - exact) / exact).toBeLessThan(0.08)
  })

  test("the playhead back and forth gives the same stock as going straight there", () => {
    const { t } = timelineOf("G21 G90\nS9000 M3\nG0 X-25 Y-10 Z5\nG1 Z-4 F300\nG1 X25 F800\nG1 Y10\nG1 X-25\nG0 Z5\nM30")
    const make = () => cam.sim.createVoxelSim({ timeline: t, stock, voxel: 1, toolOf: () => flat10 })
    const straight = make(); straight.advanceTo(t.duration * 0.6)
    const wander = make(); wander.advanceTo(t.duration); wander.advanceTo(t.duration * 0.2); wander.advanceTo(t.duration * 0.6)
    expect(wander.removedVolume()).toBe(straight.removedVolume())
    expect(Buffer.from(wander.material).equals(Buffer.from(straight.material))).toBe(true)
    expect(make().removedVolume()).toBe(0)
  })

  test("no mill tool, no removal; the surface is whole quads with unit normals", () => {
    const { t } = timelineOf("G21 G90\nS9000 M3\nG0 X0 Y0 Z5\nG1 Z-5 F300\nM30")
    const none = cam.sim.createVoxelSim({ timeline: t, stock, voxel: 2, toolOf: () => undefined })
    none.advanceTo(t.duration)
    expect(none.removedVolume()).toBe(0)
    const sim = cam.sim.createVoxelSim({ timeline: t, stock, voxel: 2, toolOf: () => flat10 })
    sim.advanceTo(t.duration)
    const { positions, normals } = sim.surface()
    expect(positions.length % 18).toBe(0)
    expect(positions.length).toBe(normals.length)
    for (let i = 0; i < normals.length; i += 3) expect(Math.abs(normals[i]!) + Math.abs(normals[i + 1]!) + Math.abs(normals[i + 2]!)).toBe(1)
  })
})
