import { expect, setDefaultTimeout, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"
import { sceneToStep, stepToElements } from "@cadcamfun/core"

setDefaultTimeout(60_000)

/** A 40 x 30 x 10 plate with a Ø10 through hole, as a STEP import (an element with an exact model and no history). */
const plate = () =>
  stepToElements(
    sceneToStep([
      { id: "a", type: "cube", width: 40, height: 30, depth: 10, x: 0, y: 0, z: 0 },
      { id: "b", type: "cylinder", radius: 5, height: 20, x: 0, y: 0, z: 0 },
      { id: "c", type: "boolean-subtract", operands: ["a", "b"], name: "plate" }
    ]).step!
  )

const disc = (d: number, h: number) => Math.PI * (d / 2) ** 2 * h

test("the exact model panel resizes and fills a recognised hole as a new solid and refuses what the kernel refuses", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: ExactModelPanel } = await import("../src/features/cad/components/ExactModelPanel.tsx")
  const { useElementsStore } = await import("../src/features/cad/store/elementsStore.ts")
  useElementsStore.setState({ elements: [] })
  const element = { ...plate().elements[0]!, id: "imp" } as Record<string, unknown>
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => ExactModelPanel({ element, all: [element] }), root)
  try {
    await new Promise((resolve) => setTimeout(resolve, 100))
    const rows = root.querySelectorAll("[data-testid='exact-hole-edit'] [data-hole]")
    expect(rows).toHaveLength(1)
    // Resize: type 14 and apply. The volume is the plate minus the new bore, to the closed form.
    const field = root.querySelector<HTMLInputElement>("#exact-hole-0")!
    field.value = "14"
    field.dispatchEvent(new window.Event("input", { bubbles: true }))
    field.dispatchEvent(new window.Event("change", { bubbles: true }))
    root.querySelector<HTMLButtonElement>("[data-testid='exact-hole-resize']")!.click()
    const created = () => useElementsStore.getState().elements.filter((e) => e["type"] === "brep")
    expect(created()).toHaveLength(1)
    expect(created()[0]!["name"]).toBe("plate hole 1 Ø14")
    expect(root.querySelector("[data-testid='exact-hole-message']")!.textContent).toContain(`volume ${(40 * 30 * 10 - disc(14, 10)).toLocaleString(undefined, { maximumFractionDigits: 3 })} mm³`)
    // Fill: the plate is whole again.
    root.querySelector<HTMLButtonElement>("[data-testid='exact-hole-fill']")!.click()
    expect(created()).toHaveLength(2)
    expect(created()[1]!["name"]).toBe("plate hole 1 filled")
    expect(root.querySelector("[data-testid='exact-hole-message']")!.textContent).toContain(`volume ${(40 * 30 * 10).toLocaleString()} mm³`)
    // A diameter wider than the plate breaks into the walls: refused with the kernel's reason, nothing added.
    field.value = "60"
    field.dispatchEvent(new window.Event("input", { bubbles: true }))
    field.dispatchEvent(new window.Event("change", { bubbles: true }))
    root.querySelector<HTMLButtonElement>("[data-testid='exact-hole-resize']")!.click()
    expect(created()).toHaveLength(2)
    expect(root.querySelector("[data-testid='exact-hole-message']")!.getAttribute("role")).toBe("alert")
  } finally { dispose() }
})
