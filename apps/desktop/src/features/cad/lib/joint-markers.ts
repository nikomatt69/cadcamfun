import * as THREE from "three"
import type { Joint, JointType } from "../types/assembly.ts"
import type { VertexPicking } from "./sub-entity.ts"

/**
 * The joints of the assembly in the 3D view. The assembly model keeps joints as data (type, origin, axis, limits); nothing drew them,
 * so a revolute pin or a slider existed only as a row in a panel. Each joint is a small glyph at its origin, turned to its axis and
 * sized to the drawing, in the colour of its type:
 *
 * - revolute: a ring about the axis with an arrow along it
 * - prismatic: a double arrow along the axis
 * - cylindrical: a ring and a double arrow (turns and slides)
 * - spherical: three rings
 * - planar: a square plate square to the axis
 * - fixed: a small cube with a cross
 * - free: a triad
 */
export const JOINT_COLORS: Readonly<Record<JointType, number>> = {
  revolute: 0x2196f3, prismatic: 0x4caf50, fixed: 0xf44336, cylindrical: 0x00bcd4, spherical: 0xffeb3b, planar: 0x9c27b0, free: 0xcccccc
}

const colorOf = (joint: Joint): number => joint.color ?? JOINT_COLORS[joint.type] ?? 0xff9800

const ring = (radius: number, plane: "xy" | "yz" | "zx", segments = 48): number[] => {
  const out: number[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2, b = ((i + 1) / segments) * Math.PI * 2
    const at = (t: number): [number, number, number] => plane === "xy" ? [radius * Math.cos(t), radius * Math.sin(t), 0] : plane === "yz" ? [0, radius * Math.cos(t), radius * Math.sin(t)] : [radius * Math.sin(t), 0, radius * Math.cos(t)]
    out.push(...at(a), ...at(b))
  }
  return out
}
/** A shaft along +Z from `from` to `to` with an arrow head at `to`. */
const arrow = (from: number, to: number, head: number): number[] => {
  const sign = to >= from ? 1 : -1
  const back = to - sign * head
  const w = head * 0.35
  return [0, 0, from, 0, 0, to, 0, 0, to, w, 0, back, 0, 0, to, -w, 0, back, 0, 0, to, 0, w, back, 0, 0, to, 0, -w, back]
}
const box = (half: number): number[] => {
  const c = [-half, half]
  const out: number[] = []
  for (const x of c) for (const y of c) out.push(x, y, -half, x, y, half)
  for (const x of c) for (const z of c) out.push(x, -half, z, x, half, z)
  for (const y of c) for (const z of c) out.push(-half, y, z, half, y, z)
  return out
}

/** The line segments of a joint's glyph in its own frame (axis along +Z, unit scale `size`). */
export const jointGlyph = (type: JointType, size: number): number[] => {
  switch (type) {
    case "revolute": return [...ring(size * 0.6, "xy"), ...arrow(-size * 0.9, size * 0.9, size * 0.25)]
    case "prismatic": return [...arrow(0, size * 1.1, size * 0.25), ...arrow(0, -size * 1.1, size * 0.25)]
    case "cylindrical": return [...ring(size * 0.6, "xy"), ...arrow(0, size * 1.1, size * 0.25), ...arrow(0, -size * 1.1, size * 0.25)]
    case "spherical": return [...ring(size * 0.6, "xy"), ...ring(size * 0.6, "yz"), ...ring(size * 0.6, "zx")]
    case "planar": { const h = size * 0.8; return [-h, -h, 0, h, -h, 0, h, -h, 0, h, h, 0, h, h, 0, -h, h, 0, -h, h, 0, -h, -h, 0, ...arrow(0, size * 0.8, size * 0.2)] }
    case "fixed": { const h = size * 0.3; return [...box(h), -h * 2, 0, 0, h * 2, 0, 0, 0, -h * 2, 0, 0, h * 2, 0, 0, 0, -h * 2, 0, 0, h * 2] }
    default: return [0, 0, 0, size, 0, 0, 0, 0, 0, 0, size, 0, 0, 0, 0, 0, 0, size]
  }
}

const Z = new THREE.Vector3(0, 0, 1)

/** The glyph of one joint at its origin (plus the drawing's origin offset), turned so its +Z follows the joint's primary axis. */
export const createJointMarker = (joint: Joint, size: number, offset: { readonly x: number; readonly y: number; readonly z: number }): THREE.Object3D => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(jointGlyph(joint.type, size), 3))
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: colorOf(joint), depthTest: false, transparent: true }))
  lines.renderOrder = 7
  lines.raycast = () => undefined
  const group = new THREE.Group().add(lines)
  group.position.set(joint.origin.x + offset.x, joint.origin.y + offset.y, joint.origin.z + offset.z)
  const axis = new THREE.Vector3(joint.primaryAxis?.x ?? 0, joint.primaryAxis?.y ?? 0, joint.primaryAxis?.z ?? 1)
  if (axis.lengthSq() > 1e-12) group.quaternion.setFromUnitVectors(Z, axis.normalize())
  group.userData.isJointMarker = true
  group.userData.jointId = joint.id
  group.userData.jointType = joint.type
  // The glyph is picked by distance from the ray to its origin: about the ring's size, never less than the pixel tolerance.
  group.userData.pickRadius = size * 0.7
  return group
}

// ------------------------------------------------------------------------------------------------------- picking

export interface JointPick {
  readonly jointId: string
  /** How far along the ray the joint's origin is. */
  readonly distance: number
}

