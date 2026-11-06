import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() }, 60000)
afterAll(async () => { await app.dispose() })
afterEach(() => { resetStores(); useGeneratorStore.getState().reset() })
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 60000)
const open = async (id: string): Promise<void> => {
  const section = await find(`[data-testid="${id}"]`)
  const header = section.querySelector<HTMLElement>('[role="button"]')!
  if (header.getAttribute("aria-expanded") !== "true") header.click()
}
const choose = (el: HTMLSelectElement, value: string): void => { el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })) }

describe("generator machine-specific controls", () => {
  test("printer preset is shared with verified print and updates actual hardware settings", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await find('[data-testid="toolpath-generator"]')
      useGeneratorStore.getState().updateSettings("machineType", "3dprinter")
      await open("machine-section")
      const preset = await find<HTMLSelectElement>('[data-testid="machine-printer-preset"]')
      choose(preset, "printer-corexy-300")
      await open("cam-kernel-print-section")
      const verified = await find<HTMLSelectElement>('[data-testid="kernel-printer"]')
      expect(verified.value).toBe("printer-corexy-300")
      expect(useGeneratorStore.getState().settings).toMatchObject({ bedWidth: 300, bedDepth: 300, buildHeight: 300, printerKinematics: "corexy", nozzleDiameter: 0.4 })
      expect(useGeneratorStore.getState().printer.flavor).toBe("klipper")
      choose(verified, "printer-large-400")
      expect(preset.value).toBe("printer-large-400")
      expect(useGeneratorStore.getState().settings).toMatchObject({ bedWidth: 400, bedDepth: 400, buildHeight: 500, nozzleDiameter: 0.6, extrusionWidth: 0.6 })
      expect(document.querySelector('[data-testid="kernel-setup-orientation"]')).toBeNull()
    } finally { dispose() }
  }, 120000)

  test("lathe exposes real turret and spindle settings and warns about unsupported compensation", async () => {
    const { dispose } = app.visit("/cam")
    try {
      await find('[data-testid="toolpath-generator"]')
      useGeneratorStore.getState().updateSettings("machineType", "lathe")
      await open("machine-section")
      choose(await find<HTMLSelectElement>('#machine-lathe-turret'), "front")
      choose(await find<HTMLSelectElement>('#machine-lathe-spindle'), "ccw")
      expect(useGeneratorStore.getState().settings).toMatchObject({ latheTurret: "front", spindleDirection: "ccw", workholdingConfigured: true })
      expect(document.querySelector('[data-testid="kernel-setup-orientation"]')).toBeNull()
      await open("lathe-parameters-section")
      expect((await find('[data-testid="lathe-parameters-section"]')).textContent).toContain("not supported")
      useGeneratorStore.getState().updateSettings("machineType", "mill")
      await find('[data-testid="kernel-setup-orientation"]')
      expect(document.querySelector('#machine-lathe-spindle')).toBeNull()
    } finally { dispose() }
  }, 120000)
})
