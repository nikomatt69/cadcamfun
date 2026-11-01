/**
 * Volume meshing (spec 48 §2 step 2): a conforming Kuhn tetrahedralisation of a voxel grid, then quadratic (10-node) elements.
 *
 * `meshBox` is exact for a box. `meshSolid` classifies cell centres against a closed triangle mesh (a B-rep tessellation) by
 * ray parity, so any closed solid can be meshed, but its boundary is a staircase of the grid: `quality.volumeRatio` (mesh
 * volume over the solid's volume) says how far, and the advisor asks for a finer grid when it is below target. A general
 * boundary-conforming mesher is the open item of F6.
 */
import { TET10_EDGES, tetGeometry } from "./element.ts"

export interface TriangleSolid {
  readonly positions: ArrayLike<number>
  readonly indices: ArrayLike<number>
}

export interface TetMesh {
  readonly nodeCount: number
  readonly elementCount: number
  /** x y z per node (corner nodes first in each element's connectivity, but node ids are global). */
  readonly nodes: Float64Array
  /** 10 node ids per element. */
  readonly elements: Uint32Array
  /** Boundary faces, 6 node ids each (3 corners, then midpoints of 01, 12, 20). */
  readonly faces: Uint32Array
  readonly faceCount: number
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }
  readonly cell: readonly [number, number, number]
  readonly volume: number
  readonly quality: MeshQuality
}

export interface MeshQuality {
  readonly minVolume: number
  readonly minJacobianRatio: number
  readonly volumeRatio: number | undefined
  readonly cells: readonly [number, number, number]
  readonly solidVolume: number | undefined
}

export interface MeshRefusal { readonly ok: false; readonly code: "empty" | "open_solid" | "too_large" | "too_thin"; readonly message: string }
export type MeshOutcome = { readonly ok: true; readonly mesh: TetMesh } | MeshRefusal

export interface MeshOptions {
  /** Target cell edge, mm. */
  readonly size: number
  /** Most elements allowed (refusal above). Default 60 000. */
  readonly maxElements?: number
}

const KUHN: ReadonlyArray<readonly [number, number, number, number]> = [[0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]]

const GOLDEN = 0.6180339887498949

/** Signed volume of a closed triangle mesh (divergence theorem). */
export const solidVolume = (s: TriangleSolid): number => {
  let v = 0
  const p = s.positions, t = s.indices
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i]! * 3, b = t[i + 1]! * 3, c = t[i + 2]! * 3
    v += (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) / 6
  }
  return v
}

const classifyCells = (s: TriangleSolid, min: readonly number[], h: readonly number[], n: readonly number[]): Uint8Array => {
  const [nx, ny, nz] = n as [number, number, number]
  const inside = new Uint8Array(nx * ny * nz)
  const bins: number[][] = Array.from({ length: nx * ny }, () => [])
  const p = s.positions, t = s.indices
  // the sample line is nudged off the grid axes by an irrational fraction of a cell so it never runs along a mesh edge
  const ox = (GOLDEN - 0.5) * 0.013 * h[0]!, oy = (GOLDEN * GOLDEN - 0.19) * 0.017 * h[1]!
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i]! * 3, b = t[i + 1]! * 3, c = t[i + 2]! * 3
    const xs = [p[a]!, p[b]!, p[c]!], ys = [p[a + 1]!, p[b + 1]!, p[c + 1]!]
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - min[0]!) / h[0]! - 0.5)), i1 = Math.min(nx - 1, Math.ceil((Math.max(...xs) - min[0]!) / h[0]!))
    const j0 = Math.max(0, Math.floor((Math.min(...ys) - min[1]!) / h[1]! - 0.5)), j1 = Math.min(ny - 1, Math.ceil((Math.max(...ys) - min[1]!) / h[1]!))
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) bins[j * nx + ii]!.push(i / 3)
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = min[0]! + (i + 0.5) * h[0]! + ox, y = min[1]! + (j + 0.5) * h[1]! + oy
    const zs: number[] = []
    for (const f of bins[j * nx + i]!) {
      const a = t[f * 3]! * 3, b = t[f * 3 + 1]! * 3, c = t[f * 3 + 2]! * 3
      const ax = p[a]!, ay = p[a + 1]!, bx = p[b]!, by = p[b + 1]!, cx = p[c]!, cy = p[c + 1]!
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
      if (Math.abs(det) < 1e-18) continue
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det
      const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det
      const l3 = 1 - l1 - l2
      if (l1 < 0 || l2 < 0 || l3 < 0) continue
      zs.push(l1 * p[a + 2]! + l2 * p[b + 2]! + l3 * p[c + 2]!)
    }
    zs.sort((u, w) => u - w)
    let q = 0
    for (let k = 0; k < nz; k++) {
      const zc = min[2]! + (k + 0.5) * h[2]!
      while (q < zs.length && zs[q]! < zc) q++
      if ((q & 1) === 1) inside[(k * ny + j) * nx + i] = 1
    }
  }
  return inside
}

