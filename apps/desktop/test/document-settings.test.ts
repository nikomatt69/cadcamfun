/**
 * Units and tolerance of the drawing: the unit table, the settings, the one place that changes them, how the 3D view
 * draws curves, the selectors in the browser, and what travels with a stored drawing.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { chordError, segmentsFor } from "@cadcamfun/core"
import { createThreeObject } from "../src/features/cad/lib/createThreeObject.ts"
import { useCADStore } from "../src/features/cad/store/cadStore.ts"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"
import { useVerifyStore } from "../src/features/cam/store/verifyStore.ts"
import { createSettings, decodeSettings, DEFAULT_SETTINGS } from "../src/shared/state/settings.ts"
import { decimalsFor, documentSettings, restoreDocumentSettings, setDisplayUnits, setDocumentTolerance, syncDocumentSettings } from "../src/shared/state/document-settings.ts"
import { DISPLAY_UNITS, UNIT_TABLE, formatLength, fromDisplay, parseLength, programUnitsOf, toDisplay } from "../src/viewport/units.ts"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

describe("units", () => {
  test("every unit converts exactly and back, and formats with its own label", () => {
    for (const unit of DISPLAY_UNITS) {
      expect(fromDisplay(toDisplay(123.456, unit), unit)).toBeCloseTo(123.456, 9)
    }
    expect(toDisplay(25.4, "inch")).toBe(1)
    expect(toDisplay(1, "um")).toBe(1000)
    expect(toDisplay(0.0254, "thou")).toBe(1)
    expect(toDisplay(1500, "m")).toBe(1.5)
    expect(formatLength(12.5, "mm")).toBe("12.500 mm")
    expect(formatLength(0.012, "um")).toBe("12.0 µm")
    expect(formatLength(25.4, "inch")).toBe("1.0000 inch")
    expect(formatLength(0.001, "mm", 4)).toBe("0.0010 mm")
  })

  test("typed lengths parse in the selected unit, with or without a suffix", () => {
    expect(parseLength("1", "inch")).toBeCloseTo(25.4, 9)
    expect(parseLength("12 µm", "um")).toBeCloseTo(0.012, 9)
    expect(parseLength("3.5mm", "mm")).toBe(3.5)
    expect(parseLength("abc", "mm")).toBeUndefined()
  })

  test("a program is written in mm or inch only", () => {
    expect(DISPLAY_UNITS.map(programUnitsOf)).toEqual(DISPLAY_UNITS.map((u) => (u === "inch" || u === "thou" ? "inch" : "mm")))
  })
})

describe("settings", () => {
  test("tolerance and units decode strictly; old stored settings keep working", () => {
    expect(DEFAULT_SETTINGS.tolerance).toBe(0.01)
    expect(decodeSettings({ units: "um", tolerance: 0.002 })).toMatchObject({ units: "um", tolerance: 0.002 })
    expect(decodeSettings({ units: "furlong", tolerance: -1 })).toMatchObject({ units: "mm", tolerance: 0.01 })
    expect(decodeSettings({ units: "inch", decimals: 3 }).tolerance).toBe(0.01)
    expect(decodeSettings({ tolerance: 100 }).tolerance).toBe(0.01)
  })

  test("decimals show the tolerance in the unit, never fewer than the unit's own", () => {
    expect(decimalsFor("mm", 0.01)).toBe(3)
    expect(decimalsFor("mm", 0.0005)).toBe(4)
    expect(decimalsFor("inch", 0.01)).toBe(4)
    expect(decimalsFor("um", 0.001)).toBe(1)
    expect(decimalsFor("thou", 0.001)).toBe(2)
  })
})

describe("the 3D view draws curves to the drawing's tolerance", () => {
  const segments = (element: Record<string, unknown>): number => (createThreeObject(element) as unknown as { geometry: { parameters: { radialSegments?: number; segments?: number; widthSegments?: number } } }).geometry.parameters.radialSegments ?? 0
  afterEach(() => resetStores())

  test("a cylinder gets as many chords as its tolerance needs, within the display cap", () => {
    useCADStore.getState().setTolerance(0.01)
    const coarse = segments({ type: "cylinder", radius: 50, height: 10, x: 0, y: 0, z: 0 })
    expect(coarse).toBe(segmentsFor(50, 0.01, 256))
    expect(chordError(50, coarse)).toBeLessThanOrEqual(0.01)
    useCADStore.getState().setTolerance(0.001)
    expect(segments({ type: "cylinder", radius: 50, height: 10, x: 0, y: 0, z: 0 })).toBe(256)
    useCADStore.getState().setTolerance(0.5)
    expect(segments({ type: "cylinder", radius: 50, height: 10, x: 0, y: 0, z: 0 })).toBe(32)
  })

  test("the element's own tolerance or segments win over the drawing's", () => {
    useCADStore.getState().setTolerance(0.1)
    expect(segments({ type: "cylinder", radius: 20, height: 5, x: 0, y: 0, z: 0, tolerance: 0.005 })).toBe(segmentsFor(20, 0.005, 256))
    expect(segments({ type: "cylinder", radius: 20, height: 5, x: 0, y: 0, z: 0, tolerance: 0.005, segments: 90 })).toBe(90)
  })

  test("spheres and revolutions follow it too", () => {
    useCADStore.getState().setTolerance(0.01)
    const sphere = createThreeObject({ type: "sphere", radius: 30, x: 0, y: 0, z: 0 }) as unknown as { geometry: { parameters: { widthSegments: number } } }
    expect(sphere.geometry.parameters.widthSegments).toBe(segmentsFor(30, 0.01, 256))
    const lathe = createThreeObject({ type: "revolution", x: 0, y: 0, z: 0, profile: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 50 }] }) as unknown as { geometry: { parameters: { segments: number } } }
    expect(lathe.geometry.parameters.segments).toBe(segmentsFor(40, 0.01, 256))
  })
})

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })
afterEach(() => { app.state.settings.reset(); resetStores() })

describe("changing them", () => {
  test("a tolerance reaches the settings, the view, the CAM generator and the verification at once", () => {
    expect(setDocumentTolerance(app.state, 0.001)).toBe(true)
    expect(app.state.settings.settings().tolerance).toBe(0.001)
    expect(useCADStore.getState().tolerance).toBe(0.001)
    expect(useGeneratorStore.getState().settings.tolerance).toBe(0.001)
    expect(useVerifyStore.getState().holder.tolerance).toBe(0.001)
    expect(app.state.settings.settings().decimals).toBe(3)
  })

  test("an unusable tolerance changes nothing", () => {
    for (const bad of [0, -0.1, 20, NaN]) expect(setDocumentTolerance(app.state, bad)).toBe(false)
    expect(app.state.settings.settings().tolerance).toBe(0.01)
  })

  test("a unit keeps the decimals the tolerance needs", () => {
    setDocumentTolerance(app.state, 0.0005)
    setDisplayUnits(app.state, "inch")
    expect(app.state.settings.settings()).toMatchObject({ units: "inch", decimals: 5 })
    setDisplayUnits(app.state, "mm")
    expect(app.state.settings.settings().decimals).toBe(4)
  })

  test("settings travel with a drawing and restore from it; junk is ignored", () => {
    setDocumentTolerance(app.state, 0.002)
    setDisplayUnits(app.state, "um")
    const stored = documentSettings(app.state)
    expect(stored).toMatchObject({ units: "um", tolerance: 0.002 })
    app.state.settings.reset()
    restoreDocumentSettings(app.state, stored)
    expect(app.state.settings.settings()).toMatchObject({ units: "um", tolerance: 0.002 })
    restoreDocumentSettings(app.state, { units: "furlong", tolerance: "x" })
    restoreDocumentSettings(app.state, null)
    expect(app.state.settings.settings()).toMatchObject({ units: "um", tolerance: 0.002 })
    syncDocumentSettings(app.state)
    expect(useGeneratorStore.getState().settings.tolerance).toBe(0.002)
  })
})

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 60000)
const choose = async (select: HTMLSelectElement, value: string): Promise<void> => {
  select.value = value
  select.dispatchEvent(new window.Event("change", { bubbles: true }))
  await settle()
}

for (const route of ["/cad", "/cam"] as const) {
  describe(`${route}: the unit and tolerance selectors`, () => {
    const open = async () => {
      const visit = app.visit(route)
      if (route === "/cam") {
        const tab = await app.wait(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.trim() === "Explorer"), 60000)
        tab.click(); await settle()
      }
      await find('[data-testid="browser-origin"]')
      return visit
    }

    test("units and tolerance are selectable and show in the bar", async () => {
      const { dispose } = await open()
      try {
        const units = await find<HTMLSelectElement>('select[aria-label="Units"]')
        expect([...units.options].map((o) => o.value)).toEqual([...DISPLAY_UNITS])
        await choose(units, "inch")
        expect(app.state.settings.settings().units).toBe("inch")
        const bar = await find(`[data-testid="${route === "/cad" ? "cad" : "cam"}-status-bar"]`)
        expect(bar.querySelector('[data-testid="status-units"]')?.textContent).toContain("inch")

        const tolerance = await find<HTMLSelectElement>('select[aria-label="Tolerance"]')
        await choose(tolerance, "0.001")
        expect(app.state.settings.settings().tolerance).toBe(0.001)
        expect(useCADStore.getState().tolerance).toBe(0.001)
        expect(bar.querySelector('[data-testid="status-tolerance"]')?.textContent).toContain("inch")
        await choose(units, "um")
        expect(bar.querySelector('[data-testid="status-tolerance"]')?.textContent).toContain("1.0 µm")
      } finally { dispose() }
    }, 120000)

    test("a custom tolerance is typed in the selected unit and kept in millimetres; junk is refused", async () => {
      const { dispose } = await open()
      try {
        await choose(await find<HTMLSelectElement>('select[aria-label="Units"]'), "um")
        await choose(await find<HTMLSelectElement>('select[aria-label="Tolerance"]'), "custom")
        const input = await find<HTMLInputElement>('[data-testid="browser-custom-tolerance"]')
        input.value = "7"
        input.dispatchEvent(new window.Event("change", { bubbles: true })); await settle()
        expect(app.state.settings.settings().tolerance).toBeCloseTo(0.007, 9)
        input.value = "0.00001"
        input.dispatchEvent(new window.Event("change", { bubbles: true })); await settle()
        expect(app.state.settings.settings().tolerance).toBeCloseTo(0.007, 9)
        expect(document.querySelector('[data-testid="browser-origin"] [role="alert"]')).not.toBeNull()
      } finally { dispose() }
    }, 120000)
  })
}
