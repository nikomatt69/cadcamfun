import { expect, test } from "bun:test"
import { plateTemplate } from "@cadcamfun/core"
import { installDom } from "./helpers/dom.ts"

test("drawing panel exports a derived preview and invalidates it when the source or options change", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: Panel } = await import("../src/features/cad/components/DrawingPanel.tsx")
  const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
  const elements = useElementsStore.getState()
  const before = [...elements.elements]
  const id = elements.addElement({ type: "parametric", history: plateTemplate(), name: "Drawing plate", x: 0, y: 0, z: 0 })
  const source = JSON.stringify(elements.elements)
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => Panel(), root)
  const waitForPreview = async () => {
    for (let i = 0; i < 100 && !root.querySelector('img'); i++) await new Promise((r) => setTimeout(r, 10))
    expect(root.querySelector('img')).not.toBeNull()
  }
  try {
    const generate = () => [...root.querySelectorAll('button')].find((b) => b.textContent === "Generate drawing")!
    generate().click()
    await waitForPreview()
    expect(JSON.stringify(elements.elements)).toBe(source)
    expect(root.textContent).toContain("Export PDF")
    expect(root.textContent).toContain("300 dpi")
    const paper = [...root.querySelectorAll('select')].find((s) => s.textContent === "A4A3A2")!
    paper.value = "A4"; paper.dispatchEvent(new Event("change", { bubbles: true }))
    await Promise.resolve()
    expect(root.querySelector('img')).toBeNull()
    generate().click(); await waitForPreview()
    expect(root.textContent).toContain("297 × 210 mm")
    elements.updateElement(id, { history: { ...plateTemplate(), parameters: { ...plateTemplate().parameters, width: 90 } } })
    await Promise.resolve()
    expect(root.querySelector('img')).toBeNull()
  } finally { dispose(); root.remove(); useElementsStore.setState({ elements: before, selectedElement: null }) }
}, 60000)
