import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import { applyElementOpacity, elementOpacity } from "./appearance.ts"
import { createThreeObject } from "./createThreeObject.ts"
import { meshIsClosed } from "./mesh-quality.ts"

const ORIGIN = { x: 0, y: 0, z: 0 }
/** A unit tetrahedron, outward winding. */
const TETRA = { vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }], faces: [[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]] }
const firstMesh = (object: THREE.Object3D): THREE.Mesh => { let found: THREE.Mesh | undefined; object.traverse((o) => { if (!found && (o as THREE.Mesh).isMesh && !(o as { isLineSegments2?: boolean }).isLineSegments2) found = o as THREE.Mesh }); return found! }

describe("meshIsClosed", () => {
  test("a closed, consistently wound skin is closed", () => {
    expect(meshIsClosed(TETRA.faces.flat())).toBe(true)
  })
  test("a missing face, a flipped face and an empty mesh are not", () => {
    expect(meshIsClosed([[0, 2, 1], [0, 1, 3], [1, 2, 3]].flat())).toBe(false)
    expect(meshIsClosed([[0, 1, 2], [0, 1, 3], [1, 2, 3], [0, 3, 2]].flat())).toBe(false)
    expect(meshIsClosed([])).toBe(false)
  })
  test("a quad sheet is open", () => {
    expect(meshIsClosed([0, 1, 2, 0, 2, 3])).toBe(false)
  })
})

describe("a mesh element (an import) is drawn like a solid", () => {
  test("a closed mesh is one-sided with creased normals and edge lines", () => {
    const object = createThreeObject({ id: "m", type: "mesh", color: "#cc8844", ...TETRA }, ORIGIN)!
    const mesh = firstMesh(object)
    expect((mesh.material as THREE.Material).side).toBe(THREE.FrontSide)
    // creased normals split the vertices at the sharp corners: 4 faces x 3 corners
    expect(mesh.geometry.getAttribute("position").count).toBe(12)
    expect(object.children.some((child) => child.name === "edges")).toBe(true)
  })

  test("a sheet is two-sided", () => {
    const object = createThreeObject({ id: "m", type: "mesh", vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }], faces: [[0, 1, 2, 3]] }, ORIGIN)!
    expect((firstMesh(object).material as THREE.Material).side).toBe(THREE.DoubleSide)
  })

  test("a face that names a vertex that is not there is refused, not drawn as garbage", () => {
    expect(createThreeObject({ id: "m", type: "mesh", vertices: TETRA.vertices, faces: [[0, 1, 9]] }, ORIGIN)).toBeNull()
  })

  test("the origin offset is applied once", () => {
    const object = createThreeObject({ id: "m", type: "mesh", ...TETRA }, { x: 10, y: 0, z: 0 })!
    expect(new THREE.Box3().setFromObject(object).min.x).toBeCloseTo(10)
  })
})

describe("element opacity", () => {
  test("only a value strictly between 0 and 1 is translucent", () => {
    expect(elementOpacity({ opacity: 0.4 })).toBe(0.4)
    for (const value of [1, 0, -1, NaN, "0.5", undefined]) expect(elementOpacity({ opacity: value })).toBeUndefined()
  })

  test("the faces blend and stop writing depth; the edge lines are untouched", () => {
    const object = createThreeObject({ id: "m", type: "mesh", opacity: 0.4, ...TETRA }, ORIGIN)!
    const material = firstMesh(object).material as THREE.MeshStandardMaterial
    expect([material.transparent, material.opacity, material.depthWrite]).toEqual([true, 0.4, false])
  })

  test("a cube with opacity is translucent, one without is not", () => {
    const cube = { type: "cube", x: 0, y: 0, z: 0, width: 1, height: 1, depth: 1 }
    expect((createThreeObject({ id: "a", ...cube, opacity: 0.5 }, ORIGIN) as THREE.Mesh).material).toMatchObject({ transparent: true, opacity: 0.5 })
    expect((createThreeObject({ id: "b", ...cube }, ORIGIN) as THREE.Mesh).material).toMatchObject({ transparent: false, opacity: 1 })
  })

  test("a material that is already more transparent keeps its own value", () => {
    const group = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 })))
    applyElementOpacity(group, { opacity: 0.6 })
    expect(((group.children[0] as THREE.Mesh).material as THREE.Material).opacity).toBeCloseTo(0.3)
  })
})
