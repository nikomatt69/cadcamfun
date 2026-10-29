/**
 * The Explorer tab of the CAD and the CAM sidebar speaks the language of the interface, in the real app over the real stores:
 * every visible word, title, placeholder and aria-label of the Explorer comes from the Italian pack, none from the English one.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => {
  const { setLocale } = await import("../src/i18n/index.ts")
  await setLocale("en")
  await app.dispose()
})

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 60000)

/** Every string a reader meets in a subtree: text nodes plus the attributes that are read aloud or hovered. */
const readable = (root: Element): string[] => {
  const found: string[] = []
  for (const node of [root, ...root.querySelectorAll("*")]) {
    for (const attribute of ["title", "aria-label", "placeholder"]) {
      const value = node.getAttribute(attribute)
      if (value !== null && value.trim() !== "") found.push(value.trim())
    }
    for (const child of node.childNodes) if (child.nodeType === 3 && (child.textContent ?? "").trim() !== "") found.push(child.textContent!.trim())
  }
  return found
}

const ENGLISH = ["By type", "Group elements", "Show all", "Isolate selection", "Document & Origin", "Units", "Tolerance", "Workpiece", "Axes", "Grid", "Dimensions", "Expand All", "Collapse All", "Search elements...", "Move to layer…", "Bodies", "Sketches", "Ask AI"]

for (const route of ["/cad", "/cam"] as const) {
  describe(`${route} Explorer tab in Italian`, () => {
    test("no English word of the Explorer is left", async () => {
      const { setLocale, t } = await import("../src/i18n/index.ts")
      const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
      await setLocale("it")
      useElementsStore.getState().addElement({ type: "cube", name: "Block", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 })
      const { dispose } = app.visit(route)
      try {
        const explorerLabel = route === "/cad" ? t("cad.explorer") : t("cam.explorer")
        const tab = await app.wait(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.trim() === explorerLabel), 60000)
        tab.click(); await settle()
        const toolbar = await find('[data-testid="browser-toolbar"]')
        const sidebar = toolbar.closest(".sidebar-browser")!
        const words = readable(sidebar)
        expect(words).toContain("Per tipo")
        expect(words).toContain("Corpi")
        expect(words).toContain("Documento e origine")
        expect(words).toContain(t("cad.explorer.search"))
        for (const english of ENGLISH) expect(words, `English text left: ${english}`).not.toContain(english)
      } finally { dispose() }
    }, 120000)
  })
}

describe("/cam generator panel in Italian", () => {
  test("the sections of the right sidebar write Italian", async () => {
    const { setLocale } = await import("../src/i18n/index.ts")
    await setLocale("it")
    const { dispose } = app.visit("/cam")
    try {
      await app.wait(() => document.querySelector('[data-testid="machine-section"]'), 60000)
      const words = readable(document.body)
      // Strings of Operation, Material, Cutting, Tool and Machine sections that used to be English only.
      for (const english of ["Cutting Parameters", "Tool Offset", "Material Type", "Machine type", "Operation type", "Finishing Allowance (mm)", "Tool Diameter (mm)", "Select from Library", "CNC mill"]) {
        expect(words, `English text left: ${english}`).not.toContain(english)
      }
      expect(document.body.textContent).toContain("Parametri di taglio")
    } finally { dispose() }
  }, 120000)
})

