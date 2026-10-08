import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanAll, booleanMesh, mergeMeshes, rotateMesh, translateMesh } from "./csg.ts"
import { meshBounds, meshOf, meshVolume, type Mesh } from "./solid.ts"

const box = (x: number, y: number, z: number, w: number, h: number, d: number): Mesh => meshOf({ _tag: "Box", origin: { x, y, z }, size: { x: w, y: h, z: d } })
const prism = (r: number, n: number, z0: number, height: number, cx = 0, cy = 0): Mesh =>
  meshOf({ _tag: "Extrude", profile: Array.from({ length: n }, (_, k) => ({ x: cx + r * Math.cos((2 * Math.PI * k) / n), y: cy + r * Math.sin((2 * Math.PI * k) / n) })), height, origin: { x: 0, y: 0, z: z0 } })
const V = meshVolume

// A Boolean on a faceted solid builds and walks binary space partitions: give a loaded machine room.
setDefaultTimeout(60000)

describe("boolean operations on meshes", () => {
  test("two overlapping boxes: union, difference and intersection have the volumes of the sets", () => {
    const a = box(0, 0, 0, 10, 10, 10), b = box(5, 0, 0, 10, 10, 10)
    expect(V(booleanMesh(a, b, "union"))).toBeCloseTo(1500, 3)
    expect(V(booleanMesh(a, b, "subtract"))).toBeCloseTo(500, 3)
    expect(V(booleanMesh(a, b, "intersect"))).toBeCloseTo(500, 3)
    const u = meshBounds(booleanMesh(a, b, "union"))
    expect([u.minX, u.maxX, u.minY, u.maxY, u.minZ, u.maxZ]).toEqual([0, 15, 0, 10, 0, 10])
    const s = meshBounds(booleanMesh(a, b, "subtract"))
    expect([s.minX, s.maxX]).toEqual([0, 5])
  })

  test("a hole through a block: the block minus the part of the cylinder inside it", () => {
    const block = box(-10, -10, 0, 20, 20, 10)
    const rod = prism(3, 64, -5, 20)
    const holed = booleanMesh(block, rod, "subtract")
    expect(V(holed)).toBeCloseTo(4000 - V(rod) / 2, 2) // the rod is 20 long and half of it is inside
    expect(V(holed)).toBeLessThan(4000 - 0.99 * Math.PI * 9 * 10)
    // The outline is still the block's.
    const b = meshBounds(holed)
    expect([b.minX, b.maxX, b.minZ, b.maxZ]).toEqual([-10, 10, 0, 10])
  })

  test("identical solids: the union and the intersection are the solid, the difference is nothing", () => {
    const a = box(0, 0, 0, 10, 10, 10)
    expect(V(booleanMesh(a, a, "union"))).toBeCloseTo(1000, 3)
    expect(V(booleanMesh(a, a, "intersect"))).toBeCloseTo(1000, 3)
    expect(Math.abs(V(booleanMesh(a, a, "subtract")))).toBeLessThan(1e-3)
  })

  test("disjoint solids: the union is both, the difference is the first, the intersection is empty", () => {
    const a = box(0, 0, 0, 10, 10, 10), b = box(30, 0, 0, 10, 10, 10)
    expect(V(booleanMesh(a, b, "union"))).toBeCloseTo(2000, 3)
    expect(V(booleanMesh(a, b, "subtract"))).toBeCloseTo(1000, 3)
    expect(Math.abs(V(booleanMesh(a, b, "intersect")))).toBeLessThan(1e-6)
  })

  test("a solid touching another along a face: the union adds up and the intersection has no volume", () => {
    const a = box(0, 0, 0, 10, 10, 10), b = box(10, 0, 0, 10, 10, 10)
    expect(V(booleanMesh(a, b, "union"))).toBeCloseTo(2000, 3)
    expect(Math.abs(V(booleanMesh(a, b, "intersect")))).toBeLessThan(1e-3)
  })

  test("inclusion–exclusion holds for solids at an angle: V(A u B) + V(A n B) = V(A) + V(B), and V(A - B) = V(A) - V(A n B)", () => {
    const a = box(0, 0, 0, 12, 9, 7)
    for (const [angle, shift] of [[0.4, [3, 2, 1]], [1.1, [-2, 4, 2]], [2.3, [5, -3, 0]], [0.7, [1, 1, 1]]] as const) {
      const b = translateMesh(rotateMesh(box(0, 0, 0, 8, 8, 8), { x: 1, y: 1, z: 1 }, angle, { x: 4, y: 4, z: 4 }), shift[0], shift[1], shift[2])
      const union = V(booleanMesh(a, b, "union")), inter = V(booleanMesh(a, b, "intersect")), diff = V(booleanMesh(a, b, "subtract"))
      expect(union + inter).toBeCloseTo(V(a) + V(b), 1)
      expect(diff).toBeCloseTo(V(a) - inter, 1)
      expect(inter).toBeGreaterThan(0)
      expect(union).toBeGreaterThan(Math.max(V(a), V(b)) - 1e-3)
    }
  })

  test("a sphere cut by a box: the volume of the cap is the textbook value for the mesh's own sphere", () => {
    const sphere = meshOf({ _tag: "Sphere", center: { x: 0, y: 0, z: 0 }, radius: 10, rings: 24 })
    const upper = booleanMesh(sphere, box(-20, -20, 0, 40, 40, 20), "intersect")
    expect(V(upper)).toBeCloseTo(V(sphere) / 2, 0)
    const lower = booleanMesh(sphere, box(-20, -20, 0, 40, 40, 20), "subtract")
    expect(V(upper) + V(lower)).toBeCloseTo(V(sphere), 1)
  })

  test("booleanAll folds left to right, and the transforms keep volume", () => {
    const parts = [box(0, 0, 0, 10, 10, 10), box(5, 0, 0, 10, 10, 10), box(10, 0, 0, 10, 10, 10)]
    expect(V(booleanAll(parts, "union"))).toBeCloseTo(2000, 3)
    expect(V(booleanAll([parts[0]!, parts[1]!, parts[2]!], "subtract"))).toBeCloseTo(500, 3)
    expect(booleanAll([], "union").indices.length).toBe(0)
    const m = box(0, 0, 0, 3, 4, 5)
    expect(V(rotateMesh(m, { x: 0, y: 0, z: 1 }, 0.9))).toBeCloseTo(60, 3)
    expect(V(translateMesh(m, 7, -2, 4))).toBeCloseTo(60, 3)
    expect(V(mergeMeshes([m, translateMesh(m, 10, 0, 0)]))).toBeCloseTo(120, 3)
  })

  test("it scales: a faceted cylinder with a thousand faces minus a box finishes quickly", () => {
    const t = performance.now()
    const rod = prism(10, 256, 0, 20)
    const cut = booleanMesh(rod, box(0, -20, -1, 20, 40, 22), "subtract")
    expect(V(cut)).toBeCloseTo(V(rod) / 2, 0)
    expect(performance.now() - t).toBeLessThan(10000)
  })
})
