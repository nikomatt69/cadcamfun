/** The generator panel follows the machine: its origins, its tools, its operations, and the probe. */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { useGeneratorStore } from "../src/cam/store/generatorStore.ts"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })
afterEach(() => { resetStores(); useGeneratorStore.getState().reset() })

const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 60000)
const open = async (id: string): Promise<void> => {
  const section = document.querySelector(`[data-testid="${id}"]`)!
  const header = section.querySelector<HTMLElement>('[role="button"]')!
  if (header.getAttribute("aria-expanded") !== "true") { header.click(); await settle() }
}
const choose = async (select: HTMLSelectElement, value: string): Promise<void> => {
  select.value = value
  select.dispatchEvent(new window.Event("change", { bubbles: true }))
  await settle()
}

describe("generator panel by machine", () => {
  test("a mill chooses its work offset; the choice is what the generator receives", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await find('[data-testid="toolpath-generator"]')
      await open("origin-section")
      const offset = await find<HTMLSelectElement>('[data-testid="origin-work-offset"]')
      expect([...offset.options].map((o) => o.value)).toEqual(["G54", "G55", "G56", "G57", "G58", "G59"])
      await choose(offset, "G56")
      expect(useGeneratorStore.getState().settings.workOffset).toBe("G56")
    } finally { dispose() }
  }, 120000)

  test("a lathe shows its own zero, a printer its plate origin and size, and neither shows the mill's offset", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await find('[data-testid="toolpath-generator"]')
      await open("origin-section")
      useGeneratorStore.getState().updateSettings("machineType", "lathe")
      await settle(200)
      const zero = await find<HTMLSelectElement>('[data-testid="origin-latheZero"] select')
      expect([...zero.options].map((o) => o.value)).toEqual(["face", "chuck"])
      await choose(zero, "chuck")
      expect(useGeneratorStore.getState().settings.latheZero).toBe("chuck")
      expect(document.querySelector('[data-testid="origin-work-offset"]')).toBeNull()

      useGeneratorStore.getState().updateSettings("machineType", "3dprinter")
      await settle(200)
      const plate = await find<HTMLSelectElement>('[data-testid="origin-bedOrigin"] select')
      expect([...plate.options].map((o) => o.value)).toEqual(["corner", "center"])
      await choose(plate, "center")
      expect(useGeneratorStore.getState().settings.bedOrigin).toBe("center")
      expect(document.querySelector('[data-testid="origin-latheZero"]')).toBeNull()
    } finally { dispose() }
  }, 120000)

  test("a mill can pick a touch probe and the probing operation, which brings its own settings", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await find('[data-testid="toolpath-generator"]')
      await open("operation-section")
      const operation = document.querySelector<HTMLSelectElement>('[data-testid="operation-section"] select')!
      expect([...operation.options].map((o) => o.value)).toContain("probing")
      expect(document.querySelector('[data-testid="probe-settings"]')).toBeNull()
      await choose(operation, "probing")
      const cycle = await find<HTMLSelectElement>('[data-testid="probe-settings"] select[aria-label="Probe cycle"]')
      expect([...cycle.options].map((o) => o.value)).toEqual(["zSurface", "edgeX", "edgeY", "corner", "bore", "boss", "toolLength"])
      await choose(cycle, "bore")
      expect(useGeneratorStore.getState().settings.probeCycle).toBe("bore")
      expect(document.querySelector('[data-testid="probe-settings"]')!.textContent).toContain("Nominal Ø")
      await choose(document.querySelector<HTMLSelectElement>('select[aria-label="Probe dialect"]')!, "fanuc")
      expect(useGeneratorStore.getState().settings.probeDialect).toBe("fanuc")
    } finally { dispose() }
  }, 120000)

  test("generating with the probe settings gives a probing program, spindle off", async () => {
    useGeneratorStore.getState().patchSettings({ operationType: "probing", toolType: "probe", probeCycle: "edgeX", workOffset: "G55" })
    const { dispose } = app.visit("/cam")
    try {
      await find('[data-testid="toolpath-generator"]')
      const button = await app.wait(() => [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.trim() === "Generate G-Code"), 60000)
      button.click()
      await app.wait(() => useGeneratorStore.getState().currentGCode.includes("Probing program"), 60000)
      const gcode = useGeneratorStore.getState().currentGCode
      expect(gcode).toContain("G10 L20 P2 X-2.000")
      expect(gcode).not.toMatch(/\bM3\b/)
    } finally { dispose() }
  }, 120000)
})
