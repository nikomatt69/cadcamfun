import { expect, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"

test("the CAD canvas mounts without WebGL and keeps its overlays usable", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: CADCanvas } = await import("../src/features/cad/components/CADCanvas.tsx")
  const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
  const { useSelectionStore } = await import("../src/features/cad/store/selectorStore.ts")
  const { useTransformControlsStore } = await import("../src/features/cad/store/transformControlsStore.ts")
  const { AppProvider, createAppState } = await import("../src/shared/state/context.ts")
  const { fakeRuntime } = await import("../src/shared/state/client.ts")
  const connection = fakeRuntime()
  const state = createAppState({ client: connection.client, runtime: connection.runtime })
  const root = document.createElement("div")
  document.body.append(root)
  let saves = 0
  const dispose = render(() => AppProvider({ state, get children() { return CADCanvas({ onSave: () => { saves++ } }) } }), root)
  try {
    expect(root.textContent).toContain("needs WebGL")
    expect(root.querySelector("[title='Toggle Elements List']")).not.toBeNull()
    expect(root.querySelector("[title='Show keyboard shortcuts (? or F2)']")).not.toBeNull()

    // Selection state drives the overlays even though nothing is drawn.
    const id = useElementsStore.getState().addElement({ type: "cube", x: 0, y: 0, z: 0, width: 1, height: 1, depth: 1 })
    useSelectionStore.getState().selectElement(id)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(useElementsStore.getState().selectedElement?.id).toBe(id)
    expect(root.textContent).toContain("Move (G)")
    expect(root.querySelector("[title='Show Element Properties']")).not.toBeNull()
    expect(root.querySelectorAll('.cad-viewport-transforms button[aria-pressed="true"]')).toHaveLength(1)
    useTransformControlsStore.getState().setMode("none")
    const mac = /mac/i.test(navigator.platform)
    window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "s", metaKey: mac, ctrlKey: !mac, cancelable: true }))
    expect(saves).toBe(1)
    expect(useTransformControlsStore.getState().mode).toBe("none")

    useSelectionStore.getState().clearSelection()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(useElementsStore.getState().selectedElement).toBeNull()
    expect(root.textContent).not.toContain("Move (G)")
  } finally { dispose(); state.dispose() }
})
