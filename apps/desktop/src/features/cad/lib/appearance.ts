import * as THREE from "three"

/**
 * The per-element appearance fields the canvas honours beyond `color` and `wireframe`.
 *
 * `opacity` (0 to 1, as the Fusion appearance slider): the faces of the part blend with what is behind; the edge lines and the
 * helpers stay as they are. A part that is not translucent is left untouched, so this costs nothing for the common case.
 */
const isFace = (object: THREE.Object3D): object is THREE.Mesh => {
  const flags = object as { isMesh?: boolean; isLine?: boolean; isLineSegments?: boolean; isLineSegments2?: boolean; isPoints?: boolean }
  return flags.isMesh === true && flags.isLine !== true && flags.isLineSegments !== true && flags.isLineSegments2 !== true && flags.isPoints !== true
}

/** The opacity an element asks for, or undefined when it is opaque (missing, not a number, 1 or more, or not above 0). */
export const elementOpacity = (element: unknown): number | undefined => {
  const value = (element as { opacity?: unknown } | null)?.opacity
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1 ? value : undefined
}

/** Makes the faces under `object` translucent when the element asks for it. Returns whether it did. */
export const applyElementOpacity = (object: THREE.Object3D, element: unknown): boolean => {
  const opacity = elementOpacity(element)
  if (opacity === undefined) return false
  object.traverse((child) => {
    if (!isFace(child)) return
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      // A material that is already translucent (a workpiece, a marker) keeps the more transparent of the two.
      material.opacity = Math.min(material.opacity, opacity)
      material.transparent = true
      // A translucent part must not hide what lies behind it, nor itself in its own depth buffer.
      material.depthWrite = false
    }
  })
  return true
}
