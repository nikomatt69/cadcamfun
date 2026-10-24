import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { model } from "@cadcamfun/core"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"
import { useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"

setDefaultTimeout(400_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })
afterEach(() => resetStores())

const m = model()
m.extrude(m.sketch("XY").circle([0, 0], 40), { depth: 30, taper: 5 })
const cone = JSON.parse(JSON.stringify({ id: "cone", type: "parametric", name: "Cone", x: 0, y: 0, z: 0, layerId: "default", history: m.build() }))
const click = async (id: string): Promise<void> => (await app.wait(() => document.querySelector<HTMLButtonElement>(`[data-testid='${id}']`), 30_000)).click()

test("the swarf picker lists the walls of the exact model and adds a flank cut of one to the plan; the kernel cuts it with the side of the cutter", async () => {
  useElementsStore.getState().addElements([cone])
  useElementsStore.setState({ selectedElement: null })
  const view = app.visit("/cam")
  try {
    const select = await app.wait(() => document.querySelector<HTMLSelectElement>("[data-testid='kernel-machine']"), 30_000)
    await click("kernel-swarf-run")
    const wall = await app.wait(() => document.querySelector<HTMLElement>("[data-testid='kernel-swarf-wall'][data-kind='cone']"), 60_000)
    expect(wall.textContent).toContain("leaning 5.0")
    // Nothing can be added on a three-axis machine, or before there is a plan.
    expect(document.querySelector("[data-testid='kernel-swarf-hint']")!.textContent).toContain("five-axis")
    select.value = "trunnion-5ax"
    select.dispatchEvent(new window.Event("change", { bubbles: true }))
    await app.wait(() => useGeneratorStore.getState().kernelSettings.machine === "trunnion-5ax" ? true : null, 10_000)
    expect(document.querySelector("[data-testid='kernel-swarf-hint']")!.textContent).toContain("Plan the part first")
    await click("kernel-plan-button")
    await app.wait(() => (useGeneratorStore.getState().kernelSettings.operations ?? []).length > 0 ? true : null, 60_000)
    expect(document.querySelector("[data-testid='kernel-swarf-hint']")).toBeNull()
    const before = useGeneratorStore.getState().kernelSettings.operations!.length
    document.querySelector<HTMLButtonElement>("[data-testid='kernel-swarf-wall'][data-kind='cone'] [data-testid='kernel-swarf-add']")!.click()
    const operations = useGeneratorStore.getState().kernelSettings.operations!
    expect(operations).toHaveLength(before + 1)
    const added = operations.at(-1) as unknown as { strategy: string; mode: string; near: Array<{ x: number; y: number; z: number }> }
    expect([added.strategy, added.mode, added.near.length]).toEqual(["multiaxis", "swarf", 1])
    // The point is on the cone: its distance to the axis follows the 5 degree wall (radius 20 at z = 0).
    expect(Math.hypot(added.near[0]!.x, added.near[0]!.y)).toBeCloseTo(20 - added.near[0]!.z * Math.tan((5 * Math.PI) / 180), 3)
    // The flank cut finishes what the plan roughed: the rest of the plan stays and runs first.
    await click("kernel-generate")
    const artifact = await app.wait(() => useCamStore.getState().kernelArtifact ?? (document.querySelector("[role='alert']") !== null ? (() => { throw new Error(`kernel error: ${document.querySelector("[role='alert']")!.textContent}`) })() : undefined), 300_000)
    expect(artifact.operations.at(-1)!.parameters["mode"]).toBe("swarf")
    expect(artifact.operations.at(-1)!.status).toBe("ok")
    // The cutter the picker chose is long enough: the shank and the holder stay out of the roughed stock.
    expect(artifact.claims.find((c) => c.id === "holder-clearance")!.status).toBe("passed")
    expect(artifact.nc).toMatch(/\bA-?\d/)
    expect(artifact.nc).toMatch(/\bC-?\d/)
  } finally {
    view.dispose()
    useGeneratorStore.getState().patchKernelSettings({ machine: "vmc-standard", operations: undefined })
  }
})
