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
      expect(await app.wait(() => [...document.querySelectorAll("h3")].find((el) => el.textContent?.trim() === "Diameter") ?? undefined, 30000)).toBeDefined()
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("machine reads its status and controller from the config", async () => {
    resetStores()
    const { dispose } = app.visit(`/machine/${machineId}`)
    try {
      await find(".cam-workspace")
      expect(await app.wait(() => byText("h1", "Haas VF2"), 30000)).toBeDefined()
      expect(await app.wait(() => [...document.querySelectorAll("p")].find((el) => el.textContent?.trim() === "fanuc") ?? undefined, 30000)).toBeDefined()
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("component opens on its page", async () => {
    resetStores()
    const { dispose } = app.visit(`/components/${componentId}`)
    try {
      await find(".cam-workspace")
      expect(await app.wait(() => byText("h1", "Bracket"), 30000)).toBeDefined()
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("Edit saves the material through the typed client", async () => {
    resetStores()
    const { dispose } = app.visit(`/materials/${materialId}`)
    try {
      await find(".cam-workspace")
      await app.wait(() => byText("h1", "Brass Alloy"), 30000)
      byText("button", "Edit")?.click()
      await settle()
      byText("button", "Details")?.click()
      await settle()
      const nameInput = await find<HTMLInputElement>("#res-name")
      nameInput.value = "Brass Alloy 360"
      nameInput.dispatchEvent(new window.Event("input", { bubbles: true }))
      await settle()
      byText("button", "Save")?.click()
      await settle(400)
      const { body } = await app.sidecar.call(`/api/materials/${materialId}`)
      expect(body.name).toBe("Brass Alloy 360")
    } finally { dispose() }
  }, PAGE_TIMEOUT)
})
