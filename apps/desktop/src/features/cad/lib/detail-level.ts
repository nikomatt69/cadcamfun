import * as THREE from "three"

/**
 * Level of detail for large drawings. Edge lines are the expensive part of a part (a thick line is one instanced quad per segment
 * with a heavier shader): on a part a few pixels wide they are invisible anyway. When the drawing has many parts, the edges of the
 * ones that are small on screen are not drawn, and come back as the camera gets closer. Faces are always drawn; frustum culling
 * is Three's own (every mesh has a bounding sphere).
 *
 * The edge holders are shared with the visual style (`display-mode.ts`), which decides whether edges are shown at all
 * (`userData.displayEdges`); this module only takes them away from parts that are too small to need them (`userData.lodHidden`).
 */

/** Below this many parts the drawing is small enough to keep every edge. */
export const LOD_MIN_PARTS = 60
/** A part whose bounding sphere covers fewer pixels than this across loses its edges. */
export const LOD_MIN_PIXELS = 14
/** Hysteresis: a part that lost its edges gets them back only above this, so a part at the threshold does not flicker. */
export const LOD_RESTORE_PIXELS = 20

const isEdgeHolder = (object: THREE.Object3D): boolean => object.name === "edges" || object.userData.brepEdge !== undefined

/** How many pixels across a sphere of `radius` at `distance` is, for a perspective camera and a viewport `height` pixels tall. */
export const pixelDiameter = (radius: number, distance: number, fovDegrees: number, height: number): number => {
  if (!(distance > 0)) return Infinity
  return (2 * radius * height) / (2 * distance * Math.tan((fovDegrees * Math.PI) / 360))
}

const sphere = new THREE.Sphere()
const box = new THREE.Box3()

/**
 * Hides or restores the edge lines of each part by its size on screen. Returns whether anything changed (the caller then asks for a
 * frame). Orthographic cameras measure by zoom. With fewer than `LOD_MIN_PARTS` parts everything is restored.
 */
export const applyDetailLevel = (parts: ReadonlyArray<THREE.Object3D>, camera: THREE.Camera, viewportHeight: number): boolean => {
  const active = parts.length >= LOD_MIN_PARTS && viewportHeight > 0
  let changed = false
  camera.updateMatrixWorld()
  for (const part of parts) {
    const was = part.userData.lodHidden === true
    let hide = false
    if (active) {
      box.setFromObject(part)
      if (!box.isEmpty()) {
        box.getBoundingSphere(sphere)
        const pixels = (camera as THREE.PerspectiveCamera).isPerspectiveCamera
          ? pixelDiameter(sphere.radius, camera.position.distanceTo(sphere.center), (camera as THREE.PerspectiveCamera).fov, viewportHeight)
          : (2 * sphere.radius * ((camera as THREE.OrthographicCamera).zoom || 1) * viewportHeight) / Math.max((camera as THREE.OrthographicCamera).top - (camera as THREE.OrthographicCamera).bottom, 1e-9)
        hide = was ? pixels < LOD_RESTORE_PIXELS : pixels < LOD_MIN_PIXELS
      }
    }
    if (hide === was) continue
    part.userData.lodHidden = hide
    part.traverse((object) => {
      if (!isEdgeHolder(object)) return
      object.visible = !hide && object.userData.displayEdges !== false
    })
    changed = true
  }
  return changed
}
