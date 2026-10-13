import { expect, setDefaultTimeout, test } from "bun:test"
import { installDom } from "./helpers/dom.ts"
import { sceneToStep, stepToElements } from "@cadcamfun/core"

// The kernel builds, writes and reads a solid before the panel renders; under a loaded machine 5 s is too short.
setDefaultTimeout(60_000)

const importedPlate = () =>
  stepToElements(
    sceneToStep([
      { id: "a", type: "cube", width: 40, height: 30, depth: 10, x: 0, y: 0, z: 0 },
      { id: "b", type: "cylinder", radius: 5, height: 20, x: 0, y: 0, z: 0 },
      { id: "c", type: "boolean-subtract", operands: ["a", "b"], name: "plate" }
    ]).step!
  )

test("the property panel shows the exact model of a STEP import at once", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: ExactModelPanel } = await import("../src/features/cad/components/ExactModelPanel.tsx")
  const element = { ...importedPlate().elements[0]!, id: "imp" } as Record<string, unknown>
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(() => ExactModelPanel({ element, all: [element] }), root)
  try {
    await new Promise((resolve) => setTimeout(resolve, 80))
    const stats = root.querySelector("[data-testid='exact-stats']")
    expect(stats).not.toBeNull()
    expect(stats!.textContent).toContain("mm³")
    expect(stats!.textContent).toContain("cylinder 1")
    expect(stats!.textContent).toContain("yes")
  } finally { dispose() }
})

