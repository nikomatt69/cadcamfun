/**
 * Project details (legacy look: header, tabs of cards, modals) and what it opens: a drawing loads into the one
 * CAD page, and the CAD / CAM pages have a single bottom bar.
 */
import { afterAll, beforeAll, describe, expect, test, afterEach } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
let projectId = ""
let drawingId = ""
beforeAll(async () => {
  app = await bootLiveApp()
  const project = await app.sidecar.call("/api/projects", { method: "POST", json: { name: "Gearbox", description: "Housing and shafts" } })
  projectId = project.body.id
  const drawing = await app.sidecar.call(`/api/projects/${projectId}/drawings`, {
    method: "POST",
    json: { name: "Housing", description: "Main body", data: { elements: [
      { id: "d-cube", type: "cube", layerId: "gone", x: 0, y: 0, z: 0, width: 40, height: 40, depth: 40 },
      { id: "d-ball", type: "sphere", layerId: "gone", x: 50, y: 0, z: 0, radius: 10 }
    ], version: "1.0" } }
  })
  drawingId = drawing.body.id
})
afterAll(async () => { await app.dispose() })

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 60000)
const byText = (tag: string, text: string): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent?.trim() === text)
const click = async (el: Element | null | undefined): Promise<void> => { (el as HTMLElement).click(); await settle() }

afterEach(() => resetStores())

describe("project details page", () => {
  test("shows the project, its drawings as cards, and the other tabs with their empty states", async () => {
    const { dispose } = app.visit(`/projects/${projectId}`)
    try {
      const page = await find('[data-testid="project-detail"]')
      await app.wait(() => page.textContent?.includes("Gearbox"), 60000)
      expect(page.textContent).toContain("Housing and shafts")
      expect(byText("button", "Edit")).toBeDefined()
      expect(byText("button", "Delete")).toBeDefined()
      expect(page.querySelectorAll('[role="tab"]').length).toBe(3)
      await app.wait(() => page.querySelector(`[data-testid="project-card-${drawingId}"]`), 60000)
      expect(page.textContent).toContain("Main body")
      await click(byText("button", "Components"))
      expect(page.textContent).toContain("No components yet")
      await click(byText("button", "Toolpaths"))
      expect(page.textContent).toContain("No toolpaths yet")
      // No second editor on this page.
      expect(document.querySelector('[data-testid="cad-status-bar"]')).toBeNull()
    } finally { dispose() }
  }, 120000)

  test("a drawing opens in the CAD page, with its elements on a real layer and one bottom bar", async () => {
    const { useElementsStore } = await import("../src/cad/store/elementsStore.ts")
    const { useLayerStore } = await import("../src/cad/store/layerStore.ts")
    const { dispose } = app.visit(`/cad?drawingId=${drawingId}`)
    try {
      await app.wait(() => useElementsStore.getState().elements.some((e) => e.id === "d-cube"), 60000)
      const elements = useElementsStore.getState().elements
      expect(elements.map((e) => e.id)).toEqual(expect.arrayContaining(["d-cube", "d-ball"]))
      const layerIds = new Set(useLayerStore.getState().layers.map((l) => l.id))
      expect(elements.every((e) => layerIds.has(e.layerId))).toBe(true)
      const bar = await find('[data-testid="cad-status-bar"]')
      for (const id of ["status-units", "status-snap", "status-sidecar"]) expect(bar.querySelector(`[data-testid="${id}"]`)).not.toBeNull()
      expect(document.querySelector(".reference-native-statusbar")).toBeNull()
    } finally { dispose() }
  }, 120000)

  test("/drawings/:id is the same CAD page", async () => {
    const { useElementsStore } = await import("../src/cad/store/elementsStore.ts")
    useElementsStore.setState({ elements: [] })
    const { dispose } = app.visit(`/drawings/${drawingId}`)
    try {
      await app.wait(() => useElementsStore.getState().elements.some((e) => e.id === "d-ball"), 60000)
      await find('[data-testid="cad-status-bar"]')
    } finally { dispose() }
  }, 120000)

  test("/cad?projectId= opens the project's newest drawing instead of an empty canvas", async () => {
    const { useElementsStore } = await import("../src/cad/store/elementsStore.ts")
    useElementsStore.setState({ elements: [] })
    const { dispose } = app.visit(`/cad?projectId=${projectId}`)
    try {
      await app.wait(() => useElementsStore.getState().elements.some((e) => e.id === "d-cube"), 60000)
      await find('[data-testid="cad-status-bar"]')
    } finally { dispose() }
  }, 120000)

  test("a new drawing from the modal is created in the project", async () => {
    const { dispose } = app.visit(`/projects/${projectId}`)
    try {
      await app.wait(() => document.querySelector('[data-testid="project-detail"]')?.textContent?.includes("Project Drawings"), 60000)
      await app.wait(() => byText("button", "New Drawing"), 60000)
      await click(byText("button", "New Drawing"))
      const name = await find<HTMLInputElement>('[role="dialog"] input')
      name.value = "Shaft"
      name.dispatchEvent(new window.Event("input", { bubbles: true })); await settle()
      await click(byText("button", "Create Drawing"))
      let created = false
      for (let attempt = 0; attempt < 200 && !created; attempt++) {
        created = ((await app.sidecar.call(`/api/projects/${projectId}/drawings`)).body as Array<{ name: string }>).some((d) => d.name === "Shaft")
        if (!created) await settle(100)
      }
      expect(created).toBe(true)
    } finally { dispose() }
  }, 120000)

  test("an unknown project says so instead of failing silently", async () => {
    const { dispose } = app.visit("/projects/nope")
    try {
      await app.wait(() => document.body.textContent?.includes("Project Not Found"), 60000)
      expect(byText("button", "Back to Projects")).toBeDefined()
    } finally { dispose() }
  }, 120000)
})

describe("the CAM page has the same single bar", () => {
  test("no footer from the shell", async () => {
    const { dispose } = app.visit("/cam")
    try {
      const bar = await find('[data-testid="cam-status-bar"]')
      expect(bar.querySelector('[data-testid="status-sidecar"]')?.textContent).toContain("Ready")
      expect(document.querySelector(".reference-native-statusbar")).toBeNull()
    } finally { dispose() }
  }, 120000)
})
