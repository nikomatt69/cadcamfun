/** The 3D scene of one machine envelope (pure Three.js: no DOM, no WebGL), drawn by `MachinePreview3D`. */
import * as THREE from "three"
import type { MachineEnvelope } from "./machine-details.ts"

const material = (color: number, opacity = 1): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1, transparent: opacity < 1, opacity })

/** The scene of one machine envelope, Z up like the CAM view; the table's top face is Z0. */
export const machineObject = (envelope: MachineEnvelope): THREE.Group => {
  const group = new THREE.Group()
  const volume = envelope.volume
  if (volume === undefined) return group
  const table = envelope.table ?? { length: volume.x * 1.2, width: volume.y * 1.2 }
  const thickness = Math.max(2, Math.min(table.length, table.width) * 0.05)
  const plate = new THREE.Mesh(new THREE.BoxGeometry(table.length, table.width, thickness), material(0x64748b))
  plate.position.set(0, 0, -thickness / 2)
  group.add(plate)
  const space = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(volume.x, volume.y, volume.z)), new THREE.LineBasicMaterial({ color: 0x38bdf8 }))
  space.position.set(0, 0, volume.z / 2)
  group.add(space)
  const radius = Math.max(1, Math.min(volume.x, volume.y) * 0.05)
  if (envelope.kind === "printer") {
    // A nozzle over the plate.
    const nozzle = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.7, radius * 2.4, 24), material(0xf59e0b))
    nozzle.rotation.x = Math.PI
    nozzle.position.set(0, 0, volume.z * 0.5 + radius * 1.2)
    group.add(nozzle)
  } else if (envelope.kind === "lathe") {
    // A chuck at the left end of the bar axis.
    const chuck = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(volume.y, volume.z) * 0.45, Math.min(volume.y, volume.z) * 0.45, volume.x * 0.12, 32), material(0xf59e0b))
    chuck.rotation.z = Math.PI / 2
    chuck.position.set(-volume.x / 2 - volume.x * 0.06, 0, volume.z / 2)
    group.add(chuck)
  } else {
    // The spindle comes down onto the middle of the space; a rotary table is a disc on the plate.
    const head = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, volume.z * 0.45, 32), material(0xf59e0b))
    head.rotation.x = Math.PI / 2
    head.position.set(0, 0, volume.z + volume.z * 0.225)
    group.add(head)
    if (envelope.rotary) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(volume.x, volume.y) * 0.3, Math.min(volume.x, volume.y) * 0.3, thickness, 48), material(0x94a3b8))
      disc.rotation.x = Math.PI / 2
      disc.position.set(0, 0, thickness / 2)
      group.add(disc)
    }
  }
  group.add(new THREE.AxesHelper(Math.max(volume.x, volume.y, volume.z) * 0.3))
  return group
}
