/**
 * The person's side of "make it parametric" and the Fusion-style shortcuts, mounted for real over the elements store: the property
 * panel's buttons turn the selected element into its parametric twin (same solid, same place), and the parametric panel appends a
 * coil, a copy, a split and a scale to a history.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { cam, historyVolume, rebuild, type History } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"

type Store = typeof import("../src/features/cad/store/elementsStore.ts")["useElementsStore"]
let useElementsStore: Store
let useLayerStore: typeof import("../src/features/cad/store/layerStore.ts")["useLayerStore"]
let mountProperties: () => () => void
let app: ReturnType<typeof import("../src/shared/state/context.ts")["createAppState"]>
let mountParametric: (history: History) => { readonly id: string; readonly dispose: () => void }
let realConfirm: typeof window.confirm
let answer = true
const SLOW = 90_000

const tick = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const button = (label: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === label)
  if (found === undefined) throw new Error(`No button '${label}'`)
  return found
}
const click = async (label: string): Promise<void> => { button(label).click(); await tick(60) }
const all = () => useElementsStore.getState().elements as Array<Record<string, any>>
const volumeOfTwin = (e: Record<string, any>): number => historyVolume(rebuild(e["history"] as History))

beforeAll(async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { createComponent } = await import("solid-js")
  const { default: PropertyPanel } = await import("../src/features/cad/components/PropertyPanel.tsx")
  const { default: ParametricPanel } = await import("../src/features/cad/components/ParametricPanel.tsx")
  ;({ useElementsStore } = await import("../src/features/cad/store/elementsStore.ts"))
  ;({ useLayerStore } = await import("../src/features/cad/store/layerStore.ts"))
  const { createFakeApi } = await import("../src/testing/fake-api.ts")
  const { runtimeForClient } = await import("../src/app/client.ts")
  const { createAppState, AppProvider } = await import("../src/shared/state/context.ts")
  const client = createFakeApi()
  app = createAppState({ client, runtime: runtimeForClient(client), sidecar: "fake" })
  mountProperties = () => {
    const host = document.createElement("div")
    document.body.append(host)
    // The panel's library button reads the app context, so it is mounted inside the provider as in the application.
    const dispose = render(() => AppProvider({ state: app, get children() { return createComponent(PropertyPanel, {}) } }), host)
    return () => { dispose(); host.remove() }
  }
  mountParametric = (history) => {
    const id = useElementsStore.getState().addElement({ type: "parametric", x: 0, y: 0, z: 0, history })
    const host = document.createElement("div")
    document.body.append(host)
    const dispose = render(() => {
      const store = useElementsStore()
      return createComponent(ParametricPanel, { get element() { return store.elements.find((e) => e.id === id)! }, locked: false })
    }, host)
    return { id, dispose: () => { dispose(); host.remove() } }
  }
  realConfirm = window.confirm
  window.confirm = () => answer
})
afterAll(() => { window.confirm = realConfirm; app.dispose() })
beforeEach(() => { answer = true; useElementsStore.setState({ elements: [], selectedElement: null, selectedElements: [] }) })

describe("the property panel makes the selected element parametric", () => {
  const select = (element: Record<string, unknown>): string => {
    const id = useElementsStore.getState().addElement(element)
    expect(id).not.toBe("")
    useElementsStore.getState().selectElement(id)
    return id
  }

  test("Make parametric keeps the original and adds a twin with the same volume in the same place and layer", async () => {
    expect(useLayerStore.getState().activeLayer).toBeTruthy()
    const id = select({ type: "cube", width: 30, height: 20, depth: 10, x: 5, y: 6, z: 7, name: "Block" })
    const original = all().find((e) => e["id"] === id)!
    const unmount = mountProperties()
    try {
      await tick(50)
      await click("Make parametric")
      const twin = all().find((e) => e["type"] === "parametric")!
      expect(all()).toHaveLength(2)
      expect(twin).toMatchObject({ x: 5, y: 6, z: 7, name: "Block (parametric)", layerId: original["layerId"] })
      expect(Object.keys(twin["history"].parameters)).toEqual(["width", "height", "depth"])
      expect(Math.abs(volumeOfTwin(twin) / cam.model.volumeOf(cam.model.elementMesh(original, 0.01)!) - 1)).toBeLessThan(1e-3)
      expect(useElementsStore.getState().selectedElement?.id).toBe(twin["id"])
    } finally { unmount() }
  }, SLOW)

  test("Replace with parametric asks first, and removes the original only when the person agrees", async () => {
    const id = select({ type: "cylinder", radius: 9, height: 40 })
    const unmount = mountProperties()
    try {
      await tick(50)
      answer = false
      await click("Replace with parametric")
      expect(all().map((e) => e["type"])).toEqual(["cylinder"])
      answer = true
      await click("Replace with parametric")
      expect(all().map((e) => e["type"])).toEqual(["parametric"])
      expect(all().some((e) => e["id"] === id)).toBe(false)
    } finally { unmount() }
  }, SLOW)

  test("what has no measures to convert gets no button: a parametric part, a mesh, text", async () => {
    const { canMakeParametric } = await import("../src/features/cad/lib/makeParametric.ts")
    for (const type of ["parametric", "mesh", "text3d", "boolean-union"]) expect(canMakeParametric({ type })).toBe(false)
    for (const type of ["cube", "gear", "wall", "spring", "rectangle", "component"]) expect(canMakeParametric({ type })).toBe(true)
    const id = select({ type: "text3d", text: "CAD", height: 8 })
    const unmount = mountProperties()
    try {
      await tick(50)
      expect([...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").trim() === "Make parametric")).toBe(false)
      expect(all().some((e) => e["id"] === id)).toBe(true)
    } finally { unmount() }
  }, SLOW)
})

describe("the parametric panel's Fusion-style shortcuts", () => {
  const plate = (): History => ({
    parameters: { w: 40 },
    features: [
      { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: "w", height: 20, centered: true }] } },
      { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" }
    ]
  })
  const stored = (id: string): History => all().find((e) => e["id"] === id)!["history"] as History

  test("Coil, Copy body, Split body and Scale each append their feature and the part rebuilds", async () => {
    const mounted = mountParametric(plate())
    try {
      await tick(50)
      await click("Coil")
      await click("Copy body")
      await click("Split body")
      await click("Scale")
      const history = stored(mounted.id)
      expect(history.features.map((f) => f.type)).toEqual(["sketch", "extrude", "coil", "move", "split", "scale"])
      expect(history.features.find((f) => f.type === "move")).toMatchObject({ copy: true })
      // Through the middle of the bodies there are when it is added (the plate, the coil and the copy), not of the plate alone.
      const split = history.features.find((f) => f.type === "split") as { offset: number }
      expect(split).toMatchObject({ plane: "XY", keep: "both" })
      expect(split.offset).toBeGreaterThan(0)
      expect(split.offset).toBeLessThan(20)
      const built = rebuild(history)
      expect(built.issues.filter((i) => i.severity === "error")).toEqual([])
      // The plate, the coil, the copy of both, and the halves the split makes of what it crosses.
      expect(built.bodies.length).toBeGreaterThanOrEqual(4)
    } finally { mounted.dispose() }
  }, SLOW)

  test("with nothing to act on, a shortcut says so instead of appending", async () => {
    const mounted = mountParametric({ parameters: {}, features: [{ id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 10, height: 10 }] } }] })
    try {
      await tick(50)
      await click("Copy body")
      expect(stored(mounted.id).features).toHaveLength(1)
      expect(document.body.textContent).toContain("There is no solid to copy yet")
    } finally { mounted.dispose() }
  }, SLOW)
})
