import { expect, test } from "bun:test"
import { cam } from "@cadcamfun/core"
import { formDefaults } from "../src/cad/lib/formDefaults.ts"
import { getFieldsForElementType } from "../src/cad/lib/propertyFields.ts"

test("the Parametric tool creates a plate with a feature history that builds a solid", () => {
  const element: Record<string, unknown> = { ...formDefaults("parametric"), type: "parametric" }
  expect(element["history"]).toBeDefined()
  expect(cam.model.elementMesh(element as never)).toBeDefined()
})

test("a parametric element's property fields are placement and look, not primitive dimensions", () => {
  const names = getFieldsForElementType("parametric").map((field) => field.name)
  expect(names).toContain("color")
  for (const primitive of ["width", "height", "depth", "radius", "segments"]) expect(names).not.toContain(primitive)
})

test("a Boolean consumes its operands only when it forms a solid", async () => {
  const { useElementsStore } = await import("../src/cad/store/elementsStore.ts")
  const { booleanFormed } = await import("../src/cad/lib/createThreeObject.ts")
  const store = useElementsStore.getState()
  const a = store.addElement({ type: "cube", x: 0, y: 0, z: 0, width: 20, height: 20, depth: 20 })
  const b = store.addElement({ type: "cylinder", x: 0, y: 0, z: 0, radius: 4, height: 40 })
  const good = { id: "bool-good", type: "boolean-subtract", operands: [a, b] }
  const missing = { id: "bool-missing", type: "boolean-subtract", operands: [a, "nope"] }
  expect(booleanFormed(good)).toBe(true)
  expect(booleanFormed(missing)).toBe(false)
})

test("the canvas draws every element except those hidden by themselves or by an existing hidden layer", async () => {
  const { isDrawn } = await import("../src/cad/lib/sceneHelpers.ts")
  const layers = [{ id: "a", visible: true }, { id: "b", visible: false }]
  expect(isDrawn({ layerId: "a" }, layers)).toBe(true)
  expect(isDrawn({ layerId: "b" }, layers)).toBe(false)
  expect(isDrawn({ layerId: "a", visible: false }, layers)).toBe(false)
  // A layer nobody listed (a stored drawing, a name the assistant used) must not make the element vanish.
  expect(isDrawn({ layerId: "default" }, layers)).toBe(true)
})
