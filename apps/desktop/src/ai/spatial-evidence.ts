import { Box3, Object3D, Vector3 } from "three"

/** Actual renderer matrices and pivots, rather than inferred centres from element fields. */
export const spatialEvidence = (objects: ReadonlyArray<Object3D>, selectedIds: ReadonlyArray<string> = []) => {
  const selected = new Set(selectedIds)
  const ordered = [...objects].sort((a, b) => Number(selected.has(String(b.userData.elementId))) - Number(selected.has(String(a.userData.elementId))))
  const entries = ordered.slice(0, 100).map((object) => {
    object.updateWorldMatrix(true, true)
    const bounds = new Box3().setFromObject(object)
    const pivot = object.userData.pivot
    const position = object.getWorldPosition(new Vector3())
    const xyz = (v: Vector3) => ({ x: v.x, y: v.y, z: v.z })
    return {
      elementId: typeof object.userData.elementId === "string" ? object.userData.elementId : null,
      visible: object.visible,
      matrixWorldColumnMajor: object.matrixWorld.toArray(),
      objectWorldOrigin: xyz(position),
      editorPivot: pivot instanceof Vector3 ? xyz(pivot) : null,
      worldBounds: bounds.isEmpty() ? null : { min: xyz(bounds.min), max: xyz(bounds.max) }
    }
  })
  return { frame: "Actual Three.js scene coordinates, including drawing origin offset; mm, right-handed XYZ, Z up", entries, omitted: Math.max(0, objects.length - entries.length) }
}
