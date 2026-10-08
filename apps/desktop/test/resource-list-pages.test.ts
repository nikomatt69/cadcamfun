/**
 * The Resources list pages (components, materials, tools, configurations) in the same CAM workspace layout as the
 * toolpaths list: filter rail, card grid, create modal, and cards that open the detail page.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => {
  app = await bootLiveApp()
  const projectId = (await app.sidecar.call("/api/projects", { method: "POST", json: { name: "Resource Lists" } })).body.id
  await app.sidecar.call("/api/materials", { method: "POST", json: { name: "Brass List", properties: { density: 8500 } } })
  await app.sidecar.call("/api/tools", { method: "POST", json: { name: "Endmill List", type: "endmill", diameter: 6, material: "carbide" } })
  await app.sidecar.call("/api/machine-configs", { method: "POST", json: { name: "Haas List", type: "mill", config: { workVolume: { x: 508, y: 406, z: 635 }, maxSpindleSpeed: 12000, maxFeedRate: 10000, controller: "fanuc" } } })
  await app.sidecar.call(`/api/projects/${projectId}/components`, { method: "POST", json: { name: "Bracket List", type: "mechanical", data: {} } })
})
afterAll(async () => { await app.dispose() })

const PAGE_TIMEOUT = 20000
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 30000)
const byText = (tag: string, text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent?.trim() === text)

const cases = [
  { path: "/materials", title: "Materials Library", card: "Brass List" },
  { path: "/tools", title: "Tools Library", card: "Endmill List" },
  { path: "/machine", title: "Configurations Library", card: "Haas List" },
  { path: "/components", title: "Components Library", card: "Bracket List" }
] as const

describe("resource list pages", () => {
  for (const { path, title, card } of cases) {
    test(`${path} renders the workspace chrome and its card`, async () => {
      resetStores()
      const { dispose } = app.visit(path)
      try {
        await find(".cam-workspace")
        expect(document.querySelector(".cam-workspace__sidebar")).not.toBeNull()
        expect(document.querySelector(".cam-workspace__stage")).not.toBeNull()
        expect(document.querySelector(".workstation-toolbar")).not.toBeNull()
        expect(await app.wait(() => byText("h1", title), 30000)).toBeDefined()
        expect(await app.wait(() => byText("h3", card), 30000)).toBeDefined()
      } finally { dispose() }
    }, PAGE_TIMEOUT)
  }

  test("search filters the cards and a card opens its detail page", async () => {
    resetStores()
    // happy-dom's pushState cannot serialise an undefined state, which the router passes on navigation.
    const pushState = window.history.pushState.bind(window.history)
    window.history.pushState = (state, title, url) => pushState(state ?? null, title, url)
    const { dispose } = app.visit("/tools")
    try {
      await find(".cam-workspace")
      await app.wait(() => byText("h3", "Endmill List"), 30000)
      const input = document.querySelector<HTMLInputElement>('input[name="search"]')!
      input.value = "nomatch"
      input.dispatchEvent(new window.Event("input", { bubbles: true }))
      expect(await app.wait(() => byText("h3", "No tools found"), 30000)).toBeDefined()
      input.value = "Endmill"
      input.dispatchEvent(new window.Event("input", { bubbles: true }))
      const cardTitle = await app.wait(() => byText("h3", "Endmill List"), 30000)
      cardTitle.closest<HTMLElement>('[role="link"]')?.click()
      expect(await app.wait(() => byText("h1", "Endmill List"), 30000)).toBeDefined()
    } finally { dispose() }
  }, PAGE_TIMEOUT)
})
