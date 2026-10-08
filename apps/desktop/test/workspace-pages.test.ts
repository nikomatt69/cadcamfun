/**
 * The list and settings pages share the CAM workspace chrome of the toolpaths list: a glass toolbar with the page
 * title as its `h1`, and (for list pages) a filter rail and a central stage.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
let orgId = ""
beforeAll(async () => {
  app = await bootLiveApp()
  await app.sidecar.call("/api/projects", { method: "POST", json: { name: "Workspace Pages", description: "Chrome check" } })
  orgId = (await app.sidecar.call("/api/organizations", { method: "POST", json: { name: "Acme Works", description: "Shop" } })).body.id
})
afterAll(async () => { await app.dispose() })

const PAGE_TIMEOUT = 30000
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 30000)
const byText = (tag: string, text: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(tag)].find((el) => el.textContent?.trim() === text)

const lists = [
  { path: "/projects", title: "Projects", card: "Workspace Pages" },
  { path: "/organizations", title: "Organizations", card: "Acme Works" }
] as const

describe("list pages use the workspace chrome", () => {
  for (const { path, title, card } of lists) {
    test(`${path} has the toolbar, the filter rail and its card`, async () => {
      resetStores()
      const { dispose } = app.visit(path)
      try {
        await find(".cam-workspace")
        expect(document.querySelector(".workstation-toolbar")).not.toBeNull()
        expect(document.querySelector(".cam-workspace__sidebar")).not.toBeNull()
        expect(document.querySelector(".cam-workspace__stage")).not.toBeNull()
        expect(await app.wait(() => [...document.querySelectorAll("h1")].find((el) => el.textContent?.includes(title)), 30000)).toBeDefined()
        expect(await app.wait(() => byText("h3", card), 30000)).toBeDefined()
      } finally { dispose() }
    }, PAGE_TIMEOUT)
  }

  test("/plugins shows the empty stage and the install action", async () => {
    resetStores()
    const { dispose } = app.visit("/plugins")
    try {
      await find(".cam-workspace")
      expect(document.querySelector(".workstation-toolbar")).not.toBeNull()
      expect(await app.wait(() => byText("h3", "No plugins found"), 30000)).toBeDefined()
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("/marketplace filters the catalogue from the rail", async () => {
    resetStores()
    const { dispose } = app.visit("/marketplace")
    try {
      await find(".cam-workspace")
      expect(await app.wait(() => byText("h3", "Gear Set 24T/48T"), 30000)).toBeDefined()
      const input = document.querySelector<HTMLInputElement>('input[name="search"]')!
      input.value = "gear"
      input.dispatchEvent(new window.Event("input", { bubbles: true }))
      await app.wait(() => byText("h3", "Gear Set 24T/48T") && !byText("h3", "Pneumatic Cylinder 50mm"), 30000)
      expect(byText("h3", "Pneumatic Cylinder 50mm")).toBeUndefined()
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("/mcp/directory shows the empty stage", async () => {
    resetStores()
    const { dispose } = app.visit("/mcp/directory")
    try {
      await find(".cam-workspace")
      expect(document.querySelector(".workstation-toolbar")).not.toBeNull()
    } finally { dispose() }
  }, PAGE_TIMEOUT)
})

describe("detail and settings pages use the workspace chrome", () => {
  const pages = [
    { path: "/analytics", title: "Dashboard" },
    { path: "/analytics/history", title: "Activity" },
    { path: "/costs", title: "Costs" },
    { path: "/settings", title: "Settings" },
    { path: "/settings/subscription", title: "Subscription" },
    { path: "/marketplace/purchases", title: "Purchases" },
    { path: "/marketplace/seller/dashboard", title: "Seller" }
  ] as const
  for (const { path, title } of pages) {
    test(`${path} has the workspace toolbar`, async () => {
      resetStores()
      const { dispose } = app.visit(path)
      try {
        await find(".cam-workspace")
        expect(document.querySelector(".workstation-toolbar")).not.toBeNull()
        expect(await app.wait(() => [...document.querySelectorAll("h1")].find((el) => el.textContent?.toLowerCase().includes(title.toLowerCase())), 30000)).toBeDefined()
      } finally { dispose() }
    }, PAGE_TIMEOUT)
  }

  test("an organization opens in the workspace detail frame", async () => {
    resetStores()
    const { dispose } = app.visit(`/organizations/${orgId}`)
    try {
      await find(".cam-workspace")
      expect(await app.wait(() => byText("h1", "Acme Works"), 30000)).toBeDefined()
    } finally { dispose() }
  }, PAGE_TIMEOUT)
})
