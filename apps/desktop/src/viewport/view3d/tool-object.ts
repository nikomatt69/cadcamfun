/**
 * The 3D object of a tool, from its core model (`cam.ToolModel`, spec 31): the one drawing of a tool the app has. The tool's
 * page in the Resources shows it, the CAM preview moves it along the program, the machine scene mounts the lathe insert and
 * the printer nozzle with it.
 *
 * Tool coordinates: the programmed point at the origin, mill tools along +Z (they turn about it), lathe inserts in the XZ
 * tool plane (a front turret mirrors them), the nozzle tip at the origin, a tool setter's pad top at the origin.
 */
import * as THREE from "three"
import { cam } from "@cadcamfun/core"

export interface ToolObjectOptions {
  /** Colour of the cutting part (the preview gives each tool its own). */
  readonly color?: number
  /** Draw a generic holder when the model has none (translucent, named "assumed"). */
  readonly assumeHolder?: boolean
  readonly turret?: "rear" | "front"
  readonly segments?: number
}

const NOZZLE_COLORS: Readonly<Record<cam.NozzleType, number>> = { brass: 0xd4a017, standard: 0xd4a017, hardened: 0x4b5563, ruby: 0xb91c1c }

const meshOf = (part: cam.kernel.AssemblyMesh, color: number): THREE.Mesh => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(part.positions, 3))
  geometry.setAttribute("normal", new THREE.BufferAttribute(part.normals, 3))
  geometry.setIndex(new THREE.BufferAttribute(part.indices, 1))
  const material = new THREE.MeshStandardMaterial({ color, metalness: part.part === "holder" ? 0.4 : 0.75, roughness: part.part === "cutting" ? 0.3 : 0.45, transparent: part.assumed, opacity: part.assumed ? 0.35 : 1, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = `${part.part}${part.assumed ? " (assumed)" : ""}`
  return mesh
}

const latheInsert = (m: cam.LatheModel, turret: "rear" | "front"): THREE.Group => {
  const group = new THREE.Group()
  group.name = "lathe-tool"
  for (const outline of cam.viewer.latheToolOutlines(m.insert, m.width, m.noseRadius, m.shape)) {
    // The outline is in the (x, z) tool plane; a Shape is drawn in (x, y), so y stands for z and the extrusion runs along y.
    const shape = new THREE.Shape(outline.points.map((p) => new THREE.Vector2(p.x, p.z)))
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: outline.thickness, bevelEnabled: false, curveSegments: 12 })
    geometry.translate(0, 0, -outline.thickness / 2)
    geometry.rotateX(Math.PI / 2)
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: outline.part === "insert" ? (m.insert === "knurling" ? 0x9ca3af : 0xfbbf24) : 0x6b7280, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }))
    mesh.name = `lathe-tool:${outline.part}`
    group.add(mesh)
  }
  // A front turret is the mirror image of a rear one across the spindle axis.
  if (turret === "front") group.scale.z = -1
  return group
}

const nozzle = (m: cam.NozzleModel): THREE.Group => {
  const group = new THREE.Group()
  group.name = "nozzle"
  const color = NOZZLE_COLORS[m.nozzle]
  const tip = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 24), new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.3 }))
  tip.rotation.x = -Math.PI / 2
  tip.position.z = 3
  tip.name = `nozzle:${m.nozzle}`
  const flats = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 3, 6), new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.3 }))
  flats.rotation.x = Math.PI / 2
  flats.position.z = 7.5
  const block = new THREE.Mesh(new THREE.BoxGeometry(16, 12, 10), new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.6, roughness: 0.4 }))
  block.position.z = 14
  block.name = "heater-block"
  const opening = new THREE.Mesh(new THREE.CylinderGeometry(m.diameter / 2, m.diameter / 2, 0.4, 16), new THREE.MeshBasicMaterial({ color: m.nozzle === "ruby" ? 0xef4444 : 0x111827 }))
  opening.rotation.x = Math.PI / 2
  opening.name = "opening"
  group.add(tip, flats, block, opening)
  return group
}

const setter = (m: cam.SetterModel): THREE.Group => {
  const group = new THREE.Group()
  group.name = "tool-setter"
  const body = new THREE.Mesh(new THREE.CylinderGeometry(m.padDiameter * 0.8, m.padDiameter * 0.9, m.height - 6, 32), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.5 }))
  body.rotation.x = Math.PI / 2
  body.position.z = -6 - (m.height - 6) / 2
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(m.padDiameter / 2, m.padDiameter / 2, 6, 32), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 }))
  pad.rotation.x = Math.PI / 2
  pad.position.z = -3
  pad.name = "setter-pad"
  group.add(body, pad)
  return group
}

export const toolObject = (model: cam.ToolModel, options: ToolObjectOptions = {}): THREE.Group => {
  if (model.family === "lathe") return latheInsert(model, options.turret ?? "rear")
  if (model.family === "nozzle") return nozzle(model)
  if (model.family === "setter") return setter(model)
  const group = new THREE.Group()
  group.name = model.family === "probe" ? "probe" : `tool:${model.shape}`
  const cutting = model.family === "probe" ? 0xdc2626 : options.color ?? 0xf59e0b
  for (const part of cam.toolMeshes(model, { assumeHolder: options.assumeHolder ?? true, segments: options.segments ?? 40 })) {
    group.add(meshOf(part, part.part === "cutting" ? cutting : part.part === "shank" ? 0xb8bec6 : 0x4b5563))
  }
  if (model.family === "mill" && model.shape === "boringBar") {
    // The boring head's single insert, off the axis at the cutting radius.
    const insert = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1.5, model.diameter * 0.15), 3, 3), new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.7, roughness: 0.3 }))
    insert.position.set(model.diameter / 2 - Math.max(0.75, model.diameter * 0.075), 0, 1.5)
    insert.name = "flute-marker"
    group.add(insert)
  }
  return group
}

/** The tool a cutter of the kernel's library or the generator's settings stands for. */
export const toolModelOfCutter = (cutter: cam.kernel.Cutter): cam.ToolModel => cam.toolModelFromCutter(cutter)
