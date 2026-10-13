import { afterEach, beforeEach, expect, test } from "bun:test"
import * as THREE from "three"
import { componentBounds, componentEntries, componentLibraryDocument, createComponentAssembly, libraryComponentElement } from "./component-assembly.ts"
import { transformLibraryItemToCADElement, createComponentPreview } from "./libraryTransform.ts"
import { buildElementObject, disposeObject } from "./sceneHelpers.ts"
import { useElementsStore, type Element } from "../store/elementsStore.ts"
import { useSelectionStore } from "../store/selectorStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { useCADStore } from "../store/cadStore.ts"

const cube = (id: string, x: number, extra = {}): Element => ({ id, type: "cube", name: id, layerId: "default", x, y: 0, z: 0, width: 10, height: 4, depth: 2, ...extra })
const nested = (): Element => ({ id: "assembly", type: "component", name: "Nested bracket", layerId: "default", x: 30, y: 0, z: 0,
  rotation: { z: 90 }, scale: { x: 2, y: 1, z: 1 }, elements: [
    { id: "subassembly", type: "component", name: "Subassembly", layerId: "default", x: 10, y: 0, z: 0,
      elements: [cube("child", 3, { color: "#123456", metadata: { material: "aluminium" }, rotation: { z: 45 } })] }
  ] })
const positions = (elements: Element[]): number[][] => {
  const values: number[][] = []
  for (const element of elements) {
    const object = buildElementObject(element)!
    object.updateMatrixWorld(true)
    object.traverse((child) => {
      const geometry = (child as THREE.Mesh).geometry
      const attr = geometry?.getAttribute("position")
      if (!attr) return
      for (let i = 0; i < attr.count; i++) values.push(new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(child.matrixWorld).toArray().map((value) => Number(value.toFixed(4))))
    })
    disposeObject(object)
  }
  return values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}
beforeEach(() => {
  useCADStore.setState({ originOffset: { x: 0, y: 0, z: 0 } })
  useElementsStore.setState({ elements: [], selectedElement: null, selectedElements: [], history: [[]], currentHistoryIndex: 0 })
  useSelectionStore.getState().clearSelection()
})

afterEach(() => useCADStore.setState({ originOffset: { x: 0, y: 0, z: 0 } }))

test("creating an assembly preserves the visible vertices of nested transformed components and lines", () => {
  const chosen = [nested(), { id: "line", name: "Line", type: "line", layerId: "default", x1: 50, y1: 2, z1: 1, x2: 70, y2: 8, z2: 4 }]
  const before = positions(chosen)
  const assembled = createComponentAssembly(chosen, { name: "Complete assembly", layerId: "default", tags: ["fixture"] })
  expect(positions([assembled])).toEqual(before)
  expect(componentEntries(assembled.elements).length).toBe(4)
  const descendant = assembled.elements[0].elements[0].elements[0]
  expect(descendant.color).toBe("#123456")
  expect(descendant.metadata).toEqual({ material: "aluminium" })
  expect(descendant.id).not.toBe("child")
  descendant.width = 99
  expect(chosen[0]!.elements[0].elements[0].width).toBe(10)
})

test("one undo restores the complete selection; redo restores the new component", () => {
  const chosen = [cube("a", 0), nested()]
  useElementsStore.getState().addElements(chosen)
  useSelectionStore.getState().selectMultiple(chosen.map((e) => e.id))
  const historyIndex = useElementsStore.getState().currentHistoryIndex
  const id = useSelectionStore.getState().saveAsComponent()
  expect(id).not.toBe("")
  expect(useElementsStore.getState().elements.map((e) => e.id)).toEqual([id])
  expect(useElementsStore.getState().selectedElement?.id).toBe(id)
  expect(useElementsStore.getState().currentHistoryIndex).toBe(historyIndex + 1)
  useElementsStore.getState().undo()
  expect(useElementsStore.getState().elements).toEqual(chosen)
  useElementsStore.getState().redo()
  expect(useElementsStore.getState().elements[0]!.id).toBe(id)
})

test("copy creation keeps the sources and selects the whole new assembly", () => {
  const original = nested()
  useElementsStore.getState().addElement(original)
  const component = createComponentAssembly([original], { name: "Copy", layerId: useLayerStore.getState().activeLayer })
  useElementsStore.getState().insertComponent(component, [original.id], true)
  expect(useElementsStore.getState().elements.map((e) => e.id)).toEqual([original.id, component.id])
})

test("local and API document round-trips retain all nested geometry and create independent instances", () => {
  const assembled = createComponentAssembly([nested(), cube("other", 80)], { name: "Reusable fixture", layerId: "default" })
  const item = { id: "library-id", name: "Reusable fixture", data: componentLibraryDocument(assembled) }
  const first = transformLibraryItemToCADElement(item, { x: 100, y: 50, z: 20 })
  const second = transformLibraryItemToCADElement({ ...item, data: JSON.stringify(item.data) }, { x: 200, y: 50, z: 20 })
  expect(first.type).toBe("component")
  expect(componentEntries(first.elements).length).toBe(4)
  expect(first.id).not.toBe(second.id)
  expect(first.elements[0].elements[0].id).not.toBe(second.elements[0].elements[0].id)
  expect(componentBounds([first])?.centerX).toBeCloseTo(100)
  expect(componentBounds([first])?.centerY).toBeCloseTo(50)
  expect(componentBounds([first])?.centerZ).toBeCloseTo(20)
  const preview = createComponentPreview(item)!
  expect(new THREE.Box3().setFromObject(preview).getSize(new THREE.Vector3()).x).toBeCloseTo(componentBounds([assembled])!.width)
  disposeObject(preview)
})

test("legacy single elements, geometry documents and multi-element documents retain every part", () => {
  const direct = libraryComponentElement({ data: cube("old", 5) })!
  expect(direct.width).toBe(10)
  expect(direct.id).not.toBe("old")
  const document = libraryComponentElement({ data: { elements: [], geometry: { elements: [cube("a", 0), cube("b", 20)] } } })!
  expect(document.elements.length).toBe(2)
  expect(componentBounds([document])?.width).toBeCloseTo(30)
})

test("document origin is applied once, even through several nested components", () => {
  useCADStore.setState({ originOffset: { x: 100, y: 200, z: 300 } })
  const chosen = [nested(), cube("other", 80)]
  const before = positions(chosen)
  const assembled = createComponentAssembly(chosen, { name: "Origin", layerId: "default" })
  expect(positions([assembled])).toEqual(before)
  expect(componentBounds([assembled])!.maxX).toBeLessThan(100)
})
