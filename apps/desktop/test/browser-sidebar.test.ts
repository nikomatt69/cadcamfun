/**
 * The model browser (Fusion / Creo style) in the CAD and the CAM sidebar, and the thin status strips:
 * the same functions in both places, over the real stores.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, afterEach } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 60000)
const click = async (el: Element | null | undefined): Promise<void> => { (el as HTMLElement).click(); await settle() }
const byLabel = (label: string): HTMLElement => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!
const stores = async () => ({
  elements: (await import("../src/features/cad/store/elementsStore.ts")).useElementsStore,
  layers: (await import("../src/features/cad/store/layerStore.ts")).useLayerStore,
  selection: (await import("../src/features/cad/store/selectorStore.ts")).useSelectionStore,
  cad: (await import("../src/features/cad/store/cadStore.ts")).useCADStore
})
const names = (): string[] => [...document.querySelectorAll("[data-testid^='browser-section-'] [title='Double-click to rename']")].map((el) => el.textContent ?? "")

beforeEach(async () => {
  const { elements, selection } = await stores()
  selection.getState().clearSelection()
  for (const element of [...elements.getState().elements]) elements.getState().deleteElement(element.id)
  window.confirm = () => true
})

const seed = async (): Promise<{ readonly cube: string; readonly circle: string; readonly group?: string }> => {
  const { elements } = await stores()
  const cube = elements.getState().addElement({ type: "cube", name: "Block", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 })
  const circle = elements.getState().addElement({ type: "circle", name: "Hole", x: 5, y: 5, z: 0, radius: 2 })
  return { cube, circle }
}

for (const route of ["/cad", "/cam"] as const) {
  describe(`${route} sidebar browser`, () => {
    const open = async () => {
      const visit = app.visit(route)
      if (route === "/cam") {
        // The CAM explorer lives under the sidebar's "Explorer" tab.
        const tab = await app.wait(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.trim() === "Explorer"), 60000)
        tab.click(); await settle()
      }
      await find('[data-testid="browser-toolbar"]')
      return visit
    }

    test("sections by type, with the Document & Origin block and its toggles", async () => {
      await seed()
      const { dispose } = await open()
      try {
        await app.wait(() => document.querySelector('[data-testid="browser-section-bodies"]'), 60000)
        expect(document.querySelector('[data-testid="browser-section-sketches"]')).not.toBeNull()
        expect(document.querySelector('[data-testid="browser-section-bodies"]')?.textContent).toContain("Block")
        expect(document.querySelector('[data-testid="browser-section-sketches"]')?.textContent).toContain("Hole")
        const { cad } = await stores()
        const before = cad.getState().gridVisible
        await click(await find('[data-testid="browser-toggle-grid"]'))
        expect(cad.getState().gridVisible).toBe(!before)
        await click(await find('[data-testid="browser-toggle-grid"]'))
      } finally { dispose() }
    }, 120000)

    test("rename, lock, hide, duplicate and delete from the row", async () => {
      const ids = await seed()
      const { elements } = await stores()
      const { dispose } = await open()
      try {
        await app.wait(() => names().includes("Block"), 60000)
        // Rename in place.
        const label = [...document.querySelectorAll<HTMLElement>("[title='Double-click to rename']")].find((el) => el.textContent === "Block")!
        label.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true })); await settle()
        const input = await find<HTMLInputElement>('input[aria-label="Element name"]')
        input.value = "Base plate"
        input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await settle()
        expect(elements.getState().elements.find((e) => e.id === ids.cube)?.name).toBe("Base plate")

        const row = await find(`[data-testid="row-actions-${ids.cube}"]`)
        await click(row.querySelector('[aria-label="Lock"]'))
        expect(elements.getState().elements.find((e) => e.id === ids.cube)?.locked).toBe(true)
        await click(document.querySelector(`[data-testid="row-actions-${ids.cube}"] [aria-label="Unlock"]`))
        expect(elements.getState().elements.find((e) => e.id === ids.cube)?.locked).toBe(false)

        await click(document.querySelector(`[data-testid="row-actions-${ids.cube}"] [aria-label="Hide"]`))
        expect(elements.getState().elements.find((e) => e.id === ids.cube)?.visible).toBe(false)
        await click(document.querySelector('[aria-label="Show all"]'))
        expect(elements.getState().elements.find((e) => e.id === ids.cube)?.visible).not.toBe(false)

        const count = elements.getState().elements.length
        await click(document.querySelector(`[data-testid="row-actions-${ids.circle}"] [aria-label="Duplicate"]`))
        expect(elements.getState().elements.length).toBe(count + 1)
        await click(document.querySelector(`[data-testid="row-actions-${ids.circle}"] [aria-label="Delete"]`))
        expect(elements.getState().elements.some((e) => e.id === ids.circle)).toBe(false)
      } finally { dispose() }
    }, 120000)

    test("ask the assistant about the selection: disabled without one, opens the panel with one", async () => {
      const ids = await seed()
      const { selection } = await stores()
      app.state.setPanelOpen(false)
      const { dispose } = await open()
      try {
        await app.wait(() => names().includes("Block"), 60000)
        expect((byLabel("Ask AI") as HTMLButtonElement).disabled).toBe(true)
        selection.getState().selectMultiple([ids.cube])
        await settle()
        expect((byLabel("Ask AI") as HTMLButtonElement).disabled).toBe(false)
        await click(byLabel("Ask AI"))
        expect(app.state.panelOpen()).toBe(true)
      } finally { dispose(); app.state.setPanelOpen(false) }
    }, 120000)

    test("isolate selection, group and the layer view with its own bulk toggles", async () => {
      const ids = await seed()
      const { elements, selection, layers } = await stores()
      const { dispose } = await open()
      try {
        await app.wait(() => names().includes("Block"), 60000)
        selection.getState().selectMultiple([ids.cube])
        await settle()
        await click(byLabel("Isolate selection"))
        expect(elements.getState().elements.find((e) => e.id === ids.circle)?.visible).toBe(false)
        await click(byLabel("Show all"))

        // Layer view: a new layer appears at once, and its eye toggles the layer.
        const mode = byLabel("Group elements") as HTMLSelectElement
        mode.value = "layer"; mode.dispatchEvent(new window.Event("change", { bubbles: true })); await settle()
        await click(byLabel("New layer"))
        const added = layers.getState().layers.at(-1)!
        expect(document.querySelector(`[data-testid="browser-section-${added.id}"]`)).not.toBeNull()
        await click(byLabel(`Toggle visibility of ${added.name}`))
        expect(layers.getState().layers.find((l) => l.id === added.id)?.visible).toBe(false)
        await click(byLabel(`Delete ${added.name}`))
        expect(layers.getState().layers.some((l) => l.id === added.id)).toBe(false)
        mode.value = "kind"; mode.dispatchEvent(new window.Event("change", { bubbles: true })); await settle()
      } finally { dispose() }
    }, 120000)
  })
}

afterEach(() => resetStores())

describe("status strips", () => {
  test("CAD: one thin row with the view toggles, counts and cursor", async () => {
    await seed()
    const { dispose } = app.visit("/cad")
    try {
      const bar = await find('[data-testid="cad-status-bar"]')
      expect(bar.className).toContain("h-6")
      expect(bar.className).toContain("whitespace-nowrap")
      for (const label of ["Mode", "Tool", "Elements"]) expect(bar.textContent).toContain(label)
      const { cad } = await stores()
      const dims = cad.getState().showDimensions
      await click(bar.querySelector('[data-testid="status-dims"]'))
      expect(cad.getState().showDimensions).toBe(!dims)
      await click(bar.querySelector('[data-testid="status-dims"]'))
    } finally { dispose() }
  }, 120000)

  test("CAM: the program, tool, controller and the verification verdict", async () => {
    const { dispose } = app.visit("/cam")
    try {
      const bar = await find('[data-testid="cam-status-bar"]')
      expect(bar.className).toContain("h-6")
      expect(bar.querySelector('[data-testid="status-verify"]')?.textContent).toContain("not run")
      expect(bar.textContent).toContain("Lines")
      expect(bar.textContent).toContain("Post")
    } finally { dispose() }
  }, 120000)
})

// Exercise the controls moved into generator-style disclosures, over the same live stores.
describe("sidebar controls", () => {
  const tab = async (sidebar: Element, label: string) => {
    const button = sidebar.querySelector<HTMLButtonElement>(`.sidebar-tabs button[aria-label="${label}"]`)!
    button.click()
    await settle()
  }
  const input = async (selector: string, value: string) => {
    const field = await find<HTMLInputElement>(selector)
    field.value = value
    field.dispatchEvent(new window.Event("input", { bubbles: true }))
    await settle()
  }

  test("CAD tools, layer editing, keyboard disclosure and collapsed tabs remain usable", async () => {
    const { dispose } = app.visit("/cad")
    try {
      const sidebar = await find(".cad-workspace__sidebar")
      await tab(sidebar, "Tools")
      const section = sidebar.querySelector<HTMLElement>(".panel-section")!
      const header = section.querySelector<HTMLElement>('[role="button"]')!
      expect(header.getAttribute("aria-expanded")).toBe("true")
      header.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true }))
      expect(header.getAttribute("aria-expanded")).toBe("false")
      header.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      expect(header.getAttribute("aria-expanded")).toBe("true")
      expect(section.querySelector(".sidebar-tool")).not.toBeNull()

      await tab(sidebar, "Layers")
      sidebar.querySelector<HTMLButtonElement>('[aria-label="Add layer"]')!.click()
      await input('input[placeholder="Layer name"]', "Sidebar fixture")
      sidebar.querySelector<HTMLInputElement>('input[placeholder="Layer name"]')!.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      const { layers } = await stores()
      expect(layers.getState().layers.some((layer) => layer.name === "Sidebar fixture")).toBe(true)
      const row = [...sidebar.querySelectorAll<HTMLElement>(".sidebar-layer")].find((row) => row.textContent?.includes("Sidebar fixture"))!
      row.querySelector<HTMLButtonElement>('[title="Edit Layer"]')!.click()
      const name = row.querySelector<HTMLInputElement>('input[type="text"]')!
      name.value = "Renamed fixture"
      name.dispatchEvent(new window.Event("input", { bubbles: true }))
      row.querySelector<HTMLButtonElement>('[aria-label="Save layer"]')!.click()
      expect(layers.getState().layers.some((layer) => layer.name === "Renamed fixture")).toBe(true)

      sidebar.querySelector<HTMLButtonElement>(".sidebar-footer button")!.click()
      expect(sidebar.getAttribute("data-open")).toBe("false")
      await tab(sidebar, "Explorer")
      expect(sidebar.getAttribute("data-open")).toBe("true")
      expect(sidebar.querySelector('[data-testid="browser-toolbar"]')).not.toBeNull()
    } finally { dispose() }
  }, 120000)

  test("CAM stock, origin, view and snapping retain their values across disclosures", async () => {
    const { dispose } = app.visit("/cam")
    try {
      const sidebar = await find(".cam-workspace__sidebar")
      await find("#cam-stock-x")
      await input("#cam-stock-x", "40/2+3")
      await input("#workspace-origin-x", "-12,5")
      const { useCamStore } = await import("../src/features/cam/store/camStore.ts")
      const { cad } = await stores()
      expect(useCamStore.getState().workpiece.x).toBe(23)
      expect(cad.getState().originOffset.x).toBe(-12.5)
      const header = sidebar.querySelector<HTMLElement>('#cam-workpiece [role="button"]')!
      header.click()
      expect(document.querySelector("#cam-stock-x")).toBeNull()
      header.click()
      expect(document.querySelector<HTMLInputElement>("#cam-stock-x")!.value).toBe("23")

      await tab(sidebar, "Settings")
      const before = cad.getState().gridVisible
      sidebar.querySelector<HTMLInputElement>("#cam-view-grid")!.click()
      expect(cad.getState().gridVisible).toBe(!before)
      const snapping = sidebar.querySelector<HTMLInputElement>('#cam-snap input[type="checkbox"]')!
      const enabled = snapping.checked
      snapping.click()
      expect(sidebar.querySelector<HTMLInputElement>('#cam-snap input[type="checkbox"]')!.checked).toBe(!enabled)
      sidebar.querySelector<HTMLButtonElement>(".sidebar-footer button")!.click()
      await tab(sidebar, "Machine")
      expect(sidebar.getAttribute("data-open")).toBe("true")
      expect(document.querySelector<HTMLInputElement>("#cam-stock-x")!.value).toBe("23")
    } finally { dispose() }
  }, 120000)
})
