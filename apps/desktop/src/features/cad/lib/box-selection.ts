import * as THREE from "three"

export interface ScreenPoint { readonly x: number; readonly y: number }
export interface ScreenBox { readonly start: ScreenPoint; readonly end: ScreenPoint }
export function screenRectangle(box: ScreenBox) {
  const left = Math.min(box.start.x, box.end.x), top = Math.min(box.start.y, box.end.y)
  const width = Math.abs(box.end.x - box.start.x), height = Math.abs(box.end.y - box.start.y)
  return { left, top, width, height, right: left + width, bottom: top + height, leftToRight: box.end.x >= box.start.x }
}

/** Project local geometry bounds through each child's world transform, rather than inflating a rotated world AABB. */
export function projectedSelectionBounds(object: THREE.Object3D, camera: THREE.Camera, width: number, height: number) {
  object.updateWorldMatrix(true, true)
  camera.updateMatrixWorld()
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  let inFront = false, behindNear = false
  const corner = new THREE.Vector3()
  object.traverseVisible(child => {
    const geometry = (child as THREE.Mesh).geometry
    if (!(geometry instanceof THREE.BufferGeometry)) return
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const bounds = geometry.boundingBox
    if (!bounds || bounds.isEmpty()) return
    for (let i = 0; i < 8; i++) {
      corner.set(i & 4 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 1 ? bounds.max.z : bounds.min.z)
        .applyMatrix4(child.matrixWorld).project(camera)
      if (corner.z < -1) { behindNear = true; continue }
      if (corner.z > 1) continue
      inFront = true
      const x = (corner.x + 1) * width / 2, y = (1 - corner.y) * height / 2
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
  })
  if (!inFront || !Number.isFinite(left + top + right + bottom)) return undefined
  // A part crossing the near plane cannot be wholly contained in a small window.
  if (behindNear) return { left: 0, top: 0, right: width, bottom: height }
  return { left, top, right, bottom }
}

export function boxSelectionIncludes(box: ScreenBox, bounds: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }): boolean {
  const r = screenRectangle(box), epsilon = 0.5
  return r.leftToRight
    ? bounds.left >= r.left - epsilon && bounds.right <= r.right + epsilon && bounds.top >= r.top - epsilon && bounds.bottom <= r.bottom + epsilon
    : bounds.right >= r.left && bounds.left <= r.right && bounds.bottom >= r.top && bounds.top <= r.bottom
}
