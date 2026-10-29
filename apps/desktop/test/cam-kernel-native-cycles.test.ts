import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"
import { restoreKernelSettings, useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })
afterEach(() => resetStores())

test("the native-cycles switch reaches the real sidecar: a TNC machine gets Klartext fixed cycles for the plate's holes, and the switch is restored from the stored request (spec 69 G4c)", async () => {
  const { buildRecipe } = await import("../../../packages/core/src/cad/recipes.ts")
  const recipe = buildRecipe("mounting_plate", { width: 60, depth: 40, thickness: 8, fastener: "M3", counterbore: false })
  useElementsStore.getState().addElements([{ id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: recipe.history } as never])
  useElementsStore.setState({ selectedElement: null })
  const view = app.visit("/cam")
  try {
    const box = await app.wait(() => document.querySelector<HTMLInputElement>("[data-testid='kernel-native-cycles']"), 30_000)
    expect(box.checked).toBe(false)
    useGeneratorStore.getState().patchKernelSettings({ machine: "kern-micro-hd-hsk40" })
    box.click()
    expect(useGeneratorStore.getState().kernelSettings.nativeCycles).toBe(true)
    const button = await app.wait(() => document.querySelector<HTMLButtonElement>("[data-testid='kernel-generate']:not([disabled])"), 30_000)
    button.click()
    await app.wait(() => document.querySelector("[data-testid='kernel-evidence']"), 90_000)
    const store = useCamStore.getState()
    expect(store.kernelRequest?.nativeCycles).toBe(true)
    expect(store.gcode).toMatch(/^\d+ BEGIN PGM|^0 BEGIN PGM/m)
    expect(store.gcode).toMatch(/CYCL DEF 200 DRILLING ~/)
    useGeneratorStore.getState().patchKernelSettings({ nativeCycles: undefined })
    restoreKernelSettings(store.kernelRequest!)
    expect(useGeneratorStore.getState().kernelSettings.nativeCycles).toBe(true)
  } finally { view.dispose(); useGeneratorStore.getState().patchKernelSettings({ nativeCycles: undefined }) }
})
