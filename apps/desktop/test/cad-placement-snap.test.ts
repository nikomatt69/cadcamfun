import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import * as THREE from "three"
import { createSnap } from "../src/features/cad/hooks/createSnap.ts"
import { createPlacementReference } from "../src/features/cad/lib/placement-reference.ts"
import { defaultSnapSettings, SnapType, type SnapAxis } from "../src/features/cad/lib/enanchedSnapService.ts"
import { transformLibraryItemToCADElement } from "../src/features/cad/lib/libraryTransform.ts"
import { predefinedComponents } from "../src/features/cad/lib/predefinedLibraries.ts"
import { applyDragDelta, buildElementObject, commitDrag, deltaFrom, disposeObject, type DragStart } from "../src/features/cad/lib/sceneHelpers.ts"
import { applyElementTransform } from "../src/features/cad/lib/element-transform.ts"
import { useElementsStore, type Element, type Point } from "../src/features/cad/store/elementsStore.ts"
import { useLayerStore } from "../src/features/cad/store/layerStore.ts"
import { useCADStore } from "../src/features/cad/store/cadStore.ts"

const at = (x: number, y: number, z = 0): Point => ({ x, y, z })
const line = (x1: number, y1: number, x2: number, y2: number) => ({ type: "line", x1, y1, z1: 0, x2, y2, z2: 0 })
const only = (kind: SnapType) => ({ ...defaultSnapSettings, enabled: true, tolerance: 3,
  types: Object.fromEntries(Object.values(SnapType).map((type) => [type, type === kind])) as Record<SnapType, boolean> })

function fixture(run: (context: {
  snap: ReturnType<typeof createSnap>
  reference: ReturnType<typeof createPlacementReference>
  objects: Map<string, THREE.Object3D>
  place: (point: Point) => string
  rebuild: (id: string) => THREE.Object3D
  anchor: () => Point | undefined
}) => void): void {
  createRoot((dispose) => {
    const oldElements = useElementsStore.getState(), oldLayers = useLayerStore.getState(), oldCAD = useCADStore.getState()
    const snap = createSnap(), oldSettings = snap.snapSettings()
    const objects = new Map<string, THREE.Object3D>()
    const reference = createPlacementReference()
    const rebuild = (id: string) => {
      const old = objects.get(id)
      if (old) disposeObject(old)
      const element = useElementsStore.getState().elements.find((part) => part.id === id)!
      const object = buildElementObject(element)!
      expect(object).not.toBeNull()
      objects.set(id, object)
      return object
    }
    const place = (point: Point) => {
      const part = predefinedComponents.find((candidate) => candidate.name === "T-Slot Extrusion 20mm")!
      const id = useElementsStore.getState().addElement(transformLibraryItemToCADElement(part, point))
      expect(id).not.toBe("")
      rebuild(id)
      reference.remember(id)
      return id
    }
    const anchor = () => reference.anchor(useElementsStore.getState().elements, (id) => objects.get(id), useCADStore.getState().originOffset)
    try {
      useElementsStore.setState({ elements: [], history: [[]], currentHistoryIndex: 0, isEditing: false, selectedElement: null, selectedElements: [] })
      useLayerStore.setState({ activeLayer: "placement-test", layers: [{ id: "placement-test", name: "Test", visible: true, locked: false, color: "#ffffff" }] })
      useCADStore.getState().resetOrigin()
      run({ snap, reference, objects, place, rebuild, anchor })
    } finally {
      for (const object of objects.values()) disposeObject(object)
      snap.updateSnapSettings(oldSettings)
      snap.clearIndicator()
      useElementsStore.setState(oldElements)
      useLayerStore.setState(oldLayers)
      useCADStore.setState(oldCAD)
      dispose()
    }
  })
}

const nearPoint = (actual: Point | undefined, expected: Point) => {
  expect(actual).toBeDefined()
  for (const axis of ["x", "y", "z"] as const) expect(actual![axis]).toBeCloseTo(expected[axis], 5)
}

