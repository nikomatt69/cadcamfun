/**
 * Queries a triangle soup the way a cutter sees it: where the surface is under a column, which way it
 * faces there, whether a point is inside the material and how far it is from the nearest surface.
 *
 * This is what the 5-axis strategies need and the Z-dexel model cannot give: a tilted tool touches a
 * surface at an angle, so a *column* of material is not enough — the query needs the surface normal at
 * the contact point and the clearances around a tilted cutter. The mesh is bucketed on a uniform XY
 * grid (same idea as the dexel grid, one bucket per cell), so a query only visits the triangles near it.
 *
 * The meshes must be **closed** (they are: `element-mesh.ts` seals every solid, and the Boolean kernel
 * keeps them closed), because "inside" is a ray-parity test. Points exactly on an edge are a measure-zero
 * case; the parity ray is nudged to make it unlikely.
 */
import { type Mesh64 } from "./element-mesh.ts"
import { length3, type Vec3 } from "../../cad/vec.ts"

export interface SurfaceHit {
  /** Contact point on the surface. */
  readonly point: Vec3
  /** Outward unit normal at the contact point, flipped so it points up (+Z). */
  readonly normal: Vec3
}

interface Bucket {
  readonly indices: number[]
}

const nudge = 1e-7

/** Tolerant point-in-triangle test with the barycentric coordinates returned. */
const barycentric = (
  p: { readonly x: number; readonly y: number },
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number
): { u: number; v: number; w: number } | undefined => {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
  if (Math.abs(d) < 1e-18) return undefined
  const u = ((by - cy) * (p.x - cx) + (cx - bx) * (p.y - cy)) / d
  const v = ((cy - ay) * (p.x - cx) + (ax - cx) * (p.y - cy)) / d
  const w = 1 - u - v
  if (u < -1e-12 || v < -1e-12 || w < -1e-12) return undefined
  return { u, v, w }
}

