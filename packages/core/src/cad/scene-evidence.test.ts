import { expect, test } from "bun:test"
import { sceneGeometryText } from "./scene-evidence.ts"
test("scene evidence ignores presentation remapping and retains exact geometric identity", () => {
  const e = { id: "a", type: "component", x: 2, elements: [{ id: "b", type: "cube", width: 10, layer: "local", color: "red" }] }
  const styled = { ...e, name: "display", elements: [{ color: "blue", layer: "persisted", width: 10, type: "cube", id: "b" }] }
  expect(sceneGeometryText([e])).toBe(sceneGeometryText([styled]))
  expect(sceneGeometryText([e])).not.toBe(sceneGeometryText([{ ...e, x: 3 }]))
  expect(sceneGeometryText([e])).not.toBe(sceneGeometryText([{ ...e, elements: [{ ...e.elements[0], width: 11 }] }]))
})
