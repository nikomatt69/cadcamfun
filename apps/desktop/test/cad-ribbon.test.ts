import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

test("CAD ribbon opens modeling operations and keeps section controls in sync", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: Ribbon } = await import("../src/features/cad/components/CadRibbon.tsx")
  const { useCADStore } = await import("../src/features/cad/store/cadStore.ts")
  const { DEFAULT_SECTION } = await import("../src/features/cad/lib/section.ts")
  useCADStore.setState({ section: DEFAULT_SECTION, viewMode: "2d" })
  const root = document.createElement("div")
  document.body.append(root)
  const picked: string[] = []
  const dispose = render(() => Ribbon({ ready: true, onSurface: op => picked.push(op), onBoolean: () => {} }), root)
  try {
    root.querySelector<HTMLButtonElement>('button[title="Shell (Hollow)"]')!.click()
    expect(picked).toEqual(["shell"])
    expect(root.textContent).not.toContain("Fit view")
    root.querySelector<HTMLButtonElement>('button[title="Section view"]')!.click()
    await Promise.resolve()
    expect(useCADStore.getState().viewMode).toBe("3d")
    expect(useCADStore.getState().section.enabled).toBe(true)
    const axis = root.querySelector<HTMLSelectElement>('select[aria-label="Clipping axis"]')!
    axis.value = "x"
    axis.dispatchEvent(new Event("change", { bubbles: true }))
    expect(useCADStore.getState().section.axis).toBe("x")
    const position = root.querySelector<HTMLInputElement>('input[aria-label="Position"]')!
    position.value = "12.5"
    position.dispatchEvent(new Event("input", { bubbles: true }))
    expect(useCADStore.getState().section.position).toBe(12.5)
    position.value = ""
    position.dispatchEvent(new Event("input", { bubbles: true }))
    expect(useCADStore.getState().section.position).toBe(12.5)
    useCADStore.getState().setSection({ enabled: false })
    await Promise.resolve()
    expect(root.querySelector("select")).toBeNull()
  } finally { dispose(); root.remove(); useCADStore.setState({ section: DEFAULT_SECTION, viewMode: "3d" }) }
}, 60000)

test("boolean ribbon actions require two selected unlocked elements", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: Ribbon } = await import("../src/features/cad/components/CadRibbon.tsx")
  const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
  const { useSelectionStore } = await import("../src/features/cad/store/selectorStore.ts")
  const { useLayerStore } = await import("../src/features/cad/store/layerStore.ts")
  const elements = useElementsStore.getState()
  const layerId = useLayerStore.getState().activeLayer
  const selection = useSelectionStore.getState()
  selection.clearSelection()
  const root = document.createElement("div")
  document.body.append(root)
  const picked: string[] = []
  const dispose = render(() => Ribbon({ ready: true, onSurface: () => {}, onBoolean: op => picked.push(op) }), root)
  const button = () => root.querySelector<HTMLButtonElement>('button[title="Union"]')!
  const ids: string[] = []
  try {
    expect(button().disabled).toBe(true)
    ids.push(elements.addElement({ type: "cube", layerId, x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 }))
    ids.push(elements.addElement({ type: "cube", layerId, x: 5, y: 0, z: 0, width: 10, height: 10, depth: 10 }))
    selection.selectElement(ids[0]!)
    selection.selectElement(ids[1]!, true)
    await Promise.resolve()
    expect(button().disabled).toBe(false)
    button().click()
    expect(picked).toEqual(["union"])
    useLayerStore.getState().updateLayer(layerId, { locked: true })
    await Promise.resolve()
    expect(button().disabled).toBe(true)
  } finally {
    dispose(); root.remove(); useLayerStore.getState().updateLayer(layerId, { locked: false }); selection.clearSelection()
    for (const id of ids) elements.deleteElement(id)
  }
}, 60000)

test("ribbon clipboard actions respect selection and the destination layer lock", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: Ribbon } = await import("../src/features/cad/components/CadRibbon.tsx")
  const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
  const { useSelectionStore } = await import("../src/features/cad/store/selectorStore.ts")
  const { useLayerStore } = await import("../src/features/cad/store/layerStore.ts")
  const elements = useElementsStore.getState()
  const before = [...elements.elements]
  const layer = useLayerStore.getState().activeLayer
  const root = document.createElement("div")
  document.body.append(root)
  useSelectionStore.getState().clearSelection()
  useElementsStore.setState({ clipboard: null })
  const dispose = render(() => Ribbon({ ready: true, onSurface: () => {}, onBoolean: () => {} }), root)
  const button = (label: string) => root.querySelector<HTMLButtonElement>(`button[title="${label}"]`)!
  try {
    expect(button("Copy").disabled).toBe(true)
    expect(button("Paste").disabled).toBe(true)
    expect(button("Box").disabled).toBe(false)
    button("Box").click()
    await Promise.resolve()
    const form = document.body.querySelector("form")!
    expect(form).not.toBeNull()
    const width = form.querySelector<HTMLInputElement>('input[name="width"]')!
    width.value = "24"
    width.dispatchEvent(new Event("input", { bubbles: true }))
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    expect(useElementsStore.getState().elements.at(-1)?.["width"]).toBe(24)
    const created = useElementsStore.getState().elements.at(-1)!
    elements.deleteElement(created.id)
    const id = elements.addElement({ type: "cube", x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 })
    useSelectionStore.getState().selectElement(id)
    await Promise.resolve()
    button("Copy").click()
    await Promise.resolve()
    expect(useElementsStore.getState().clipboard?.id).toBe(id)
    expect(button("Paste").disabled).toBe(false)
    button("Paste").click()
    expect(useElementsStore.getState().elements.length).toBe(before.length + 2)
    useLayerStore.getState().updateLayer(layer, { locked: true })
    await Promise.resolve()
    expect(button("Paste").disabled).toBe(true)
    expect(button("Parametric part").disabled).toBe(true)
  } finally {
    dispose(); root.remove(); useLayerStore.getState().updateLayer(layer, { locked: false })
    useSelectionStore.getState().clearSelection()
    useElementsStore.setState({ elements: before, clipboard: null, selectedElement: null })
  }
}, 60000)