const build = (min: readonly [number, number, number], max: readonly [number, number, number], n: readonly [number, number, number], inside: Uint8Array, solidVol: number | undefined): TetMesh | MeshRefusal => {
  const [nx, ny, nz] = n
  const h: [number, number, number] = [(max[0] - min[0]) / nx, (max[1] - min[1]) / ny, (max[2] - min[2]) / nz]
  const vid = new Int32Array((nx + 1) * (ny + 1) * (nz + 1)).fill(-1)
  const vIndex = (i: number, j: number, k: number) => (k * (ny + 1) + j) * (nx + 1) + i
  const corners: number[] = []
  let cellsUsed = 0
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (inside[(k * ny + j) * nx + i] === 0) continue
    cellsUsed++
    for (let c = 0; c < 8; c++) {
      const ci = i + (c & 1), cj = j + ((c >> 1) & 1), ck = k + ((c >> 2) & 1)
      const idx = vIndex(ci, cj, ck)
      if (vid[idx] === -1) { vid[idx] = corners.length / 3; corners.push(min[0] + ci * h[0], min[1] + cj * h[1], min[2] + ck * h[2]) }
    }
  }
  if (cellsUsed === 0) return { ok: false, code: "empty", message: "No grid cell lies inside the solid: the size is larger than the part, or the surface is not closed." }
  const cornerCount = corners.length / 3
  const tetCorners: number[] = []
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (inside[(k * ny + j) * nx + i] === 0) continue
    const v = (c: number) => vid[vIndex(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]!
    for (const t of KUHN) tetCorners.push(v(t[0]), v(t[1]), v(t[2]), v(t[3]))
  }
  const ne = tetCorners.length / 4
  const nodes: number[] = corners.slice()
  const mid = new Map<number, number>()
  const midOf = (a: number, b: number): number => {
    const key = a < b ? a * cornerCount + b : b * cornerCount + a
    let id = mid.get(key)
    if (id === undefined) {
      id = nodes.length / 3
      nodes.push((nodes[a * 3]! + nodes[b * 3]!) / 2, (nodes[a * 3 + 1]! + nodes[b * 3 + 1]!) / 2, (nodes[a * 3 + 2]! + nodes[b * 3 + 2]!) / 2)
      mid.set(key, id)
    }
    return id
  }
  const elements = new Uint32Array(ne * 10)
  const xe = new Float64Array(12)
  let volume = 0, minVol = Infinity, minJac = Infinity
  const geo = { volume: 0, gradL: new Float64Array(12) }
  for (let e = 0; e < ne; e++) {
    let c0 = tetCorners[e * 4]!, c1 = tetCorners[e * 4 + 1]!, c2 = tetCorners[e * 4 + 2]!, c3 = tetCorners[e * 4 + 3]!
    const cs = [c0, c1, c2, c3]
    for (let a = 0; a < 4; a++) { xe[a * 3] = nodes[cs[a]! * 3]!; xe[a * 3 + 1] = nodes[cs[a]! * 3 + 1]!; xe[a * 3 + 2] = nodes[cs[a]! * 3 + 2]! }
    tetGeometry(xe, geo)
    if (geo.volume < 0) { const tmp = c1; c1 = c2; c2 = tmp; cs[1] = c1; cs[2] = c2; tetGeometry([xe[0]!, xe[1]!, xe[2]!, xe[6]!, xe[7]!, xe[8]!, xe[3]!, xe[4]!, xe[5]!, xe[9]!, xe[10]!, xe[11]!], geo) }
    volume += geo.volume
    minVol = Math.min(minVol, geo.volume)
    elements[e * 10] = c0; elements[e * 10 + 1] = c1; elements[e * 10 + 2] = c2; elements[e * 10 + 3] = c3
    for (let q = 0; q < 6; q++) elements[e * 10 + 4 + q] = midOf(cs[TET10_EDGES[q]![0]]!, cs[TET10_EDGES[q]![1]]!)
  }
  // every Kuhn tetrahedron of a cell shares the cell's proportions, so the worst case is the cell's aspect ratio
  minJac = Math.min(h[0], h[1], h[2]) / Math.max(h[0], h[1], h[2])
  // boundary faces: a corner triple that belongs to exactly one tetrahedron
  const faceUse = new Map<string, { e: number; opp: number; count: number }>()
  const FACE = [[0, 1, 2, 3], [0, 1, 3, 2], [1, 2, 3, 0], [0, 2, 3, 1]] as const
  for (let e = 0; e < ne; e++) for (const [a, b, c, o] of FACE) {
    const ids = [elements[e * 10 + a]!, elements[e * 10 + b]!, elements[e * 10 + c]!].sort((u, w) => u - w)
    const key = `${ids[0]}_${ids[1]}_${ids[2]}`
    const entry = faceUse.get(key)
    if (entry === undefined) faceUse.set(key, { e, opp: o, count: 1 }); else entry.count++
  }
  const faceList: number[] = []
  for (const [key, use] of faceUse) {
    if (use.count !== 1) continue
    const [a, b, c] = key.split("_").map(Number) as [number, number, number]
    const o = elements[use.e * 10 + use.opp]!
    const px = (id: number, d: number) => nodes[id * 3 + d]!
    const ux = px(b, 0) - px(a, 0), uy = px(b, 1) - px(a, 1), uz = px(b, 2) - px(a, 2)
    const vx = px(c, 0) - px(a, 0), vy = px(c, 1) - px(a, 1), vz = px(c, 2) - px(a, 2)
    const nxv = uy * vz - uz * vy, nyv = uz * vx - ux * vz, nzv = ux * vy - uy * vx
    const toOpp = (px(o, 0) - px(a, 0)) * nxv + (px(o, 1) - px(a, 1)) * nyv + (px(o, 2) - px(a, 2)) * nzv
    const [f0, f1, f2] = toOpp > 0 ? [a, c, b] : [a, b, c]
    faceList.push(f0, f1, f2, midOf(f0, f1), midOf(f1, f2), midOf(f2, f0))
  }
  const quality: MeshQuality = { minVolume: minVol, minJacobianRatio: minJac, volumeRatio: solidVol !== undefined && solidVol > 0 ? volume / solidVol : undefined, cells: [nx, ny, nz], solidVolume: solidVol }
  return {
    nodeCount: nodes.length / 3, elementCount: ne, nodes: Float64Array.from(nodes), elements, faces: Uint32Array.from(faceList), faceCount: faceList.length / 6,
    bounds: { min, max }, cell: h, volume, quality
  }
}

