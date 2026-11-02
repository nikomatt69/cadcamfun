import { expect, test } from "bun:test"
import { bootLiveApp } from "../../../../test/helpers/live-app.ts"

test("model browser supports keyboard selection and rename", async () => {
  const app = await bootLiveApp()
  const { useElementsStore } = await import("../store/elementsStore.ts")
  const { useSelectionStore } = await import("../store/selectorStore.ts")
  const { t } = await import("../../../i18n/index.ts")
  useElementsStore.getState().addElement({ type: "cube", name: "Keyboard fixture", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 })
  const element = useElementsStore.getState().elements.find((item) => item.name === "Keyboard fixture")!
  const { dispose } = app.visit("/cad")
  try {
    const tab = await app.wait(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === t("cad.explorer")), 60000)
    tab.click()
    const row = await app.wait(() => [...document.querySelectorAll<HTMLElement>('.workstation-browser-row[role="button"]')].find((node) => node.textContent?.includes("Keyboard fixture")), 60000)
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    expect(useSelectionStore.getState().selectedElementIds).toContain(element.id)
    row.dispatchEvent(new KeyboardEvent("keydown", { key: "F2", bubbles: true }))
    const input = await app.wait(() => row.querySelector<HTMLInputElement>(`input[aria-label="${t("browser.elementName")}"]`), 60000)
    input.value = "Renamed fixture"
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    expect(useElementsStore.getState().elements.find((item) => item.id === element.id)?.name).toBe("Renamed fixture")
  } finally {
    dispose()
    await app.dispose()
  }
}, 120000)