describe("library placement reference", () => {
  test("the previous part's centre follows a live move and remains in model coordinates when the origin changes", () => fixture(({ place, anchor, objects }) => {
    expect(anchor()).toBeUndefined()
    const id = place(at(30, 50, 10))
    nearPoint(anchor(), at(30, 50, 10))
    const part = useElementsStore.getState().elements.find((part) => part.id === id)!
    useElementsStore.getState().updateElement(id, { x: part.x + 11, y: part.y - 7 })
    const moved = useElementsStore.getState().elements.find((part) => part.id === id)!
    applyElementTransform(objects.get(id)!, { x: moved.x, y: moved.y, z: moved.z })
    nearPoint(anchor(), at(41, 43, 10))
    useCADStore.getState().setOriginOffset(at(100, -200, 25))
    const object = objects.get(id)!
    const geometry = object.children[0]
    // Match the canvas cache path: moving the origin must not require rebuilding a solid.
    applyElementTransform(object, { x: moved.x, y: moved.y, z: moved.z }, useCADStore.getState().originOffset)
    nearPoint(new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()), at(141, -157, 35))
    nearPoint(anchor(), at(41, 43, 10))
    applyElementTransform(object, { x: moved.x, y: moved.y, z: moved.z }, useCADStore.getState().originOffset)
    nearPoint(anchor(), at(41, 43, 10))
    expect(object.children[0]).toBe(geometry)
    useCADStore.getState().resetOrigin()
    applyElementTransform(object, { x: moved.x, y: moved.y, z: moved.z }, useCADStore.getState().originOffset)
    nearPoint(anchor(), at(41, 43, 10))
  }))

  test("cancel, failed insertion, missing geometry, deletion and undo cannot leave a stale anchor", () => fixture(({ place, reference, anchor, objects }) => {
    const id = place(at(30, 50))
    reference.clear()
    expect(anchor()).toBeUndefined()
    reference.remember(id)
    reference.remember("")
    expect(anchor()).toBeUndefined()
    reference.remember(id)
    const object = objects.get(id)!
    objects.delete(id)
    expect(anchor()).toBeUndefined()
    objects.set(id, object)
    useElementsStore.getState().deleteElement(id)
    expect(anchor()).toBeUndefined()
    useElementsStore.getState().undo()
    nearPoint(anchor(), at(30, 50))
    useElementsStore.getState().undo()
    expect(anchor()).toBeUndefined()
  }))
})

const relations: ReadonlyArray<{
  kind: SnapType
  from: Point
  cursor: Point
  expected: Point
  source: Omit<Element, "id" | "layerId">
  axes: ReadonlyArray<SnapAxis>
}> = [
  { kind: SnapType.PERPENDICULAR, from: at(30, 50), cursor: at(30, 2), expected: at(30, 0), source: line(0, 0, 100, 0), axes: ["y"] },
  { kind: SnapType.TANGENT, from: at(20, 0), cursor: at(6, 9), expected: at(5, Math.sqrt(75)), source: { type: "circle", x: 0, y: 0, z: 0, radius: 10 }, axes: ["x", "y"] },
  { kind: SnapType.PARALLEL, from: at(10, 10), cursor: at(60, 62), expected: at(61, 61), source: line(0, 0, 100, 100), axes: ["x", "y"] }
]

describe("relative snaps through the real placement and gizmo pipeline", () => {
  for (const relation of relations) {
    test(`placement: ${relation.kind} uses the previous part and the next solid is centred on the snap`, () => fixture(({ place, anchor, snap, objects }) => {
      place(relation.from)
      useElementsStore.getState().addElement(relation.source)
      snap.updateSnapSettings(only(relation.kind))
      const hit = snap.snapToPoint(relation.cursor, anchor())
      expect(hit.type).toBe(relation.kind)
      nearPoint(hit, relation.expected)
      expect(snap.snapIndicator()).toMatchObject({ visible: true, type: relation.kind })
      const id = place(hit)
      const centre = new THREE.Box3().setFromObject(objects.get(id)!).getCenter(new THREE.Vector3())
      nearPoint(centre, relation.expected)
      snap.updateSnapSettings({ enabled: false })
      nearPoint(snap.snapToPoint(relation.cursor, anchor()), relation.cursor)
      expect(snap.snapIndicator().visible).toBe(false)
    }))

    test(`gizmo: ${relation.kind} survives commit, redraw, undo and redo as one history step`, () => fixture(({ place, objects, snap, rebuild }) => {
      const id = place(relation.from)
      useElementsStore.getState().addElement(relation.source)
      snap.updateSnapSettings(only(relation.kind))
      const pivot = new THREE.Object3D()
      pivot.position.copy(relation.from)
      pivot.updateMatrix()
      const object = objects.get(id)!
      const start: DragStart = { pivotMatrix: pivot.matrix.clone(), items: [{ id, object, matrix: object.matrix.clone(), center: new THREE.Vector3().copy(relation.from) }] }
      const before = useElementsStore.getState().currentHistoryIndex
      useElementsStore.getState().beginEdit()
      // The canvas reads the initial pivot matrix as the anchor and applies only the dragged axes.
      const from = new THREE.Vector3().setFromMatrixPosition(start.pivotMatrix)
      pivot.position.copy(relation.cursor)
      const hit = snap.snapAlongAxes(pivot.position, relation.axes, new Set([id]), 1, from)!
      expect(hit.type).toBe(relation.kind)
      for (const axis of relation.axes) pivot.position[axis] = hit[axis]
      nearPoint(pivot.position, relation.expected)
      const delta = deltaFrom(start, pivot)
      applyDragDelta(start, delta)
      commitDrag(start, delta)
      useElementsStore.getState().endEdit()
      expect(useElementsStore.getState().currentHistoryIndex).toBe(before + 1)
      nearPoint(new THREE.Box3().setFromObject(rebuild(id)).getCenter(new THREE.Vector3()), relation.expected)
      useElementsStore.getState().undo()
      nearPoint(new THREE.Box3().setFromObject(rebuild(id)).getCenter(new THREE.Vector3()), relation.from)
      useElementsStore.getState().redo()
      nearPoint(new THREE.Box3().setFromObject(rebuild(id)).getCenter(new THREE.Vector3()), relation.expected)
    }))
  }
})
