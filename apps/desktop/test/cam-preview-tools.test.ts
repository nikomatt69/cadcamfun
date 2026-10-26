import { expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import * as THREE from "three"
import { installDom } from "./helpers/dom.ts"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"
import { previewToolModel } from "../src/features/cam/lib/machine-view.ts"
import { previewToolFor } from "../src/viewport/view3d/tool-models.ts"
import { toolObject } from "../src/viewport/view3d/tool-object.ts"
import { cuttersOf } from "../src/viewport/view3d/stock-simulation.ts"

const code = "(T1 D=8.5 CR=0. - drill)\n(T2 D=10. CR=0. - right hand tap)\nG21 G90 G17\nT1 M6\nS1000 M3\nG0 X0 Y0 Z5\nG81 X0 Y0 Z-8 R2 F100\nG80\nT2 M6\nG84 X10 Y0 Z-6 R2 F100\nG80\nT3 M6\nG38.2 Z-1 F50\nM30"

test("imported operations use their own 3D geometry and stock cutter rather than the generator's ball mill", () => {
  const parsed = cam.generator.analyseGcode(code)
  const models = new Map([...cam.programTools(parsed.program, parsed.motion, code)].map(([id, t]) => [id, t.model]))
  const sources = { toolModels: models, defaultToolModel: cam.toolModelOf({ type: "ballnose", diameter: 20 }) }
  const objects = parsed.program.toolpaths.map((path) => {
    const model = previewToolFor(path.toolId, sources)!
    return { model, object: toolObject(model, { assumeHolder: true }) }
  })
  try {
    expect(objects.map((t) => cam.toolKindOf(t.model))).toEqual(["drill", "tap", "probe"])
    expect(objects.map((t) => t.object.name)).toEqual(["tool:drill", "tool:tap", "probe"])
    for (const { model, object } of objects) {
      expect(object.children.length).toBeGreaterThan(0)
      if (model.family !== "mill" && model.family !== "probe") throw new Error("Expected a spindle tool")
      const positions: number[] = []
      object.traverse((part) => { if (part instanceof THREE.Mesh) positions.push(...part.geometry.getAttribute("position").array) })
      expect(positions.every(Number.isFinite)).toBe(true)
      expect(positions.length).toBeGreaterThan(30)
    }
    // A drill's pointed cutting profile and a tap's profile differ; the probe removes no material.
    const timeline = cam.viewer.buildTimeline(parsed.program, parsed.motion)
    const cutters = cuttersOf({ ...sources, program: parsed.program, timeline, stock: { minX: -20, maxX: 20, minY: -20, maxY: 20, minZ: -20, maxZ: 0 } })
    expect([...cutters.keys()]).toEqual(parsed.program.toolpaths.slice(0, 2).map((path) => path.toolId))
    expect([...cutters.values()].map((c) => c.radius)).toEqual([4.25, 5])
  } finally {
    for (const { object } of objects) object.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return
      part.geometry.dispose()
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) material.dispose()
    })
  }
})

test("editing the next operation cannot replace the tool model of the generated program", () => {
  const gen = useGeneratorStore.getState()
  gen.reset()
  try {
    gen.patchSettings({ machineType: "mill", operationType: "drill", toolType: "drill", toolDiameter: 8.5 })
    gen.setResult("G81 Z-10 R2 F100", [])
    gen.patchSettings({ operationType: "3d_surface", toolType: "ballnose", toolDiameter: 20 })
    const saved = useGeneratorStore.getState()
    expect(previewToolModel("mill", saved.generatedSettings!, saved.generatedTool)).toMatchObject({ family: "mill", shape: "drill", diameter: 8.5 })
    expect(previewToolModel("mill", saved.settings, null)).toMatchObject({ family: "mill", shape: "ball", diameter: 20 })
  } finally { gen.reset() }
})

test("operation navigation, active model and keyboard scrubbing share the simulation clock", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { createSignal } = await import("solid-js")
  const { default: ToolpathVisualizer } = await import("../src/features/cam/components/ToolpathVisualizer.tsx")
  const parsed = cam.generator.analyseGcode(code)
  const tools = cam.programTools(parsed.program, parsed.motion, code)
  const models = new Map([...tools].map(([id, tool]) => [id, tool.model]))
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  let time = () => 0
  const dispose = render(() => {
    const [seconds, setSeconds] = createSignal(0)
    const [playing, setPlaying] = createSignal(false)
    time = seconds
    return ToolpathVisualizer({
      program: parsed.program, motion: parsed.motion, gcode: code, toolModels: models,
      operationTools: [...tools.values()].map((tool) => ({ ...tool, name: tool.toolId })),
      workpiece: { x: 100, y: 60, z: 20 }, playbackRate: 1,
      get playbackTime() { return seconds() }, get playing() { return playing() },
      onPlayingChange: setPlaying, onPlaybackTimeChange: setSeconds
    })
  }, root)
  const model = () => root.querySelector('[data-testid="visualizer-tool-model"]')!.textContent
  const click = (id: string) => root.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click()
  try {
    expect(model()).toContain("drill Ø8.5")
    click("timeline-next-op")
    expect(model()).toContain("tap Ø10")
    click("timeline-next-op")
    expect(model()).toContain("touch probe")
    const slider = root.querySelector<HTMLElement>('[role="slider"]')!
    slider.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }))
    expect(time()).toBe(0)
    expect(model()).toContain("drill Ø8.5")
    slider.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }))
    expect(time()).toBe(1)
    slider.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }))
    expect(time()).toBeCloseTo(Number(slider.getAttribute("aria-valuemax")))
    expect(model()).toContain("touch probe")
    click("operations-toggle")
    expect([...root.querySelectorAll('[data-testid="operation-model"]')].map((row) => row.textContent)).toEqual([expect.stringContaining("drill Ø8.5"), expect.stringContaining("tap Ø10"), expect.stringContaining("touch probe")])
  } finally { dispose() }
}, 60_000)
