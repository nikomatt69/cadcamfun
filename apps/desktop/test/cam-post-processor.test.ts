/**
 * The Post-Processor tab end to end (legacy `AdvancedPostProcessorPanel` + the Fanuc / Heidenhain / Generic
 * wrappers): process the editor's G-code for several controllers, options, presets, results, preview.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 30000)
const byText = (tag: string, text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent?.trim() === text)
const clickText = async (tag: string, text: string): Promise<void> => {
  const el = await app.wait(() => byText(tag, text), 30000)
  el.click()
  await settle()
}
const typeInto = async (el: HTMLTextAreaElement, value: string): Promise<void> => {
  el.value = value
  el.dispatchEvent(new window.Event("input", { bubbles: true }))
  await settle()
}
const setSelect = async (el: HTMLSelectElement, value: string): Promise<void> => {
  el.value = value
  el.dispatchEvent(new window.Event("change", { bubbles: true }))
  await settle()
}
const process = async (): Promise<void> => {
  const button = await find<HTMLButtonElement>('[data-testid="process-gcode"]')
  await app.wait(() => !button.disabled)
  button.click()
  await find('[data-testid="post-results"]')
}

/** The tab choice outlives the page (camStore), so make sure the editor is the visible tab before typing. */
const openEditor = async (): Promise<HTMLTextAreaElement> => {
  await clickText("button", "Editor G-Code")
  return app.wait(() => document.querySelector<HTMLTextAreaElement>("textarea"), 30000)
}

const PROGRAM = "G21\nG90\nT1 M6\nS3000 M3\nG0 X0 Y0 Z5\nG1 Z-1 F150\nG1 X10 Y0\nG1 X10 Y10\nG0 Z5\nM5\nM30"

describe("Post-Processor tab", () => {
  test("every controller processes the editor's program; Heidenhain converts, results and preview show", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await typeInto(await openEditor(), PROGRAM)
      await clickText("button", "Post-Processor")
      await find('[data-testid="advanced-post-processor"]')

      // Nothing is processed until the button is pressed; the legacy panel shows no results yet.
      expect(document.querySelector('[data-testid="post-results"]')).toBeNull()
      expect(document.body.textContent).toContain("Advanced Post-Processor")
      expect(document.body.textContent).toContain("Fanuc Specific Options")

      await process()
      expect(document.body.textContent).toContain("Optimization Results")
      expect(document.body.textContent).toContain("Original lines:")
      expect(document.body.textContent).toContain("The optimized G-code passed all safety checks.")

      // Heidenhain: switch the page-level select, the panel follows, options change to the Heidenhain set.
      await setSelect(await find<HTMLSelectElement>("#post-processor-type"), "heidenhain")
      await app.wait(() => document.body.textContent?.includes("Heidenhain Specific Options"))
      expect(document.body.textContent).toContain("Use function blocks (LBL)")
      await process()
      expect(document.body.textContent).toContain("Convertito al formato Heidenhain")
      await clickText("button", "Show Preview")
      const preview = await find('[data-testid="post-preview"]')
      expect(preview.textContent).toContain("BEGIN PGM WORKPIECE MM")
      expect(preview.textContent).toContain("END PGM WORKPIECE MM")
      expect(preview.textContent).toContain("L Z+100 R0 FMAX M2")
      expect(byText("button", "Hide Preview")).toBeDefined()

      // Siemens / Mazak go through the generic pipeline and get the banner.
      await setSelect(await find<HTMLSelectElement>("#post-processor-type"), "mazak")
      await process()
      await clickText("button", "Show Preview").catch(() => {})
      expect(document.body.textContent).toContain("Controller: Mazak")
    } finally {
      // camStore keeps the active tab for the whole process: leave it on the legacy default, with an empty editor, for the other CAM tests.
      await typeInto(await openEditor(), "").catch(() => {})
      dispose()
    }
  }, 90000)

  test("presets set the options, the controller select inside the panel works, the dialects blurb follows", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await typeInto(await openEditor(), PROGRAM)
      await clickText("button", "Post-Processor")
      await find('[data-testid="advanced-post-processor"]')

      const checkbox = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement
      expect(checkbox("useHighSpeedMode").checked).toBe(false)
      await clickText("button", "Speed")
      expect(checkbox("useHighSpeedMode").checked).toBe(true)
      expect(checkbox("removeComments").checked).toBe(true)
      expect(checkbox("fanucUseAI").checked).toBe(true)
      await clickText("button", "Basic")
      expect(checkbox("useHighSpeedMode").checked).toBe(false)
      expect(checkbox("fanucUseAI").checked).toBe(false)

      // A single option toggles.
      checkbox("removeComments").click()
      await settle()
      expect(checkbox("removeComments").checked).toBe(true)

      // Fanuc high-speed + AI shows its block in the output.
      await clickText("button", "Advanced")
      await process()
      await clickText("button", "Show Preview")
      const preview = await find('[data-testid="post-preview"]')
      expect(preview.textContent).toContain("G05.1 Q1 ; Attiva AI Contour Control")
      expect(preview.textContent).toContain("Attivazione modalità Alta Velocità")

      // The in-panel controller select switches the whole panel.
      await setSelect(await find<HTMLSelectElement>('[data-testid="advanced-controller"]'), "okuma")
      await app.wait(() => document.body.textContent?.includes("Okuma Specific Options"))
      expect(document.body.textContent).toContain("Specific optimizations for Okuma controllers include OSP syntax and advanced cycles.")
      expect(document.body.textContent).toContain("Extended options are available only for Fanuc and Heidenhain controllers.")
    } finally {
      // camStore keeps the active tab for the whole process: leave it on the legacy default, with an empty editor, for the other CAM tests.
      await typeInto(await openEditor(), "").catch(() => {})
      dispose()
    }
  }, 90000)
})
