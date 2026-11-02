import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { addSectionCaps, removeSectionCaps, SECTION_CAP_COLOR } from "./sectionHelper.ts"
import { applyDisplayMode } from "./display-mode.ts"
import { disposeObject } from "./sceneHelpers.ts"

const capsOf = (root: THREE.Object3D): THREE.Mesh[] => {
  const found: THREE.Mesh[] = []
  root.traverse((object) => { if (object.userData.isSectionCap === true) found.push(object as THREE.Mesh) })
  return found
}
const solid = (): THREE.Mesh => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())

describe("section caps", () => {
  test("every solid mesh gets a back-face cap in the section colour, sharing its geometry", () => {
    const part = solid()
    expect(addSectionCaps([part])).toBe(1)
    const [cap] = capsOf(part)
    expect(cap!.geometry).toBe(part.geometry)
    const material = cap!.material as THREE.MeshBasicMaterial
    expect(material.side).toBe(THREE.BackSide)
    expect(material.color.getHex()).toBe(SECTION_CAP_COLOR)
  })

  test("a B-rep with one mesh per face gets one cap per face and one material for all", () => {
    const group = new THREE.Group()
    const shared = new THREE.MeshStandardMaterial()
    for (let i = 0; i < 4; i++) group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared))
    expect(addSectionCaps([group])).toBe(4)
    expect(new Set(capsOf(group).map((cap) => cap.material)).size).toBe(1)
  })

  test("adding twice does not stack caps", () => {
    const part = solid()
    addSectionCaps([part])
    addSectionCaps([part])
    expect(capsOf(part).length).toBe(1)
  })

  test("sheets, translucent parts, wireframes, markers and edge lines are not capped", () => {
    const root = new THREE.Group()
    root.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })))
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 })))
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ wireframe: true })))
    const marker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    marker.userData.isInvalidMarker = true
    root.add(marker)
    root.add(new LineSegments2(new LineSegmentsGeometry().setPositions([0, 0, 0, 1, 1, 1]), new LineMaterial()))
    root.add(new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()))
    expect(addSectionCaps([root])).toBe(0)
  })

  test("the caps cannot be picked", () => {
    const part = solid()
    addSectionCaps([part])
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1))
    const hits = raycaster.intersectObject(part, true)
    expect(hits.every((hit) => hit.object.userData.isSectionCap !== true)).toBe(true)
  })

  test("removing the caps frees their material and leaves the part's geometry alone", () => {
    const part = solid()
    addSectionCaps([part])
    const [cap] = capsOf(part)
    let disposedMaterial = false, disposedGeometry = false
    ;(cap!.material as THREE.Material).addEventListener("dispose", () => { disposedMaterial = true })
    part.geometry.addEventListener("dispose", () => { disposedGeometry = true })
    removeSectionCaps([part])
    expect(capsOf(part).length).toBe(0)
    expect(disposedMaterial).toBe(true)
    expect(disposedGeometry).toBe(false)
  })

  test("disposing a capped part frees everything once", () => {
    const part = solid()
    addSectionCaps([part])
    expect(() => disposeObject(part)).not.toThrow()
  })

  test("the visual style dresses the caps too: in wireframe the cut is not filled", () => {
    const part = solid()
    addSectionCaps([part])
    applyDisplayMode(part, "wireframe")
    const [cap] = capsOf(part)
    expect((cap!.material as THREE.Material).colorWrite).toBe(false)
  })
})
