import * as THREE from "three"
import type { LineQuality } from "./lines.ts"

/**
 * Selection and hover outline: an inverted hull. The outlined meshes are drawn a second time, back faces only, each vertex pushed
 * outward along its smoothed normal by a constant number of screen pixels. What peeks out behind the front faces is the outline.
 *
 * Why this and not an `OutlinePass`: the hull is one extra draw of geometry that is already on the GPU, needs no render target and no
 * composer (so the MSAA of the canvas and the demand-driven frame scheduler stay as they are), costs nothing while nothing is
 * outlined, and the width is exact in pixels at any DPI. A screen pass renders the selection to a mask, blurs/edge-detects at full
 * resolution on every frame of an orbit, loses the canvas antialiasing, and ties the whole viewport to a composer. The price of the
 * hull is the smoothed normal: a mesh with split vertices (a cube, a creased solid, one mesh per B-rep face) would tear open at its
 * corners, so the normals are welded by position across everything outlined together (`computeHullNormals`).
 */

export type OutlineState = "hover" | "selected"

export interface OutlineStyle { readonly color: number; /** Width in CSS pixels. */ readonly width: number }

export const DEFAULT_OUTLINE_STYLE: Readonly<Record<OutlineState, OutlineStyle>> = {
  selected: { color: 0xff3366, width: 2.5 },
  hover: { color: 0x4a90e2, width: 1.8 }
}

/** Above this many vertices under one outlined object the hull is skipped (welding costs CPU and the tint remains). */
export const OUTLINE_MAX_VERTICES = 250_000

export interface HullPart {
  readonly positions: ArrayLike<number>
  readonly indices?: ArrayLike<number> | undefined
}

const accumulate = (sum: Float64Array, at: number, nx: number, ny: number, nz: number, weight: number): void => {
  sum[at] = sum[at]! + nx * weight; sum[at + 1] = sum[at + 1]! + ny * weight; sum[at + 2] = sum[at + 2]! + nz * weight
}

const angleBetween = (dot: number, l1: number, l2: number): number => Math.acos(Math.max(-1, Math.min(1, dot / (l1 * l2))))

/**
 * One smoothed normal per vertex of each part: the corner-angle-weighted mean of the face normals of every vertex that sits at the
 * same position (within `1e-5` of the extent), across all the parts. Welding across parts is what keeps the hulls of a B-rep's
 * faces (and of a creased mesh) closed along their shared edges.
 */
