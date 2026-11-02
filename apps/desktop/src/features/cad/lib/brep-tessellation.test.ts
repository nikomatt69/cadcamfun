import { describe, expect, test } from "bun:test"
import { brep } from "@cadcamfun/core"
import * as THREE from "three"
import { createThreeObject } from "./createThreeObject.ts"

const ORIGIN = { x: 0, y: 0, z: 0 }
const triangles = (object: THREE.Object3D): number => {
  let count = 0
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.isMesh && mesh.userData.brepFace !== undefined) count += (mesh.geometry.getIndex()?.count ?? 0) / 3
  })
  return count
}
const sphere = (radius: number, extra: Record<string, unknown> = {}) => createThreeObject({ id: "s", type: "brep", x: 0, y: 0, z: 0, brep: brep.makeSphere(radius), ...extra }, ORIGIN)!

describe("the exact solids are tessellated for their size", () => {
  test("a small body is finer than the old fixed 0.01 mm, a big one coarser than it", () => {
    const small = triangles(sphere(2)), smallFixed = triangles(sphere(2, { tolerance: 0.01 }))
    const big = triangles(sphere(30)), bigFixed = triangles(sphere(30, { tolerance: 0.01 }))
    expect(small).toBeGreaterThan(smallFixed)
    expect(big).toBeLessThan(bigFixed)
  })

  test("the element can still ask for its own tolerance", () => {
    expect(triangles(sphere(50, { tolerance: 0.5 }))).toBeLessThan(triangles(sphere(50, { tolerance: 0.005 })))
  })

  test("every face of a body keeps its exact normals and a name for picking", () => {
    const object = sphere(5)
    let faces = 0
    object.traverse((child) => { if (child.userData.brepFace !== undefined) { faces++; expect((child as THREE.Mesh).geometry.getAttribute("normal").count).toBeGreaterThan(0) } })
    expect(faces).toBeGreaterThan(0)
  })
})