const gridCounts = (min: readonly number[], max: readonly number[], size: number, maxElements: number): readonly [number, number, number] | MeshRefusal => {
  const ext = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!]
  if (!(size > 0) || ext.some((x) => !(x > 0))) return { ok: false, code: "too_thin", message: "The part has no extent along one axis, or the element size is not positive." }
  const n = ext.map((x) => Math.max(1, Math.round(x / size))) as [number, number, number]
  if (n[0] * n[1] * n[2] * 6 > maxElements * 1.6) return { ok: false, code: "too_large", message: `The grid ${n.join(" x ")} would exceed the element budget of ${maxElements}: raise the element size.` }
  return n
}

export const meshBox = (min: readonly [number, number, number], max: readonly [number, number, number], options: MeshOptions): MeshOutcome => {
  const n = gridCounts(min, max, options.size, options.maxElements ?? 60_000)
  if ("ok" in n) return n
  const out = build(min, max, n, new Uint8Array(n[0] * n[1] * n[2]).fill(1), (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]))
  if ("ok" in out) return out
  return out.elementCount > (options.maxElements ?? 60_000) ? { ok: false, code: "too_large", message: `${out.elementCount} elements exceed the budget of ${options.maxElements ?? 60_000}.` } : { ok: true, mesh: out }
}

export const meshSolid = (solid: TriangleSolid, options: MeshOptions): MeshOutcome => {
  const p = solid.positions
  if (p.length < 9 || solid.indices.length < 12) return { ok: false, code: "empty", message: "The solid has no triangles." }
  const vol = solidVolume(solid)
  if (!(vol > 0)) return { ok: false, code: "open_solid", message: "The surface is not a closed, outward-oriented solid (its signed volume is not positive)." }
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i += 3) for (let d = 0; d < 3; d++) { min[d] = Math.min(min[d]!, p[i + d]!); max[d] = Math.max(max[d]!, p[i + d]!) }
  const n = gridCounts(min, max, options.size, options.maxElements ?? 60_000)
  if ("ok" in n) return n
  const h = [(max[0] - min[0]) / n[0], (max[1] - min[1]) / n[1], (max[2] - min[2]) / n[2]]
  const out = build(min, max, n, classifyCells(solid, min, h, n), vol)
  if ("ok" in out) return out
  return out.elementCount > (options.maxElements ?? 60_000) ? { ok: false, code: "too_large", message: `${out.elementCount} elements exceed the budget of ${options.maxElements ?? 60_000}.` } : { ok: true, mesh: out }
}
