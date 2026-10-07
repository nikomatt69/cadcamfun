/**
 * The docked AI panel (spec 06-desktop-ui.md §1) has to be reachable from the two
 * workspace screens, where the reference's activity bar is hidden: the CAD assistant
 * button (bottom-right of the canvas) and the CAM toolbar's "Toggle AI Copilot"
 * both open it, and the panel can be dismissed from inside.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const panel = (): Element | null => document.querySelector('[data-testid="ai-panel"]')

/** Waits for a control, clicks it and lets Solid flush the state change. */
const click = async (selector: string): Promise<HTMLElement> => {
  const control = await app.wait(() => document.querySelector<HTMLElement>(selector), 30000)
  control.click()
  await new Promise((resolve) => setTimeout(resolve, 50))
  return control
}

describe("docked AI panel", () => {
  test("the CAD assistant button opens it and the panel closes itself", async () => {
    const { dispose } = app.visit("/cad")
    try {
      expect(panel()).toBeNull()
      const button = await click('button[title="Show CAD Assistant"]')
      await app.wait(() => panel())
      expect(panel()).not.toBeNull()
      // The button tracks the panel it toggles.
      expect(button.getAttribute("title")).toBe("Hide CAD Assistant")

      await click('button[title="Close the AI panel"]')
      expect(panel()).toBeNull()
      expect(button.getAttribute("title")).toBe("Show CAD Assistant")
    } finally { dispose() }
  }, 60000)

  test("the CAM Toggle AI Copilot button opens it", async () => {
    const { dispose } = app.visit("/cam")
    try {
      expect(panel()).toBeNull()
      const button = await click('button[aria-label="Toggle AI Copilot"]')
      await app.wait(() => panel())
      expect(panel()).not.toBeNull()
      expect(button.getAttribute("aria-pressed")).toBe("true")
      expect(button.getAttribute("title")).toBe("Disable AI Copilot")
    } finally { dispose() }
  }, 60000)
})
