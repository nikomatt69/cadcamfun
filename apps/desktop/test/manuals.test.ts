import { describe, expect, test } from "bun:test"
import { categories, findManuals, manuals } from "../src/features/manuals/lib/catalogue.ts"
/** Control families the catalogue covers besides the ones with a post (Mazak and Okuma run Fanuc-compatible ISO here). */
const CONTROLLER_TYPES = ["mazak", "okuma"] as const
import { posts } from "../../../packages/core/src/cam/post/index.ts"
import { installDom } from "./helpers/dom.ts"

describe("default CAD/CAM manuals catalogue", () => {
  test("ships a broad catalogue with all exposed controller families and official sources", () => {
    expect(manuals.length).toBeGreaterThan(250)
    expect(new Set(manuals.map((entry) => entry.id)).size).toBe(manuals.length)
    expect(new Set(manuals.map((entry) => entry.url)).size).toBe(manuals.length)
    for (const category of categories) expect(manuals.some((entry) => entry.category === category)).toBe(true)
    for (const controller of new Set([...CONTROLLER_TYPES, ...Object.keys(posts)])) {
      expect(findManuals({ query: controller, category: "", publisher: "" }).length).toBeGreaterThan(0)
    }
    expect(manuals.filter((entry) => entry.kind === "manual").length).toBeGreaterThan(15)
    const trusted = new Set(["www.fanucamerica.com", "www.heidenhain.com", "content.heidenhain.de", "support.industry.siemens.com", "cache.industry.siemens.com", "www.mazak.com", "www.okuma.com", "haascnc.com", "www.haascnc.com", "linuxcnc.org", "marlinfw.org", "www.klipper3d.org", "www.freecad.org", "wiki.freecad.org", "docs.blender.org", "openscad.org", "help.autodesk.com", "cad.onshape.com", "docs.mcneel.com", "cadquery.readthedocs.io", "build123d.readthedocs.io", "help.prusa3d.com", "www.sandvik.coromant.com", "www.secotools.com", "dev.opencascade.org", "occt3d.com", "3mf.io"])
    for (const entry of manuals) {
      const url = new URL(entry.url)
      expect(url.protocol).toBe("https:")
      expect(url.username + url.password).toBe("")
      if (url.hostname === "github.com") expect(/^\/(gnea\/grbl|grblHAL\/core|FreeCAD\/FreeCAD-documentation)\//.test(url.pathname)).toBe(true)
      else expect(trusted.has(url.hostname)).toBe(true)
      expect(entry.title.trim().length).toBeGreaterThan(3)
    }
  })

  test("manufacturer account portals are distinguished from public manuals", () => {
    for (const publisher of ["FANUC", "Mazak"]) expect(manuals.some((entry) => entry.publisher === publisher && entry.access === "account" && entry.kind === "portal")).toBe(true)
    expect(manuals.filter((entry) => entry.access === "account").every((entry) => entry.kind === "portal")).toBe(true)
  })

  test("search combines words, machining topics, publisher and category", () => {
    expect(findManuals({ query: "FANUC macro", category: "", publisher: "FANUC" }).length).toBeGreaterThan(0)
    expect(findManuals({ query: "G-code", category: "programming", publisher: "LinuxCNC" }).every((entry) => entry.publisher === "LinuxCNC" && entry.category === "programming")).toBe(true)
    expect(findManuals({ query: "PARAMETRIC sketch", category: "modeling", publisher: "" }).length).toBeGreaterThan(0)
    expect(findManuals({ query: "Python tutorial", category: "", publisher: "" })).toEqual([])
    expect(findManuals({ query: "not-a-real-manual-4728", category: "", publisher: "" })).toEqual([])
  })
})

async function mount(path = "/manuals") {
  installDom(`http://localhost${path}`)
  // happy-dom 18 JSON-clones history state; browsers also accept undefined.
  const push = window.history.pushState.bind(window.history)
  const replace = window.history.replaceState.bind(window.history)
  window.history.pushState = (state, title, url) => push(state ?? null, title, url)
  window.history.replaceState = (state, title, url) => replace(state ?? null, title, url)
  const { render } = await import("solid-js/web")
  const { createComponent } = await import("solid-js")
  const { Router, Route } = await import("@solidjs/router")
  const { default: Screen } = await import("../src/features/manuals/screens/manuals.tsx")
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => createComponent(Router, { get children() { return createComponent(Route, { path: "/manuals", component: Screen }) } }), root)
  const settle = () => new Promise((resolve) => setTimeout(resolve, 40))
  await settle()
  return { root, dispose, settle }
}

