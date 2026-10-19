/**
 * The live stock simulation (spec 32 §4.5): the material as the program removes it.
 *
 * The gate of the phase: the simulation's remaining stock is the verifier's height field, cell for
 * cell, and the deviation it reports is the deviation the verifier reports.
 */
import { describe, expect, test } from "bun:test"
import { cam } from "../../src/index.ts"
import { StockSimulation, type SimCutter } from "../../src/cam/sim/index.ts"

const flat = (radius: number): SimCutter => ({ radius, flat: true, profile: () => 0 })

/** A program from G-code. */
const programOf = (gcode: string) => {
  const analysis = cam.generator.analyseGcode(gcode)
  return { analysis, program: analysis.program }
}

const cuttersOf = (diameters: ReadonlyMap<string, number>): ReadonlyMap<string, SimCutter> => {
  const out = new Map<string, SimCutter>()
  for (const [id, diameter] of diameters) out.set(id, flat(diameter / 2))
  return out
}

/** A pocket cut 2 mm deep along a rectangle, in a 24 × 24 mm stock. */
const POCKET = [
  "G21 G90 G17", "T1 M6", "S6000 M3",
  "G0 X0 Y0 Z5", "G1 Z-2 F300", "G1 X20 F600", "G1 Y20 F600", "G1 X0 F600", "G1 Y0 F600", "G0 Z5",
  "M30"
].join("\n")