/**
 * The joint whose glyph is under the cursor, or undefined. A glyph is drawn on top of the model (no depth test), so it is picked
 * wherever it is seen: the joint whose origin is nearest to the ray among those within `max(pick radius of the glyph, pixel tolerance)`.
 */
export const pickJointMarker = (markers: THREE.Object3D | undefined, picking: VertexPicking): JointPick | undefined => {
  if (markers === undefined) return undefined
  markers.updateWorldMatrix(true, true)
  const world = new THREE.Vector3()
  let best: { jointId: string; distance: number; miss: number } | undefined
  for (const child of markers.children) {
    const jointId = child.userData.jointId as string | undefined
    if (jointId === undefined || child.visible === false) continue
    world.setFromMatrixPosition(child.matrixWorld)
    const along = world.clone().sub(picking.ray.origin).dot(picking.ray.direction)
    if (along <= 0) continue
    const miss = picking.ray.distanceToPoint(world)
    const radius = Math.max(Number(child.userData.pickRadius) || 0, picking.radiusAt(along))
    if (miss > radius) continue
    // Nearest to the ray, then nearest to the eye.
    if (best === undefined || miss < best.miss - 1e-9 || (Math.abs(miss - best.miss) <= 1e-9 && along < best.distance)) best = { jointId, distance: along, miss }
  }
  return best === undefined ? undefined : { jointId: best.jointId, distance: best.distance }
}

export const JOINT_HIGHLIGHT = { hover: 0x00e5ff, picked: 0xffab00 } as const
const HIGHLIGHT_SCALE = 1.35

/**
 * Colours the glyph of the picked joint amber and the hovered one cyan (and draws the picked one larger); every other glyph returns to the
 * colour of its type. Returns whether anything changed, so the canvas asks for a frame only then.
 */
export const applyJointSelection = (markers: THREE.Object3D | undefined, picked: string | null, hovered: string | null): boolean => {
  if (markers === undefined) return false
  let changed = false
  for (const child of markers.children) {
    const jointId = child.userData.jointId as string | undefined
    if (jointId === undefined) continue
    const lines = child.children[0] as THREE.LineSegments | undefined
    const material = lines?.material as THREE.LineBasicMaterial | undefined
    if (material === undefined) continue
    const base = (material.userData.baseColor ??= material.color.getHex()) as number
    const color = jointId === picked ? JOINT_HIGHLIGHT.picked : jointId === hovered ? JOINT_HIGHLIGHT.hover : base
    if (material.color.getHex() !== color) { material.color.setHex(color); changed = true }
    const scale = jointId === picked ? HIGHLIGHT_SCALE : 1
    if (child.scale.x !== scale) { child.scale.setScalar(scale); changed = true }
  }
  return changed
}

// ----------------------------------------------------------------------------------------------------- description

export interface JointRow {
  readonly key: "name" | "type" | "parent" | "child" | "origin" | "axis" | "secondaryAxis" | "limits" | "value"
  readonly value: string
}

const num = (value: number): string => String(Number(value.toFixed(3)))
const vec = (v: { readonly x: number; readonly y: number; readonly z: number }): string => `${num(v.x)}, ${num(v.y)}, ${num(v.z)}`

/** The rows the property chip shows for a joint (`nodeName` turns a node id into the node's name). Only what the joint has. */
export const describeJoint = (joint: Joint, nodeName: (id: string) => string = (id) => id): ReadonlyArray<JointRow> => {
  const rows: JointRow[] = [
    { key: "name", value: joint.name }, { key: "type", value: joint.type },
    { key: "parent", value: nodeName(joint.parent) }, { key: "child", value: nodeName(joint.child) },
    { key: "origin", value: vec(joint.origin) }, { key: "axis", value: vec(joint.primaryAxis) }
  ]
  if (joint.secondaryAxis !== undefined) rows.push({ key: "secondaryAxis", value: vec(joint.secondaryAxis) })
  const limits = joint.limits
  if (limits !== undefined) {
    // Turns are in degrees, slides in drawing units; the legacy rotation / translation names are read when the current ones are absent.
    const turn = [limits.minAngle ?? limits.minRotation, limits.maxAngle ?? limits.maxRotation] as const
    const slide = [limits.minDistance ?? limits.minTranslation, limits.maxDistance ?? limits.maxTranslation] as const
    const range = (pair: readonly [number | undefined, number | undefined], unit: string): string | undefined =>
      pair[0] === undefined && pair[1] === undefined ? undefined : `${pair[0] === undefined ? "–" : num(pair[0])} … ${pair[1] === undefined ? "–" : num(pair[1])} ${unit}`
    const text = [range(turn, "°"), range(slide, "mm")].filter((part): part is string => part !== undefined).join(" · ")
    if (text !== "") rows.push({ key: "limits", value: text })
  }
  if (typeof joint.value === "number") rows.push({ key: "value", value: num(joint.value) })
  return rows
}

/** The size of a joint glyph for a drawing of the given radius: a few percent of it, never smaller than a screw or larger than a part. */
export const jointMarkerSize = (sceneRadius: number): number => Math.max(3, Math.min(60, (Number.isFinite(sceneRadius) ? sceneRadius : 100) * 0.06))

/** One group with a glyph for each visible joint. */
export const createJointMarkers = (joints: ReadonlyArray<Joint>, sceneRadius: number, offset: { readonly x: number; readonly y: number; readonly z: number }): THREE.Group => {
  const group = new THREE.Group()
  group.name = "joint-markers"
  group.userData.isJointMarkers = true
  const size = jointMarkerSize(sceneRadius)
  for (const joint of joints) if (joint.visible !== false) group.add(createJointMarker(joint, size, offset))
  return group
}
