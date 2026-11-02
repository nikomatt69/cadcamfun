import { textStrokes } from "@cadcamfun/core"
import * as THREE from "three"

/**
 * The elements the toolbar can create (`elementTemplates.ts`) that have no builder in `createThreeObject`'s switch: `text`,
 * `extrude`, `grid`, `tube` and `lathe`. Before these builders existed the element was in the list, selectable by its row and
 * saved with the drawing, and nothing was drawn.
 *
 * All of them are Z-up like the rest of the scene and sit at the element's x, y, z shifted by the drawing's origin offset.
 */
type Offset = { readonly x: number; readonly y: number; readonly z: number }

const EXTRA_TYPES = new Set(["text", "extrude", "grid", "tube", "lathe"])
export const isExtraElement = (type: unknown): boolean => typeof type === "string" && EXTRA_TYPES.has(type)

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const colorOf = (element: Record<string, unknown>, fallback: number): THREE.ColorRepresentation => (typeof element.color === "string" || typeof element.color === "number" ? (element.color as THREE.ColorRepresentation) : fallback)
const points2 = (list: unknown): THREE.Vector2[] => (Array.isArray(list) ? list.filter((p): p is { x: number; y: number } => typeof p === "object" && p !== null && finite((p as { x?: unknown }).x) && finite((p as { y?: unknown }).y)).map((p) => new THREE.Vector2(p.x, p.y)) : [])
const points3 = (list: unknown): THREE.Vector3[] =>
  Array.isArray(list) ? list.filter((p): p is { x: number; y: number; z?: number } => typeof p === "object" && p !== null && finite((p as { x?: unknown }).x) && finite((p as { y?: unknown }).y)).map((p) => new THREE.Vector3(p.x, p.y, finite(p.z) ? p.z : 0)) : []

const place = <T extends THREE.Object3D>(object: T, element: Record<string, unknown>, offset: Offset): T => {
  object.position.set((finite(element.x) ? element.x : 0) + offset.x, (finite(element.y) ? element.y : 0) + offset.y, (finite(element.z) ? element.z : 0) + offset.z)
  return object
}

const solid = (element: Record<string, unknown>, fallback: number, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: colorOf(element, fallback), wireframe: element.wireframe === true, side })

/** Single-line text in the XY plane at the element's position: the same Hershey-style strokes the CAM engraves. */
const textObject = (element: Record<string, unknown>, offset: Offset): THREE.Object3D | null => {
  const size = finite(element.size) && element.size > 0 ? element.size : 10
  const laid = textStrokes(String(element.text ?? ""), size)
  if (laid.strokes.length === 0) return null
  const positions: number[] = []
  for (const stroke of laid.strokes) for (let i = 1; i < stroke.length; i++) positions.push(stroke[i - 1]!.x, stroke[i - 1]!.y, 0, stroke[i]!.x, stroke[i]!.y, 0)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: colorOf(element, 0x1e88e5) }))
  lines.userData.text = element.text
  return place(lines, element, offset)
}

/** A closed profile pushed along +Z by `depth`; a self-intersecting or degenerate profile draws nothing. */
const extrudeObject = (element: Record<string, unknown>, offset: Offset): THREE.Object3D | null => {
  const ring = points2(element.shape ?? element.profile)
  if (ring.length < 3) return null
  const depth = finite(element.depth) && element.depth > 0 ? element.depth : 10
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(ring), { depth, bevelEnabled: false })
  return place(new THREE.Mesh(geometry, solid(element, 0x1e88e5)), element, offset)
}

/** A reference grid of `size` and `divisions` lying on the element's plane (xy, xz or yz). */
const gridObject = (element: Record<string, unknown>, offset: Offset): THREE.Object3D | null => {
  const size = finite(element.size) && element.size > 0 ? element.size : 100
  const divisions = finite(element.divisions) ? Math.max(1, Math.min(500, Math.floor(element.divisions))) : 10
  const helper = new THREE.GridHelper(size, divisions, new THREE.Color(colorOf({ color: element.colorCenterLine }, 0x444444)), new THREE.Color(colorOf({ color: element.colorGrid }, 0x888888)))
  // GridHelper lies in XZ (Y-up). The scene is Z-up: xy is the ground, xz stands on its edge, yz beside it.
  const plane = typeof element.plane === "string" ? element.plane.toLowerCase() : "xy"
  if (plane === "xy") helper.rotation.x = Math.PI / 2
  else if (plane === "yz") helper.rotation.z = Math.PI / 2
  return place(helper, element, offset)
}

/** A round pipe along a smooth path through the points (relative to the element's position). */
const tubeObject = (element: Record<string, unknown>, offset: Offset): THREE.Object3D | null => {
  const path = points3(element.path)
  if (path.length < 2) return null
  const curve = new THREE.CatmullRomCurve3(path, element.closed === true)
  const tubular = finite(element.tubularSegments) ? Math.max(2, Math.min(4096, Math.floor(element.tubularSegments))) : Math.max(16, path.length * 16)
  const radial = finite(element.radialSegments) ? Math.max(3, Math.min(128, Math.floor(element.radialSegments))) : 8
  const radius = finite(element.radius) && element.radius > 0 ? element.radius : 1
  const geometry = new THREE.TubeGeometry(curve, tubular, radius, radial, element.closed === true)
  return place(new THREE.Mesh(geometry, solid(element, 0x2196f3, THREE.DoubleSide)), element, offset)
}

/** A profile (x = distance from the axis, y = height) turned about the vertical axis, standing on Z like every other solid. */
const latheObject = (element: Record<string, unknown>, offset: Offset): THREE.Object3D | null => {
  const profile = points2(element.points ?? element.profile)
  if (profile.length < 2) return null
  const segments = finite(element.segments) ? Math.max(3, Math.min(512, Math.floor(element.segments))) : 32
  const phiLength = finite(element.phiLength) && element.phiLength > 0 ? Math.min(element.phiLength, Math.PI * 2) : Math.PI * 2
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(Math.abs(p.x), p.y)), segments, 0, phiLength), solid(element, 0x607d8b, THREE.DoubleSide))
  mesh.rotation.x = Math.PI / 2
  return place(mesh, element, offset)
}

/** The Three object of an element of the five types above, or null when its data cannot be drawn. */
export const buildExtraElement = (element: Record<string, unknown>, offset: Offset): THREE.Object3D | null => {
  switch (element.type) {
    case "text": return textObject(element, offset)
    case "extrude": return extrudeObject(element, offset)
    case "grid": return gridObject(element, offset)
    case "tube": return tubeObject(element, offset)
    case "lathe": return latheObject(element, offset)
    default: return null
  }
}
