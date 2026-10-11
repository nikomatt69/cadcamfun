import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
let projectId = ""
let drawingId = ""

beforeAll(async () => {
  app = await bootLiveApp()
  const project = await app.sidecar.call("/api/projects", { method: "POST", json: { name: "Library probe" } })
  projectId = project.body.id
  const drawing = await app.sidecar.call(`/api/projects/${projectId}/drawings`, {
    method: "POST",
    json: { name: "Part", data: { elements: [{ id: "probe-1", type: "cube", layerId: "default", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 }], version: "1.0" } }
  })
  drawingId = drawing.body.id
  // One row of every library kind, exactly as the assistant's lib_lookup_* tools read them.
  await app.sidecar.call("/api/materials", { method: "POST", json: { name: "Aluminium 6061-T6", properties: { density: 2.7 } } })
  await app.sidecar.call("/api/tools", { method: "POST", json: { name: "6mm endmill", type: "endmill", diameter: 6, material: "carbide", numberOfFlutes: 3 } })
  await app.sidecar.call("/api/machine-configs", { method: "POST", json: { name: "Haas Mini Mill", type: "mill", config: { workVolume: { x: 400, y: 300, z: 300 }, maxSpindleSpeed: 12000, maxFeedRate: 5000, controller: "fanuc" } } })
})
afterAll(async () => { await app.dispose() })

const settle = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms))

const openLibrary = async () => {
  const { dispose } = app.visit(`/cad?drawingId=${drawingId}`)
  const button = await app.wait(() => document.querySelector<HTMLButtonElement>('button[title="Unified Library"]'), 20000)
  button.click()
  await settle(400)
  return dispose
}

/** The modal's own tab, not the sidebar's section of the same name. */
const tab = (kind: string) => document.querySelector<HTMLButtonElement>(`button[data-kind="${kind}"]`)
const choose = async (kind: string) => { tab(kind)!.click(); await settle(300) }
const modalText = () => document.querySelector('[data-library-search]')!.closest("div.flex.flex-col")!.parentElement!.textContent ?? ""

describe("the CAD library modal holds the whole library", () => {
  test("components, materials, tools and machines are all listed, with the fields that matter", async () => {
    const dispose = await openLibrary()
    try {
      // The component catalogue is there first, as before.
      expect(document.querySelector('input[placeholder="Search components..."]')).not.toBeNull()

      await choose("materials")
      expect(modalText()).toContain("Aluminium 6061-T6")
      expect(modalText()).toContain("density: 2.7")

      await choose("tools")
      expect(modalText()).toContain("6mm endmill")
      expect(modalText()).toContain("Ø 6 mm")
      expect(modalText()).toContain("3 flutes")

      await choose("machines")
      expect(modalText()).toContain("Haas Mini Mill")
      expect(modalText()).toContain("controller fanuc")
      expect(modalText()).toContain("max 12000 rpm")
      expect(modalText()).toContain("envelope 400×300×300 mm")

      await choose("components")
      expect(document.querySelector('input[placeholder="Search components..."]')).not.toBeNull()
    } finally { dispose() }
  }, 60000)

  test("the search narrows the open kind", async () => {
    const dispose = await openLibrary()
    try {
      await choose("tools")
      const search = document.querySelector<HTMLInputElement>('[data-library-search]')!
      expect(search.placeholder).toBe("Search tools...")
      search.value = "endmill"
      search.dispatchEvent(new window.Event("input", { bubbles: true }))
      await settle(250)
      expect(modalText()).toContain("6mm endmill")
      search.value = "zzz-nothing"
      search.dispatchEvent(new window.Event("input", { bubbles: true }))
      await settle(250)
      expect(modalText()).toContain("No tools found")
    } finally { dispose() }
  }, 60000)
})
