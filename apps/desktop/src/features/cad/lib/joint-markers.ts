import * as THREE from "three"
import type { Joint, JointType } from "../types/assembly.ts"

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
  return group
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
