import { describe, expect, test } from "bun:test"
import { brep } from "@cadcamfun/core"
import * as THREE from "three"
import { useCADStore } from "../store/cadStore.ts"
import { useLayerStore } from "../store/layerStore.ts"
import { shapeFingerprint, shapeKey } from "./fingerprint.ts"
import { applyHighlight, buildElementObject, disposeObject } from "./sceneHelpers.ts"
import { applyElementTransform, type ElementTransformFields } from "./element-transform.ts"
import { isPooledType, sceneCost, ShapePool } from "./shared-geometry.ts"

const layerId = () => useLayerStore.getState().activeLayer
const origin = () => useCADStore.getState().originOffset

/** What the canvas does for one element: ask the pool, which builds once per shape. */
const draw = (pool: ShapePool, element: Record<string, unknown>) =>
  pool.acquire(shapeKey(element), element as { id: string; type: string }, () => buildElementObject(element as never), (copy) => applyElementTransform(copy, element as ElementTransformFields, origin()))

const plate = (id: string, x: number, extra: Record<string, unknown> = {}) => ({ id, type: "brep", layerId: layerId(), x, y: 0, z: 0, brep: brep.makeBox(10, 6, 4), ...extra })
const peg = (id: string, x: number, radius = 3) => ({ id, type: "cylinder", layerId: layerId(), x, y: 0, z: 0, radius, height: 12, segments: 24 })

const geometriesOf = (object: THREE.Object3D): THREE.BufferGeometry[] => {
  const list: THREE.BufferGeometry[] = []
  object.traverse((child) => { const g = (child as THREE.Mesh).geometry; if (g && !list.includes(g)) list.push(g) })
  return list
}
const centre = (object: THREE.Object3D): THREE.Vector3 => { object.updateMatrixWorld(true); return new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()) }

describe("the key that tells shapes apart across elements", () => {
  test("placement is not part of it, geometry and type are, and it is wider than the plain fingerprint", () => {
    expect(shapeKey(peg("a", 0))).toBe(shapeKey(peg("b", 90)))
    expect(shapeKey(peg("a", 0))).not.toBe(shapeKey(peg("a", 0, 4)))
    expect(shapeKey({ ...peg("a", 0), type: "cone" })).not.toBe(shapeKey(peg("a", 0)))
    expect(shapeKey(peg("a", 0)).split(":")).toHaveLength(3)
    // a thousand different radii: no two keys alike
    const keys = new Set(Array.from({ length: 1000 }, (_, i) => shapeKey(peg("a", 0, 1 + i * 0.01))))
    expect(keys.size).toBe(1000)
  })

  test("it leaves the plain fingerprint alone (the seed is back to zero after a key)", () => {
    const before = shapeFingerprint(peg("a", 0))
    shapeKey(peg("a", 0))
    expect(shapeFingerprint(peg("a", 0))).toBe(before)
  })
})

