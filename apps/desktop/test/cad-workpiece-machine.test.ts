/**
 * The machine picker of the CAD settings panel: it lists the built-in catalogue and the machines of
 * the Resources library — the same two lists the CAM sidebar's "Machine" tab shows — and a pick
 * sizes the stock and drives the preview's machine. Runs over the real sidecar handlers.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useCADStore } from "../src/features/cad/store/cadStore.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"

let app: Awaited<ReturnType<typeof bootLiveApp>>
let millId = ""

beforeAll(async () => {
  app = await bootLiveApp()
  const mill = await app.sidecar.call("/api/machine-configs", { method: "POST", json: {
    name: "Haas Workpiece", type: "mill", config: { workVolume: { x: 508, y: 406, z: 635 }, maxSpindleSpeed: 8100, maxFeedRate: 16500, controller: "fanuc" }
  } })
  millId = mill.body.data.id
})
afterAll(async () => { await app.dispose() })
afterEach(() => {
  useCADStore.setState({ selectedMachine: null })
  useCamStore.getState().setMachineOverride(undefined)
})

const PAGE_TIMEOUT = 30000
const settle = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const select = (): HTMLSelectElement | null => document.querySelector<HTMLSelectElement>('[data-testid="cad-workpiece-machine"]')

/** Opens the CAD workspace on the inspector's Settings tab, where the workpiece setup lives. */
const openSettings = async () => {
  resetStores()
  const { dispose } = app.visit("/cad")
  const tab = await app.wait(() => document.querySelector<HTMLButtonElement>('.workspace-inspector button[aria-label="Settings"]'), 30000)
  if (tab.getAttribute("aria-pressed") !== "true") tab.click()
  await app.wait(select, 30000)
  return dispose
}

const choose = async (id: string): Promise<void> => {
  const element = select()!
  element.value = id
  element.dispatchEvent(new Event("change", { bubbles: true }))
  await settle()
}

describe("CAD workpiece machine picker", () => {
  test("lists the built-in catalogue and the library machines, labelled like the CAM panel", async () => {
    const dispose = await openSettings()
    try {
      await app.wait(() => document.querySelector(`option[value="${millId}"]`), PAGE_TIMEOUT)
      const element = select()!
      expect([...element.querySelectorAll("optgroup")].map((group) => group.getAttribute("label")))
        .toEqual(["Built-in machines", "Saved machines"])
      expect(element.querySelectorAll('optgroup[label="Built-in machines"] option').length).toBeGreaterThan(0)
      expect(element.querySelector(`option[value="${millId}"]`)?.textContent).toBe("Haas Workpiece (Mill)")
      // Nothing picked: the placeholder is the selected option.
      expect(element.value).toBe("")
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("a pick sizes the stock, drives the preview and names the kernel's machine", async () => {
    const dispose = await openSettings()
    try {
      await app.wait(() => document.querySelector(`option[value="${millId}"]`), PAGE_TIMEOUT)

      await choose(millId)
      expect(useCADStore.getState().selectedMachine?.id).toBe(millId)
      expect(useCamStore.getState().machineOverride).toBe("mill")
      // The machine's work volume becomes the stock, ready for "Apply Changes".
      const value = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value
      expect([value("width"), value("height"), value("depth")]).toEqual(["508", "406", "635"])
      const facts = document.querySelector(".workspace-inspector")!.textContent ?? ""
      expect(facts).toContain("Machine Information")
      expect(facts).toContain("Work Volume: 508×406×635 mm")
      expect(facts).toContain("Spindle Speed: 8100 rpm")
      expect(facts).toContain("Controller: fanuc")

      // A built-in preset is a pick like any other: the kernel plans against it.
      await choose("haas-vf2")
      expect(useCADStore.getState().selectedMachine?.id).toBe("haas-vf2")
      expect(useGeneratorStore.getState().kernelSettings.machine).toBe("haas-vf2")
      expect(select()!.value).toBe("haas-vf2")

      // "Select a machine" is Auto: no machine for the preview.
      await choose("")
      expect(useCADStore.getState().selectedMachine).toBeNull()
      expect(useCamStore.getState().machineOverride).toBeUndefined()
    } finally { dispose() }
  }, PAGE_TIMEOUT)

  test("a machine restored with a drawing is still listed when the library no longer has it", async () => {
    resetStores()
    useCADStore.setState({ selectedMachine: { id: "retired-mill", name: "Retired mill", type: "mill", config: {} } })
    const { dispose } = app.visit("/cad")
    try {
      const tab = await app.wait(() => document.querySelector<HTMLButtonElement>('.workspace-inspector button[aria-label="Settings"]'), PAGE_TIMEOUT)
      if (tab.getAttribute("aria-pressed") !== "true") tab.click()
      const option = await app.wait(() => document.querySelector<HTMLOptionElement>('option[value="retired-mill"]'), PAGE_TIMEOUT)
      expect(option.textContent).toContain("Retired mill")
      expect(option.textContent).toContain("not in the library")
      expect(select()!.value).toBe("retired-mill")
    } finally { dispose() }
  }, PAGE_TIMEOUT)
})
