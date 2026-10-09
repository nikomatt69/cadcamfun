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
