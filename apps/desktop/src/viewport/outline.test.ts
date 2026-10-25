import { expect, test } from "bun:test"
import * as THREE from "three"
import { Outline, computeHullNormals, outlineMeshes } from "./outline.ts"

const boxMesh = () => new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial())

test("coincident vertices of a split mesh get the same smoothed normal (the cube corners do not tear)", () => {
  const box = new THREE.BoxGeometry(2, 2, 2)
  const [normals] = computeHullNormals([{ positions: box.getAttribute("position").array, indices: box.getIndex()!.array }])
  const position = box.getAttribute("position")
  const seen = new Map<string, string>()
  for (let v = 0; v < position.count; v++) {
    const key = `${position.getX(v)},${position.getY(v)},${position.getZ(v)}`
    const normal = [normals![v * 3]!, normals![v * 3 + 1]!, normals![v * 3 + 2]!].map((x) => x.toFixed(4)).join(",")
    expect(seen.get(key) ?? normal).toBe(normal)
    seen.set(key, normal)
  }
  // A corner of a cube: the diagonal, unit length, pointing away from the centre.
  const at = position.getX(0), bt = position.getY(0), ct = position.getZ(0)
  expect(normals![0]!).toBeCloseTo(Math.sign(at) / Math.sqrt(3), 4)
  expect(normals![1]!).toBeCloseTo(Math.sign(bt) / Math.sqrt(3), 4)
  expect(normals![2]!).toBeCloseTo(Math.sign(ct) / Math.sqrt(3), 4)
})

test("welding spans the parts: two faces of a B-rep meet with one normal on their shared edge", () => {
  // Two squares sharing the edge x=0,z=0..? (floor on XY, wall on XZ), each its own part.
  const floor = { positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], indices: [0, 1, 2, 0, 2, 3] }
  const wall = { positions: [0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1], indices: [0, 1, 2, 0, 2, 3] }
  const [a, b] = computeHullNormals([floor, wall])
  expect([...a!.slice(0, 3)]).toEqual([...b!.slice(0, 3)])
  expect(Math.hypot(a![0]!, a![1]!, a![2]!)).toBeCloseTo(1, 5)
})

test("non-indexed and degenerate triangles are handled", () => {
  const [normals] = computeHullNormals([{ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5, 5, 5, 5, 5, 5, 5] }])
  expect(normals![2]).toBeCloseTo(1, 5)
  expect([...normals!.slice(9)].every((v) => v === 0)).toBe(true)
  expect(computeHullNormals([])).toEqual([])
})

test("outline meshes skip lines, wireframes, control points and outlines", () => {
  const root = new THREE.Group()
  const solid = boxMesh()
  const wire = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ wireframe: true }))
  const marker = boxMesh(); marker.userData.isControlPoint = true
  root.add(solid, wire, marker, new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()))
  expect(outlineMeshes(root)).toEqual([solid])
})

test("selection state: set, repeat, change, remove; hulls are children that are never picked and never free the mesh geometry", () => {
  const outline = new Outline()
  const root = new THREE.Group(), mesh = boxMesh()
  root.add(mesh)
  expect(outline.set("a", root, "hover")).toBe(true)
  expect(outline.set("a", root, "hover")).toBe(false)
  expect(outline.stateOf("a")).toBe("hover")
  expect(mesh.children.length).toBe(1)
  const hull = mesh.children[0] as THREE.Mesh
  expect(hull.geometry).toBe(mesh.geometry)
  expect(hull.geometry.getAttribute("hullNormal").count).toBe(mesh.geometry.getAttribute("position").count)
  const hits: THREE.Intersection[] = []
  hull.raycast(new THREE.Raycaster(new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1)), hits)
  expect(hits.length).toBe(0)
  expect(outline.set("a", root, "selected")).toBe(true)
  expect(mesh.children.length).toBe(1)
  expect(outline.stateOf("a")).toBe("selected")
  expect(outline.count).toBe(1)
  expect(outline.set("a", root, "none")).toBe(true)
  expect(mesh.children.length).toBe(0)
  expect(outline.set("a", root, "none")).toBe(false)
  outline.set("a", root, "selected")
  expect(outline.clear()).toBe(true)
  expect(outline.count).toBe(0)
  outline.dispose()
})

test("low quality outlines the selection but not the hover; a huge mesh is left to the tint", () => {
  let quality: "low" | "standard" = "low"
  const outline = new Outline({ quality: () => quality, maxVertices: 30 })
  const mesh = boxMesh()
  expect(outline.set("a", mesh, "hover")).toBe(false)
  expect(outline.count).toBe(0)
  expect(outline.set("a", mesh, "selected")).toBe(true)
  quality = "standard"
  expect(outline.set("a", mesh, "hover")).toBe(true)
  const big = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, 4, 4, 4), new THREE.MeshStandardMaterial())
  expect(outline.set("big", big, "selected")).toBe(false)
  expect(outline.stateOf("big")).toBeUndefined()
})

test("the normals of a big mesh are welded fast enough to run on a click", () => {
  const plane = new THREE.PlaneGeometry(10, 10, 300, 300)
  const started = performance.now()
  computeHullNormals([{ positions: plane.getAttribute("position").array, indices: plane.getIndex()!.array }])
  expect(performance.now() - started).toBeLessThan(500)
})
