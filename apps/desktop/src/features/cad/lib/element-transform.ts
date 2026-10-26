import * as THREE from "three"

/** Per-element transform fields written by the gizmo; the factory output is moved/rotated/scaled around the element centre. */
export interface ElementTransformFields {
  /** Euler angles in degrees (the property panel's "Rotation" vector). */
  readonly rotation?: { x?: number; y?: number; z?: number }
  readonly scale?: { x?: number; y?: number; z?: number }
  readonly translateX?: number
  readonly translateY?: number
  readonly translateZ?: number
  /** Where the element sits; the factory bakes these into `object.position`. */
  readonly x?: number
  readonly y?: number
  readonly z?: number
}

export const premultiplyObject = (object: THREE.Object3D, matrix: THREE.Matrix4): void => {
  object.updateMatrix()
  object.matrix.premultiply(matrix)
  object.matrix.decompose(object.position, object.quaternion, object.scale)
  object.updateMatrixWorld(true)
}

const IDENTITY_QUATERNION = new THREE.Quaternion()

export const rotationOf = (element: ElementTransformFields) => new THREE.Quaternion().setFromEuler(new THREE.Euler(
  THREE.MathUtils.degToRad(element.rotation?.x ?? 0), THREE.MathUtils.degToRad(element.rotation?.y ?? 0), THREE.MathUtils.degToRad(element.rotation?.z ?? 0)
))

/** The element x / y / z a factory object was built at, kept so a move can be applied as a delta. */
interface Placement {
  readonly x: number
  readonly y: number
  readonly z: number
}

const placementOf = (element: ElementTransformFields): Placement => ({
  x: Number(element.x) || 0,
  y: Number(element.y) || 0,
  z: Number(element.z) || 0,
})

/**
 * Re-applies an element's placement and gizmo transform to an object whose geometry is unchanged.
 *
 * The factory bakes `x` / `y` / `z` into `object.position` and leaves the rest to the gizmo matrix,
 * so both are replayed here from the pose the factory produced: the x / y / z delta as a
 * translation, the gizmo fields as a matrix about the centre. Without this the canvas would have to
 * rebuild the geometry to move a part, which on a large assembly means rebuilding all of it.
 *
 * `userData.pivot` ends up holding the centre in world space, which is what the gizmo attaches to.
 */
export function applyElementTransform(object: THREE.Object3D, element: ElementTransformFields, originOffset?: Placement): void {
  const base = object.userData.baseMatrix as THREE.Matrix4 | undefined
  const localPivot = object.userData.localPivot as THREE.Vector3 | undefined
  const placedAt = object.userData.placedAt as Placement | undefined
  if (!base || !localPivot || !placedAt) return

  // Back to the factory pose first, so the transform below is applied from scratch and never compounds.
  object.matrix.copy(base)
  object.matrix.decompose(object.position, object.quaternion, object.scale)

  const at = placementOf(element)
  const builtOrigin = object.userData.builtOrigin as Placement | undefined
  const origin = originOffset ?? builtOrigin
  const shift = new THREE.Vector3(
    at.x - placedAt.x + (origin?.x ?? 0) - (builtOrigin?.x ?? 0),
    at.y - placedAt.y + (origin?.y ?? 0) - (builtOrigin?.y ?? 0),
    at.z - placedAt.z + (origin?.z ?? 0) - (builtOrigin?.z ?? 0)
  )
  object.position.set(
    object.position.x + shift.x,
    object.position.y + shift.y,
    object.position.z + shift.z
  )

  const translate = new THREE.Vector3(element.translateX ?? 0, element.translateY ?? 0, element.translateZ ?? 0)
  const scale = new THREE.Vector3(element.scale?.x ?? 1, element.scale?.y ?? 1, element.scale?.z ?? 1)
  const rotation = rotationOf(element)
  const moved = translate.lengthSq() > 0 || scale.x !== 1 || scale.y !== 1 || scale.z !== 1 || !rotation.equals(IDENTITY_QUATERNION)

  // The factory pivot belongs to the original placement; the current placement moves the rotation/scale centre too.
  const pivot = localPivot.clone().add(shift)
  if (moved) {
    const matrix = new THREE.Matrix4()
      .makeTranslation(pivot.x + translate.x, pivot.y + translate.y, pivot.z + translate.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
      .multiply(new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z))
    premultiplyObject(object, matrix)
    pivot.add(translate)
  } else {
    object.updateMatrix()
    object.updateMatrixWorld(true)
  }
  object.userData.pivot = pivot
}

/** Records the factory pose before applying the editable transform fields. */
export function initializeElementTransform(object: THREE.Object3D, element: ElementTransformFields, originOffset?: Placement): void {
  object.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(object)
  object.updateMatrix()
  object.userData.baseMatrix = object.matrix.clone()
  object.userData.localPivot = box.isEmpty() ? object.position.clone() : box.getCenter(new THREE.Vector3())
  object.userData.placedAt = placementOf(element)
  object.userData.builtOrigin = { x: originOffset?.x ?? 0, y: originOffset?.y ?? 0, z: originOffset?.z ?? 0 }
  applyElementTransform(object, element)
}
