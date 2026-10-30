import { afterAll, afterEach, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { bootLiveApp } from "./helpers/live-app.ts"
import { resetStores } from "./helpers/reset-stores.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useCamStore } from "../src/features/cam/store/camStore.ts"
import { restoreKernelSettings, useGeneratorStore } from "../src/features/cam/store/generatorStore.ts"
import { tcpRefusal } from "../src/features/cam/lib/kernel-tcp.ts"

setDefaultTimeout(120_000)
let app: Awaited<ReturnType<typeof bootLiveApp>>
beforeAll(async () => { app = await bootLiveApp() })
afterAll(async () => { await app.dispose() })
afterEach(() => resetStores())

const plate = {
  id: "plate", type: "parametric", name: "Plate", x: 0, y: 0, z: 0, layerId: "default",
  history: {
    parameters: {},
    features: [
      { id: "base", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "baser", kind: "rectangle", at: [0, 0], width: 80, height: 50 }] } },
      { id: "slab", type: "extrude", sketch: "base", depth: 12, operation: "new" },
      { id: "c", type: "hole", plane: "XY", offset: 12, at: [30, 25], diameter: 5, depth: 12, kind: "countersink", headDiameter: 10, angle: 90 }
    ]
  }
}

test("the tip-control switch is available only for a five-axis machine whose post has a tip-control word, and says why otherwise", () => {
  expect(tcpRefusal({ machine: "vmc-standard" })?.key).toBe("cam.kernel.tcpNeedsFiveAxis")
  expect(tcpRefusal({})?.key).toBe("cam.kernel.tcpNeedsFiveAxis")
  expect(tcpRefusal({ machine: "trunnion-5ax" })).toBeUndefined()
  expect(tcpRefusal({ machine: "kern-micro-hd-hsk40" })).toBeUndefined()
})

test("the breadth switches reach the real sidecar: the countersink becomes a cycle, the rule is shown in the notes, and the switches are restored from the stored request", async () => {
  useElementsStore.getState().addElements([plate as never])
  useElementsStore.setState({ selectedElement: null })
  const view = app.visit("/cam")
  try {
    const holes = await app.wait(() => document.querySelector<HTMLInputElement>("[data-testid='kernel-breadth-hole-cycles']"), 30_000)
    expect(holes.checked).toBe(false)
    expect(useGeneratorStore.getState().kernelSettings.breadth).toBeUndefined()
    // The switch says why tip control is not there for the default three-axis machine, and cannot be turned on.
    const tcp = document.querySelector<HTMLInputElement>("[data-testid='kernel-tcp']")!
    expect(tcp.disabled).toBe(true)
    expect(document.querySelector("[data-testid='kernel-tcp-hint']")?.textContent).toMatch(/5-axis/)
    holes.click()
    expect(useGeneratorStore.getState().kernelSettings.breadth).toEqual({ holeCycles: true })
    document.querySelector<HTMLInputElement>("[data-testid='kernel-breadth-tilted']")!.click()
    expect(useGeneratorStore.getState().kernelSettings.breadth).toEqual({ holeCycles: true, tilted: true })
    const button = await app.wait(() => document.querySelector<HTMLButtonElement>("[data-testid='kernel-generate']:not([disabled])"), 30_000)
    button.click()
    const notes = await app.wait(() => document.querySelector("[data-testid='kernel-notes']"), 90_000)
    expect(notes.textContent).toMatch(/H1-countersink-cycle: c planned/)
    expect(notes.textContent).toMatch(/Tilted drilling needs a five-axis machine/)
    const store = useCamStore.getState()
    expect(store.kernelRequest?.breadth).toEqual({ holeCycles: true, tilted: true })
    // Turning one switch off leaves the other; the last one off removes the key.
    holes.click()
    expect(useGeneratorStore.getState().kernelSettings.breadth).toEqual({ tilted: true })
    useGeneratorStore.getState().patchKernelSettings({ breadth: undefined })
    restoreKernelSettings(store.kernelRequest!)
    expect(useGeneratorStore.getState().kernelSettings.breadth).toEqual({ holeCycles: true, tilted: true })
  } finally { view.dispose(); useGeneratorStore.getState().patchKernelSettings({ breadth: undefined, tcp: undefined }) }
})

test("tip control is switchable on a five-axis machine and is sent with the request", async () => {
  useElementsStore.getState().addElements([plate as never])
  useElementsStore.setState({ selectedElement: null })
  const view = app.visit("/cam")
  try {
    const tcp = await app.wait(() => document.querySelector<HTMLInputElement>("[data-testid='kernel-tcp']"), 30_000)
    useGeneratorStore.getState().patchKernelSettings({ machine: "trunnion-5ax" })
    await app.wait(() => (document.querySelector<HTMLInputElement>("[data-testid='kernel-tcp']")?.disabled === false ? true : undefined), 30_000)
    tcp.click()
    expect(useGeneratorStore.getState().kernelSettings.tcp).toBe(true)
    const button = await app.wait(() => document.querySelector<HTMLButtonElement>("[data-testid='kernel-generate']:not([disabled])"), 30_000)
    button.click()
    await app.wait(() => document.querySelector("[data-testid='kernel-evidence']"), 90_000)
    expect(useCamStore.getState().kernelRequest?.tcp).toBe(true)
    // Back to a three-axis machine: the request no longer asks for tip control, and the switch is off and says why.
    useGeneratorStore.getState().patchKernelSettings({ machine: "vmc-standard" })
    await app.wait(() => (document.querySelector<HTMLInputElement>("[data-testid='kernel-tcp']")?.disabled === true ? true : undefined), 30_000)
    expect(document.querySelector<HTMLInputElement>("[data-testid='kernel-tcp']")!.checked).toBe(false)
  } finally { view.dispose(); useGeneratorStore.getState().patchKernelSettings({ breadth: undefined, tcp: undefined, machine: "vmc-standard" }) }
})