describe("identical parts share one build and their geometry", () => {
  test("fifty identical exact plates: one build, one set of geometries, fifty copies placed where they belong", () => {
    const pool = new ShapePool()
    const scene = new THREE.Scene()
    const parts = Array.from({ length: 50 }, (_, i) => draw(pool, plate(`p${i}`, i * 20))!)
    for (const part of parts) scene.add(part)
    const stats = pool.stats()
    expect(stats).toEqual({ masters: 1, instances: 50, builds: 1, hits: 49 })
    const one = geometriesOf(parts[0]!).length
    expect(one).toBeGreaterThan(6) // six faces and their edge lines
    const cost = sceneCost(scene)
    expect(cost.uniqueGeometries).toBe(one)
    expect(cost.geometries).toBe(one * 50)
    // draw calls are per part, not saved: each copy is still drawn on its own (and can be tinted, clipped and picked alone)
    expect(cost.drawCalls).toBe(one * 50)
    // each copy is at its own x
    for (let i = 0; i < 50; i++) expect(centre(parts[i]!).x).toBeCloseTo(i * 20 + 5, 6)
    // the same geometry buffers, but nobody's material is shared
    expect(geometriesOf(parts[0]!)).toEqual(geometriesOf(parts[1]!))
    const materialOf = (part: THREE.Object3D) => (part.children[0] as THREE.Mesh).material
    expect(materialOf(parts[0]!)).not.toBe(materialOf(parts[1]!))
    // against the same fifty built one by one: fifty times the geometry on the GPU
    const alone = new THREE.Scene()
    for (let i = 0; i < 50; i++) alone.add(buildElementObject(plate(`q${i}`, i * 20) as never)!)
    const unshared = sceneCost(alone)
    expect(unshared.uniqueGeometries).toBe(one * 50)
    expect(unshared.uniqueVertices).toBe(cost.uniqueVertices * 50)
    expect(unshared.drawCalls).toBe(cost.drawCalls)
  })

  test("a tint on one copy does not reach the others", () => {
    const pool = new ShapePool()
    const [a, b] = [draw(pool, peg("a", 0))!, draw(pool, peg("b", 40))!]
    const colour = (part: THREE.Object3D) => ((part as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.getHex()
    const before = colour(b)
    applyHighlight(a, "selected")
    expect(colour(a)).not.toBe(before)
    expect(colour(b)).toBe(before)
    applyHighlight(a, "none")
    expect(colour(a)).toBe(before)
    // a master is never dressed: a copy made after the tint is clean
    applyHighlight(b, "hover")
    expect(colour(draw(pool, peg("c", 80))!)).toBe(before)
  })

  test("different shapes do not share, and each is its own master", () => {
    const pool = new ShapePool()
    const a = draw(pool, peg("a", 0, 3))!
    const b = draw(pool, peg("b", 0, 4))!
    expect(geometriesOf(a)[0]).not.toBe(geometriesOf(b)[0])
    expect(pool.stats()).toMatchObject({ masters: 2, builds: 2, hits: 0 })
  })

  test("the gizmo transform of a part is its own: a turned copy sits where its element says", () => {
    const pool = new ShapePool()
    const straight = draw(pool, peg("a", 0))!
    const turned = draw(pool, { ...peg("b", 30), rotation: { x: 0, y: 0, z: 90 }, translateY: 5 })!
    expect(pool.stats().builds).toBe(1)
    expect(centre(straight).x).toBeCloseTo(0, 6)
    expect(centre(turned).x).toBeCloseTo(30, 6)
    expect(centre(turned).y).toBeCloseTo(5, 6)
    // and it is the same pose a fresh build gives
    const fresh = buildElementObject({ ...peg("c", 30), rotation: { x: 0, y: 0, z: 90 }, translateY: 5 } as never)!
    expect(centre(turned).distanceTo(centre(fresh))).toBeLessThan(1e-6)
    const size = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
    expect(size(turned).distanceTo(size(fresh))).toBeLessThan(1e-6)
  })

  test("what is not safe to share is built on its own: lines, booleans, broken parts", () => {
    expect(isPooledType("brep")).toBe(true)
    expect(isPooledType("line")).toBe(false)
    expect(isPooledType("boolean-union")).toBe(false)
    expect(isPooledType("group")).toBe(false)
    const pool = new ShapePool()
    const broken = (id: string, x: number) => ({ id, type: "brep", layerId: layerId(), x, y: 0, z: 0 })
    const first = draw(pool, broken("a", 0))!
    const second = draw(pool, broken("b", 5))!
    expect(first.userData.isInvalidMarker).toBe(true)
    expect(geometriesOf(first)[0]).not.toBe(geometriesOf(second)[0])
    expect(pool.stats()).toMatchObject({ masters: 0, instances: 0, builds: 2, hits: 0 })
    let builds = 0
    const line = { id: "l", type: "line", layerId: layerId(), x1: 0, y1: 0, z1: 0, x2: 5, y2: 0, z2: 0 }
    pool.acquire("k", line, () => { builds++; return buildElementObject(line as never) }, () => undefined)
    pool.acquire("k", line, () => { builds++; return buildElementObject(line as never) }, () => undefined)
    expect(builds).toBe(2)
  })
})

describe("memory: shared geometry is freed by its last part, never earlier", () => {
  const watch = (object: THREE.Object3D) => {
    const disposed: THREE.BufferGeometry[] = []
    for (const geometry of geometriesOf(object)) geometry.addEventListener("dispose", () => disposed.push(geometry))
    return disposed
  }

  test("freeing copies one by one keeps the geometry until the last copy goes, and empties the pool", () => {
    const pool = new ShapePool()
    const parts = Array.from({ length: 5 }, (_, i) => draw(pool, plate(`p${i}`, i * 20))!)
    const disposed = watch(parts[0]!)
    const total = geometriesOf(parts[0]!).length
    for (const part of parts.slice(0, 4)) disposeObject(part)
    expect(disposed).toHaveLength(0)
    expect(pool.stats()).toMatchObject({ masters: 1, instances: 1 })
    // the survivor still has everything it draws
    expect(geometriesOf(parts[4]!)).toHaveLength(total)
    disposeObject(parts[4]!)
    expect(disposed).toHaveLength(total)
    expect(new Set(disposed).size).toBe(total)
    expect(pool.stats()).toMatchObject({ masters: 0, instances: 0 })
    // the shape is built again when it is asked for again
    const again = draw(pool, plate("again", 0))!
    expect(pool.stats()).toMatchObject({ masters: 1, builds: 2 })
    expect(geometriesOf(again)).toHaveLength(total)
  })

  test("a copy's own materials are freed with it", () => {
    const pool = new ShapePool()
    const a = draw(pool, peg("a", 0))!
    const b = draw(pool, peg("b", 5))!
    let freed = 0
    ;((a as THREE.Mesh).material as THREE.Material).addEventListener("dispose", () => freed++)
    let others = 0
    ;((b as THREE.Mesh).material as THREE.Material).addEventListener("dispose", () => others++)
    disposeObject(a)
    expect(freed).toBe(1)
    expect(others).toBe(0)
  })

  test("clearing the pool (the canvas closes) frees the masters; copies still alive keep what they draw", () => {
    const pool = new ShapePool()
    const part = draw(pool, plate("p", 0))!
    const disposed = watch(part)
    pool.clear()
    expect(disposed).toHaveLength(0)
    expect(pool.stats().masters).toBe(0)
    disposeObject(part)
    expect(disposed).toHaveLength(geometriesOf(part).length)
  })

  test("an object that was never shared is freed exactly as before", () => {
    const part = buildElementObject(peg("solo", 0) as never)!
    const disposed = watch(part)
    disposeObject(part)
    expect(disposed).toHaveLength(1)
  })

  test("a part rebuilt because its shape changed gives its share back and takes another shape's", () => {
    const pool = new ShapePool()
    const a = draw(pool, peg("a", 0))!
    const b = draw(pool, peg("b", 10))!
    const disposed = watch(a)
    // `a` becomes a thicker peg: the canvas frees the old object and acquires a new one
    disposeObject(a)
    expect(disposed).toHaveLength(0) // b still draws the old shape
    const thicker = draw(pool, peg("a", 0, 5))!
    expect(pool.stats()).toMatchObject({ masters: 2, instances: 2 })
    disposeObject(b)
    expect(disposed).toHaveLength(1)
    expect(pool.stats()).toMatchObject({ masters: 1, instances: 1 })
    disposeObject(thicker)
    expect(pool.stats()).toMatchObject({ masters: 0, instances: 0 })
  })
})
