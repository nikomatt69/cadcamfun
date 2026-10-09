/**
 * The three.js side of the section view and of wireframe base pieces, checked without a GPU: the plane convention three
 * clips by, the orientation of the cut sheet, and the materials the editor builds. (Pixels are not checked here.)
 */
import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import { clipPlaneFor, keeps, type SectionState } from "../src/cad/lib/section.ts"
import { createSectionHelper } from "../src/cad/lib/sectionHelper.ts"
import { createThreeObject } from "../src/cad/lib/createThreeObject.ts"
import { normalizeElement } from "../../../packages/ai/src/element-catalog.ts"

const planeOf = (s: Pick<SectionState, "axis" | "position" | "inverted">) => {
  const { normal, constant } = clipPlaneFor(s)
  return new THREE.Plane(new THREE.Vector3(...normal), constant)
}

describe("the clipping plane three.js builds from a section", () => {
  test("three clips where the signed distance is negative: exactly where `keeps` says no", () => {
    const points = [-50, -1, 0, 0.5, 39.9, 40, 40.1, 90].flatMap((v) => [
      { x: v, y: 3, z: 3 }, { x: 3, y: v, z: 3 }, { x: 3, y: 3, z: v }
    ])
    for (const axis of ["x", "y", "z"] as const) {
      for (const inverted of [false, true]) {
        const section = { enabled: true, axis, position: 40, inverted }
        const plane = planeOf(section)
        for (const p of points) {
          const distance = plane.distanceToPoint(new THREE.Vector3(p.x, p.y, p.z))
          expect(distance >= -1e-9).toBe(keeps(section, p))
        }
      }
    }
  })

  test("cutting a 100 mm cube at its middle leaves the lower half", () => {
    const box = new THREE.Box3(new THREE.Vector3(-50, -50, -50), new THREE.Vector3(50, 50, 50))
    const plane = planeOf({ axis: "z", position: 0, inverted: false })
    const corners = [-50, 50].flatMap((x) => [-50, 50].flatMap((y) => [-50, 50].map((z) => new THREE.Vector3(x, y, z))))
    expect(corners.filter((c) => plane.distanceToPoint(c) >= 0).every((c) => c.z === -50)).toBe(true)
    expect(box.containsPoint(new THREE.Vector3(0, 0, 0))).toBe(true)
  })
})

describe("the sheet that shows where the cut is", () => {
  const worldNormal = (object: THREE.Object3D) => new THREE.Vector3(0, 0, 1).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion())).round()
  const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 60, 40))

  test("it faces the axis of the cut and sits on the plane, on the kept side", () => {
    for (const [axis, normal] of [["x", [1, 0, 0]], ["y", [0, 1, 0]], ["z", [0, 0, 1]]] as const) {
      const sheet = createSectionHelper(axis, 20, false, box)
      const n = worldNormal(sheet)
      expect([Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)]).toEqual([...normal])
      expect(sheet.position[axis]).toBeCloseTo(19.98, 5)
      expect(createSectionHelper(axis, 20, true, box).position[axis]).toBeCloseTo(20.02, 5)
    }
  })

  test("it is centred on the model in the other axes, larger than the model, and never picked by the mouse", () => {
    const sheet = createSectionHelper("z", 20, false, box)
    expect(sheet.position.x).toBeCloseTo(50)
    expect(sheet.position.y).toBeCloseTo(30)
    const mesh = sheet.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3())
    expect(size.x).toBeGreaterThan(100)
    expect(sheet.userData.isSectionHelper).toBe(true)
    const raycaster = new THREE.Raycaster(new THREE.Vector3(50, 30, 100), new THREE.Vector3(0, 0, -1))
    expect(raycaster.intersectObject(sheet, true)).toHaveLength(0)
  })

  test("an empty scene still gets a usable sheet", () => {
    const sheet = createSectionHelper("x", 0, false, new THREE.Box3())
    expect(new THREE.Box3().setFromObject(sheet).isEmpty()).toBe(false)
  })
})

describe("wireframe base pieces reach the renderer as wireframe materials", () => {
  const materialOf = (object: THREE.Object3D | null): THREE.Material | undefined => {
    let found: THREE.Material | undefined
    object?.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && found === undefined) found = Array.isArray(m) ? m[0] : m })
    return found
  }

  test("what the assistant adds as a base piece is drawn as wireframe; a finished solid is not", () => {
    for (const type of ["cube", "sphere", "cylinder", "cone", "torus"]) {
      const r = normalizeElement({ type })
      if (!r.ok) throw new Error(r.error)
      const material = materialOf(createThreeObject({ id: `e-${type}`, ...r.element }))
      expect((material as THREE.MeshStandardMaterial | undefined)?.wireframe).toBe(true)
    }
    const solid = normalizeElement({ type: "cube", wireframe: false })
    if (!solid.ok) throw new Error(solid.error)
    expect((materialOf(createThreeObject({ id: "solid", ...solid.element })) as THREE.MeshStandardMaterial | undefined)?.wireframe).toBe(false)
  })
})
