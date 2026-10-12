import { expect, test } from "bun:test"
import * as THREE from "three"
import { plateTemplate } from "@cadcamfun/core"
import { ELEMENT_SPECS, ELEMENT_TYPES, normalizeElement } from "../../../packages/ai/src/element-catalog.ts"
import { applyDragDelta, buildElementObject, commitDrag, type DragStart } from "../src/features/cad/lib/sceneHelpers.ts"
import { useElementsStore } from "../src/features/cad/store/elementsStore.ts"
import { useLayerStore } from "../src/features/cad/store/layerStore.ts"

const center = (object: THREE.Object3D): THREE.Vector3 => new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3())

/** An element of every type the assistant (or the tool panel) can create, ready to be put in the scene. */
const samples = (): Array<Record<string, unknown>> => {
  const out: Array<Record<string, unknown>> = []
  const needs: Record<string, Record<string, unknown>> = {
    component: { elements: [{ type: "cube" }, { type: "cylinder", x: 30 }] }, group: { elements: [{ type: "sphere" }] },
    parametric: { history: plateTemplate() }
  }
  for (const type of ELEMENT_TYPES) {
    if (type.startsWith("boolean-")) continue
    const result = normalizeElement({ type, ...(needs[type] ?? {}) })
    if (result.ok) out.push({ id: `t-${type}`, layerId: useLayerStore.getState().activeLayer, ...result.element })
  }
  void ELEMENT_SPECS
  return out
}

test("move, rotate and scale reach every kind of element, and the element drawn again shows the move", () => {
  const failures: string[] = []
  for (const sample of samples()) {
    const type = String(sample["type"])
    useElementsStore.setState({ elements: [sample] as never, selectedElement: null, history: [[]], currentHistoryIndex: 0 })
    const object = buildElementObject(sample as never)
    if (!object) { failures.push(`${type}: not drawn`); continue }
    object.updateMatrix()
    const pivot = object.userData.pivot as THREE.Vector3 | undefined
    if (!pivot) { failures.push(`${type}: no pivot to transform around`); continue }
    const start: DragStart = { pivotMatrix: new THREE.Matrix4(), items: [{ id: String(sample["id"]), object, matrix: object.matrix.clone(), center: pivot.clone() }] }
    const before = center(object)

    // Move.
    const move = new THREE.Matrix4().makeTranslation(7, 5, 3)
    commitDrag(start, move)
    const moved = useElementsStore.getState().elements[0]!
    const again = buildElementObject(moved as never)
    if (!again) { failures.push(`${type}: not drawn after a move`); continue }
    const shift = center(again).sub(before)
    if (Math.abs(shift.x - 7) > 0.05 || Math.abs(shift.y - 5) > 0.05 || Math.abs(shift.z - 3) > 0.05) failures.push(`${type}: moved by (${shift.x.toFixed(2)}, ${shift.y.toFixed(2)}, ${shift.z.toFixed(2)}) instead of (7, 5, 3)`)

    // Rotate and scale about the element's own centre: the element still draws and the change is stored.
    for (const [label, delta] of [["rotate", new THREE.Matrix4().makeRotationZ(Math.PI / 4)], ["scale", new THREE.Matrix4().makeScale(2, 2, 2)]] as const) {
      useElementsStore.setState({ elements: [moved] as never, history: [[]], currentHistoryIndex: 0 })
      const obj = buildElementObject(moved as never)!
      obj.updateMatrix()
      const s: DragStart = { pivotMatrix: new THREE.Matrix4(), items: [{ id: String(sample["id"]), object: obj, matrix: obj.matrix.clone(), center: (obj.userData.pivot as THREE.Vector3).clone() }] }
      applyDragDelta(s, delta)
      commitDrag(s, delta)
      const changed = useElementsStore.getState().elements[0]!
      if (JSON.stringify(changed) === JSON.stringify(moved)) failures.push(`${type}: ${label} stored nothing`)
      else if (!buildElementObject(changed as never)) failures.push(`${type}: not drawn after ${label}`)
    }
  }
  expect(failures).toEqual([])
})
