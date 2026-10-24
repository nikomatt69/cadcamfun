import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })
afterEach(() => resetStores())

/** A 60 x 40 x 20 block with a Ø6 hole drilled into it from its +X face. */
const sideHole = {
  id: "side", type: "parametric", name: "Side", x: 0, y: 0, z: 0, layerId: "default",
  history: {
    parameters: {},
    features: [
      { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 60, height: 40 }] } },
      { id: "block", type: "extrude", sketch: "s", depth: 20, operation: "new" },
      { id: "h", type: "hole", plane: "YZ", offset: 60, at: [20, 10], diameter: 6, depth: 12 }
    ]
  }
}

test("the setup planner reads the exact model through the sidecar and a chosen side becomes the kernel's setup orientation", async () => {
  useElementsStore.getState().addElements([sideHole])
  useElementsStore.setState({ selectedElement: null })
  const view = app.visit("/cam")
  try {
    const run = await app.wait(() => document.querySelector<HTMLButtonElement>("[data-testid='kernel-setups-run']"), 30_000)
    await app.wait(() => (run.disabled ? null : true), 30_000)
    run.click()
    const items = await app.wait(() => {
      const found = document.querySelectorAll<HTMLElement>("[data-testid='kernel-setups-item']")
      return found.length > 0 ? found : null
    }, 60_000)
    expect([...items].map((i) => i.dataset["orientation"]).sort()).toEqual(["+X", "+Z"])
    const side = [...items].find((i) => i.dataset["orientation"] === "+X")!
    expect(side.textContent).toContain("1 holes")
    expect(document.querySelector("[data-testid='kernel-setups-uncovered']")).toBeNull()
    expect(useGeneratorStore.getState().kernelSettings.setupOrientation).toBeUndefined()
    side.querySelector<HTMLButtonElement>("[data-testid='kernel-setups-use']")!.click()
    expect(useGeneratorStore.getState().kernelSettings.setupOrientation).toBe("+X")
    expect(useGeneratorStore.getState().settings.workholdingConfigured).toBe(false)
    expect(document.querySelector<HTMLSelectElement>("[data-testid='kernel-setup-orientation']")!.value).toBe("+X")
  } finally { view.dispose() }
})
