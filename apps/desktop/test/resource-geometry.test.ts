import { expect, test } from "bun:test"
import * as THREE from "three"
import { resourceElements, resourcePreviewElements } from "../src/features/library/lib/resource-geometry.ts"
import { createComponentPreviewObject } from "../src/features/library/lib/component-preview.ts"
import { createThreeObject } from "../src/features/cad/lib/createThreeObject.ts"
import { initializeElementTransform, type ElementTransformFields } from "../src/features/cad/lib/element-transform.ts"
import { disposeObject } from "../src/features/cad/lib/sceneHelpers.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"

test("saved preview geometry keeps nested component poses without changing the saved document", () => {
  const data = { elements: [{ id: "assembly", type: "component", x: 30, rotation: { x: 0, y: 0, z: 90 }, elements: [
    { id: "body", type: "cube", x: 10, y: 0, width: 4, height: 6, depth: 2 },
    { id: "insert", type: "component", y: 20, elements: [{ id: "pin", type: "cube", width: 2, height: 2, depth: 2 }] }
  ] }] }
  const before = structuredClone(data)
  const elements = resourcePreviewElements(resourceElements(data))
  const object = createThreeObject(elements[0]!, { x: 0, y: 0, z: 0 })!
  try {
    initializeElementTransform(object, elements[0]! as ElementTransformFields)
    expect(object.children).toHaveLength(2)
    expect(object.children[1]!.children).toHaveLength(1)
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
    expect(size.x).toBeGreaterThan(10)
    expect(size.y).toBeGreaterThan(2)
    expect(data).toEqual(before)
  } finally { disposeObject(object) }
})

test("saved preview geometry unwraps legacy JSON envelopes and maps box primitives", () => {
  const source = JSON.stringify({ data: JSON.stringify({ componentData: { children: [
    { id: "legacy-box", type: "box", width: 12, height: 8, depth: 4 }
  ] } }) })
  const elements = resourcePreviewElements(resourceElements(source))
  expect(elements).toHaveLength(1)
  expect(elements[0]!.type).toBe("cube")
  const object = createThreeObject(elements[0]!, { x: 0, y: 0, z: 0 })!
  try { expect(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).toArray()).toEqual([12, 8, 4]) }
  finally { disposeObject(object) }
})

test("component details preview builds legacy primitives and nested custom components directly", () => {
  const elements = resourceElements({ elements: [{ id: "custom", type: "custom", x: 2, elements: [
    { id: "cylinder", type: "cylinder", x: 4, radius: 3, height: 8 },
    { id: "nested", type: "component", y: 5, elements: [{ id: "sphere", type: "sphere", radius: 2 }] }
  ] }] })
  const object = createComponentPreviewObject(elements[0]!)!
  try {
    expect(object.children).toHaveLength(2)
    expect(object.position.x).toBe(2)
    const bounds = new THREE.Box3().setFromObject(object)
    expect(bounds.getSize(new THREE.Vector3()).x).toBeGreaterThan(7)
    expect(bounds.getSize(new THREE.Vector3()).y).toBeGreaterThan(5)
  } finally { disposeObject(object) }
})

test("Boolean previews resolve saved operands even when the active drawing contains different bodies", () => {
  const data = { elements: [
    { id: "a", type: "cube", x: 0, y: 0, width: 10, height: 10, depth: 10 },
    { id: "b", type: "cube", x: 4, y: 0, width: 10, height: 10, depth: 10 },
    { id: "union", type: "boolean-union", operands: ["a", "b"] }
  ] }
  const previous = useElementsStore.getState().elements
  useElementsStore.setState({ elements: [{ id: "a", type: "cube", layerId: "default", width: 999, height: 999, depth: 999 }] })
  try {
    const elements = resourcePreviewElements(resourceElements(data))
    expect(elements).toHaveLength(1)
    expect(elements[0]!.type).toBe("mesh")
    const object = createThreeObject(elements[0]!, { x: 0, y: 0, z: 0 })!
    try { expect(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).x).toBeCloseTo(14) }
    finally { disposeObject(object) }
    expect(useElementsStore.getState().elements[0]!["width"]).toBe(999)
  } finally { useElementsStore.setState({ elements: previous }) }
})
