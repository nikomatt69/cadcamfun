/** Real WebGL smoke fixture: serves the production visualizer without project or provider credentials. */
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { render } from "solid-js/web"
import { cam } from "@cadcamfun/core"
import ToolpathVisualizer from "../../src/features/cam/components/ToolpathVisualizer.tsx"
import { previewSetup } from "../../src/features/cam/lib/machine-view.ts"
import "../../src/styles/globals.css"

const stock = { width: 50, height: 50, depth: 100, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }
const turning = cam.kernel.planTurning({ profile: [{ diameter: 40, z: 0 }, { diameter: 25, z: -50 }], stock: { diameter: 44, length: 60 } }).nc
const cases = {
  "Mill B/C": { kind: "mill" as const, code: "(TABLE-BC)\nG17 G21 G90\nM3 S800\nG0 X0 Y0 Z60 B0 C0\nG1 X20 Y0 Z20 B60 C180 F600\nG1 X0 Y20 Z10 B30 C270\nM30" },
  "Mill-turn B/C": { kind: "lathe" as const, code: "G18 G21 G90\nM3 S600\nG0 X44 Y6 Z2 B0 C0\nG1 X40 Y6 Z-25 B90 C180 F90\nG1 Z-45 B45 C270\nM30" },
  "Turning preview": { kind: "lathe" as const, code: turning }
}
function Fixture() {
  const [name, setName] = createSignal<keyof typeof cases>("Mill B/C")
  const [seconds, setSeconds] = createSignal(0)
  const [playing, setPlaying] = createSignal(false)
  const current = createMemo(() => cases[name()])
  const analysis = createMemo(() => cam.generator.analyseGcode(current().code))
  const settings = createMemo(() => cam.generator.withMachineDefaults(cam.generator.decodeSettings({ machineType: current().kind, stockDiameter: 44, stockLength: 60, noseRadius: 0 })))
  const setup = createMemo(() => previewSetup(current().kind, settings(), stock, { program: analysis().program, gcode: current().code }))
  const timeline = createMemo(() => cam.viewer.buildTimeline(analysis().program, analysis().motion, cam.viewer.DEFAULT_RAPID_RATE, cam.viewer.programStart(current().kind, analysis().program)))
  const tools = createMemo(() => current().kind === "lathe" ? cam.viewer.turnMillToolModels(analysis().program, analysis().motion, current().code) : cam.headerToolModels(current().code, "mill"))
  createEffect(() => { current(); setPlaying(false); setSeconds(timeline().duration * 0.65) })
  createEffect(() => {
    if (!playing()) return
    let previous = performance.now(), frame = 0
    const tick = (now: number) => {
      setSeconds((t) => (t + (now - previous) / 1000) % Math.max(1, timeline().duration))
      previous = now; frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    onCleanup(() => cancelAnimationFrame(frame))
  })
  return <div style={{ height: "100vh", display: "flex", "flex-direction": "column", background: "#f4f6f9", color: "#172033" }}>
    <header style={{ padding: "12px 18px", display: "flex", gap: "12px", "align-items": "center" }}>
      <strong>CAM five-axis verification</strong>
      {Object.keys(cases).map((key) => <button style={{ padding: "6px 12px", border: "1px solid #9aa8b9", "border-radius": "6px", background: name() === key ? "#c5dcff" : "white" }} onClick={() => setName(key as keyof typeof cases)}>{key}</button>)}
      <output>{name()} · {seconds().toFixed(1)} / {timeline().duration.toFixed(1)} s</output>
    </header>
    <div style={{ flex: 1, "min-height": "0", position: "relative" }}>
      <ToolpathVisualizer program={analysis().program} motion={analysis().motion} gcode={current().code} machine={setup()}
        toolModels={tools()} defaultToolModel={cam.toolForOperation(settings(), current().kind)} stock={stock} workpiece={{ x: 50, y: 50, z: 100 }}
        playing={playing()} playbackTime={seconds()} playbackRate={1} playbackDuration={timeline().duration} onPlayingChange={setPlaying} onPlaybackTimeChange={setSeconds} />
    </div>
  </div>
}
render(Fixture, document.getElementById("root")!)
