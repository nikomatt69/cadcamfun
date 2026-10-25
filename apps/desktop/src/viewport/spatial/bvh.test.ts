import { expect, test } from "bun:test"
import * as THREE from "three"
import { buildTriangleBvh, createBvhHit, raycastTriangleBvh } from "./bvh.ts"
import { accelerateMesh, accelerateObject, bvhOf, MIN_ACCELERATED_TRIANGLES } from "./mesh-raycast.ts"

/** Deterministic random numbers, so a failure reproduces. */
const random = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

const soupGeometry = (triangles: number, next: () => number, indexed: boolean): THREE.BufferGeometry => {
  const positions = new Float32Array(triangles * 9)
  for (let i = 0; i < triangles; i++) {
    const cx = (next() - 0.5) * 100, cy = (next() - 0.5) * 100, cz = (next() - 0.5) * 100
    for (let v = 0; v < 3; v++) {
      positions[i * 9 + v * 3] = cx + (next() - 0.5) * 8
      positions[i * 9 + v * 3 + 1] = cy + (next() - 0.5) * 8
      positions[i * 9 + v * 3 + 2] = cz + (next() - 0.5) * 8
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  if (indexed) geometry.setIndex(Array.from({ length: triangles * 3 }, (_, i) => i))
  return geometry
}

const randomRay = (next: () => number, extent: number): THREE.Ray => {
  const origin = new THREE.Vector3((next() - 0.5) * extent * 3, (next() - 0.5) * extent * 3, (next() - 0.5) * extent * 3)
  const aim = new THREE.Vector3((next() - 0.5) * extent, (next() - 0.5) * extent, (next() - 0.5) * extent)
  return new THREE.Ray(origin, aim.sub(origin).normalize())
}

/** The same mesh twice: one with the stock triangle loop, one with the BVH. */
const pair = (geometry: THREE.BufferGeometry, side: THREE.Side, matrix?: THREE.Matrix4) => {
  const material = new THREE.MeshBasicMaterial({ side })
  const stock = new THREE.Mesh(geometry, material)
  const fast = new THREE.Mesh(geometry, material)
  if (matrix) for (const mesh of [stock, fast]) { mesh.applyMatrix4(matrix); mesh.updateMatrixWorld(true) }
  expect(accelerateMesh(fast)).toBe(true)
  return { stock, fast }
}

const compare = (stock: THREE.Mesh, fast: THREE.Mesh, rays: number, seed: number, extent: number) => {
  const next = random(seed)
  const raycaster = new THREE.Raycaster()
  let hits = 0
  for (let i = 0; i < rays; i++) {
    const ray = randomRay(next, extent)
    raycaster.set(ray.origin, ray.direction)
    const a = raycaster.intersectObject(stock, false)
    const b = raycaster.intersectObject(fast, false)
    expect(b.length).toBe(a.length > 0 ? 1 : 0)
    if (a.length === 0) continue
    hits++
    expect(b[0]!.faceIndex).toBe(a[0]!.faceIndex)
    expect(Math.abs(b[0]!.distance - a[0]!.distance)).toBeLessThan(1e-9)
    expect(b[0]!.point.distanceTo(a[0]!.point)).toBeLessThan(1e-9)
    expect(b[0]!.object).toBe(fast)
    expect([b[0]!.face!.a, b[0]!.face!.b, b[0]!.face!.c]).toEqual([a[0]!.face!.a, a[0]!.face!.b, a[0]!.face!.c])
    expect(b[0]!.face!.normal.distanceTo(a[0]!.face!.normal)).toBeLessThan(1e-9)
  }
  return hits
}

test("BVH picking equals brute force on random rays: same triangle, same distance (random soup, every material side)", () => {
  for (const [side, seed] of [[THREE.FrontSide, 1], [THREE.BackSide, 2], [THREE.DoubleSide, 3]] as const) {
    const geometry = soupGeometry(3000, random(seed * 7), seed !== 2)
    const { stock, fast } = pair(geometry, side)
    const hits = compare(stock, fast, 600, seed, 100)
    expect(hits).toBeGreaterThan(100)
  }
})

test("BVH picking equals brute force through a moving, scaled and rotated mesh", () => {
  const geometry = soupGeometry(2000, random(11), true)
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(30, -12, 7), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, 1.1, -0.4)), new THREE.Vector3(2, 0.5, 1.5))
  const { stock, fast } = pair(geometry, THREE.DoubleSide, matrix)
  expect(compare(stock, fast, 500, 5, 150)).toBeGreaterThan(50)
})

test("BVH picking equals brute force on a closed sphere with shared edges and axis-aligned rays", () => {
  const geometry = new THREE.SphereGeometry(10, 48, 32)
  const { stock, fast } = pair(geometry, THREE.FrontSide)
  const raycaster = new THREE.Raycaster()
  let hits = 0
  // Rays along the axes and through exact vertices graze triangle edges and box faces.
  const origins: THREE.Vector3[] = []
  for (let x = -12; x <= 12; x += 2) for (let y = -12; y <= 12; y += 2) origins.push(new THREE.Vector3(x, y, -30))
  for (const origin of origins) {
    raycaster.set(origin, new THREE.Vector3(0, 0, 1))
    const a = raycaster.intersectObject(stock, false), b = raycaster.intersectObject(fast, false)
    expect(b.length).toBe(a.length > 0 ? 1 : 0)
    if (a.length) { hits++; expect(b[0]!.faceIndex).toBe(a[0]!.faceIndex); expect(Math.abs(b[0]!.distance - a[0]!.distance)).toBeLessThan(1e-9) }
  }
  expect(hits).toBeGreaterThan(20)
  // A ray from inside the box: the stock loop and the BVH agree on the front-facing hit (none, from inside a front-only sphere).
  raycaster.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, 0.2, 0.9).normalize())
  expect(raycaster.intersectObject(fast, false).length).toBe(raycaster.intersectObject(stock, false).length)
})