export const computeHullNormals = (parts: ReadonlyArray<HullPart>): Float32Array[] => {
  let total = 0
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  for (const part of parts) {
    total += Math.floor(part.positions.length / 3)
    for (let i = 0; i + 2 < part.positions.length; i += 3) for (let k = 0; k < 3; k++) {
      const v = part.positions[i + k]!
      if (v < lo[k]!) lo[k] = v
      if (v > hi[k]!) hi[k] = v
    }
  }
  const extent = total === 0 ? 1 : Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!, 1e-9)
  const quantum = Math.max(extent * 1e-5, 1e-9)
  const cells = new Int32Array(total * 3)
  const weld = new Int32Array(total)
  let capacity = 16
  while (capacity < total * 2) capacity *= 2
  const table = new Int32Array(capacity).fill(-1)
  let unique = 0
  const representative = new Int32Array(total)
  let at = 0
  for (const part of parts) {
    const count = Math.floor(part.positions.length / 3)
    for (let v = 0; v < count; v++, at++) {
      const x = Math.round(part.positions[v * 3]! / quantum), y = Math.round(part.positions[v * 3 + 1]! / quantum), z = Math.round(part.positions[v * 3 + 2]! / quantum)
      cells[at * 3] = x; cells[at * 3 + 1] = y; cells[at * 3 + 2] = z
      let slot = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & (capacity - 1)
      for (;;) {
        const found = table[slot]!
        if (found === -1) { table[slot] = unique; representative[unique] = at; weld[at] = unique++; break }
        const r = representative[found]!
        if (cells[r * 3] === x && cells[r * 3 + 1] === y && cells[r * 3 + 2] === z) { weld[at] = found; break }
        slot = (slot + 1) & (capacity - 1)
      }
    }
  }

  const sum = new Float64Array(unique * 3)
  let base = 0
  for (const part of parts) {
    const p = part.positions
    const corners = part.indices ? part.indices.length : Math.floor(p.length / 3)
    const at3 = (c: number) => part.indices ? part.indices[c]! : c
    for (let c = 0; c + 2 < corners; c += 3) {
      const ia = at3(c), ib = at3(c + 1), ic = at3(c + 2)
      const ax = p[ia * 3]!, ay = p[ia * 3 + 1]!, az = p[ia * 3 + 2]!
      const bx = p[ib * 3]!, by = p[ib * 3 + 1]!, bz = p[ib * 3 + 2]!
      const cx = p[ic * 3]!, cy = p[ic * 3 + 1]!, cz = p[ic * 3 + 2]!
      const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, bcx = cx - bx, bcy = cy - by, bcz = cz - bz
      let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx
      const area2 = Math.hypot(nx, ny, nz)
      if (area2 < 1e-18) continue
      nx /= area2; ny /= area2; nz /= area2
      const lab = Math.hypot(abx, aby, abz), lac = Math.hypot(acx, acy, acz), lbc = Math.hypot(bcx, bcy, bcz)
      const wa = angleBetween(abx * acx + aby * acy + abz * acz, lab, lac)
      const wb = angleBetween(-abx * bcx - aby * bcy - abz * bcz, lab, lbc)
      const wc = Math.PI - wa - wb
      accumulate(sum, weld[base + ia]! * 3, nx, ny, nz, wa)
      accumulate(sum, weld[base + ib]! * 3, nx, ny, nz, wb)
      accumulate(sum, weld[base + ic]! * 3, nx, ny, nz, wc)
    }
    base += Math.floor(p.length / 3)
  }

  const out: Float32Array[] = []
  base = 0
  for (const part of parts) {
    const count = Math.floor(part.positions.length / 3)
    const normals = new Float32Array(count * 3)
    for (let v = 0; v < count; v++) {
      const u = weld[base + v]! * 3
      const length = Math.hypot(sum[u]!, sum[u + 1]!, sum[u + 2]!)
      if (length > 1e-12) { normals[v * 3] = sum[u]! / length; normals[v * 3 + 1] = sum[u + 1]! / length; normals[v * 3 + 2] = sum[u + 2]! / length }
    }
    out.push(normals)
    base += count
  }
  return out
}

