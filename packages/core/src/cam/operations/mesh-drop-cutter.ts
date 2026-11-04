/**
 * Mesh drop-cutter (spec 69 F1): the height of a vertical axisymmetric cutter's tip when it is lowered at (x, y) until it touches a
 * triangle mesh, found per triangle in closed form (vertex, edge and facet contact) instead of sampling a height field. A triangle
 * BVH over the XY footprint keeps a query to the triangles within one cutter radius.
 *
 * The cutter is its lower-envelope profile `h(r)` (height of the cutting surface above the tip at radius r, non-decreasing, zero at
 * the axis; `toolModel(...).profile`), so ball, bull, cone, tapered, lollipop, barrel and lens cutters all share the code. Contact
 * is exact on the mesh: the only error against the true surface is the mesh's own chord error, which the caller declares
 * (`Mesh` tessellation tolerance). The tip is lowered from above, so an undercut (overhang) is never entered: the result is the
 * highest contact, and a facet that faces down never carries the tip.
 *
 * Units are millimetres. Heights below every triangle in reach are `-Infinity` (nothing to touch).
 */
import type { VerifyTool } from "../verify/schema.ts"
import { toolModel } from "../verify/tool-model.ts"

export interface DropMesh {
  /** x, y, z of each vertex, consecutive. */
  readonly positions: ArrayLike<number>
  /** Three vertex indices per triangle. */
  readonly indices: ArrayLike<number>
}

export interface DropProfile {
  /** Cutter radius, mm. */
  readonly radius: number
  /** Height of the cutting surface above the tip at radial distance r (0 <= r <= radius). */
  readonly profile: (r: number) => number
}

interface Node {
  x0: number; y0: number; x1: number; y1: number; maxZ: number
  /** Leaf: triangle range [from, to) in `order`; inner: children. */
  from: number; to: number
  left?: Node; right?: Node
}

const LEAF = 6
const SCAN = 24
const GOLDEN = (Math.sqrt(5) - 1) / 2

/** Maximum of `f` over [a, b]: a coarse scan to find the best bracket, then golden-section inside it. Exact for concave `f`. */
const maximise = (f: (t: number) => number, a: number, b: number): number => {
  if (b - a < 1e-12) return f(a)
  let bestI = 0, best = -Infinity
  for (let i = 0; i <= SCAN; i++) { const v = f(a + ((b - a) * i) / SCAN); if (v > best) { best = v; bestI = i } }
  let lo = a + ((b - a) * Math.max(0, bestI - 1)) / SCAN, hi = a + ((b - a) * Math.min(SCAN, bestI + 1)) / SCAN
  let c = hi - GOLDEN * (hi - lo), d = lo + GOLDEN * (hi - lo)
  let fc = f(c), fd = f(d)
  for (let i = 0; i < 48; i++) {
    if (fc > fd) { hi = d; d = c; fd = fc; c = hi - GOLDEN * (hi - lo); fc = f(c) } else { lo = c; c = d; fc = fd; d = lo + GOLDEN * (hi - lo); fd = f(d) }
  }
  return Math.max(best, fc, fd)
}

export class MeshDropCutter {
  readonly triangles: number
  /** Queries answered and triangles tested so far (a diagnostic for the BVH). */
  queries = 0
  tested = 0
  private readonly p: Float64Array
  private readonly tri: Int32Array
  private readonly order: Int32Array
  private readonly root: Node | undefined
  private readonly R: number
  private readonly h: (r: number) => number

  constructor(mesh: DropMesh, cutter: DropProfile) {
    this.R = cutter.radius
    this.h = cutter.profile
    this.p = Float64Array.from(mesh.positions)
    this.tri = Int32Array.from(mesh.indices)
    this.triangles = Math.floor(this.tri.length / 3)
    this.order = Int32Array.from({ length: this.triangles }, (_, i) => i)
    this.root = this.triangles === 0 ? undefined : this.build(0, this.triangles)
  }

  private bounds(from: number, to: number): Node {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, maxZ = -Infinity
    for (let k = from; k < to; k++) {
      const t = this.order[k]!
      for (let c = 0; c < 3; c++) {
        const v = this.tri[t * 3 + c]! * 3
        const x = this.p[v]!, y = this.p[v + 1]!, z = this.p[v + 2]!
        if (x < x0) x0 = x; if (x > x1) x1 = x
        if (y < y0) y0 = y; if (y > y1) y1 = y
        if (z > maxZ) maxZ = z
      }
    }
    return { x0, y0, x1, y1, maxZ, from, to }
  }

  private centre(t: number, axis: 0 | 1): number {
    return (this.p[this.tri[t * 3]! * 3 + axis]! + this.p[this.tri[t * 3 + 1]! * 3 + axis]! + this.p[this.tri[t * 3 + 2]! * 3 + axis]!) / 3
  }

  private build(from: number, to: number): Node {
    const node = this.bounds(from, to)
    if (to - from <= LEAF) return node
    const axis: 0 | 1 = node.x1 - node.x0 >= node.y1 - node.y0 ? 0 : 1
    const slice = Array.from(this.order.subarray(from, to)).sort((a, b) => this.centre(a, axis) - this.centre(b, axis))
    this.order.set(slice, from)
    const mid = (from + to) >> 1
    node.left = this.build(from, mid)
    node.right = this.build(mid, to)
    return node
  }

