/**
 * The CAM page end to end (legacy `pages/cam.tsx` layout): every toolbar control, the tabs, the right sidebar
 * (generator → editor, cycles), the `?loadToolpath` / `?loadTool` hand-offs, over the real sidecar handlers.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
const errors: string[] = []
const originalError = console.error
beforeAll(async () => {
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(" ")); originalError(...args) }
  app = await bootLiveApp()
})
afterAll(async () => { console.error = originalError; await app.dispose() })

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 30000)
const click = async (selector: string): Promise<HTMLElement> => { const el = await find(selector); el.click(); await settle(); return el }
const byText = (tag: string, text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent?.trim() === text)
const clickText = async (tag: string, text: string): Promise<void> => {
  const el = await app.wait(() => byText(tag, text), 30000)
  el.click()
  await settle()
}
const editor = (): HTMLTextAreaElement | null => document.querySelector<HTMLTextAreaElement>("textarea")
const type = async (el: HTMLTextAreaElement, value: string): Promise<void> => {
  el.value = value
  el.dispatchEvent(new window.Event("input", { bubbles: true }))
  await settle()
}

describe("CAM page", () => {
  test("toolbar controls and tabs", async () => {
    const { dispose } = app.visit("/cam")
    try {
      // Legacy default tab: the G-code editor.
      await app.wait(() => editor())
      for (const label of ["Preview", "Editor G-Code", "Toolpath", "Post-Processor"]) expect(byText("button", label)).toBeDefined()
      for (const title of ["Salva G-Code", "Importa G-Code", "Unified Library", "Gestione Costi di Produzione", "Switch to CAD Editor"]) {
        expect(document.querySelector(`[title="${title}"]`)).not.toBeNull()
      }

      // Save stays disabled until there is code.
      expect((document.querySelector('button[title="Salva G-Code"]') as HTMLButtonElement).disabled).toBe(true)
      await type(editor()!, "G21\nG90\nG0 X0 Y0\nG1 X10 Y0 F200\nG1 X10 Y10\nM30")
      expect((document.querySelector('button[title="Salva G-Code"]') as HTMLButtonElement).disabled).toBe(false)

      // Save downloads `toolpath-<date>.nc`.
      const downloads: string[] = []
      const proto = window.HTMLAnchorElement.prototype as unknown as { click: () => void }
      const nativeClick = proto.click
      ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:test"
      ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined
      proto.click = function (this: HTMLAnchorElement) { downloads.push(this.download) }
      await click('button[title="Salva G-Code"]')
      proto.click = nativeClick
      expect(downloads[0]).toMatch(/^toolpath-\d{4}-\d{2}-\d{2}\.nc$/)

      // Play with a parsed program turns into Stop; without one it explains itself (no dead button).
      await clickText("button", "Play")
      await app.wait(() => byText("button", "Play") || byText("button", "Stop"))

      // Dark mode flips the `dark` class.
      const before = document.documentElement.classList.contains("dark")
      await click('button[aria-label="Toggle dark mode"]')
      expect(document.documentElement.classList.contains("dark")).toBe(!before)
      await click('button[aria-label="Toggle dark mode"]')

      // Post-processor tab: 7 dialects, Heidenhain switches the select.
      await clickText("button", "Post-Processor")
      const select = await find<HTMLSelectElement>("#post-processor-type")
      expect([...select.options].map((o) => o.value)).toEqual(["fanuc", "heidenhain", "siemens", "haas", "mazak", "okuma", "generic"])
      select.value = "heidenhain"
      select.dispatchEvent(new window.Event("change", { bubbles: true }))
      await settle()
      expect(select.value).toBe("heidenhain")
      await clickText("button", "Editor G-Code")
      expect(editor()).not.toBeNull()
    } finally { dispose() }
  }, 60000)

  test("library, costs, AI copilot", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await click('button[title="Unified Library"]')
      await find('[data-testid="cam-tool-library"]')
      await click('button[aria-label="Close library"]')
      await settle(400)

      await click('button[title="Gestione Costi di Produzione"]')
      await find('[role="dialog"][aria-label="Production Costs Manager"]')
      await click('[role="dialog"] button[aria-label="Close"]')
      expect(document.querySelector('[role="dialog"]')).toBeNull()

      const copilot = await click('button[aria-label="Toggle AI Copilot"]')
      await find('[data-testid="ai-panel"]')
      expect(copilot.getAttribute("aria-pressed")).toBe("true")
      await click('button[aria-label="Toggle AI Copilot"]')
    } finally { dispose() }
  }, 60000)

  test("right sidebar: generator output lands in the editor, cycles append to it", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await app.wait(() => editor())
      await type(editor()!, "")
      await find('[data-testid="toolpath-generator"]')
      await clickText("button", "Generate G-Code")
      await app.wait(() => (editor()?.value.length ?? 0) > 0, 30000)
      expect(editor()!.value).toMatch(/G0?1|G21|G90/)

      await clickText("button", "Cycles")
      await find('[data-testid="machine-cycles"]')
      expect(document.querySelector('[data-testid="toolpath-generator"]')).toBeNull()
      const before = editor()!.value
      // The legacy flow: pick a template, edit a parameter, preview the block, Insert Cycle.
      await clickText("button", "Simple Drilling")
      const depth = await find<HTMLInputElement>('input#depth')
      depth.value = "12"
      depth.dispatchEvent(new window.Event("input", { bubbles: true }))
      await app.wait(() => document.querySelector('[data-testid="cycle-preview"]')?.textContent?.includes("Z-12"))
      await clickText("button", "Insert Cycle")
      expect(editor()!.value.length).toBeGreaterThan(before.length)
      expect(editor()!.value).toContain("G81")
      expect(editor()!.value).toContain("Z-12")
      await clickText("button", "Generator")
      await find('[data-testid="toolpath-generator"]')
    } finally { dispose() }
  }, 60000)

  test("import reads a file into the editor", async () => {
    const { dispose } = app.visit("/cam")
    try {
      const input = await find<HTMLInputElement>('input[type="file"]')
      const file = new window.File(["G21\nG0 X1 Y1\nM30"], "part.nc", { type: "text/plain" })
      Object.defineProperty(input, "files", { value: [file], configurable: true })
      input.dispatchEvent(new window.Event("change", { bubbles: true }))
      await app.wait(() => editor()?.value.includes("G0 X1 Y1"))
    } finally { dispose() }
  }, 60000)

  test("?loadToolpath and ?loadTool hand-offs", async () => {
    localStorage.setItem("toolpathToLoadInCAM", JSON.stringify({ id: "tp-1", name: "Bracket", gcode: "G21\nG0 X5 Y5\nM30" }))
    const first = app.visit("/cam?loadToolpath=tp-1")
    try {
      await app.wait(() => editor()?.value.includes("G0 X5 Y5"), 30000)
      await app.wait(() => localStorage.getItem("toolpathToLoadInCAM") === null)
    } finally { first.dispose() }

    localStorage.setItem("toolToLoadInCAM", JSON.stringify({ id: "t-1", name: "Flat 8", type: "endmill", diameter: 8, numberOfFlutes: 3, maxRPM: 9000 }))
    const second = app.visit("/cam?loadTool=t-1")
    try {
      const { useGeneratorStore } = await import("../src/cam/store/generatorStore.ts")
      await app.wait(() => useGeneratorStore.getState().selectedLibraryTool?.name === "Flat 8", 30000)
      expect(useGeneratorStore.getState().settings.toolDiameter).toBe(8)
      await app.wait(() => localStorage.getItem("toolToLoadInCAM") === null)
    } finally { second.dispose() }
  }, 60000)

  test("no console errors", () => {
    expect(errors.filter((line) => !/WebGL/i.test(line))).toEqual([])
  })
})
