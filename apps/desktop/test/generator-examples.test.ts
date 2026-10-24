import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { geometryExample, operationExample, originExample, projectExample } from "../src/features/cam/lib/generator-preview.ts"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

const defaults = cam.generator.DEFAULT_SETTINGS

describe("generator isometric fitting", () => {
  test("keeps tiny and large, flat and deep parts finite and inside the diagram", () => {
    for (const shape of ["rectangle", "circle", "polygon"] as const) for (const [w, h, d] of [[0.001, 0.002, 0.001], [10000, 6000, 500], [1, 1, 10000], [10000, 1, 0.01]]) {
      const view = projectExample(geometryExample(shape, w!, h!, d!, 7))
      expect(view.faces.length).toBeGreaterThan(0)
      for (const poly of [...view.faces, ...view.lines]) for (const point of poly.points.split(" ")) {
        const [x, y] = point.split(",").map(Number)
        expect(Number.isFinite(x)).toBe(true); expect(Number.isFinite(y)).toBe(true)
        expect(x!).toBeGreaterThanOrEqual(34); expect(x!).toBeLessThanOrEqual(286)
        expect(y!).toBeGreaterThanOrEqual(19); expect(y!).toBeLessThanOrEqual(135)
      }
    }
  })

  test("operation examples distinguish machines and the effective surface strategy", () => {
    const contour = operationExample(defaults)
    expect(operationExample({ ...defaults, operationType: "pocket" })).not.toEqual(contour)
    expect(operationExample({ ...defaults, machineType: "lathe", operationType: "turning" })).not.toEqual(contour)
    expect(operationExample({ ...defaults, machineType: "3dprinter", operationType: "standard" })).not.toEqual(contour)
    const rough = operationExample({ ...defaults, operationType: "3d_surface", surfaceStrategy: "roughing" })
    expect(operationExample({ ...defaults, operationType: "3d_surface", surfaceStrategy: "parallel" })).not.toEqual(rough)
  })

  test("the origin reference moves between the centre, the two corners and custom coordinates", () => {
    const stock = { width: 80, height: 40, depth: 12, x: 0, y: 0, topZ: 0 }
    expect(originExample(defaults, stock).marker).toEqual([0, 0, 0])
    expect(originExample({ ...defaults, originType: "workpiece-corner" }, stock).marker).toEqual([-40, -20, 0])
    expect(originExample({ ...defaults, originType: "workpiece-corner2" }, stock).marker).toEqual([-40, 20, 0])
    expect(originExample({ ...defaults, originType: "custom", originX: 12, originY: 8, originZ: 3 }, stock).marker).toEqual([12, 8, 3])
  })
})

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await new Promise(resolve => setTimeout(resolve, 200)); await app.dispose() })
afterEach(() => { resetStores(); useGeneratorStore.getState().reset() })
const find = (selector: string): Promise<HTMLElement> => app.wait(() => document.querySelector<HTMLElement>(selector), 30000)
const open = async (id: string) => {
  const section = await find(`[data-testid="${id}"]`)
  const header = section.querySelector<HTMLElement>('[role="button"]')!
  if (header.getAttribute("aria-expanded") !== "true") header.click()
  return section
}
const diagram = (id: string) => document.querySelector(`[data-testid="${id}"] svg`)?.innerHTML

describe("generator contextual examples", () => {
  test("removes the catalogue and explanatory palette panels, and follows operation and machine changes", async () => {
    const { dispose } = app.visit("/cam")
    try {
      const panel = await find('[data-testid="toolpath-generator"]')
      const section = await open("operation-section")
      await find('[data-testid="operation-example"] svg')
      expect(panel.textContent).not.toContain("Production CAM Features")
      expect(panel.textContent).not.toContain("Everything a Fusion")
      expect(section.querySelector(".strategy-palette__detail")).toBeNull()
      expect(section.textContent).not.toContain("Fusion-style")
      expect(section.querySelector('[data-testid="operation-example"]')!.textContent).toContain("Example")
      const initial = diagram("operation-example")
      section.querySelector<HTMLButtonElement>('[data-palette-id="pocket"]')!.click()
      await app.wait(() => diagram("operation-example") !== initial)
      expect(useGeneratorStore.getState().settings.operationType).toBe("pocket")
      const pocket = diagram("operation-example")
      useGeneratorStore.getState().updateSettings("machineType", "lathe")
      await app.wait(() => diagram("operation-example") !== pocket)
      const lathe = diagram("operation-example")
      useGeneratorStore.getState().updateSettings("machineType", "3dprinter")
      await app.wait(() => diagram("operation-example") !== lathe)
      expect(document.querySelector('[data-testid="print-operations"]')).not.toBeNull()
      const printer = diagram("operation-example")
      useGeneratorStore.getState().updateSettings("operationType", "vase")
      await app.wait(() => diagram("operation-example") !== printer)
      section.querySelector<HTMLElement>('[role="button"]')!.click()
      await app.wait(() => !document.querySelector('[data-testid="operation-example"]'))
    } finally { dispose() }
  }, 60000)

  test("geometry and origin diagrams react to dimensions and reference selection", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await find('[data-testid="toolpath-generator"]')
      await open("operation-section")
      useGeneratorStore.getState().setGeometryType("rectangle")
      const preview = await find('[data-testid="geometry-preview"]')
      const initial = diagram("geometry-preview")
      useGeneratorStore.getState().setRectangle(2400, 800)
      await app.wait(() => preview.textContent?.includes("2400 × 800"))
      expect(diagram("geometry-preview")).not.toBe(initial)
      const origin = await open("origin-section")
      const marker = () => origin.querySelector('[data-testid="preview-origin-marker"]')?.getAttribute("transform")
      await app.wait(marker)
      const centre = marker()
      const select = [...origin.querySelectorAll<HTMLSelectElement>("select")].find(s => s.value === "workpiece-center")!
      select.value = "workpiece-corner"
      select.dispatchEvent(new window.Event("change", { bubbles: true }))
      await app.wait(() => marker() !== centre)
      expect(useGeneratorStore.getState().settings.originType).toBe("workpiece-corner")
      expect(origin.querySelector('[data-testid="origin-preview"] svg')!.getAttribute("aria-label")).toContain("Origin reference")
    } finally { dispose() }
  }, 60000)
})
