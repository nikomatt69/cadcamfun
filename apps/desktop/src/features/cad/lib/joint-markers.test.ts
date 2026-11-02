import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import type { Joint, JointType } from "../types/assembly.ts"
import { applyJointSelection, createJointMarker, createJointMarkers, describeJoint, JOINT_COLORS, JOINT_HIGHLIGHT, jointGlyph, jointMarkerSize, pickJointMarker } from "./joint-markers.ts"
import type { VertexPicking } from "./sub-entity.ts"

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

const rayDown = (x: number, y: number, radiusAt: (distance: number) => number = () => 0.5): VertexPicking => ({ ray: new THREE.Ray(new THREE.Vector3(x, y, 100), new THREE.Vector3(0, 0, -1)), radiusAt })
const markers = (joints: Joint[], offset = { x: 0, y: 0, z: 0 }) => {
  const group = createJointMarkers(joints, 100, offset)
  group.updateMatrixWorld(true)
  return group
}

describe("picking a joint glyph", () => {
  test("the joint whose origin is near the ray is picked, wherever it is along the ray", () => {
    const group = markers([joint("revolute"), joint("prismatic", { id: "p", origin: { x: 60, y: 0, z: 0 } })])
    expect(pickJointMarker(group, rayDown(10, 20))?.jointId).toBe("j-revolute")
    expect(pickJointMarker(group, rayDown(60.2, 0.1))?.jointId).toBe("p")
    expect(pickJointMarker(group, rayDown(300, 300))).toBeUndefined()
    expect(pickJointMarker(undefined, rayDown(10, 20))).toBeUndefined()
  })

  test("the glyph's own size is the reach, the pixel tolerance only widens it", () => {
    const group = markers([joint("revolute")])
    const size = jointMarkerSize(100) // 6 mm
    // 3 mm from the origin is inside a 6 mm glyph (pick radius 0.7 size), 8 mm is outside
    expect(pickJointMarker(group, rayDown(13, 20, () => 0))?.jointId).toBe("j-revolute")
    expect(pickJointMarker(group, rayDown(10 + size * 0.7 + 2, 20, () => 0))).toBeUndefined()
    // a coarse screen tolerance reaches farther than the glyph
    expect(pickJointMarker(group, rayDown(10 + size * 0.7 + 2, 20, () => 7))?.jointId).toBe("j-revolute")
  })

  test("of two joints under the cursor the one nearer the ray wins, then the one nearer the eye", () => {
    const group = markers([joint("revolute", { id: "far", origin: { x: 10, y: 20, z: 0 } }), joint("revolute", { id: "near", origin: { x: 10.5, y: 20, z: 40 } })])
    expect(pickJointMarker(group, rayDown(10.4, 20))?.jointId).toBe("near")
    expect(pickJointMarker(group, rayDown(10.25, 20))?.jointId).toBe("near") // equally far from the ray: the one in front
    expect(pickJointMarker(group, rayDown(10, 20))?.jointId).toBe("far")
  })

  test("a joint behind the eye, and a hidden one, are not picked", () => {
    const behind = markers([joint("revolute", { origin: { x: 10, y: 20, z: 200 } })])
    expect(pickJointMarker(behind, rayDown(10, 20))).toBeUndefined()
    const group = markers([joint("revolute")])
    group.children[0]!.visible = false
    expect(pickJointMarker(group, rayDown(10, 20))).toBeUndefined()
  })

  test("the drawing's origin offset moves the glyph and the pick with it", () => {
    const group = markers([joint("revolute")], { x: 100, y: 0, z: 0 })
    expect(pickJointMarker(group, rayDown(110, 20))?.jointId).toBe("j-revolute")
    expect(pickJointMarker(group, rayDown(10, 20))).toBeUndefined()
  })
})

describe("the highlight of a picked or hovered joint", () => {
  const colour = (marker: THREE.Object3D) => ((marker.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial).color.getHex()

  test("picked is amber and larger, hovered cyan, the rest keep the colour of their type", () => {
    const group = markers([joint("revolute"), joint("fixed", { id: "f" })])
    const [a, b] = group.children as [THREE.Object3D, THREE.Object3D]
    expect(applyJointSelection(group, "j-revolute", "f")).toBe(true)
    expect(colour(a)).toBe(JOINT_HIGHLIGHT.picked)
    expect(a.scale.x).toBeGreaterThan(1)
    expect(colour(b)).toBe(JOINT_HIGHLIGHT.hover)
    expect(b.scale.x).toBe(1)
    // idempotent
    expect(applyJointSelection(group, "j-revolute", "f")).toBe(false)
    // and fully reversible: the type colour comes back
    expect(applyJointSelection(group, null, null)).toBe(true)
    expect(colour(a)).toBe(JOINT_COLORS.revolute)
    expect(colour(b)).toBe(JOINT_COLORS.fixed)
    expect(a.scale.x).toBe(1)
    expect(applyJointSelection(undefined, null, null)).toBe(false)
  })
})

describe("what the property chip says about a joint", () => {
  test("rows for what the joint has, with node names and limits in their units", () => {
    const rows = describeJoint(joint("revolute", { name: "Shoulder", limits: { minAngle: -45, maxAngle: 90 }, value: 12.5, secondaryAxis: { x: 1, y: 0, z: 0 } }), (id) => (id === "a" ? "Base" : "Arm"))
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]))
    expect(rows.map((row) => row.key)).toEqual(["name", "type", "parent", "child", "origin", "axis", "secondaryAxis", "limits", "value"])
    expect(byKey).toMatchObject({ name: "Shoulder", type: "revolute", parent: "Base", child: "Arm", origin: "10, 20, 30", axis: "0, 0, 1", secondaryAxis: "1, 0, 0", limits: "-45 … 90 °", value: "12.5" })
    const slider = describeJoint(joint("prismatic", { limits: { maxDistance: 80 } }))
    expect(slider.find((row) => row.key === "limits")?.value).toBe("– … 80 mm")
    // a joint with nothing optional has just the six basic rows
    expect(describeJoint(joint("fixed")).map((row) => row.key)).toEqual(["name", "type", "parent", "child", "origin", "axis"])
  })
})
