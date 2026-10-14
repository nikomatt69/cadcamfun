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

test("the subprogram switch carries through the real sidecar: the NC of the plate calls M98 for its counterbores, the replay still passes, and the choice is restored from the stored request", async () => {
  const { buildRecipe } = await import("../../../packages/core/src/cad/recipes.ts")
  const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: true })
  useElementsStore.getState().addElements([{ id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: recipe.history } as never])
  useElementsStore.setState({ selectedElement: null })
  const view = app.visit("/cam")
  try {
    const box = await app.wait(() => document.querySelector<HTMLInputElement>("[data-testid='kernel-subprograms']"), 30_000)
    expect(box.checked).toBe(false)
    box.click()
    expect(useGeneratorStore.getState().kernelSettings.subprograms).toBe(true)
    const button = await app.wait(() => document.querySelector<HTMLButtonElement>("[data-testid='kernel-generate']:not([disabled])"), 30_000)
    button.click()
    const evidence = await app.wait(() => document.querySelector("[data-testid='kernel-evidence']"), 90_000)
    expect(evidence.textContent).toContain("nc-replaypassed")
    const store = useCamStore.getState()
    expect(store.gcode).toMatch(/^M98 P\d+$/m)
    expect(store.kernelRequest?.subprograms).toBe(true)
    expect(store.kernelArtifact?.nc).toBe(store.gcode)
    // The viewer draws the program the kernel planned, not a parse of the shorter text.
    expect(store.program.toolpaths.length).toBe(store.kernelArtifact!.program.toolpaths.length)
    useGeneratorStore.getState().patchKernelSettings({ subprograms: undefined })
    restoreKernelSettings(store.kernelRequest!)
    expect(useGeneratorStore.getState().kernelSettings.subprograms).toBe(true)
  } finally { view.dispose(); useGeneratorStore.getState().patchKernelSettings({ subprograms: undefined }) }
})