describe("the stock simulation", () => {
  test("probing motion touches the stock without removing it", () => {
    const { analysis, program } = programOf("G21 G90 G17\nG0 X0 Y0 Z5\nG38.2 Z-2 F100\nG0 Z5\nM30")
    const timeline = cam.viewer.buildTimeline(program, analysis.motion)
    expect(timeline.moves.some((move) => move.state.probe)).toBe(true)
    const simulation = new StockSimulation({
      program, timeline, cutters: cuttersOf(new Map([[program.toolpaths[0]!.toolId, 6]])),
      bounds: { minX: -4, maxX: 4, minY: -4, maxY: 4, minZ: -5, maxZ: 5 }, cell: 0.5
    })
    const initial = simulation.sim.snapshot()
    simulation.advanceTo(timeline.duration)
    expect(simulation.sim.field.top).toEqual(initial)
    expect(simulation.removedVolume).toBe(0)
  })

  test("partial ball-tool passes leave the same cells as uninterrupted replay", () => {
    const { analysis, program } = programOf([
      "G21 G90 G17", "G0 X0 Y0 Z5", "G1 X8 Y0 Z-2 F100",
      "G3 X8 Y8 Z-3 I0 J4 F100", "G0 Z5", "M30"
    ].join("\n"))
    const timeline = cam.viewer.buildTimeline(program, analysis.motion)
    const ball = cam.toolModelOf({ type: "ballnose", diameter: 6 })
    const cutters = new Map([[program.toolpaths[0]!.toolId, cam.sim.simCutterOfModel(ball)!]])
    const options = { program, timeline, cutters, bounds: { minX: -4, maxX: 14, minY: -4, maxY: 12, minZ: -5, maxZ: 5 }, cell: 0.5 }
    const continuous = new StockSimulation(options)
    continuous.advanceTo(timeline.duration)
    const paused = new StockSimulation(options)
    for (const move of timeline.moves) {
      for (const fraction of [0.37, 0.63, 1]) paused.advanceTo(move.start + fraction * move.duration)
    }
    paused.advanceTo(timeline.duration)
    expect(paused.sim.field.top).toEqual(continuous.sim.field.top)
    expect(paused.removedVolume).toBe(continuous.removedVolume)
  })

  test("the remaining stock is the verifier's height field, cell for cell", () => {
    const { analysis, program } = programOf(POCKET)
    const bounds = { minX: -2, maxX: 22, minY: -2, maxY: 22, minZ: -5, maxZ: 5 }
    const tool = { diameter: 6, kind: "endmill" as const, cuttingLength: 20, shankDiameter: 6, stickout: 25 }

    const verification = cam.verify.verifyToolpath({
      program,
      stock: bounds,
      tool,
      fixtures: [],
      tolerance: 0.01,
      resolution: 0.5
    })

    const timeline = cam.viewer.buildTimeline(program, analysis.motion)
    const simulation = new StockSimulation({
      program,
      timeline,
      cutters: cuttersOf(new Map([[program.toolpaths[0]!.toolId, 6]])),
      bounds,
      cell: 0.5
    })
    simulation.advanceTo(timeline.duration)

    // The verifier's preview is block-averaged; with fewer than 64 cells on a side the block is one
    // cell, so its heights are the field's own.
    expect(verification.stats.cellsX).toBeLessThanOrEqual(64)
    expect(verification.stats.cellsY).toBeLessThanOrEqual(64)
    expect(simulation.sim.field.nx).toBe(verification.stats.cellsX)
    expect(simulation.sim.field.ny).toBe(verification.stats.cellsY)
    for (let k = 0; k < simulation.sim.field.top.length; k++) {
      expect(simulation.sim.field.top[k]!).toBeCloseTo(verification.preview.heights[k]!, 3)
    }
    expect(simulation.removedVolume).toBeCloseTo(verification.stats.removedVolume, 3)
    expect(simulation.remainingVolume).toBeCloseTo(verification.stats.remainingVolume, 3)
  })

  test("the deviation from the part is the verifier's deviation", () => {
    // The pocket is cut 1 mm below the finished floor: the machine gouges.
    const gcode = POCKET.replace("G1 Z-2 F300", "G1 Z-3 F300")
    const { analysis, program } = programOf(gcode)
    const bounds = { minX: -2, maxX: 22, minY: -2, maxY: 22, minZ: -5, maxZ: 5 }
    const tool = { diameter: 6, kind: "endmill" as const, cuttingLength: 20, shankDiameter: 6, stickout: 25 }
    // The finished part: a plate whose floor is 1 mm above the cut.
    const positions = [-2, -2, -2, 22, -2, -2, 22, 22, -2, -2, 22, -2]
    const indices = [0, 1, 2, 0, 2, 3]
    const part = { positions: new Float32Array(positions), indices: new Uint32Array(indices) }

    const verification = cam.verify.verifyToolpath({
      program,
      stock: bounds,
      tool,
      fixtures: [],
      tolerance: 0.01,
      resolution: 0.5,
      target: { solids: [], meshes: [{ positions, indices }] }
    })

    const timeline = cam.viewer.buildTimeline(program, analysis.motion)
    const simulation = new StockSimulation({
      program,
      timeline,
      cutters: cuttersOf(new Map([[program.toolpaths[0]!.toolId, 6]])),
      bounds,
      cell: 0.5
    })
    simulation.advanceTo(timeline.duration)
    const target = simulation.rasterise([part])
    const deviation = simulation.deviation(target, 0.01)

    expect(deviation.gougeVolume).toBeCloseTo(verification.stats.gougeVolume ?? 0, 3)
    expect(deviation.maxGouge).toBeCloseTo(verification.stats.maxGouge ?? 0, 6)
    expect(deviation.uncutVolume).toBeCloseTo(verification.stats.uncutVolume ?? 0, 3)
    expect(deviation.maxUncut).toBeCloseTo(verification.stats.maxUncut ?? 0, 6)
  })

  test("the material appears as the playhead moves, and scrubbing back gives the same state", () => {
    const { analysis, program } = programOf(POCKET)
    const bounds = { minX: -2, maxX: 22, minY: -2, maxY: 22, minZ: -5, maxZ: 5 }
    const timeline = cam.viewer.buildTimeline(program, analysis.motion)
    const simulation = new StockSimulation({
      program,
      timeline,
      cutters: cuttersOf(new Map([[program.toolpaths[0]!.toolId, 6]])),
      bounds,
      cell: 0.5
    })

    expect(simulation.removedVolume).toBe(0)
    simulation.advanceTo(timeline.duration * 0.5)
    const half = simulation.removedVolume
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(simulation.sim.stockVolume)
    simulation.advanceTo(timeline.duration)
    const whole = simulation.removedVolume
    expect(whole).toBeGreaterThan(half)
    // Back to the middle: the same material as the first time.
    simulation.advanceTo(timeline.duration * 0.5)
    expect(simulation.removedVolume).toBeCloseTo(half, 6)
    // And to the end again.
    simulation.advanceTo(timeline.duration)
    expect(simulation.removedVolume).toBeCloseTo(whole, 6)
  })

  test("the second operation starts on what the first one left", () => {
    const { analysis } = programOf(POCKET)
    const first = analysis.program.toolpaths[0]!
    const program = {
      ...analysis.program,
      toolpaths: [
        { ...first, moves: first.moves.slice(0, 5) },
        { ...first, id: "second", toolId: "T2", moves: first.moves.slice(5) }
      ]
    }
    const bounds = { minX: -2, maxX: 22, minY: -2, maxY: 22, minZ: -5, maxZ: 5 }
    const timeline = cam.viewer.buildTimeline(program, analysis.motion)
    const simulation = new StockSimulation({
      program,
      timeline,
      cutters: cuttersOf(new Map([[first.toolId, 6], ["T2", 6]])),
      bounds,
      cell: 0.5
    })
    const second = timeline.moves.findIndex((m) => m.path === 1)
    expect(second).toBeGreaterThan(0)
    simulation.advanceTo(timeline.moves[second]!.start)
    const afterFirst = simulation.removedVolume
    expect(afterFirst).toBeGreaterThan(0)
    simulation.advanceTo(timeline.duration)
    // The second operation removes more: it starts on the first one's stock.
    expect(simulation.removedVolume).toBeGreaterThan(afterFirst)
  })

  test("the mesh of the remaining stock follows the columns", () => {
    const bounds = { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 5 }
    const simulation = new StockSimulation({
      program: cam.makeProgram("empty", []),
      timeline: { moves: [], duration: 0, track: { paths: [], unsupported: [] } },
      cutters: new Map(),
      bounds,
      cell: 1
    })
    const mesh = simulation.mesh()
    expect(mesh.positions.length).toBe(100 * 3)
    expect(mesh.indices.length).toBe(9 * 9 * 6)
    // The whole stock is there: every column is at the ceiling.
    for (let k = 0; k < 100; k++) expect(mesh.positions[k * 3 + 2]).toBe(5)
    // A cut lowers the columns it passes over.
    simulation.sim.cut({ rapid: false, from: { x: 0, y: 0, z: 5 }, to: { x: 10, y: 0, z: 2 } }, flat(2), 0.5)
    const cut = simulation.mesh()
    expect(cut.positions[2]).toBeLessThan(5)
  })
})
