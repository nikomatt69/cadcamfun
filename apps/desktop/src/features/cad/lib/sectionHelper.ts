import * as THREE from "three"
import type { SectionAxis } from "./section.ts"

/** The translucent sheet that shows where the section cuts, sized to the model and sitting on the kept side of the cut. */
export const createSectionHelper = (axis: SectionAxis, position: number, inverted: boolean, box: THREE.Box3): THREE.Object3D => {
  const extent = box.isEmpty() ? new THREE.Vector3(200, 200, 200) : box.getSize(new THREE.Vector3())
  const side = Math.max(200, Math.max(extent.x, extent.y, extent.z) * 1.4)
  const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3())
  const group = new THREE.Group()
  const geometry = new THREE.PlaneGeometry(side, side)
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xff9800, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })))
  group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0xff9800 })))
  // PlaneGeometry faces +Z: turn it to face the axis the cut is made along.
  if (axis === "x") group.rotation.y = Math.PI / 2
  if (axis === "y") group.rotation.x = -Math.PI / 2
  const onKeptSide = position + (inverted ? 0.02 : -0.02)
  group.position.set(axis === "x" ? onKeptSide : centre.x, axis === "y" ? onKeptSide : centre.y, axis === "z" ? onKeptSide : centre.z)
  group.userData.isSectionHelper = true
  group.traverse((object) => { object.raycast = () => undefined })
  return group
}

/** The flat colour the cut of a solid is filled with, the same orange as the cutting sheet. */
export const SECTION_CAP_COLOR = 0xff9800

const isTriangleMesh = (object: THREE.Object3D): object is THREE.Mesh => {
  const flags = object as { isMesh?: boolean; isLine?: boolean; isLineSegments?: boolean; isLineSegments2?: boolean }
  return flags.isMesh === true && flags.isLine !== true && flags.isLineSegments !== true && flags.isLineSegments2 !== true
}

/** Whether a mesh is a closed solid skin that a section can be capped on: opaque, one-sided, not a marker, not a sheet. */
const cappable = (mesh: THREE.Mesh): boolean => {
  if (mesh.userData.isSectionCap === true || mesh.userData.isInvalidMarker === true || mesh.userData.isOutline === true || mesh.userData.isControlPoint === true) return false
  if (mesh.geometry.getAttribute("position") === undefined) return false
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return materials.every((material) => {
    const m = material as THREE.Material & { wireframe?: boolean }
    return m.side !== THREE.DoubleSide && !m.transparent && m.wireframe !== true && m.colorWrite
  })
}

/**
 * Closes the cut of every solid under `roots`. The renderer's clipping plane opens a closed solid and shows the inside of its far
 * walls; drawing the back faces of the same triangles in one flat colour fills the opening, exactly where the solid is cut and
 * nowhere else (a bored hole stays open: its wall faces the viewer and is shaded normally). It costs one more draw of geometry
 * already on the GPU per mesh, and only while a section is on. The caps share the mesh's geometry; one material per root.
 * Returns the number of caps added.
 */
export const addSectionCaps = (roots: ReadonlyArray<THREE.Object3D>): number => {
  let added = 0
  for (const root of roots) {
    removeSectionCaps([root])
    const meshes: THREE.Mesh[] = []
    root.traverse((object) => { if (isTriangleMesh(object) && cappable(object)) meshes.push(object) })
    if (meshes.length === 0) continue
    const material = new THREE.MeshBasicMaterial({ color: SECTION_CAP_COLOR, side: THREE.BackSide })
    for (const mesh of meshes) {
      const cap = new THREE.Mesh(mesh.geometry, material)
      cap.userData.isSectionCap = true
      cap.raycast = () => undefined
      mesh.add(cap)
      added++
    }
  }
  return added
}

/** Takes the caps off (and frees their material; the geometry is the mesh's and stays). */
export const removeSectionCaps = (roots: ReadonlyArray<THREE.Object3D>): void => {
  for (const root of roots) {
    const caps: THREE.Object3D[] = []
    root.traverse((object) => { if (object.userData.isSectionCap === true) caps.push(object) })
    for (const cap of caps) {
      cap.removeFromParent()
      ;((cap as THREE.Mesh).material as THREE.Material | undefined)?.dispose()
    }
  }
}
