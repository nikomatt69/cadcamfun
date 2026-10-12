/**
 * The CAD workspace reaches the custom element editor: its toolbar button opens the dialog, and
 * "Add to scene" puts the authored element on the canvas.
 */
import { afterAll, beforeAll, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const wait = (selector: string): Promise<HTMLElement> => app.wait(() => document.querySelector<HTMLElement>(selector), 30000)
const text = (): string => document.body.textContent ?? ""

test("the CAD toolbar opens the custom element editor", async () => {
  resetStores()
  const { dispose } = app.visit("/cad")
  try {
    const button = await wait('button[title="Custom Elements"]')
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 400))

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog, "the editor opens as a dialog").not.toBeNull()
    expect(text()).toContain("Create Custom Element")
    expect(text()).toContain("Live Preview")
    expect(text()).toContain("Valid")
  } finally { dispose() }
})

test("add to scene places the authored element on the canvas", async () => {
  resetStores()
  const { dispose } = app.visit("/cad")
  try {
    await wait(".workstation-toolbar")
    ;(await wait('button[title="Custom Elements"]')).click()
    await new Promise((resolve) => setTimeout(resolve, 400))

    const addToScene = [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent?.trim() === "Add to scene")
    expect(addToScene, "the editor can add the element to the drawing").toBeDefined()
    addToScene?.click()
    await new Promise((resolve) => setTimeout(resolve, 300))

    const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
    const placed = useElementsStore.getState().elements.filter((element) => element.type === "custom")
    expect(placed.length, "a custom element was added to the drawing").toBeGreaterThan(0)
    expect(placed[0]?.name).toBe("New Custom Element")
  } finally { dispose() }
})