export class TriangleSoup {
  private readonly positions: Float64Array
  private readonly indices: Uint32Array
  private readonly cols: number
  private readonly rows: number
  private readonly cellX: number
  private readonly cellY: number
  private readonly originX: number
  private readonly originY: number
  private readonly buckets: Bucket[]
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }

  constructor(meshes: ReadonlyArray<Mesh64>, cell = 1) {
    if (meshes.length === 0) throw new RangeError("TriangleSoup needs at least one mesh")
    const parts: number[] = []
    const tris: number[] = []
    for (const m of meshes) {
      const base = parts.length / 3
      for (let i = 0; i < m.positions.length; i++) parts.push(m.positions[i]!)
      for (let i = 0; i < m.indices.length; i++) tris.push(m.indices[i]! + base)
    }
    this.positions = Float64Array.from(parts)
    this.indices = Uint32Array.from(tris)
    const min: [number, number, number] = [Infinity, Infinity, Infinity]
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < this.positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = this.positions[i + a]!
        if (v < min[a]!) min[a] = v
        if (v > max[a]!) max[a] = v
      }
    }
    this.bounds = { min, max }
    const spanX = Math.max(max[0]! - min[0]!, 1e-6)
    const spanY = Math.max(max[1]! - min[1]!, 1e-6)
    this.cols = Math.max(1, Math.ceil(spanX / Math.max(cell, 1e-3)))
    this.rows = Math.max(1, Math.ceil(spanY / Math.max(cell, 1e-3)))
    this.cellX = spanX / this.cols
    this.cellY = spanY / this.rows
    this.originX = min[0]!
    this.originY = min[1]!
    this.buckets = Array.from({ length: this.cols * this.rows }, (): Bucket => ({ indices: [] }))
    const vertex = (t: number, k: number): Vec3 => {
      const i = this.indices[t * 3 + k]! * 3
      return { x: this.positions[i]!, y: this.positions[i + 1]!, z: this.positions[i + 2]! }
    }
    for (let t = 0; t < this.indices.length / 3; t++) {
      const a = vertex(t, 0), b = vertex(t, 1), c = vertex(t, 2)
      const i0 = this.column(Math.min(a.x, b.x, c.x))
      const i1 = this.column(Math.max(a.x, b.x, c.x))
      const j0 = this.row(Math.min(a.y, b.y, c.y))
      const j1 = this.row(Math.max(a.y, b.y, c.y))
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.buckets[j * this.cols + i]!.indices.push(t)
    }
  }

  private column(x: number): number {
    const i = Math.floor((x - this.originX) / this.cellX)
    return Math.min(this.cols - 1, Math.max(0, i))
  }

  private row(y: number): number {
    const j = Math.floor((y - this.originY) / this.cellY)
    return Math.min(this.rows - 1, Math.max(0, j))
  }

  private bucketAt(x: number, y: number): Bucket | undefined {
    if (x < this.originX || y < this.originY) return undefined
    if (x > this.originX + this.cols * this.cellX || y > this.originY + this.rows * this.cellY) return undefined
    return this.buckets[this.row(y) * this.cols + this.column(x)]
  }

  /** Triangle corners of triangle `t`. */
  private corner = (t: number): [Vec3, Vec3, Vec3] => {
    const at = (k: number): Vec3 => {
      const i = this.indices[t * 3 + k]! * 3
      return { x: this.positions[i]!, y: this.positions[i + 1]!, z: this.positions[i + 2]! }
    }
    return [at(0), at(1), at(2)]
  }

  /** Every triangle whose XY box overlaps the cells within `radius` of (x, y). */
  private near(x: number, y: number, radius: number): number[] {
    const reach = Math.max(radius, 1e-6)
    const i0 = this.column(x - reach)
    const i1 = this.column(x + reach)
    const j0 = this.row(y - reach)
    const j1 = this.row(y + reach)
    const seen = new Set<number>()
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        for (const t of this.buckets[j * this.cols + i]!.indices) seen.add(t)
      }
    }
    return [...seen]
  }

  /**
   * The highest surface under (x, y) at or below `zFrom`, with its normal flipped up. `undefined` when
   * the column is empty (the point is off the part).
   */
  down(x: number, y: number, zFrom: number): SurfaceHit | undefined {
    const bucket = this.bucketAt(x, y)
    if (bucket === undefined) return undefined
    let best: SurfaceHit | undefined
    for (const t of bucket.indices) {
      const [a, b, c] = this.corner(t)
      const hit = this.rayDownTriangle(x, y, zFrom, a, b, c)
      if (hit === undefined) continue
      if (best === undefined || hit.point.z > best.point.z) best = hit
    }
    return best
  }

  private rayDownTriangle(x: number, y: number, zFrom: number, a: Vec3, b: Vec3, c: Vec3): SurfaceHit | undefined {
    // A vertical ray meets the triangle where (x, y) lies in its XY projection; Z is interpolated on the plane.
    const bary = barycentric({ x, y }, a.x, a.y, b.x, b.y, c.x, c.y)
    if (bary === undefined) return undefined
    const z = bary.u * a.z + bary.v * b.z + bary.w * c.z
    if (z > zFrom + 1e-9) return undefined
    // Outward normal, flipped so it points up (the tool approaches from above).
    const e1 = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
    const e2 = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }
    let n = cross3(e1, e2)
    if (n.z < 0) n = { x: -n.x, y: -n.y, z: -n.z }
    const len = length3(n)
    if (!(len > 1e-12) || n.z <= 1e-12) return undefined
    return { point: { x, y, z }, normal: { x: n.x / len, y: n.y / len, z: n.z / len } }
  }

  /** Whether the point is inside the material (ray parity on a closed mesh). */
  inside(p: Vec3): boolean {
    const q = { x: p.x + nudge, y: p.y + nudge, z: p.z + nudge }
    if (q.y < this.originY || q.y > this.originY + this.rows * this.cellY) return false
    if (q.x < this.originX || q.x > this.originX + this.cols * this.cellX) return false
    // The parity ray runs along +X through the whole row of cells at this Y, so every triangle it can cross is in that row.
    const row = this.row(q.y)
    const seen = new Set<number>()
    for (let i = this.column(q.x); i < this.cols; i++) {
      for (const t of this.buckets[row * this.cols + i]!.indices) seen.add(t)
    }
    let crossings = 0
    for (const t of seen) {
      const [a, b, c] = this.corner(t)
      if (this.rayXTriangle(q, a, b, c) !== undefined) crossings++
    }
    return crossings % 2 === 1
  }

  /** Ray (q, +X) against a triangle: the distance along X, or undefined. */
  private rayXTriangle(q: Vec3, a: Vec3, b: Vec3, c: Vec3): number | undefined {
    const bary = barycentric({ x: q.y, y: q.z }, a.y, a.z, b.y, b.z, c.y, c.z)
    if (bary === undefined) return undefined
    const x = bary.u * a.x + bary.v * b.x + bary.w * c.x
    return x >= q.x ? x - q.x : undefined
  }

  /** Distance from the point to the nearest surface (searched within `radius`, Infinity when off the mesh). */
  distance(p: Vec3, radius = Infinity): number {
    let best = Infinity
    const search = Number.isFinite(radius) ? radius : Math.max(this.cellX, this.cellY) * 2
    for (const t of this.near(p.x, p.y, search)) {
      const [a, b, c] = this.corner(t)
      best = Math.min(best, pointTriangleDistance(p, a, b, c))
    }
    return best
  }

  /** True when the cutter envelope point `p` is out of the material and at least `clearance` from it. */
  isClear(p: Vec3, clearance: number): boolean {
    if (this.inside(p)) return false
    return this.distance(p, Math.max(clearance * 4, 0.1)) >= clearance
  }
}

