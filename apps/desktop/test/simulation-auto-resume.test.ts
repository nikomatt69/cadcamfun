import { expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"
import { RUN_THROUGH_PAUSE_MS } from "../src/features/cam/lib/run-through.ts"

test("the timeline flag resumes simulation stops and a manual step cancels the pending restart", async () => {
  installDom()
  const { render } = await import("solid-js/web")
  const { createSignal } = await import("solid-js")
  const { default: ToolpathVisualizer } = await import("../src/features/cam/components/ToolpathVisualizer.tsx")
  const { previewSetup } = await import("../src/features/cam/lib/machine-view.ts")
  const code = "G21 G90\nG0 X0 Y0 Z10\nG4 P1\nG0 Z-5\nG1 X20 F600\nG0 Z10\nM30"
  const analysis = cam.generator.analyseGcode(code)
  const stock = { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
  const settings = cam.generator.withMachineDefaults(cam.generator.decodeSettings({ machineType: "mill" }) as cam.generator.ToolpathSettings)
  const machine = previewSetup("mill", settings, stock, { program: analysis.program, gcode: code })
  const duration = cam.viewer.buildTimeline(analysis.program, analysis.motion).duration
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  let playing = () => false, time = () => 0, move = (_seconds: number) => {}
  const dispose = render(() => {
    const [readPlaying, setPlaying] = createSignal(false)
    const [readTime, setTime] = createSignal(0)
    playing = readPlaying; time = readTime; move = setTime
    return ToolpathVisualizer({
      program: analysis.program, motion: analysis.motion, machine, gcode: code, stock,
      defaultToolModel: cam.toolForOperation(settings),
      workpiece: { x: 100, y: 60, z: 20 }, playbackRate: 1, playbackDuration: duration,
      get playing() { return readPlaying() }, get playbackTime() { return readTime() },
      onPlayingChange: setPlaying, onPlaybackTimeChange: setTime
    })
  }, root)
  try {
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(root.querySelectorAll('[data-testid="timeline-marker"]').length).toBeGreaterThan(0)
    const end = Number(root.querySelector('[role="slider"]')!.getAttribute("aria-valuemax"))
    const flag = root.querySelector<HTMLInputElement>('[data-testid="timeline-auto-resume"]')!
    expect(flag).not.toBeNull()
    expect(flag.checked).toBe(false)
    flag.click()
    expect(flag.checked).toBe(true)
    expect(playing()).toBe(true)
    move(end - 1e-6)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(playing()).toBe(false)
    expect(time()).toBeLessThan(end - 1e-6)
    await new Promise((resolve) => setTimeout(resolve, RUN_THROUGH_PAUSE_MS + 50))
    expect(playing()).toBe(true)
    root.querySelector<HTMLButtonElement>('button[aria-label="Pause simulation"]')!.click()
    expect(playing()).toBe(false)
    expect(flag.checked).toBe(false)

    // Replay the collision, then explicitly step away while the restart is pending.
    move(0)
    flag.click()
    move(end - 1e-6)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(playing()).toBe(false)
    root.querySelector<HTMLButtonElement>('[data-testid="timeline-next-move"]')!.click()
    expect(flag.checked).toBe(false)
    const stepped = time()
    await new Promise((resolve) => setTimeout(resolve, RUN_THROUGH_PAUSE_MS + 50))
    expect(playing()).toBe(false)
    expect(time()).toBe(stepped)
  } finally { dispose() }
}, 30_000)
