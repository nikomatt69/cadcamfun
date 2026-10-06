import { beforeEach, describe, expect, test } from "bun:test"
import * as THREE from "three"
import { useElementsStore } from "../store/elementsStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { applyDragDelta, booleanElement, buildElementObject, commitDrag, type DragStart } from "./sceneHelpers.ts"

const layerId = () => useLayerStore.getState().activeLayer
const reset = () => useElementsStore.setState({ elements: [], selectedElement: null, history: [[]], currentHistoryIndex: 0 })
const cube = (id: string, x: number, extra: Record<string, unknown> = {}) =>
  ({ id, type: "cube", layerId: layerId(), x, y: 0, z: 0, width: 2, height: 2, depth: 2, ...extra })
const dragOf = (ids: string[]): DragStart => ({
  pivotMatrix: new THREE.Matrix4(),
  items: ids.map((id) => {
    const object = buildElementObject(useElementsStore.getState().elements.find((element) => element.id === id)!)!
    object.updateMatrix()
    return { id, object, matrix: object.matrix.clone(), center: (object.userData.pivot as THREE.Vector3).clone() }
  })
})

beforeEach(reset)

describe("element objects", () => {
  test("carry the element id and their centre", () => {
    const object = buildElementObject(cube("a", 4) as never)!
    expect(object.userData.elementId).toBe("a")
    expect((object.userData.pivot as THREE.Vector3).x).toBeCloseTo(4)
  })

  test("rotation and scale fields transform the object around its centre", () => {
    const object = buildElementObject(cube("a", 4, { rotation: { x: 0, y: 0, z: 90 }, scale: { x: 2, y: 1, z: 1 } }) as never)!
    const box = new THREE.Box3().setFromObject(object)
    // scaled 2x along world X, then turned 90 degrees about Z: the long side ends up along Y
    expect(box.getSize(new THREE.Vector3()).y).toBeCloseTo(4)
    expect(box.getCenter(new THREE.Vector3()).x).toBeCloseTo(4)
  })
})

describe("committing a gizmo drag", () => {
  test("a translation moves the elements by the same delta in one history step", () => {
    useElementsStore.setState({ elements: [cube("a", 0), cube("b", 10)] as never, history: [[]], currentHistoryIndex: 0 })
    const start = dragOf(["a", "b"])
    const delta = new THREE.Matrix4().makeTranslation(3, 2, 1)
    applyDragDelta(start, delta)
    expect(start.items[0]!.object.position.x).toBeCloseTo(3)
    commitDrag(start, delta)
    const { elements, currentHistoryIndex } = useElementsStore.getState()
    expect(elements.map((e) => [e.x, e.y, e.z])).toEqual([[3, 2, 1], [13, 2, 1]])
    expect(currentHistoryIndex).toBe(1)
  })

  test("a rotation about the group centre orbits the elements and turns each one", () => {
    useElementsStore.setState({ elements: [cube("a", -5), cube("b", 5)] as never, history: [[]], currentHistoryIndex: 0 })
    const start = dragOf(["a", "b"])
    const delta = new THREE.Matrix4().makeRotationZ(Math.PI / 2)
    commitDrag(start, delta)
    const [a, b] = useElementsStore.getState().elements
    expect(a!.x).toBeCloseTo(0); expect(a!.y).toBeCloseTo(-5)
    expect(b!.x).toBeCloseTo(0); expect(b!.y).toBeCloseTo(5)
    expect((a!.rotation as { z: number }).z).toBeCloseTo(90)
  })

  test("scale ratios accumulate", () => {
    useElementsStore.setState({ elements: [cube("a", 0, { scale: { x: 2, y: 1, z: 1 } })] as never, history: [[]], currentHistoryIndex: 0 })
    commitDrag(dragOf(["a"]), new THREE.Matrix4().makeScale(1.5, 1, 1))
    expect((useElementsStore.getState().elements[0]!.scale as { x: number }).x).toBeCloseTo(3)
  })

  test("elements without a point get a translate offset instead", () => {
    useElementsStore.setState({ elements: [{ id: "p", type: "polygon", layerId: layerId(), points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }] }] as never, history: [[]], currentHistoryIndex: 0 })
    commitDrag(dragOf(["p"]), new THREE.Matrix4().makeTranslation(2, 0, 0))
    expect(useElementsStore.getState().elements[0]!.translateX).toBeCloseTo(2)
  })
})

describe("boolean operations", () => {
  const objects = () => [buildElementObject(cube("a", 0) as never)!, buildElementObject(cube("b", 1) as never)!]

  test("union yields a mesh element covering both operands", () => {
    const result = booleanElement("union", objects(), "layer")!
    expect(result.type).toBe("mesh")
    const xs = (result.vertices as { x: number }[]).map((v) => v.x)
    expect(Math.min(...xs)).toBeCloseTo(-1)
    expect(Math.max(...xs)).toBeCloseTo(2)
  })

  test("intersect keeps only the overlap and subtract trims the base", () => {
    const overlap = (booleanElement("intersect", objects(), "layer")!.vertices as { x: number }[]).map((v) => v.x)
    expect(Math.min(...overlap)).toBeCloseTo(0)
    expect(Math.max(...overlap)).toBeCloseTo(1)
    const rest = (booleanElement("subtract", objects(), "layer")!.vertices as { x: number }[]).map((v) => v.x)
    expect(Math.max(...rest)).toBeCloseTo(0)
  })

  test("needs two meshes", () => {
    expect(booleanElement("union", [buildElementObject(cube("a", 0) as never)!], "layer")).toBeNull()
  })

  test("the result is renderable as an element", () => {
    const result = booleanElement("union", objects(), "layer")!
    const object = buildElementObject({ id: "r", layerId: "layer", ...result } as never)!
    expect(new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()).x).toBeCloseTo(3)
  })
})