  /** Height of the tip when lowered at (x, y), or `-Infinity` when no triangle is within reach. */
  drop(x: number, y: number): number {
    this.queries++
    let best = -Infinity
    const visit = (n: Node): void => {
      const dx = x < n.x0 ? n.x0 - x : x > n.x1 ? x - n.x1 : 0
      const dy = y < n.y0 ? n.y0 - y : y > n.y1 ? y - n.y1 : 0
      const d = Math.hypot(dx, dy)
      if (d > this.R) return
      // Nothing in the node can lift the tip above its highest vertex minus the cutter's rise at the nearest distance.
      if (n.maxZ - this.h(d) <= best) return
      if (n.left === undefined || n.right === undefined) {
        for (let k = n.from; k < n.to; k++) { const z = this.triangle(this.order[k]!, x, y); if (z > best) best = z }
        return
      }
      // Nearer child first so the bound prunes the other.
      const l = n.left, r = n.right
      const dl = Math.hypot(Math.max(l.x0 - x, 0, x - l.x1), Math.max(l.y0 - y, 0, y - l.y1))
      const dr = Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1))
      if (dl <= dr) { visit(l); visit(r) } else { visit(r); visit(l) }
    }
    if (this.root !== undefined) visit(this.root)
    return best
  }

  /** Tip height from one triangle: the best of its vertex, edge and facet contacts. */
  private triangle(t: number, x: number, y: number): number {
    this.tested++
    const R = this.R, h = this.h
    const v = [0, 1, 2].map((c) => this.tri[t * 3 + c]! * 3)
    const ax = this.p[v[0]!]!, ay = this.p[v[0]! + 1]!, az = this.p[v[0]! + 2]!
    const bx = this.p[v[1]!]!, by = this.p[v[1]! + 1]!, bz = this.p[v[1]! + 2]!
    const cx = this.p[v[2]!]!, cy = this.p[v[2]! + 1]!, cz = this.p[v[2]! + 2]!
    const X = [ax, bx, cx], Y = [ay, by, cy], Z = [az, bz, cz]
    let best = -Infinity

    for (let i = 0; i < 3; i++) {
      const d = Math.hypot(X[i]! - x, Y[i]! - y)
      if (d <= R) best = Math.max(best, Z[i]! - h(d))
    }
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3
      const ex = X[j]! - X[i]!, ey = Y[j]! - Y[i]!
      const fx = X[i]! - x, fy = Y[i]! - y
      const a = ex * ex + ey * ey
      let t0 = 0, t1 = 1
      if (a < 1e-18) continue
      const bq = fx * ex + fy * ey, cq = fx * fx + fy * fy - R * R
      const disc = bq * bq - a * cq
      if (disc < 0) continue
      const s = Math.sqrt(disc)
      t0 = Math.max(0, (-bq - s) / a); t1 = Math.min(1, (-bq + s) / a)
      if (t0 > t1) continue
      const zi = Z[i]!, dz = Z[j]! - zi
      best = Math.max(best, maximise((u) => zi + dz * u - h(Math.min(R, Math.hypot(fx + ex * u, fy + ey * u))), t0, t1))
    }
    // Facet: the contact is where the plane's steepest-ascent direction from the axis, at the distance that balances the slope.
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    if (nz > 1e-12 * Math.hypot(nx, ny, nz)) {
      const gx = -nx / nz, gy = -ny / nz, gm = Math.hypot(gx, gy)
      const rStar = gm < 1e-12 ? 0 : maximiseArg((r) => gm * r - h(r), 0, R)
      const px = gm < 1e-12 ? x : x + (gx / gm) * rStar, py = gm < 1e-12 ? y : y + (gy / gm) * rStar
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
      if (Math.abs(den) > 1e-18) {
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den
        const l3 = 1 - l1 - l2
        const e = -1e-9
        if (l1 >= e && l2 >= e && l3 >= e) best = Math.max(best, az + gx * (px - ax) + gy * (py - ay) - h(rStar))
      }
    }
    return best
  }

  /** Heights over a regular grid of nodes (`nx` x `ny`, row-major, origin (x0, y0), spacing dx / dy), `-Infinity` where nothing is in reach. */
  grid(x0: number, y0: number, nx: number, ny: number, dx: number, dy: number): Float64Array {
    const out = new Float64Array(nx * ny)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out[j * nx + i] = this.drop(x0 + i * dx, y0 + j * dy)
    return out
  }
}

/** Argument of the maximum of `f` over [a, b] (same scan + golden section as `maximise`). */
const maximiseArg = (f: (t: number) => number, a: number, b: number): number => {
  if (b - a < 1e-12) return a
  let bestI = 0, best = -Infinity
  for (let i = 0; i <= SCAN; i++) { const v = f(a + ((b - a) * i) / SCAN); if (v > best) { best = v; bestI = i } }
  let lo = a + ((b - a) * Math.max(0, bestI - 1)) / SCAN, hi = a + ((b - a) * Math.min(SCAN, bestI + 1)) / SCAN
  for (let i = 0; i < 48; i++) {
    const c = hi - GOLDEN * (hi - lo), d = lo + GOLDEN * (hi - lo)
    if (f(c) > f(d)) hi = d; else lo = c
  }
  return (lo + hi) / 2
}

/** The drop-cutter for a replay tool (`VerifyTool`, so a swept-profile cutter carries its exact envelope). */
export const meshDropCutter = (mesh: DropMesh, tool: VerifyTool): MeshDropCutter => {
  const m = toolModel(tool)
  return new MeshDropCutter(mesh, { radius: m.radius, profile: m.flat ? () => 0 : m.profile })
}