test("manuals work without a sidecar or fetching documents, and only open a source on activation", async () => {
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = Object.assign(() => { requests++; return Promise.reject(new Error("No document requests expected")) }, { preconnect: originalFetch.preconnect })
  const app = await mount()
  try {
    expect(app.root.querySelector("h1")?.textContent).toBe("Manuals")
    expect(app.root.querySelector(".workstation-toolbar h1")?.textContent).toBe("Manuals")
    expect(app.root.querySelector(".cam-workspace__sidebar .workspace-page__rail-card")).not.toBeNull()
    expect(app.root.querySelector(".cam-workspace__stage .manual-card.ui-card-default")).not.toBeNull()
    expect(app.root.querySelectorAll(".manual-card").length).toBe(24)
    expect(requests).toBe(0)
    const opened: string[] = []
    window.open = ((url: string | URL) => { opened.push(String(url)); return null }) as typeof window.open
    app.root.querySelector<HTMLAnchorElement>(".manual-open")!.click()
    expect(opened).toEqual([manuals[0]!.url])
    expect(requests).toBe(0)
    expect(app.root.querySelector('a[href="https://www.fanucamerica.com/support/myportal"]')?.getAttribute("rel")).toBe("noopener noreferrer")
  } finally { globalThis.fetch = originalFetch; app.dispose() }
})

test("manual catalogue filters, pagination, empty state and deep links work through the UI", async () => {
  const app = await mount()
  const cards = () => [...app.root.querySelectorAll<HTMLElement>(".manual-card")]
  const button = (text: string) => [...app.root.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent === text)!
  try {
    const first = cards()[0]!.dataset.manualId
    button("Next").click()
    await app.settle()
    expect(cards()[0]!.dataset.manualId).not.toBe(first)
    button("FANUC").click()
    await app.settle()
    expect(cards().length).toBeGreaterThan(0)
    expect(cards().every((card) => card.querySelector(".manual-publisher")?.textContent === "FANUC")).toBe(true)
    expect(window.location.search).not.toContain("page=")
    const search = app.root.querySelector<HTMLInputElement>('input[type="search"]')!
    search.value = "zz-no-manual"
    search.dispatchEvent(new Event("input", { bubbles: true }))
    await app.settle()
    expect(cards()).toEqual([])
    expect(app.root.textContent).toContain("No documentation matches")
    button("Clear filters").click()
    await app.settle()
    expect(cards().length).toBe(24)
    const topic = [...app.root.querySelectorAll<HTMLButtonElement>(".manuals-filters nav button")].find((element) => element.textContent?.includes("3D modeling & CAD"))!
    topic.click()
    await app.settle()
    const visibleIds = new Set(cards().map((card) => card.dataset.manualId))
    expect(manuals.filter((entry) => visibleIds.has(entry.id)).every((entry) => entry.category === "modeling")).toBe(true)
    const publisher = app.root.querySelector<HTMLSelectElement>("#manual-publisher")!
    publisher.value = "Blender Foundation"
    publisher.dispatchEvent(new Event("change", { bubbles: true }))
    await app.settle()
    expect(cards().every((card) => card.querySelector(".manual-publisher")?.textContent === "Blender Foundation")).toBe(true)
  } finally { app.dispose() }

  const deep = await mount("/manuals?publisher=HEIDENHAIN&q=cycles&page=99")
  try {
    expect(deep.root.textContent).toContain("TNC 640 cycle programming")
    expect(deep.root.querySelectorAll(".manual-card").length).toBeGreaterThan(0)
    expect(deep.root.querySelector<HTMLInputElement>("input")?.value).toBe("cycles")
  } finally { deep.dispose() }
})