test("a raycaster reports its near and far window for an accelerated mesh", () => {
  const geometry = new THREE.SphereGeometry(10, 32, 24)
  const { fast } = pair(geometry, THREE.DoubleSide)
  const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, -50), new THREE.Vector3(0, 0, 1))
  expect(raycaster.intersectObject(fast, false)[0]!.distance).toBeCloseTo(40, 1)
  raycaster.far = 20
  expect(raycaster.intersectObject(fast, false).length).toBe(0)
  raycaster.far = Infinity; raycaster.near = 45
  // The near hit (40) is before the window, so the pick behind it is not reported either: only the nearest triangle is.
  expect(raycaster.intersectObject(fast, false).length).toBe(0)
})

test("the BVH is rebuilt when the buffers change and small or unsupported meshes keep the stock loop", () => {
  const geometry = soupGeometry(MIN_ACCELERATED_TRIANGLES * 2, random(3), false)
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  accelerateMesh(mesh)
  const first = bvhOf(geometry)
  expect(bvhOf(geometry)).toBe(first)
  const position = geometry.attributes.position as THREE.BufferAttribute
  position.setX(0, 1000); position.needsUpdate = true
  expect(bvhOf(geometry)).not.toBe(first)

  const small = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
  accelerateMesh(small)
  const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, -5), new THREE.Vector3(0, 0, 1))
  // A box has 12 triangles: the stock loop answers, with every triangle along the ray (front-only: one face).
  expect(raycaster.intersectObject(small, false).length).toBeGreaterThan(0)

  const multi = new THREE.Mesh(soupGeometry(1000, random(4), false), [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()])
  multi.geometry.addGroup(0, 1500, 0); multi.geometry.addGroup(1500, 1500, 1)
  accelerateMesh(multi)
  expect(() => raycaster.intersectObject(multi, false)).not.toThrow()
  expect(accelerateObject(new THREE.Group().add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())))).toBe(1)
})

test("the BVH is a tree over every triangle exactly once", () => {
  const geometry = soupGeometry(5000, random(9), true)
  const bvh = buildTriangleBvh(geometry.attributes.position!.array as Float32Array, geometry.index!.array as Uint32Array)
  const seen = new Uint8Array(5000)
  let leafTriangles = 0
  for (let node = 0; node < bvh.nodeCount; node++) {
    if (bvh.count[node]! === 0) continue
    for (let k = bvh.first[node]!; k < bvh.first[node]! + bvh.count[node]!; k++) { seen[bvh.order[k]!]!++; leafTriangles++ }
  }
  expect(leafTriangles).toBe(5000)
  expect(seen.every((v) => v === 1)).toBe(true)
  expect(bvh.depth).toBeLessThan(48)
  // Empty and one-triangle inputs are valid.
  const hit = createBvhHit()
  const empty = buildTriangleBvh(new Float32Array(0), null)
  expect(raycastTriangleBvh(empty, new Float32Array(0), null, 0, 0, 0, 0, 0, 1, Infinity, "double", hit)).toBe(false)
  const one = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1])
  const single = buildTriangleBvh(one, null)
  expect(raycastTriangleBvh(single, one, null, 0.2, 0.2, 0, 0, 0, 1, Infinity, "double", hit)).toBe(true)
  expect(hit.triangle).toBe(0)
  expect(hit.t).toBeCloseTo(1, 12)
})

test("on a 200 000-triangle mesh the BVH answers the same picks, much faster than the stock loop", () => {
  const geometry = new THREE.SphereGeometry(40, 320, 320)
  const triangles = geometry.index!.count / 3
  expect(triangles).toBeGreaterThanOrEqual(200000)
  const { stock, fast } = pair(geometry, THREE.FrontSide)
  const raycaster = new THREE.Raycaster()
  const next = random(77)
  const rays = Array.from({ length: 40 }, () => randomRay(next, 80))

  let t0 = performance.now()
  const build = bvhOf(geometry)!
  const buildMs = performance.now() - t0
  expect(build.triangleCount).toBe(triangles)

  const slow: Array<{ face: number; distance: number } | undefined> = []
  t0 = performance.now()
  for (const ray of rays) { raycaster.set(ray.origin, ray.direction); const h = raycaster.intersectObject(stock, false)[0]; slow.push(h ? { face: h.faceIndex!, distance: h.distance } : undefined) }
  const stockMs = (performance.now() - t0) / rays.length

  const repeat = 20
  t0 = performance.now()
  const quick: typeof slow = []
  for (let r = 0; r < repeat; r++) for (const ray of rays) {
    raycaster.set(ray.origin, ray.direction)
    const h = raycaster.intersectObject(fast, false)[0]
    if (r === 0) quick.push(h ? { face: h.faceIndex!, distance: h.distance } : undefined)
  }
  const bvhMs = (performance.now() - t0) / (rays.length * repeat)

  expect(quick.length).toBe(slow.length)
  for (let i = 0; i < slow.length; i++) {
    expect(quick[i]?.face).toBe(slow[i]?.face)
    if (slow[i]) expect(Math.abs(quick[i]!.distance - slow[i]!.distance)).toBeLessThan(1e-9)
  }
  const speedup = stockMs / bvhMs
  console.log(`BVH ${triangles} triangles: build ${buildMs.toFixed(0)} ms, stock raycast ${stockMs.toFixed(2)} ms, BVH raycast ${bvhMs.toFixed(4)} ms, speed-up x${speedup.toFixed(0)}, ${build.nodeCount} nodes, depth ${build.depth}`)
  expect(speedup).toBeGreaterThan(20)
}, 60_000)
