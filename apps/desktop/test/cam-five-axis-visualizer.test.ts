import { expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"

const stock = { width: 100, height: 60, depth: 20, radius: 0, x: 0, y: 0, topZ: 0, allowance: 0 }

/** Mount the real controls and Solid memos; happy-dom deliberately has no WebGL renderer. */
const mountVisualizer = async (kind: cam.MachineKind, initialCode: string) => {
  installDom()
  const { render } = await import("solid-js/web")
  const { createMemo, createSignal } = await import("solid-js")
  const { default: ToolpathVisualizer } = await import("../src/features/cam/components/ToolpathVisualizer.tsx")
  const { previewSetup } = await import("../src/features/cam/lib/machine-view.ts")
  const settings = cam.generator.withMachineDefaults(cam.generator.decodeSettings({ machineType: kind }) as cam.generator.ToolpathSettings)
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  let replaceCode: (code: string) => void = () => { throw new Error("visualizer is not mounted") }
  const dispose = render(() => {
    const [code, setCode] = createSignal(initialCode)
    replaceCode = setCode
    const analysis = createMemo(() => cam.generator.analyseGcode(code()))
    const machine = createMemo(() => previewSetup(kind, settings, stock, { program: analysis().program, gcode: code() }))
    const tools = createMemo(() => kind === "lathe" ? cam.viewer.turnMillToolModels(analysis().program, analysis().motion, code()) : cam.headerToolModels(code(), "mill"))
    const fallback = kind === "lathe" ? cam.viewer.latheSetupOf(settings).tool : cam.toolModelOf({ type: "endmill", diameter: 8 }, "mill")
    const duration = createMemo(() => cam.viewer.buildTimeline(analysis().program, analysis().motion, cam.viewer.DEFAULT_RAPID_RATE, cam.viewer.programStart(kind, analysis().program)).duration)
    return ToolpathVisualizer({
      get program() { return analysis().program },
      get machine() { return machine() },
      get motion() { return analysis().motion },
      get gcode() { return code() },
      get toolModels() { return tools() },
      defaultToolModel: fallback,
      workpiece: { x: 100, y: 60, z: 20 }, stock,
      playing: false, get playbackTime() { return duration() }, playbackRate: 1,
      onPlaybackTimeChange: () => {}
    })
  }, root)
  const select = (label: string) => root.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!
  const openSettings = () => root.querySelector<HTMLButtonElement>('button[aria-label="Visualization settings"]')!.click()
  const showMachine = () => [...root.querySelectorAll("label")].find((label) => label.textContent === "Show the machine (axes, head, table)")?.querySelector<HTMLInputElement>("input")
  return { root, replaceCode, dispose, select, openSettings, showMachine }
}

test("a B0/C0 lathe opens the five-axis controls and switching to turning clears rotary state", async () => {
  const code = "G18\nT1 M6\nS1200 M3\nG0 X40 Y0 Z2 B0 C0\nG1 Z-20 F100"
  const view = await mountVisualizer("lathe", code)
  try {
    expect(view.select("View preset").value).toBe("perspective")
    expect(view.root.querySelector('[data-testid="visualizer-joints"]')?.textContent).toContain("X40 Y0 Z-20 B0 C0")
    expect(view.root.querySelector('[data-testid="visualizer-dro"]')?.textContent).toContain("B0° C0°")
    expect(view.root.querySelector('[data-testid="visualizer-tool-model"]')?.textContent).toContain("flat Ø10")
    view.openSettings()
    expect(view.showMachine()?.checked).toBe(true)
    expect(view.select("Rotary view").value).toBe("machine")
    view.select("Rotary view").value = "part"
    view.select("Rotary view").dispatchEvent(new window.Event("change", { bubbles: true }))
    expect(view.select("Rotary view").value).toBe("part")

    view.replaceCode("G18\nT2 M6\nS500 M3\nG0 X52 Z2\nG1 X40 Z-8 F100")
    expect(view.select("View preset").value).toBe("front")
    expect(view.root.querySelector('[data-testid="visualizer-joints"]')).toBeNull()
    expect(view.root.querySelector('[data-testid="visualizer-dro"]')?.textContent).not.toMatch(/[BC]0°/)
    expect(view.root.querySelector('select[aria-label="Rotary view"]')).toBeNull()
    expect(view.showMachine()).toBeUndefined()
    expect(view.root.querySelector('[data-testid="visualizer-tool-model"]')?.textContent).toContain("insert")
    expect(view.root.querySelector('[data-testid="visualizer-tool-model"]')?.textContent).not.toContain("flat Ø10")
  } finally { view.dispose() }
})

test("a mill follows B/C inference and resets a manual machine class for the next layout", async () => {
  const view = await mountVisualizer("mill", "G17\nG0 X0 Y0 Z5 B0 C0\nG1 X10 B45 C90 F600")
  try {
    expect(view.select("View preset").value).toBe("perspective")
    expect(view.root.querySelector('[data-testid="visualizer-dro"]')?.textContent).toContain("B45° C90°")
    view.openSettings()
    expect(view.showMachine()?.checked).toBe(true)
    expect(view.select("Rotary view").value).toBe("machine")
    expect(view.select("Rotary view").parentElement?.textContent).toContain("table-BC")
    expect(view.select("Machine class").value).toBe("auto")
    view.select("Machine class").value = "head-table-bc"
    view.select("Machine class").dispatchEvent(new window.Event("change", { bubbles: true }))
    expect(view.select("Machine class").value).toBe("head-table-bc")

    view.replaceCode("(HEAD-TABLE-BC)\nG17\nG0 X0 Y0 Z5 B0 C0\nG1 X10 B30 C60 F600")
    expect(view.select("Machine class").value).toBe("auto")
    expect(view.select("Rotary view").parentElement?.textContent).toContain("head-table-BC")
    expect(view.select("Rotary view").value).toBe("machine")
    expect(view.root.querySelector('[data-testid="visualizer-dro"]')?.textContent).toContain("B30° C60°")
  } finally { view.dispose() }
})
