/**
 * The toolpaths pages in the CAM workspace style: the list (filters, grid, create, Standard Library) and the
 * detail (tabs, edit and save with a version, comments), over the real sidecar.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
let projectId = ""
let toolpathId = ""
beforeAll(async () => {
  app = await bootLiveApp()
  projectId = (await app.sidecar.call("/api/projects", { method: "POST", json: { name: "Toolpath Pages" } })).body.id
  toolpathId = (await app.sidecar.call("/api/toolpaths", { method: "POST", json: { name: "Outline", projectId, type: "mill", operationType: "contour", gcode: "G0 X0" } })).body.id
})
afterAll(async () => { await app.dispose() })

const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 30000)
const byText = (tag: string, text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent?.trim() === text)

describe("toolpaths list page", () => {
  test("renders the workspace chrome, the toolpath card and the Standard Library", async () => {
    resetStores()
    const { dispose } = app.visit("/toolpaths")
    try {
      await find(".cam-workspace")
      expect(document.querySelector(".cam-workspace__sidebar")).not.toBeNull()
      expect(document.querySelector(".cam-workspace__stage")).not.toBeNull()
      expect(document.querySelector(".workstation-toolbar")).not.toBeNull()
      expect(await app.wait(() => byText("h3", "Outline"), 30000)).toBeDefined()

      const library = await app.wait(() => byText("button", "Standard Library"), 30000)
      library.click()
      await settle()
      expect(document.querySelector('[role="dialog"][aria-label="Standard Library"]')).not.toBeNull()
    } finally {
      dispose()
    }
  })
})

describe("toolpath detail page", () => {
  test("opens with the workspace toolbar and the tabs; comments can be added", async () => {
    resetStores()
    const { dispose } = app.visit(`/toolpaths/${toolpathId}`)
    try {
      await find(".cam-workspace")
      const title = await app.wait(() => byText("h1", "Outline"), 30000)
      expect(title).toBeDefined()
      for (const label of ["Details", "G-code", "Versions", "Comments"]) expect(byText("button", label)).toBeDefined()

      byText("button", "Comments")?.click()
      await settle()
      const textarea = await find<HTMLTextAreaElement>('textarea[placeholder="Add a comment..."]')
      textarea.value = "Check the feed rate"
      textarea.dispatchEvent(new window.Event("input", { bubbles: true }))
      await settle()
      const form = textarea.closest("form")
      form?.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
      await settle(300)
      const { body } = await app.sidecar.call(`/api/toolpaths/${toolpathId}/comments`)
      expect(body.map((c: { content: string }) => c.content)).toContain("Check the feed rate")
    } finally {
      dispose()
    }
  })

  test("Versions tab lists the history recorded by a save", async () => {
    resetStores()
    const { dispose } = app.visit(`/toolpaths/${toolpathId}`)
    try {
      await find(".cam-workspace")
      await app.wait(() => byText("h1", "Outline"), 30000)
      await app.sidecar.call(`/api/toolpaths/${toolpathId}/versions`, { method: "POST", json: { gcode: "G1 X2", changeMessage: "manual" } })
      byText("button", "Versions")?.click()
      await settle(200)
      expect(await app.wait(() => byText("div", "manual") ?? [...document.querySelectorAll("div")].find((el) => el.textContent?.trim() === "manual"), 30000)).toBeDefined()
      expect(byText("button", "Restore")).toBeDefined()
    } finally {
      dispose()
    }
  })
})
