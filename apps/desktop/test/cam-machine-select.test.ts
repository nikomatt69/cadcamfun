/**
 * The machine picker of the CAM sidebar's "Machine" tab: it lists the machines of the Resources
 * library (`/machine`), and picking one drives the preview's machine and the CAD workpiece's
 * machine. Runs over the real sidecar handlers, like the rest of the CAM page tests.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useCADStore } from "../src/features/cad/store/cadStore.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
let millId = ""
let latheId = ""

beforeAll(async () => {
  app = await bootLiveApp()
  const mill = await app.sidecar.call("/api/machine-configs", { method: "POST", json: {
    name: "Haas Sidebar", type: "mill", config: { workVolume: { x: 508, y: 406, z: 635 }, maxSpindleSpeed: 8100, maxFeedRate: 16500, controller: "fanuc" }
  } })
  millId = mill.body.data.id
  const lathe = await app.sidecar.call("/api/machine-configs", { method: "POST", json: {
    name: "Emco Sidebar", type: "lathe", config: { workVolume: { x: 100, y: 100, z: 300 }, maxSpindleSpeed: 4000, maxFeedRate: 2000, controller: "fanuc" }
  } })
  latheId = lathe.body.data.id
})
afterAll(async () => { await app.dispose() })

const PAGE_TIMEOUT = 30000
const settle = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const find = <T extends Element = HTMLElement>(selector: string): Promise<T> => app.wait(() => document.querySelector<T>(selector), 30000)
const option = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-testid="cam-machine-option-${id}"]`)

/** Opens the CAM workspace on the machine tab (its default) with nothing picked. */
const openCam = () => {
  resetStores()
  useCADStore.setState({ selectedMachine: null })
  useCamStore.getState().setMachineOverride(undefined)
  return app.visit("/cam")
}

/** The stores are module-level: a pick must not leak into the next test file of the same process. */
const closeCam = (dispose: () => void): void => {
  useCADStore.setState({ selectedMachine: null })
  useCamStore.getState().setMachineOverride(undefined)
  dispose()
}

describe("CAM sidebar machine picker", () => {
  test("lists the machines of the Resources library, in name order, with their facts", async () => {
    const { dispose } = openCam()
    try {
      await find('[data-testid="cam-machine-select"]')
      // A machine without work volume is still listed.
      const mill = await app.wait(() => option(millId), 30000)
      const lathe = await app.wait(() => option(latheId), 30000)
      const rows = [...document.querySelectorAll<HTMLElement>('[data-testid^="cam-machine-option-"]')]
      expect(rows.indexOf(lathe)).toBeLessThan(rows.indexOf(mill))

      expect(lathe.textContent).toContain("Emco Sidebar")
      expect(lathe.textContent).toContain("Lathe")
      expect(mill.textContent).toContain("Haas Sidebar")
      expect(mill.textContent).toContain("Mill")
      expect(mill.textContent).toContain("Envelope 508×406×635 mm")
      expect(mill.textContent).toContain("Spindle 8100 rpm")
      expect(mill.textContent).toContain("Feed 16500 mm/min")
      expect(mill.textContent).toContain("Controller fanuc")
      // Nothing picked: the "Auto" row is the selected one.
      expect(mill.getAttribute("aria-selected")).toBe("false")
      expect(document.querySelector('[role="listbox"][aria-label="Machine to run this job on"]')).not.toBeNull()
    } finally { closeCam(dispose) }
  }, PAGE_TIMEOUT)

  test("picking a machine drives the preview and the CAD workpiece; picking it again clears the pick", async () => {
    const { dispose } = openCam()
    try {
      const mill = await app.wait(() => option(millId), 30000)

      mill.click(); await settle()
      expect(useCADStore.getState().selectedMachine?.id).toBe(millId)
      expect(useCamStore.getState().machineOverride).toBe("mill")
      expect(option(millId)!.getAttribute("aria-selected")).toBe("true")

      // The toolpath view's badge follows the pick, and says the machine was chosen.
      const toolpathTab = [...document.querySelectorAll<HTMLElement>(".workstation-workspace-tabs button")].find((el) => el.textContent?.trim() === "Toolpath")
      toolpathTab?.click(); await settle()
      const badge = await app.wait(() => document.querySelector<HTMLElement>('[data-testid="machine-badge"]'), 30000)
      expect(badge.textContent).toBe("Mill")
      expect(badge.parentElement?.textContent).toContain("chosen")

      // The same machine again: back to Auto, the preview no longer shows a picked machine.
      option(millId)!.click(); await settle()
      expect(useCADStore.getState().selectedMachine).toBeNull()
      expect(useCamStore.getState().machineOverride).toBeUndefined()

      // A lathe resource switches the preview to a lathe.
      option(latheId)!.click(); await settle()
      expect(useCADStore.getState().selectedMachine?.id).toBe(latheId)
      expect(useCamStore.getState().machineOverride).toBe("lathe")
      expect(await app.wait(() => document.querySelector<HTMLElement>('[data-testid="machine-badge"]')?.textContent === "Lathe" ? true : undefined, 30000)).toBe(true)
    } finally { closeCam(dispose) }
  }, PAGE_TIMEOUT)
})
