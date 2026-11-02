import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import type { Joint, JointType } from "../types/assembly.ts"
import { createJointMarker, createJointMarkers, JOINT_COLORS, jointGlyph, jointMarkerSize } from "./joint-markers.ts"

const joint = (type: JointType, extra: Partial<Joint> = {}): Joint => ({ id: `j-${type}`, name: type, type, parent: "a", child: "b", origin: { x: 10, y: 20, z: 30 }, primaryAxis: { x: 0, y: 0, z: 1 }, ...extra })
const TYPES: JointType[] = ["fixed", "revolute", "prismatic", "cylindrical", "spherical", "planar", "free"]

describe("joint glyphs", () => {
  test("every joint type has a glyph made of whole segments", () => {
    for (const type of TYPES) {
      const glyph = jointGlyph(type, 10)
      expect(glyph.length).toBeGreaterThan(0)
      expect(glyph.length % 6).toBe(0)
      expect(glyph.every(Number.isFinite)).toBe(true)
    }
  })

  test("a revolute ring turns about the axis (it lies in the plane square to it)", () => {
    const zs = jointGlyph("revolute", 10).filter((_, i) => i % 3 === 2)
    // the ring's points have z = 0; only the arrow runs along z
    expect(zs.filter((z) => z === 0).length).toBeGreaterThan(40)
  })

  test("each type has its own colour; a joint can override it", () => {
    expect(new Set(Object.values(JOINT_COLORS)).size).toBe(Object.keys(JOINT_COLORS).length)
    const colour = (object: THREE.Object3D) => ((object.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial).color.getHex()
    expect(colour(createJointMarker(joint("revolute"), 5, { x: 0, y: 0, z: 0 }))).toBe(JOINT_COLORS.revolute)
    expect(colour(createJointMarker(joint("revolute", { color: 0x123456 }), 5, { x: 0, y: 0, z: 0 }))).toBe(0x123456)
  })
})

describe("joint markers in the scene", () => {
  test("a marker sits at the joint origin plus the drawing offset", () => {
    const marker = createJointMarker(joint("revolute"), 5, { x: 1, y: 2, z: 3 })
    expect(marker.position.toArray()).toEqual([11, 22, 33])
  })

  test("the glyph's +Z follows the joint axis", () => {
    const marker = createJointMarker(joint("prismatic", { primaryAxis: { x: 1, y: 0, z: 0 } }), 5, { x: 0, y: 0, z: 0 })
    marker.updateMatrixWorld(true)
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(marker.quaternion)
    expect(z.x).toBeCloseTo(1)
    expect(z.z).toBeCloseTo(0)
  })

  test("a zero axis leaves the glyph upright instead of producing NaN", () => {
    const marker = createJointMarker(joint("revolute", { primaryAxis: { x: 0, y: 0, z: 0 } }), 5, { x: 0, y: 0, z: 0 })
    expect(marker.quaternion.toArray().every(Number.isFinite)).toBe(true)
  })

  test("hidden joints are not drawn; the markers cannot be picked", () => {
    const group = createJointMarkers([joint("revolute"), joint("fixed", { id: "h", visible: false })], 100, { x: 0, y: 0, z: 0 })
    expect(group.children).toHaveLength(1)
    const raycaster = new THREE.Raycaster(new THREE.Vector3(10, 20, 100), new THREE.Vector3(0, 0, -1))
    expect(raycaster.intersectObject(group, true)).toEqual([])
  })

  test("the glyph size follows the drawing within sane bounds", () => {
    expect(jointMarkerSize(10)).toBe(3)
    expect(jointMarkerSize(500)).toBeCloseTo(30)
    expect(jointMarkerSize(1e6)).toBe(60)
    expect(jointMarkerSize(NaN)).toBe(6)
  })
})