/** Squared distance from a point to a triangle (Ericson, Real-Time Collision Detection). */
const pointTriangleDistance = (p: Vec3, a: Vec3, b: Vec3, c: Vec3): number => {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z
  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  if (d1 <= 0 && d2 <= 0) return pointDistance({ x: a.x, y: a.y, z: a.z }, p)
  const bpx = p.x - b.x, bpy = p.y - b.y, bpz = p.z - b.z
  const d3 = abx * bpx + aby * bpy + abz * bpz
  const d4 = acx * bpx + acy * bpy + acz * bpz
  if (d3 >= 0 && d4 <= d3) return pointDistance({ x: b.x, y: b.y, z: b.z }, p)
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3)
    return pointDistance({ x: a.x + abx * v, y: a.y + aby * v, z: a.z + abz * v }, p)
  }
  const cpx = p.x - c.x, cpy = p.y - c.y, cpz = p.z - c.z
  const d5 = abx * cpx + aby * cpy + abz * cpz
  const d6 = acx * cpx + acy * cpy + acz * cpz
  if (d6 >= 0 && d5 <= d6) return pointDistance({ x: c.x, y: c.y, z: c.z }, p)
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6)
    return pointDistance({ x: a.x + acx * w, y: a.y + acy * w, z: a.z + acz * w }, p)
  }
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6))
    return pointDistance({ x: b.x + (c.x - b.x) * w, y: b.y + (c.y - b.y) * w, z: b.z + (c.z - b.z) * w }, p)
  }
  const denom = 1 / (va + vb + vc)
  const v = vb * denom
  const w = vc * denom
  return pointDistance({ x: a.x + abx * v + acx * w, y: a.y + aby * v + acy * w, z: a.z + abz * v + acz * w }, p)
}

const pointDistance = (a: Vec3, b: Vec3): number => {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

const cross3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })

/** Centre of the meshes' bounds, the default pivot of a trunnion table. */
export const soupCentre = (soup: TriangleSoup): Vec3 => {
  const { min, max } = soup.bounds
  return { x: (min[0]! + max[0]!) / 2, y: (min[1]! + max[1]!) / 2, z: (min[2]! + max[2]!) / 2 }
}

/** Total path length of a polyline (used by the strategies to bound sampling). */
export const polylineLength = (points: ReadonlyArray<Vec3>): number => {
  let total = 0
  for (let i = 1; i < points.length; i++) total += length3(sub(points[i - 1]!, points[i]!))
  return total
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
