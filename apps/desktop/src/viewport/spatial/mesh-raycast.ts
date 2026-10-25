/**
 * Plugs the triangle BVH into `THREE.Mesh` so `raycaster.intersectObjects` stays the one picking call (spec 06 §viewport).
 *
 * `accelerateMesh(mesh)` replaces only the per-triangle loop of the mesh (`_computeIntersections`); the bounding-sphere and
 * bounding-box early outs, the world transform and the `near`/`far` window stay three.js's own. An accelerated mesh reports
 * its single nearest hit instead of every triangle along the ray: a pick never needs the others, and it is what makes the
 * query cheap. The hit carries `object`, `distance`, `point`, `faceIndex` and `face` (a, b, c, normal) as three.js does.
 *
 * Meshes that the BVH cannot stand in for (a material array or groups, a draw range, a skinned or instanced mesh, fewer
 * than {@link MIN_ACCELERATED_TRIANGLES} triangles, where brute force is cheaper) keep the stock loop.
 */
import * as THREE from "three"
import { buildTriangleBvh, createBvhHit, raycastTriangleBvh, triangleCountOf, type TriangleBvh, type TriangleSide } from "./bvh.ts"

/** Below this a plain loop beats the traversal overhead. */
export const MIN_ACCELERATED_TRIANGLES = 256

interface CacheEntry {
  readonly bvh: TriangleBvh
  readonly positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
  readonly positionVersion: number
  readonly indexVersion: number
  readonly vertexCount: number
  readonly indexCount: number
}

const cache = new WeakMap<THREE.BufferGeometry, CacheEntry>()

type Computing = (raycaster: THREE.Raycaster, intersects: THREE.Intersection[], ray: THREE.Ray) => void
type Accelerated = THREE.Mesh & { _computeIntersections: Computing }

const MARK = "__bvhAccelerated"

/** Whether the geometry is a plain triangle soup the BVH can answer for. */
const eligible = (mesh: THREE.Mesh): boolean => {
  const geometry = mesh.geometry
  const material = mesh.material
  if (!geometry || Array.isArray(material) || material === undefined) return false
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return false
  const position = geometry.attributes.position
  if (!position || position.itemSize < 3 || (position as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return false
  if (geometry.groups.length > 0) return false
  const total = geometry.index ? geometry.index.count : position.count
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count < total) return false
  return triangleCountOf({ length: position.count * 3 }, geometry.index ? { length: geometry.index.count } : null) >= MIN_ACCELERATED_TRIANGLES
}

/** The hierarchy of a geometry, built on first use and rebuilt when its buffers change. */
export const bvhOf = (geometry: THREE.BufferGeometry): TriangleBvh | undefined => {
  const position = geometry.attributes.position as THREE.BufferAttribute | undefined
  if (!position) return undefined
  const index = geometry.index
  const known = cache.get(geometry)
  if (known && known.positions === position && known.positionVersion === position.version && known.vertexCount === position.count
    && known.indexVersion === (index?.version ?? -1) && known.indexCount === (index?.count ?? -1)) return known.bvh
  const bvh = buildTriangleBvh(position.array as ArrayLike<number>, index ? (index.array as ArrayLike<number>) : null)
  cache.set(geometry, { bvh, positions: position, positionVersion: position.version, indexVersion: index?.version ?? -1, vertexCount: position.count, indexCount: index?.count ?? -1 })
  return bvh
}

const hit = createBvhHit()
const localPoint = new THREE.Vector3()
const worldPoint = new THREE.Vector3()
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3()

const sideOf = (material: THREE.Material): TriangleSide => (material.side === THREE.BackSide ? "back" : material.side === THREE.FrontSide ? "front" : "double")

const accelerated = (stock: Computing) => function (this: THREE.Mesh, raycaster: THREE.Raycaster, intersects: THREE.Intersection[], ray: THREE.Ray): void {
  if (!eligible(this)) { stock.call(this, raycaster, intersects, ray); return }
  const geometry = this.geometry
  const bvh = bvhOf(geometry)
  if (!bvh) { stock.call(this, raycaster, intersects, ray); return }
  const positions = (geometry.attributes.position as THREE.BufferAttribute).array as ArrayLike<number>
  const index = geometry.index ? (geometry.index.array as ArrayLike<number>) : null
  const { origin, direction } = ray
  if (!raycastTriangleBvh(bvh, positions, index, origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, Infinity, sideOf(this.material as THREE.Material), hit)) return

  localPoint.copy(origin).addScaledVector(direction, hit.t)
  worldPoint.copy(localPoint).applyMatrix4(this.matrixWorld)
  const distance = raycaster.ray.origin.distanceTo(worldPoint)
  if (distance < raycaster.near || distance > raycaster.far) return

  const tri = hit.triangle
  const a = index ? index[tri * 3]! : tri * 3, b = index ? index[tri * 3 + 1]! : tri * 3 + 1, c = index ? index[tri * 3 + 2]! : tri * 3 + 2
  this.getVertexPosition(a, vA); this.getVertexPosition(b, vB); this.getVertexPosition(c, vC)
  const normal = new THREE.Vector3()
  THREE.Triangle.getNormal(vA, vB, vC, normal)
  intersects.push({ distance, point: worldPoint.clone(), object: this, faceIndex: tri, face: { a, b, c, normal, materialIndex: 0 } })
}

/** Makes one mesh answer rays through the BVH. Idempotent; returns whether the mesh is (now) accelerated. */
export const accelerateMesh = (mesh: THREE.Mesh): boolean => {
  const target = mesh as Accelerated
  if (target.userData[MARK]) return true
  if (!mesh.isMesh || !mesh.geometry) return false
  const stock = target._computeIntersections
  if (typeof stock !== "function") return false
  target._computeIntersections = accelerated(stock)
  target.userData[MARK] = true
  return true
}

/** Accelerates every mesh under `root`; returns how many meshes are accelerated. Cheap to call on every rebuild. */
export const accelerateObject = (root: THREE.Object3D): number => {
  let count = 0
  root.traverse((child) => { if ((child as THREE.Mesh).isMesh && accelerateMesh(child as THREE.Mesh)) count++ })
  return count
}

/** Builds the hierarchies of large meshes while the browser is idle, so the first hover does not pay for it. */
export const prepareBvhWhenIdle = (root: THREE.Object3D, threshold = 20000): void => {
  const idle = (globalThis as { requestIdleCallback?: (callback: () => void) => number }).requestIdleCallback
  if (!idle) return
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
    const triangles = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3
    if (triangles >= threshold && eligible(mesh)) idle(() => { if (mesh.geometry) bvhOf(mesh.geometry) })
  })
}
