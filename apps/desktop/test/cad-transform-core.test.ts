import { expect, test } from "bun:test"
import * as THREE from "three"
import { plateTemplate, cad, cam } from "@cadcamfun/core"
import { ELEMENT_TYPES, normalizeElement } from "../../../packages/ai/src/element-catalog.ts"
import { buildElementObject, commitDrag, type DragStart } from "../src/cad/lib/sceneHelpers.ts"
import { useElementsStore } from "../src/cad/store/elementsStore.ts"
import { UNRELIABLE_PIVOT } from "../../sidecar/src/services/ai-transform.ts"
import { useLayerStore } from "../src/cad/store/layerStore.ts"

const needs: Record<string, Record<string, unknown>> = {
  component: { elements: [{ type: "cube" }, { type: "cylinder", x: 30 }] }, group: { elements: [{ type: "sphere" }] }, parametric: { history: plateTemplate() }
}
const samples = (): Array<Record<string, unknown>> => ELEMENT_TYPES.flatMap((type) => {
  if (type.startsWith("boolean-")) return []
  const r = normalizeElement({ type, ...(needs[type] ?? {}) })
  return r.ok ? [{ id: `t-${type}`, layerId: useLayerStore.getState().activeLayer, ...r.element }] : []
})
const box = (element: Record<string, unknown>): THREE.Box3 => new THREE.Box3().setFromObject(buildElementObject(element as never)!)

/** What the gizmo does for this delta (the editor's own `commitDrag`). */
const byGizmo = (element: Record<string, unknown>, delta: THREE.Matrix4): Record<string, unknown> => {
  useElementsStore.setState({ elements: [element] as never, selectedElement: null, history: [[]], currentHistoryIndex: 0 })
  const object = buildElementObject(element as never)!
  object.updateMatrix()
  const start: DragStart = { pivotMatrix: new THREE.Matrix4(), items: [{ id: String(element["id"]), object, matrix: object.matrix.clone(), center: (object.userData.pivot as THREE.Vector3).clone() }] }
  commitDrag(start, delta)
  return useElementsStore.getState().elements[0] as never
}
const about = (p: THREE.Vector3, m: THREE.Matrix4) => new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(m).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z))

test("core's transformElement puts every kind of element where the gizmo would", () => {
  const failures: string[] = []
  const far = new THREE.Vector3(40, -25, 10)
  for (const sample of samples()) {
    const type = String(sample["type"])
    const pivot = (buildElementObject(sample as never)!.userData.pivot as THREE.Vector3).clone()
    const cases: Array<[string, cad.ElementTransform, (p: THREE.Vector3) => THREE.Matrix4]> = [
      ["move", { move: { x: 7, y: 5, z: 3 } }, () => new THREE.Matrix4().makeTranslation(7, 5, 3)],
      ["rotate about its centre", { rotate: { axis: "z", degrees: 30 } }, (p) => about(p, new THREE.Matrix4().makeRotationZ(Math.PI / 6))],
      ["rotate about a point", { rotate: { axis: "x", degrees: 90, about: far } }, () => about(far, new THREE.Matrix4().makeRotationX(Math.PI / 2))],
      ["scale about its centre", { scale: { factor: 2 } }, (p) => about(p, new THREE.Matrix4().makeScale(2, 2, 2))],
      ["scale about a point", { scale: { factor: 0.5, about: far } }, () => about(far, new THREE.Matrix4().makeScale(0.5, 0.5, 0.5))]
    ]
    for (const [label, transform, delta] of cases) {
      // The tool refuses these (see UNRELIABLE_PIVOT): core's bounds are not where the editor draws them.
      if (label.endsWith("about a point") && UNRELIABLE_PIVOT.has(type)) continue
      const truth = box(byGizmo(sample, delta(pivot)))
      // The centre the sidecar knows: the middle of the element's bounds (what `cad_describe_drawing` reports).
      const b = cam.generator.elementBounds(sample as never)
      const centre = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 }
      const mine = box(cad.transformElement(sample, transform, centre))
      const off = Math.max(...[mine.min.distanceTo(truth.min), mine.max.distanceTo(truth.max)])
      if (off > 0.05) failures.push(`${type}: ${label} is ${off.toFixed(2)} mm from where the gizmo puts it`)
    }
  }
  expect(failures).toEqual([])
})
