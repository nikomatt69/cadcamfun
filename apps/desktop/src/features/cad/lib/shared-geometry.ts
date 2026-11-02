import * as THREE from "three"

/**
 * Identical parts share their geometry. A pattern of 200 screws, a row of nuts, a bank of identical brackets are the same shape at
 * different places: `shapeFingerprint` already says so (it ignores placement). Building each one tessellates and traces the edges again
 * and keeps its own copy of every vertex buffer on the GPU. This pool builds a shape once, keeps that build as a hidden pristine *master*
 * (never drawn, never tinted or dressed) and hands every element a lightweight copy of it:
 *
 * - the BufferGeometry of each mesh and line is shared (one GPU buffer for all copies, reference counted so freeing one part never frees
 *   what another still draws; see `disposeObject`),
 * - the materials are cloned per copy (the hover tint, the selection, the display mode and the section clipping live on the material),
 * - the transform fields and the factory pose are copied, then `applyElementTransform` moves the copy to its element, exactly as the
 *   canvas moves a cached part.
 *
 * It does not reduce draw calls: each part is still one draw per mesh and per edge line (a real GPU-instanced draw would lose the
 * per-part highlight, picking and clipping); it removes the repeated build and the repeated buffers. `sceneCost` measures both.
 */

/** The element types whose geometry depends on their own fields alone (nothing read from another element or from the document). */
export const POOLED_TYPES: ReadonlySet<string> = new Set([
  "brep", "screw", "bolt", "nut", "washer", "rivet", "gear", "spring", "thread",
  "cube", "sphere", "cylinder", "cone", "torus", "hemisphere", "prism", "pyramid", "ellipsoid", "capsule",
  "extrusion", "revolution", "sweep", "loft", "tube", "lathe", "mesh", "parametric"
])

export const isPooledType = (type: unknown): boolean => typeof type === "string" && POOLED_TYPES.has(type)

type Placement = { readonly x: number; readonly y: number; readonly z: number }
type Pose = (object: THREE.Object3D) => void

interface Entry {
  readonly master: THREE.Object3D
  users: number
}

/** Counts of a scene's cost: what is drawn and what is on the GPU. */
export interface SceneCost {
  /** One draw call per mesh, line or point cloud that is visible. */
  readonly drawCalls: number
  /** Geometry objects hung on the scene (a shared one is counted once per part that draws it). */
  readonly geometries: number
  /** Distinct geometry objects: what the GPU actually holds. */
  readonly uniqueGeometries: number
  /** Vertices held by the distinct geometries. */
  readonly uniqueVertices: number
}

/** The cost of the visible drawing under `root`: the figure instancing and shared geometry are measured by. */
export const sceneCost = (root: THREE.Object3D): SceneCost => {
  const unique = new Set<THREE.BufferGeometry>()
  let drawCalls = 0
  let geometries = 0
  root.traverseVisible((object) => {
    const drawn = object as THREE.Mesh
    if (!drawn.geometry || (drawn.material === undefined)) return
    drawCalls++
    geometries++
    unique.add(drawn.geometry)
  })
  let uniqueVertices = 0
  for (const geometry of unique) uniqueVertices += geometry.getAttribute("position")?.count ?? 0
  return { drawCalls, geometries, uniqueGeometries: unique.size, uniqueVertices }
}

/** How many parts hold a geometry: 1 (not shared) when nothing says otherwise. */
const holders = (geometry: THREE.BufferGeometry): number => (geometry.userData.shareCount as number | undefined) ?? 1

/**
 * Gives one holder's share of the geometries under `root` back. A geometry still held by another part is kept; the last holder frees it.
 * (`disposeObject` is built on this.) Returns the geometries that really were freed.
 */
export const releaseGeometries = (geometries: Iterable<THREE.BufferGeometry>): THREE.BufferGeometry[] => {
  const freed: THREE.BufferGeometry[] = []
  for (const geometry of geometries) {
    const count = holders(geometry)
    if (count > 1) { geometry.userData.shareCount = count - 1; continue }
    geometry.dispose()
    freed.push(geometry)
  }
  return freed
}

/** The instances handed out, so freeing one (by `disposeObject`) gives its place in the pool back without the caller knowing about the pool. */
const instances = new WeakMap<THREE.Object3D, () => void>()

/** Called by `disposeObject` on the root it frees: a pooled copy tells its pool. */
export const releasePooledInstance = (root: THREE.Object3D): void => {
  const release = instances.get(root)
  if (release === undefined) return
  instances.delete(root)
  release()
}

const OWN_FUNCTIONS = ["raycast", "onBeforeRender", "onAfterRender"] as const

