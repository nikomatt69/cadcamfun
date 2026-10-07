/**
 * The draggable "CAD Tools" window has to stay on the drawing surface: it used to be
 * `position: fixed` in viewport coordinates, which inside the shell lands under the
 * title bar / status bar / docked AI panel (and an ancestor's `transform` or
 * `backdrop-filter` rebases `fixed` anyway, so it could fall off the canvas).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

/** Waits for a control, clicks it and lets Solid flush the state change. */
const click = async (selector: string): Promise<HTMLElement> => {
  const control = await app.wait(() => document.querySelector<HTMLElement>(selector), 30000)
  control.click()
  await new Promise((resolve) => setTimeout(resolve, 50))
  return control
}

const windowBox = (): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>("div")].find((el) =>
    (el.getAttribute("style") ?? "").includes("position: absolute")
    && (el.textContent ?? "").includes("CAD Tools")
    && (el.textContent ?? "").includes("Basic Primitives"))

describe("CAD floating toolbar", () => {
  test("floats inside the canvas instead of over the viewport", async () => {
    const { dispose } = app.visit("/cad")
    try {
      await app.wait(() => document.body.textContent?.includes("Quick Navigation"), 30000)
      const toolbar = await app.wait(() => windowBox(), 30000)
      expect(toolbar, "the CAD Tools window renders").toBeDefined()

      const style = toolbar.getAttribute("style") ?? ""
      expect(style).toContain("position: absolute")
      expect(style).not.toContain("position: fixed")
      expect(style).toMatch(/left: \d+px/)
      expect(style).toMatch(/top: \d+px/)
      expect(style).toContain("z-index: 1000")

      // Containing block = the canvas panel (relative + rounded): the window can
      // neither leave the drawing surface nor slide under the shell chrome.
      const host = toolbar.parentElement
      expect(host?.className ?? "").toContain("relative")
      expect(host?.className ?? "").toContain("rounded-2xl")
      expect(host?.className ?? "").not.toContain("h-screen")

      // The page fits its shell container: no 100vw/100vh box to scroll sideways.
      expect(document.querySelector(".h-screen.w-screen")).toBeNull()
      expect(document.querySelector(".reference-workspace-container .h-full.w-full")).not.toBeNull()
    } finally {
      dispose()
    }
  }, 60000)

  test("the toolbar wrench button hides and restores it", async () => {
    const { dispose } = app.visit("/cad")
    try {
      await app.wait(() => document.body.textContent?.includes("Quick Navigation"), 30000)
      await app.wait(() => windowBox(), 30000)

      await click("button[title='Hide Floating Toolbar']")
      await app.wait(() => !windowBox(), 15000)
      expect(windowBox()).toBeUndefined()

      await click("button[title='Show Floating Toolbar']")
      await app.wait(() => windowBox(), 15000)
      expect(windowBox()).toBeDefined()
    } finally {
      dispose()
    }
  }, 60000)
})
