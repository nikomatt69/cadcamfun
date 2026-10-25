/**
 * The Resources detail pages (materials, tools, machines, components) in the CAM workspace style: the overview
 * shows the record, Edit saves through the typed client, and the record is removed from the list.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
let projectId = ""
let materialId = ""
let toolId = ""
let machineId = ""
let componentId = ""
beforeAll(async () => {
  app = await bootLiveApp()
  projectId = (await app.sidecar.call("/api/projects", { method: "POST", json: { name: "Resources" } })).body.id
  materialId = (await app.sidecar.call("/api/materials", { method: "POST", json: { name: "Brass Alloy", properties: { density: 8500, hardness: 80, color: "#d4af37" } } })).body.id
  toolId = (await app.sidecar.call("/api/tools", { method: "POST", json: { name: "Endmill 6", type: "endmill", diameter: 6, material: "carbide", numberOfFlutes: 3 } })).body.id
  machineId = (await app.sidecar.call("/api/machine-configs", { method: "POST", json: { name: "Haas VF2", type: "mill", config: { workVolume: { x: 508, y: 406, z: 635 }, maxSpindleSpeed: 12000, maxFeedRate: 10000, controller: "fanuc" } } })).body.data.id
  componentId = (await app.sidecar.call(`/api/projects/${projectId}/components`, { method: "POST", json: { name: "Bracket", type: "mechanical", data: {} } })).body.id
})
afterAll(async () => { await app.dispose() })

// Each page mounts the whole shell (AI status, analytics, profile) before its own data, so give it room.
const PAGE_TIMEOUT = 20000

const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 30000)
const toolbarButton = (text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(".cam-workspace button")].find((el) => el.textContent?.trim() === text)
const byText = (tag: string, text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent?.trim() === text)

describe("resource detail pages", () => {
  test("material shows its record in the workspace chrome", async () => {
    resetStores()
    const { dispose } = app.visit(`/materials/${materialId}`)
    try {
      await find(".cam-workspace")
      expect(await app.wait(() => byText("h1", "Brass Alloy"), 30000)).toBeDefined()
      expect(document.querySelector(".workstation-toolbar")).not.toBeNull()
      for (const label of ["Overview", "Details", "Raw data"]) expect(byText("button", label)).toBeDefined()
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("tool shows diameter and flutes in the overview", async () => {
    resetStores()
    const { dispose } = app.visit(`/tools/${toolId}`)
    try {
      await find(".cam-workspace")
      expect(await app.wait(() => byText("h1", "Endmill 6"), 30000)).toBeDefined()
      const diameter = await app.wait(() => byText("dt", "Diameter"), 30000)
      expect(diameter.nextElementSibling?.textContent?.trim()).toBe("6 mm")
      expect(byText("dt", "Flutes")?.nextElementSibling?.textContent?.trim()).toBe("3")
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("machine reads its status and controller from the config", async () => {
    resetStores()
    const { dispose } = app.visit(`/machine/${machineId}`)
    try {
      await find(".cam-workspace")
      expect(await app.wait(() => byText("h1", "Haas VF2"), 30000)).toBeDefined()
      const controller = await app.wait(() => byText("dt", "Controller"), 30000)
      expect(controller.nextElementSibling?.textContent?.trim()).toBe("fanuc")
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("a machine lists every figure of its profile in sections and draws its envelope", async () => {
    resetStores()
    const { dispose } = app.visit(`/machine/${machineId}`)
    try {
      await app.wait(() => byText("h1", "Haas VF2"), 30000)
      expect(await find("[data-testid='machine-preview']")).toBeDefined()
      toolbarButton("Details")?.click()
      const sections = await find("[data-testid='machine-sections']")
      expect(sections.textContent).toContain("Spindle")
      expect(sections.textContent).toContain("12000 rpm")
      expect(sections.textContent).toContain("508 × 406 × 635 mm")
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("a built-in machine opens read-only and can be duplicated into the person's own configurations", async () => {
    resetStores()
    const builtin = (await app.sidecar.call("/api/machine-configs/defaults")).body.data[0] as { id: string; name: string }
    const { dispose } = app.visit(`/machine/${encodeURIComponent(builtin.id)}`)
    // The router pushes an undefined state on navigation, which the test DOM's history cannot hold; the browser takes it.
    const push = window.history.pushState.bind(window.history)
    window.history.pushState = (state: unknown, title: string, url?: string | URL | null) => push(state ?? {}, title, url)
    try {
      await app.wait(() => byText("h1", builtin.name), 30000)
      expect(toolbarButton("Edit")).toBeUndefined()
      expect(toolbarButton("Delete")).toBeUndefined()
      toolbarButton("Duplicate")!.click()
      const copy = await app.wait(() => byText("h1", `${builtin.name} (copy)`), 30000)
      expect(copy).toBeDefined()
      expect(toolbarButton("Edit")).toBeDefined()
      // The copy states what the preset states: its spindle ceiling and feed in the library's own keys, no invented volume.
      const copies = (await app.sidecar.call("/api/machine-configs")).body.data.data as Array<{ name: string; config: Record<string, unknown> }>
      const stored = copies.find((row) => row.name === `${builtin.name} (copy)`)!
      expect(stored.config["maxSpindleSpeed"]).toBe(12000)
      expect(stored.config["workVolume"]).toBeUndefined()
    } finally { window.history.pushState = push; dispose() }
  }, PAGE_TIMEOUT)

  test("component opens on its page", async () => {
    resetStores()
    const { dispose } = app.visit(`/components/${componentId}`)
    try {
      await find(".cam-workspace")
      expect(await app.wait(() => byText("h1", "Bracket"), 30000)).toBeDefined()
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("component resource preserves nested structure and exposes the reference preview tabs", async () => {
    const data = { elements: [{ id: "assembly", type: "component", name: "Assembly", layerId: "default", elements: [
      { id: "plate", type: "cube", name: "Base plate", width: 30, height: 20, depth: 5, layerId: "default" },
      { id: "insert", type: "component", name: "Insert", layerId: "default", elements: [{ id: "pin", name: "Pin", type: "cylinder", radius: 2, height: 10, layerId: "default" }] }
    ] }] }
    const row = (await app.sidecar.call(`/api/projects/${projectId}/components`, { method: "POST", json: { name: "Nested assembly", type: "composite", data } })).body
    const view = app.visit(`/components/${row.id}`)
    try {
      await app.wait(() => byText("h1", "Nested assembly"), 30_000)
      expect(document.querySelector("[data-testid='resource-geometry-preview']")).not.toBeNull()
      byText("button", "Structure")!.click()
      const structure = await find("[data-testid='component-resource-structure']")
      expect(structure.textContent).toContain("Elements: 4")
      for (const name of ["Assembly", "Base plate", "Insert", "Pin"]) expect(structure.textContent).toContain(name)
      byText("button", "Preview")!.click()
      await find("[data-testid='resource-geometry-preview']")
      expect((await app.sidecar.call(`/api/components/${row.id}`)).body.data).toEqual(data)
    } finally { view.dispose() }
  }, PAGE_TIMEOUT)

  test("a tool resource is drawn in 3D from its type and properties, and saves its shape (spec 31)", async () => {
    resetStores()
    const { dispose } = app.visit(`/tools/${toolId}`)
    try {
      await find(".cam-workspace")
      await app.wait(() => byText("h1", "Endmill 6"), 30000)
      const description = await find('[data-testid="tool-preview-description"]')
      expect(description.textContent).toContain("flat Ø6, 3 flutes")
      expect(document.querySelector('[data-testid="tool-preview-assumed"]')!.textContent).toContain("cuttingLength")
      toolbarButton("Edit")?.click()
      await settle()
      toolbarButton("Details")?.click()
      await settle()
      const type = await find<HTMLSelectElement>("#res-type")
      expect([...type.querySelectorAll("optgroup")].map((g) => g.getAttribute("label"))).toEqual(["Milling", "Turning", "3D printing nozzle"])
      type.value = "bullnose"
      type.dispatchEvent(new window.Event("change", { bubbles: true }))
      await settle()
      const corner = await find<HTMLInputElement>("#res-corner")
      // A dimension field: comma decimals are typed as written.
      corner.value = "1,5"
      corner.dispatchEvent(new window.Event("input", { bubbles: true }))
      await settle()
      expect(await app.wait(() => [...document.querySelectorAll('[data-testid="tool-preview-description"]')].find((el) => el.textContent?.includes("bull Ø6") && el.textContent.includes("r1.5")) ?? undefined, 15000)).toBeDefined()
      toolbarButton("Save")?.click()
      await settle(400)
      const { body } = await app.sidecar.call(`/api/tools/${toolId}`)
      expect(body.type).toBe("bullnose")
      expect(body.cornerRadius).toBe(1.5)
      // What the CAM preview draws for this resource is the same model.
      const { cam } = await import("@cadcamfun/core")
      expect(cam.describeTool(cam.toolModelOf(body, "mill"))).toContain("bull Ø6")
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("Edit saves the material through the typed client", async () => {
    resetStores()
    const { dispose } = app.visit(`/materials/${materialId}`)
    try {
      await find(".cam-workspace")
      await app.wait(() => byText("h1", "Brass Alloy"), 30000)
      // The shell's menu bar also has an "Edit" button, so the page's own buttons are looked up inside the workspace.
      toolbarButton("Edit")?.click()
      await settle()
      toolbarButton("Details")?.click()
      await settle()
      const nameInput = await app.wait(() => document.querySelector<HTMLInputElement>("#res-name") ?? null, 15000).catch((cause: unknown) => {
        const buttons = [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter(Boolean).join(" | ")
        throw new Error(`no #res-name; buttons: ${buttons}; cause: ${String(cause).slice(0, 120)}`)
      })
      nameInput.value = "Brass Alloy 360"
      nameInput.dispatchEvent(new window.Event("input", { bubbles: true }))
      await settle()
      toolbarButton("Save")?.click()
      await settle(400)
      const { body } = await app.sidecar.call(`/api/materials/${materialId}`)
      expect(body.name).toBe("Brass Alloy 360")
    } finally { dispose() }
  }, PAGE_TIMEOUT)
})