const HULL_VERTEX = /* glsl */ `
  attribute vec3 hullNormal;
  uniform vec2 resolution;
  uniform float thickness;
  #include <clipping_planes_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 clip = projectionMatrix * mvPosition;
    vec3 viewNormal = normalize(normalMatrix * hullNormal);
    // The push is in screen space: direction from the projected normal (aspect-corrected), length in pixels.
    vec2 direction = (projectionMatrix * vec4(viewNormal, 0.0)).xy * resolution;
    float length2 = dot(direction, direction);
    direction = length2 > 1e-12 ? direction * inversesqrt(length2) : vec2(0.0);
    clip.xy += direction * (thickness * 2.0 / resolution) * clip.w;
    gl_Position = clip;
    #include <clipping_planes_vertex>
  }
`
const HULL_FRAGMENT = /* glsl */ `
  uniform vec3 diffuse;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    gl_FragColor = vec4(diffuse, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const viewport = new THREE.Vector4()

const hullMaterial = (style: OutlineStyle): THREE.ShaderMaterial => new THREE.ShaderMaterial({
  uniforms: { diffuse: { value: new THREE.Color(style.color) }, thickness: { value: style.width }, resolution: { value: new THREE.Vector2(1, 1) } },
  vertexShader: HULL_VERTEX,
  fragmentShader: HULL_FRAGMENT,
  side: THREE.BackSide,
  clipping: true,
  depthWrite: false
})

const noRaycast = (): void => {}
const welded = new WeakSet<THREE.BufferGeometry>()

/** The meshes an outline can follow: real triangle meshes, not lines, sprites, wireframes, control points or an outline itself. */
export const outlineMeshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const meshes: THREE.Mesh[] = []
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || (mesh as { isLineSegments2?: boolean }).isLineSegments2 || mesh.userData.isOutline || mesh.userData.isControlPoint) return
    const position = mesh.geometry?.getAttribute("position")
    if (!(position instanceof THREE.BufferAttribute) || position.itemSize !== 3 || position.count === 0) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    if (materials.some((material) => (material as THREE.MeshBasicMaterial).wireframe === true)) return
    meshes.push(mesh)
  })
  return meshes
}

interface Entry {
  state: OutlineState
  root: THREE.Object3D
  hulls: THREE.Mesh[]
}

export interface OutlineOptions {
  readonly style?: Partial<Record<OutlineState, Partial<OutlineStyle>>>
  /** The tier decides whether hover is outlined; `low` outlines the selection only. Read at every change. */
  readonly quality?: () => LineQuality
  readonly maxVertices?: number
}

/** Outlines by key (an element id): `set(key, root, state)` shows or removes the outline of `root`. */
export class Outline {
  private readonly entries = new Map<string, Entry>()
  private readonly materials: Record<OutlineState, THREE.ShaderMaterial>
  private readonly maxVertices: number
  private readonly quality: () => LineQuality

  constructor(options: OutlineOptions = {}) {
    this.materials = {
      selected: hullMaterial({ ...DEFAULT_OUTLINE_STYLE.selected, ...options.style?.selected }),
      hover: hullMaterial({ ...DEFAULT_OUTLINE_STYLE.hover, ...options.style?.hover })
    }
    this.maxVertices = options.maxVertices ?? OUTLINE_MAX_VERTICES
    this.quality = options.quality ?? (() => "standard")
  }

  /** The number of objects outlined now. */
  get count(): number { return this.entries.size }

  stateOf(key: string): OutlineState | undefined { return this.entries.get(key)?.state }

  /** The keys outlined now. */
  keys(): string[] { return [...this.entries.keys()] }

  /**
   * Returns whether anything changed (the caller then asks for a frame). A state of `undefined` or `"none"`, a missing root, a too
   * big mesh and, on `low`, a hover all remove the outline.
   */
  set(key: string, root: THREE.Object3D | undefined, state: OutlineState | "none" | undefined): boolean {
    const wanted = state === "none" || state === undefined || root === undefined || (state === "hover" && this.quality() === "low") ? undefined : state
    const current = this.entries.get(key)
    if (current && wanted && current.state === wanted && current.root === root) return false
    if (current) this.drop(key, current)
    if (!wanted || !root) return current !== undefined
    const hulls = this.build(root, wanted)
    if (hulls.length === 0) return current !== undefined
    this.entries.set(key, { state: wanted, root, hulls })
    return true
  }

  clear(): boolean {
    const had = this.entries.size > 0
    for (const [key, entry] of [...this.entries]) this.drop(key, entry)
    return had
  }

  dispose(): void {
    this.clear()
    this.materials.selected.dispose()
    this.materials.hover.dispose()
  }

  private drop(key: string, entry: Entry): void {
    // The hull shares its mesh's geometry: only the child goes, never the geometry (that would free the mesh's own GPU buffers).
    for (const hull of entry.hulls) hull.removeFromParent()
    this.entries.delete(key)
  }

  private build(root: THREE.Object3D, state: OutlineState): THREE.Mesh[] {
    const meshes = outlineMeshes(root)
    let vertices = 0
    for (const mesh of meshes) vertices += mesh.geometry.getAttribute("position").count
    if (meshes.length === 0 || vertices > this.maxVertices) return []
    const missing = meshes.filter((mesh) => !welded.has(mesh.geometry))
    if (missing.length > 0) {
      // Welded across all the parts at once, so the hulls of neighbouring faces meet along their shared edges.
      const parts = missing.map((mesh) => ({ positions: mesh.geometry.getAttribute("position").array, indices: mesh.geometry.getIndex()?.array }))
      const normals = computeHullNormals(parts)
      missing.forEach((mesh, index) => {
        mesh.geometry.setAttribute("hullNormal", new THREE.BufferAttribute(normals[index]!, 3))
        welded.add(mesh.geometry)
      })
    }
    const material = this.materials[state]
    return meshes.map((mesh) => {
      const hull = new THREE.Mesh(mesh.geometry, material)
      hull.name = "outline"
      hull.userData.isOutline = true
      hull.raycast = noRaycast
      hull.matrixAutoUpdate = false
      hull.renderOrder = mesh.renderOrder
      // Keeps the outline's pixel width right in every viewport (four-view panes, the capture), like the thick lines.
      hull.onBeforeRender = (renderer) => {
        renderer.getViewport(viewport)
        material.uniforms.resolution!.value.set(Math.max(1, viewport.z), Math.max(1, viewport.w))
      }
      mesh.add(hull)
      return hull
    })
  }
}
