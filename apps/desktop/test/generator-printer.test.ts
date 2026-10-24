/** The generator panel for a 3D printer: its own profile, its result, its verified print, and no mill-only sections. */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useSelectionStore } from "../src/features/cad/store/selectorStore.ts"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })
afterEach(() => { resetStores(); useGeneratorStore.getState().reset() })

const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 60000)
const open = async (id: string): Promise<void> => {
  const section = await find(`[data-testid="${id}"]`)
  const header = section.querySelector<HTMLElement>('[role="button"]')!
  if (header.getAttribute("aria-expanded") !== "true") { header.click(); await settle() }
}
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}]/u

const part = () => {
  useElementsStore.setState({ elements: [{ id: "block", type: "cube", layerId: "default", visible: true, x: 0, y: 0, z: 3, width: 16, height: 12, depth: 6 }] as never, selectedElement: null })
  useSelectionStore.setState({ selectedElementIds: ["block"] } as never)
}

describe("generator panel for a 3D printer", () => {
  test("shows the print profile and the verified print, hides what only a mill uses, and has no emoji", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await find('[data-testid="toolpath-generator"]')
      useGeneratorStore.getState().updateSettings("machineType", "3dprinter")
      await settle(200)
      for (const id of ["print-profile-section", "cam-kernel-print-section", "print-result-section", "material-section"]) await find(`[data-testid="${id}"]`)
      for (const id of ["cutting-section", "advanced-options-panel", "cam-kernel-section"]) expect(document.querySelector(`[data-testid="${id}"]`), id).toBeNull()
      for (const id of ["print-profile-section", "cam-kernel-print-section", "print-result-section", "machine-section", "operation-section"]) await open(id)
      const panel = document.querySelector('[data-testid="toolpath-generator"]')!
      expect(EMOJI.test(panel.textContent ?? "")).toBe(false)
      expect(panel.textContent).toContain("Print profile")
      expect(panel.textContent).not.toContain("Cutting Parameters")
    } finally { dispose() }
  }, 120000)

  test("a profile sets what the slicer reads, and the fields take a decimal comma", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await find('[data-testid="toolpath-generator"]')
      useGeneratorStore.getState().updateSettings("machineType", "3dprinter")
      await settle(200)
      await open("print-profile-section")
      const presets = await find('[data-testid="print-presets"]')
      const strong = [...presets.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Strong")!
      strong.click()
      await settle()
      const s = useGeneratorStore.getState()
      expect(s.printer).toMatchObject({ shellCount: 4, infillDensity: 40, infillPattern: "gyroid", topLayers: 5 })
      expect(s.settings.layerHeight).toBe(0.2)
      const layer = document.querySelector<HTMLInputElement>('input[aria-label="Layer height"]')!
      layer.value = "0,15"
      layer.dispatchEvent(new window.Event("input", { bubbles: true }))
      await settle()
      expect(useGeneratorStore.getState().settings.layerHeight).toBe(0.15)
      const fine = [...presets.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.getAttribute("aria-pressed") === "true")
      expect(fine).toBeUndefined()
    } finally { dispose() }
  }, 120000)

  test("generating measures the print and the evidence reads the program", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await find('[data-testid="toolpath-generator"]')
      part()
      useGeneratorStore.getState().updateSettings("machineType", "3dprinter")
      await settle(200)
      ;(await find('[data-testid="generate-toolpath"]')).click()
      await open("print-result-section")
      const stats = await app.wait(() => document.querySelector('[data-testid="print-stats"]') ?? (useGeneratorStore.getState().error !== null ? (() => { throw new Error(`generate failed: ${useGeneratorStore.getState().error}`) })() : undefined), 60000)
      expect(stats.textContent).toContain("Print time")
      expect(useGeneratorStore.getState().printStats!.layers).toBe(30)
      expect(useGeneratorStore.getState().evidence!.checks.find((c) => c.id === "wall-coverage")!.status).toBe("passed")
      expect(document.querySelector('[data-testid="evidence-check-bed-fit"]')).not.toBeNull()
      expect(document.querySelector('[data-testid="evidence-check-cutting-data"]')).toBeNull()
      expect(useCamStore.getState().gcode).toContain("; Print Start G-code")
    } finally { dispose() }
  }, 120000)

  test("the kernel slices and verifies the same part: release, claims and the program it published", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await find('[data-testid="toolpath-generator"]')
      part()
      useGeneratorStore.getState().updateSettings("machineType", "3dprinter")
      await settle(200)
      await open("cam-kernel-print-section")
      ;(await find('[data-testid="kernel-print-generate"]')).click()
      const evidence = await find('[data-testid="kernel-print-evidence"]')
      await app.wait(() => evidence.textContent?.includes("Verified") || undefined, 60000)
      expect(document.querySelector('[data-testid="kernel-claim-bed-fit"]')).not.toBeNull()
      expect(document.querySelector('[data-testid="kernel-claim-wall-coverage"]')).not.toBeNull()
      expect(useCamStore.getState().kernelArtifact?.release).toBe("verified-program")
      expect(useCamStore.getState().gcode).toContain("M104 S200")
    } finally { dispose() }
  }, 120000)

  test("the ribbon offers printing operations and cannot assign a milling one to a printer", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await find('[data-testid="toolpath-generator"]')
      useGeneratorStore.getState().updateSettings("machineType", "3dprinter")
      await settle(300)
      const vase = await app.wait(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.trim() === "Vase"), 30000)
      vase.click()
      await settle()
      expect(useGeneratorStore.getState().settings.operationType).toBe("vase")
      const contour = [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.trim() === "Contour")
      expect(contour).toBeUndefined()
    } finally { dispose() }
  }, 120000)
})