/** A copy of `source` and everything under it that shares the geometry (counted) and owns its materials. */
const copyTree = (source: THREE.Object3D, materials: Map<THREE.Material, THREE.Material>, geometries: Set<THREE.BufferGeometry>, id: string, root: boolean): THREE.Object3D => {
  const carrier = source as THREE.Mesh
  const Ctor = source.constructor as new (...args: unknown[]) => THREE.Object3D
  const own = (material: THREE.Material): THREE.Material => {
    let copy = materials.get(material)
    if (copy === undefined) { copy = material.clone(); materials.set(material, copy) }
    return copy
  }
  let copy: THREE.Object3D
  if ((source as THREE.Sprite).isSprite === true) {
    // A sprite's quad is the library's own shared one; only its material is the part's.
    copy = new Ctor(own((source as THREE.Sprite).material))
  } else if (carrier.geometry !== undefined) {
    const material = carrier.material === undefined ? undefined : Array.isArray(carrier.material) ? carrier.material.map(own) : own(carrier.material)
    copy = new Ctor(carrier.geometry, material)
    geometries.add(carrier.geometry)
  } else {
    copy = new Ctor()
  }
  copy.name = source.name
  copy.position.copy(source.position)
  copy.quaternion.copy(source.quaternion)
  copy.scale.copy(source.scale)
  copy.visible = source.visible
  copy.renderOrder = source.renderOrder
  copy.frustumCulled = source.frustumCulled
  copy.castShadow = source.castShadow
  copy.receiveShadow = source.receiveShadow
  copy.layers.mask = source.layers.mask
  copy.matrixAutoUpdate = source.matrixAutoUpdate
  if (!source.matrixAutoUpdate) copy.matrix.copy(source.matrix)
  for (const name of OWN_FUNCTIONS) if (Object.hasOwn(source, name)) (copy as unknown as Record<string, unknown>)[name] = (source as unknown as Record<string, unknown>)[name]
  // userData is copied by reference one level deep (typed arrays and matrices are read-only after the build); who the part belongs to is its own.
  Object.assign(copy.userData, source.userData)
  copy.userData.isCADElement = true
  copy.userData.elementId = id
  if (!root) copy.userData.isChild = true
  for (const child of source.children) copy.add(copyTree(child, materials, geometries, id, false))
  return copy
}

/** Whether a built object can be pooled: a real part, with all its edge lines already built (a deferred edge pass fills one object only). */
const poolable = (object: THREE.Object3D): boolean => {
  if (object.userData.isInvalidMarker === true || object.userData.historyIssues !== undefined) return false
  let complete = true
  object.traverse((child) => { if (child.name === "edges" && child.children.length === 0) complete = false })
  return complete
}

export interface PoolStats {
  /** Pooled shapes alive (each holds one master). */
  readonly masters: number
  /** Copies handed out and not yet freed. */
  readonly instances: number
  /** Times the builder ran for a pooled type. */
  readonly builds: number
  /** Times a copy was made without building. */
  readonly hits: number
}

/**
 * The pool of one canvas. `acquire` returns the Three object of an element: a copy of the pooled master of its shape key when there is
 * one, else what `build` makes (pooled afterwards when its type and state allow). Freeing the object with `disposeObject` returns it.
 */
export class ShapePool {
  private readonly entries = new Map<string, Entry>()
  private builds = 0
  private hits = 0
  private live = 0

  acquire(key: string, element: { readonly id: string; readonly type?: unknown }, build: () => THREE.Object3D | null, place: Pose): THREE.Object3D | null {
    if (!isPooledType(element.type)) return build()
    const known = this.entries.get(key)
    if (known !== undefined) {
      this.hits++
      return this.hand(key, known, element.id, place)
    }
    this.builds++
    const built = build()
    if (built === null || !poolable(built)) return built
    // The master is the object as built; the first part is a copy like every other.
    const master = built
    master.removeFromParent()
    const entry: Entry = { master, users: 0 }
    this.entries.set(key, entry)
    return this.hand(key, entry, element.id, place)
  }

  private hand(key: string, entry: Entry, id: string, place: Pose): THREE.Object3D {
    const geometries = new Set<THREE.BufferGeometry>()
    const copy = copyTree(entry.master, new Map(), geometries, id, true)
    for (const geometry of geometries) geometry.userData.shareCount = holders(geometry) + 1
    entry.users++
    this.live++
    instances.set(copy, () => this.give(key, entry))
    place(copy)
    return copy
  }

  private give(key: string, entry: Entry): void {
    entry.users--
    this.live--
    if (entry.users > 0 || this.entries.get(key) !== entry) return
    // Nobody draws this shape any more: the master gives its own share back and the shape leaves the pool.
    this.entries.delete(key)
    this.disposeMaster(entry.master)
  }

  private disposeMaster(master: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    master.traverse((object) => {
      const drawn = object as THREE.Mesh
      if (drawn.geometry) geometries.add(drawn.geometry)
      for (const material of Array.isArray(drawn.material) ? drawn.material : drawn.material ? [drawn.material] : []) materials.add(material)
    })
    releaseGeometries(geometries)
    for (const material of materials) material.dispose()
  }

  stats(): PoolStats {
    return { masters: this.entries.size, instances: this.live, builds: this.builds, hits: this.hits }
  }

  /** Frees every master (the canvas is going away); copies still alive keep the geometry they hold until they are freed. */
  clear(): void {
    for (const entry of this.entries.values()) this.disposeMaster(entry.master)
    this.entries.clear()
  }
}
