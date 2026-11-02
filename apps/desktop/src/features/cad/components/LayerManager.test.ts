import { expect, test } from "bun:test"

test("layer controls expose their target and editing supports the keyboard", async () => {
  const { installDom } = await import("../../../../test/helpers/dom.ts")
  installDom()
  const { render } = await import("solid-js/web")
  const { default: LayerManager } = await import("./LayerManager.tsx")
  const { useLayerStore } = await import("../store/layerStore.ts")
  const original = useLayerStore.getState()
  const id = original.activeLayer
  const name = original.layers.find((layer) => layer.id === id)!.name
  const root = document.createElement("div")
  document.body.replaceChildren(root)
  const dispose = render(() => LayerManager(), root)
  try {
    const action = (label: string): HTMLButtonElement => root.querySelector<HTMLButtonElement>(`button[aria-label="${label}: ${name}"]`)!
    expect(action("Hide Layer")).not.toBeNull()
    action("Edit Layer").click()
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Layer name"]')!
    expect(input).not.toBeNull()
    input.value = "Revised layer"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    expect(useLayerStore.getState().layers.find((layer) => layer.id === id)?.name).toBe("Revised layer")
    expect(root.querySelector('button[aria-label="Hide Layer: Revised layer"]')).not.toBeNull()
  } finally {
    dispose()
    useLayerStore.setState({ layers: original.layers, activeLayer: original.activeLayer })
  }
}, 120000)
