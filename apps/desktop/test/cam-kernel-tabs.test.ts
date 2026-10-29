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

test("the tabs field holds the through-cut outline of the plate: the request carries it, the plan says so, the replay passes and the field comes back from the stored request (spec 69 A1)", async () => {
  const { buildRecipe } = await import("../../../packages/core/src/cad/recipes.ts")
  const recipe = buildRecipe("mounting_plate", { width: 120, depth: 80, thickness: 12, fastener: "M5", counterbore: false })
  useElementsStore.getState().addElements([{ id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default", history: recipe.history } as never])
  useElementsStore.setState({ selectedElement: null })
  const view = app.visit("/cam")
  try {
    const field = await app.wait(() => document.querySelector<HTMLInputElement>("#kernel-tabs"), 30_000)
    expect(field.value).toBe("0")
    useGeneratorStore.getState().patchKernelSettings({ tabs: { count: 3, width: 4, height: 2 } })
    const button = await app.wait(() => document.querySelector<HTMLButtonElement>("[data-testid='kernel-generate']:not([disabled])"), 30_000)
    button.click()
    const evidence = await app.wait(() => document.querySelector("[data-testid='kernel-evidence']"), 90_000)
    expect(evidence.textContent).toContain("nc-replaypassed")
    const store = useCamStore.getState()
    expect(store.kernelRequest?.tabs).toEqual({ count: 3, width: 4, height: 2 })
    expect(store.kernelArtifact?.notes.join(" ")).toMatch(/3 tabs of 4 mm x 2 mm hold the part/)
    useGeneratorStore.getState().patchKernelSettings({ tabs: undefined })
    restoreKernelSettings(store.kernelRequest!)
    expect(useGeneratorStore.getState().kernelSettings.tabs?.count).toBe(3)
  } finally { view.dispose(); useGeneratorStore.getState().patchKernelSettings({ tabs: undefined }) }
})
