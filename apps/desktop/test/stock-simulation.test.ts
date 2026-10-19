import { describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { createLiveStock, createStockSimulation, cuttersOf } from "../src/viewport/view3d/stock-simulation.ts"

const analysis = cam.generator.analyseGcode("G21 G90 G17\nT1 M6\nG0 X0 Y0 Z5\nG1 Z-2 F100\nG1 X8 F100\nG0 Z5\nM30")
const program = analysis.program
const timeline = cam.viewer.buildTimeline(program, analysis.motion)
const id = program.toolpaths[0]!.toolId
const stock = { minX: -4, maxX: 12, minY: -4, maxY: 4, minZ: -5, maxZ: 5 }
const input = { program, timeline, stock, cell: 0.5 }
const cutter = (id: string): cam.kernel.Cutter => cam.kernel.DEFAULT_CUTTERS.find((c) => c.id === id)!

describe("the stock adapter's cutting geometry", () => {
  test.each([
    ["ball-6", 2, 3 - Math.sqrt(5)],
    ["bull-6-r0.5", 2.75, 0.5 - Math.sqrt(0.25 - 0.25 ** 2)],
    ["spot-6", 2, 2],
    ["drill-6", 2, 2 / Math.tan(70 * Math.PI / 180)]
  ] as const)("%s keeps its cutting profile", (toolId, radius, height) => {
    const profile = cuttersOf({ ...input, tools: new Map([[id, cutter(toolId)]]) }).get(id)!
    expect(profile.flat).toBe(false)
    expect(profile.profile(radius)).toBeCloseTo(height, 10)
  })

  test("an explicit probe does not cut with a kernel or default milling tool", () => {
    const tools = new Map([[id, cutter("flat-6")]])
    const toolModels = new Map([[id, cam.toolModelOf({ type: "probe", diameter: 4 })]])
    expect(cuttersOf({ ...input, tools, toolModels, defaultToolModel: cam.toolModelFromCutter(cutter("flat-10")) }).has(id)).toBe(false)
  })

  test("a default kernel cutter is used when no tool model is supplied", () => {
    const simulation = createStockSimulation({ ...input, defaultTool: cutter("ball-6") })
    expect(simulation).toBeDefined()
    expect(simulation!.missingTools).toEqual([])
    simulation!.advanceTo(timeline.duration)
    expect(simulation!.removedVolume).toBeGreaterThan(0)
  })

  test("an operation's own model takes precedence over the kernel and default tools", () => {
    const toolModels = new Map([[id, cam.toolModelFromCutter(cutter("ball-6"))]])
    const profile = cuttersOf({ ...input, toolModels, tools: new Map([[id, cutter("flat-10")]]) }).get(id)!
    expect(profile.radius).toBe(3)
    expect(profile.profile(2)).toBeCloseTo(3 - Math.sqrt(5), 10)
  })

  test("the material removed by a kernel ball tool equals its explicit model", () => {
    const ball = cutter("ball-6")
    const fromKernel = createStockSimulation({ ...input, tools: new Map([[id, ball]]) })!
    const fromModel = createStockSimulation({ ...input, toolModels: new Map([[id, cam.toolModelFromCutter(ball)]]) })!
    fromKernel.advanceTo(timeline.duration)
    fromModel.advanceTo(timeline.duration)
    expect(fromKernel.sim.field.top).toEqual(fromModel.sim.field.top)
  })
})

describe("the vertical stock simulation's machine scope", () => {
  const tools = new Map([[id, cutter("flat-6")]])

  test("lathe and printer setups keep their own stock representations", () => {
    const settings = cam.generator.DEFAULT_SETTINGS
    for (const machine of [cam.viewer.latheSetupOf(settings), cam.viewer.printerSetupOf(settings)]) {
      expect(createStockSimulation({ ...input, tools, machine })).toBeUndefined()
    }
  })

  test("rotary motion is not replayed as a vertical cutter", () => {
    const rotary = cam.generator.analyseGcode("G21 G90 G17\nT1 M6\nG0 X0 Y0 Z5\nG1 X8 Z-2 A30 F100\nM30")
    expect(createStockSimulation({ ...input, tools, program: rotary.program, timeline: cam.viewer.buildTimeline(rotary.program, rotary.motion) })).toBeUndefined()
  })
})

test("rewinding and resetting restore the visible stock", () => {
  const simulation = createStockSimulation({ ...input, tools: new Map([[id, cutter("flat-6")]]) })!
  const live = createLiveStock(simulation)
  try {
    const initial = Float32Array.from(live.mesh.geometry.getAttribute("position").array)
    simulation.advanceTo(timeline.duration)
    expect(live.update()).toBe(true)
    expect(live.mesh.geometry.getAttribute("position").array).not.toEqual(initial)
    simulation.advanceTo(0)
    expect(live.update()).toBe(true)
    expect(live.mesh.geometry.getAttribute("position").array).toEqual(initial)
    simulation.advanceTo(timeline.duration)
    expect(live.update()).toBe(true)
    simulation.reset()
    expect(live.update()).toBe(true)
    expect(live.mesh.geometry.getAttribute("position").array).toEqual(initial)
    expect(live.update()).toBe(false)
  } finally {
    live.mesh.geometry.dispose()
    const materials = Array.isArray(live.mesh.material) ? live.mesh.material : [live.mesh.material]
    for (const material of materials) material.dispose()
  }
})
