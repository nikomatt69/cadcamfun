/**
 * Mesh repair for printing: the pre-pass that turns the usual sloppy triangle soup (an STL with duplicated vertices, a
 * zero-area sliver, a missing face, a patch wound the wrong way, an inside-out shell) into a closed, consistently oriented
 * surface that the slicer accepts, and says exactly what it did and what it could not do.
 *
 * Steps, each reported in the `RepairReport`:
 *   1. vertices closer than the weld tolerance are merged (spatial hash, no O(n^2));
 *   2. triangles with a repeated vertex or no area are dropped; duplicated faces are collapsed, and a face that is paired with
 *      its own reverse (an internal wall) is removed with its twin;
 *   3. the winding is made consistent by flooding across manifold edges, then every closed shell is turned outward by its
 *      signed volume (a shell whose volume is negative is inside-out);
 *   4. open boundary loops are closed (ear clipping on the loop's best-fit plane; a loop longer than `maxHoleEdges`, or one
 *      the clipping cannot triangulate, is left open and reported);
 *   5. self-intersections are counted by a grid broad phase and an exact edge-through-triangle test (reported, never repaired:
 *      cutting a self-intersecting shell apart is a modelling decision).
 *
 * Nothing is repaired silently: `status` is `clean` when the input was already a closed manifold, `repaired` when every defect
 * was fixed, and `unrepairable` when the result still is not a closed manifold (non-manifold edges, a hole that was not filled).
 */
import type { Mesh64 } from "../model/element-mesh.ts"

export interface RepairOptions {
  /** Vertices closer than this are one vertex, mm. Default 1e-5. */
  readonly weldTolerance?: number
  /** Close open boundary loops. Default true. */
  readonly fillHoles?: boolean
  /** The longest boundary loop that is filled, in edges. Default 256. */
  readonly maxHoleEdges?: number
  /** Count self-intersections. Default true. */
  readonly checkSelfIntersections?: boolean
  /** The most triangle pairs the self-intersection test examines; past it the answer is marked incomplete. Default 5e6. */
  readonly selfIntersectionBudget?: number
  readonly signal?: { readonly aborted: boolean }
}

export interface SelfIntersectionReport {
  /** Pairs of triangles that cross each other (no shared vertex). */
  readonly pairs: number
  /** The first few pairs, as triangle indices of the repaired mesh. */
  readonly sample: ReadonlyArray<readonly [number, number]>
  /** False when the budget stopped the search: `pairs` is then a lower bound. */
  readonly complete: boolean
  readonly examined: number
}

export interface RepairReport {
  readonly inputTriangles: number
  readonly outputTriangles: number
  readonly inputVertices: number
  readonly outputVertices: number
  readonly weldedVertices: number
  readonly degenerateRemoved: number
  readonly duplicateRemoved: number
  /** Faces removed together with their reversed twin (an internal wall). */
  readonly internalRemoved: number
  readonly flippedTriangles: number
  /** Closed shells that were inside-out and have been turned. */
  readonly invertedShells: number
  readonly holesFilled: number
  readonly holeTriangles: number
  /** Boundary loops left open, with the reason. */
  readonly holesSkipped: ReadonlyArray<string>
  /** Edges shared by three or more faces after the repair. */
  readonly nonManifoldEdges: number
  /** Edges used by one face only, after the repair. */
  readonly openEdges: number
  readonly shells: number
  readonly selfIntersections: SelfIntersectionReport | undefined
  readonly closed: boolean
  /** Enclosed volume, mm^3 (0 when not closed). */
  readonly volume: number
  readonly status: "clean" | "repaired" | "unrepairable"
  readonly problems: ReadonlyArray<string>
}

export interface RepairResult {
  readonly mesh: Mesh64
  readonly report: RepairReport
}

// ---------------------------------------------------------------- welding

/** Merges vertices closer than `tol`: returns the compact positions and the old-to-new index map. */
const weld = (p: ArrayLike<number>, tol: number): { positions: Float64Array; map: Uint32Array } => {
  const n = p.length / 3
  const map = new Uint32Array(n)
  const out: number[] = []
  const cell = Math.max(tol, 1e-12)
  const size = 1 << Math.max(4, Math.ceil(Math.log2(Math.max(16, n * 2))))
  const mask = size - 1
  const table = new Int32Array(size).fill(-1)
  const next = new Int32Array(n).fill(-1)
  const ix = new Float64Array(n), iy = new Float64Array(n), iz = new Float64Array(n)
  const slot = (a: number, b: number, c: number): number => (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) & mask
  const kept: number[] = []
  const tol2 = tol * tol
  for (let v = 0; v < n; v++) {
    const x = p[v * 3]!, y = p[v * 3 + 1]!, z = p[v * 3 + 2]!
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell)
    let found = -1
    search: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (let k = table[slot(cx + dx, cy + dy, cz + dz)]!; k >= 0; k = next[k]!) {
        if (ix[k] !== cx + dx || iy[k] !== cy + dy || iz[k] !== cz + dz) continue
        const q = kept[k]! * 3
        const ex = p[q]! - x, ey = p[q + 1]! - y, ez = p[q + 2]! - z
        if (ex * ex + ey * ey + ez * ez <= tol2) { found = k; break search }
      }
    }
    if (found >= 0) { map[v] = found; continue }
    const id = kept.length
    kept.push(v)
    ix[id] = cx; iy[id] = cy; iz[id] = cz
    const s = slot(cx, cy, cz)
    next[id] = table[s]!
    table[s] = id
    map[v] = id
    out.push(x, y, z)
  }
  return { positions: Float64Array.from(out), map }
}

// ---------------------------------------------------------------- adjacency

const edgeKey = (a: number, b: number, vertices: number): number => (a < b ? a * vertices + b : b * vertices + a)

interface Adjacency {
  /** For half-edge h = 3 * face + k (from corner k to corner k + 1): the first other half-edge on the same edge, or -1. */
  readonly twin: Int32Array
  /** Edges with exactly one half-edge. */
  readonly open: number
  readonly nonManifold: number
  /** True per half-edge when its edge has three or more half-edges. */
  readonly bad: Uint8Array
}

const adjacency = (tri: Uint32Array, vertices: number): Adjacency => {
  const faces = tri.length / 3
  const twin = new Int32Array(faces * 3).fill(-1)
  const bad = new Uint8Array(faces * 3)
  const first = new Map<number, number>()
  const count = new Map<number, number>()
  for (let f = 0; f < faces; f++) {
    for (let k = 0; k < 3; k++) {
      const h = f * 3 + k
      const a = tri[f * 3 + k]!, b = tri[f * 3 + (k + 1) % 3]!
      const key = edgeKey(a, b, vertices)
      const seen = first.get(key)
      if (seen === undefined) { first.set(key, h); count.set(key, 1) }
      else {
        const c = count.get(key)! + 1
        count.set(key, c)
        if (c === 2) { twin[h] = seen; twin[seen] = h } else {
          bad[h] = 1; bad[seen] = 1
          const second = twin[seen]!
          if (second >= 0) { bad[second] = 1; twin[second] = -1; twin[seen] = -1 }
        }
      }
    }
  }
  let open = 0, nonManifold = 0
  for (const c of count.values()) { if (c === 1) open++; else if (c > 2) nonManifold++ }
  // A half-edge whose edge is non-manifold has no usable twin.
  for (let h = 0; h < bad.length; h++) if (bad[h]) twin[h] = -1
  return { twin, open, nonManifold, bad }
}

// ---------------------------------------------------------------- volume

const shellVolume = (p: ArrayLike<number>, tri: Uint32Array, faces: ReadonlyArray<number>): number => {
  let v = 0
  for (const f of faces) {
    const a = tri[f * 3]! * 3, b = tri[f * 3 + 1]! * 3, c = tri[f * 3 + 2]! * 3
    v += (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) / 6
  }
  return v
}

// ---------------------------------------------------------------- hole filling

/** Ear clipping of a closed loop of vertices on its best-fit plane (Newell normal). Returns triangles as loop positions, or undefined. */
const earClip = (p: ArrayLike<number>, loop: ReadonlyArray<number>): Array<[number, number, number]> | undefined => {
  const n = loop.length
  if (n < 3) return undefined
  let nx = 0, ny = 0, nz = 0
  for (let i = 0; i < n; i++) {
    const a = loop[i]! * 3, b = loop[(i + 1) % n]! * 3
    nx += (p[a + 1]! - p[b + 1]!) * (p[a + 2]! + p[b + 2]!)
    ny += (p[a + 2]! - p[b + 2]!) * (p[a]! + p[b]!)
    nz += (p[a]! - p[b]!) * (p[a + 1]! + p[b + 1]!)
  }
  const len = Math.hypot(nx, ny, nz)
  if (len < 1e-18) return undefined
  nx /= len; ny /= len; nz /= len
  // An orthonormal basis (u, v) of the plane; the loop winds counter-clockwise in it by construction of the normal.
  const ux0 = Math.abs(nx) < 0.9 ? 1 : 0, uy0 = Math.abs(nx) < 0.9 ? 0 : 1
  let ux = uy0 * nz, uy = -ux0 * nz, uz = ux0 * ny - uy0 * nx
  const ul = Math.hypot(ux, uy, uz)
  ux /= ul; uy /= ul; uz /= ul
  const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux
  const px = new Float64Array(n), py = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const a = loop[i]! * 3
    px[i] = p[a]! * ux + p[a + 1]! * uy + p[a + 2]! * uz
    py[i] = p[a]! * vx + p[a + 1]! * vy + p[a + 2]! * vz
  }
  const idx: number[] = Array.from({ length: n }, (_, i) => i)
  const out: Array<[number, number, number]> = []
  const cross = (a: number, b: number, c: number): number => (px[b]! - px[a]!) * (py[c]! - py[a]!) - (py[b]! - py[a]!) * (px[c]! - px[a]!)
  let guard = n * n + 10
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length]!, b = idx[k]!, c = idx[(k + 1) % idx.length]!
      if (cross(a, b, c) <= 1e-12) continue
      let inside = false
      for (const q of idx) {
        if (q === a || q === b || q === c) continue
        if (cross(a, b, q) >= -1e-12 && cross(b, c, q) >= -1e-12 && cross(c, a, q) >= -1e-12) { inside = true; break }
      }
      if (inside) continue
      out.push([a, b, c])
      idx.splice(k, 1)
      clipped = true
      break
    }
    if (!clipped) return undefined
  }
  if (idx.length === 3) {
    // The last triangle may be flat in the plane projection only when the loop is degenerate.
    if (Math.abs(cross(idx[0]!, idx[1]!, idx[2]!)) <= 1e-12) return out.length > 0 ? out : undefined
    out.push([idx[0]!, idx[1]!, idx[2]!])
  }
  return out
}

// ---------------------------------------------------------------- self-intersection

/**
 * Whether the open segment s0->s1 pierces triangle (t0, t1, t2): strictly between its ends (so a segment that only ends on the
 * triangle does not count), and inside or on the boundary of the triangle, so a crossing exactly on a shared diagonal is found.
 */
const segmentThrough = (p: Float64Array, s0: number, s1: number, t0: number, t1: number, t2: number, eps: number): boolean => {
  const ox = p[s0]!, oy = p[s0 + 1]!, oz = p[s0 + 2]!
  const dx = p[s1]! - ox, dy = p[s1 + 1]! - oy, dz = p[s1 + 2]! - oz
  const ax = p[t0]!, ay = p[t0 + 1]!, az = p[t0 + 2]!
  const e1x = p[t1]! - ax, e1y = p[t1 + 1]! - ay, e1z = p[t1 + 2]! - az
  const e2x = p[t2]! - ax, e2y = p[t2 + 1]! - ay, e2z = p[t2 + 2]! - az
  const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x
  const det = e1x * hx + e1y * hy + e1z * hz
  if (Math.abs(det) < 1e-18) return false
  const inv = 1 / det
  const sx = ox - ax, sy = oy - ay, sz = oz - az
  const u = inv * (sx * hx + sy * hy + sz * hz)
  if (u < -eps || u > 1 + eps) return false
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x
  const v = inv * (dx * qx + dy * qy + dz * qz)
  if (v < -eps || u + v > 1 + eps) return false
  const t = inv * (e2x * qx + e2y * qy + e2z * qz)
  return t > eps && t < 1 - eps
}

const countSelfIntersections = (p: Float64Array, tri: Uint32Array, budget: number, signal: RepairOptions["signal"]): SelfIntersectionReport => {
  const faces = tri.length / 3
  if (faces < 2) return { pairs: 0, sample: [], complete: true, examined: 0 }
  const lo = new Float64Array(faces * 3), hi = new Float64Array(faces * 3)
  let edgeSum = 0
  const gmin = [Infinity, Infinity, Infinity], gmax = [-Infinity, -Infinity, -Infinity]
  for (let f = 0; f < faces; f++) {
    for (let a = 0; a < 3; a++) {
      let mn = Infinity, mx = -Infinity
      for (let k = 0; k < 3; k++) { const v = p[tri[f * 3 + k]! * 3 + a]!; if (v < mn) mn = v; if (v > mx) mx = v }
      lo[f * 3 + a] = mn; hi[f * 3 + a] = mx
      if (mn < gmin[a]!) gmin[a] = mn
      if (mx > gmax[a]!) gmax[a] = mx
      edgeSum += mx - mn
    }
  }
  const cell = Math.max((edgeSum / (faces * 3)) * 1.5, 1e-6)
  const dim = [0, 1, 2].map((a) => Math.max(1, Math.min(512, Math.ceil((gmax[a]! - gmin[a]!) / cell) + 1)))
  const ny = dim[1]!, nz = dim[2]!
  /** Lowest grid cell of each face's box; a pair is examined only in the lowest cell both boxes share, so once. */
  const c0 = new Int32Array(faces * 3)
  const heads = new Map<number, number[]>()
  const large: number[] = []
  const MAX_CELLS = 2048
  for (let f = 0; f < faces; f++) {
    let cells = 1
    const c1 = [0, 0, 0]
    for (let a = 0; a < 3; a++) {
      c0[f * 3 + a] = Math.min(dim[a]! - 1, Math.floor((lo[f * 3 + a]! - gmin[a]!) / cell))
      c1[a] = Math.min(dim[a]! - 1, Math.floor((hi[f * 3 + a]! - gmin[a]!) / cell))
      cells *= c1[a]! - c0[f * 3 + a]! + 1
    }
    // A triangle that spans many cells (a big flat face next to fine detail) is tested against every other box instead of being listed everywhere.
    if (cells > MAX_CELLS) { large.push(f); continue }
    for (let x = c0[f * 3]!; x <= c1[0]!; x++) for (let y = c0[f * 3 + 1]!; y <= c1[1]!; y++) for (let z = c0[f * 3 + 2]!; z <= c1[2]!; z++) {
      const key = (x * ny + y) * nz + z
      const list = heads.get(key)
      if (list === undefined) heads.set(key, [f]); else list.push(f)
    }
  }
  let pairs = 0, examined = 0
  const sample: Array<readonly [number, number]> = []
  const eps = 1e-9
  const overlap = (f: number, g: number): boolean =>
    !(lo[f * 3]! > hi[g * 3]! || lo[g * 3]! > hi[f * 3]! || lo[f * 3 + 1]! > hi[g * 3 + 1]! || lo[g * 3 + 1]! > hi[f * 3 + 1]! || lo[f * 3 + 2]! > hi[g * 3 + 2]! || lo[g * 3 + 2]! > hi[f * 3 + 2]!)
  const shares = (f: number, g: number): boolean => {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (tri[f * 3 + i] === tri[g * 3 + j]) return true
    return false
  }
  const crosses = (f: number, g: number): boolean => {
    const a = [tri[f * 3]! * 3, tri[f * 3 + 1]! * 3, tri[f * 3 + 2]! * 3] as const
    const b = [tri[g * 3]! * 3, tri[g * 3 + 1]! * 3, tri[g * 3 + 2]! * 3] as const
    for (let k = 0; k < 3; k++) {
      if (segmentThrough(p, a[k]!, a[(k + 1) % 3]!, b[0], b[1], b[2], eps)) return true
      if (segmentThrough(p, b[k]!, b[(k + 1) % 3]!, a[0], a[1], a[2], eps)) return true
    }
    return false
  }
  const test = (f: number, g: number): boolean => {
    if (shares(f, g)) return true
    if (++examined > budget) return false
    if (crosses(f, g)) { pairs++; if (sample.length < 8) sample.push([Math.min(f, g), Math.max(f, g)] as const) }
    return true
  }
  for (const [key, list] of heads) {
    if (signal?.aborted) throw Object.assign(new Error("Repair cancelled"), { name: "AbortError" })
    const z = key % nz, y = Math.floor(key / nz) % ny, x = Math.floor(key / nz / ny)
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!
      for (let j = i + 1; j < list.length; j++) {
        const g = list[j]!
        // The cell must be the lowest one the two boxes have in common.
        if (x !== Math.max(c0[f * 3]!, c0[g * 3]!) || y !== Math.max(c0[f * 3 + 1]!, c0[g * 3 + 1]!) || z !== Math.max(c0[f * 3 + 2]!, c0[g * 3 + 2]!)) continue
        if (!overlap(f, g)) continue
        if (!test(f, g)) return { pairs, sample, complete: false, examined: examined - 1 }
      }
    }
  }
  const isLarge = new Uint8Array(faces)
  for (const f of large) isLarge[f] = 1
  for (let k = 0; k < large.length; k++) {
    if (signal?.aborted) throw Object.assign(new Error("Repair cancelled"), { name: "AbortError" })
    const f = large[k]!
    for (let g = 0; g < faces; g++) {
      if (g === f || (isLarge[g] && g < f)) continue
      if (!overlap(f, g)) continue
      if (!test(f, g)) return { pairs, sample, complete: false, examined: examined - 1 }
    }
  }
  return { pairs, sample, complete: true, examined }
}

// ---------------------------------------------------------------- the repair

export const repairMesh = (input: { readonly positions: ArrayLike<number>; readonly indices: ArrayLike<number> }, options: RepairOptions = {}): RepairResult => {
  const { positions: src, indices: srcIdx } = input
  if (src.length % 3 !== 0 || srcIdx.length % 3 !== 0) throw new RangeError("Mesh positions and indices must be complete triples")
  for (let i = 0; i < src.length; i++) if (!Number.isFinite(src[i])) throw new RangeError(`Mesh coordinate ${i} must be finite`)
  const vCount = src.length / 3
  for (let i = 0; i < srcIdx.length; i++) if (!Number.isInteger(srcIdx[i]) || srcIdx[i]! < 0 || srcIdx[i]! >= vCount) throw new RangeError(`Mesh index ${i} must be an integer in [0, ${vCount - 1}]`)
  const problems: string[] = []
  const tol = options.weldTolerance ?? 1e-5
  const checkAbort = (): void => { if (options.signal?.aborted) throw Object.assign(new Error("Repair cancelled"), { name: "AbortError" }) }

  // 1. weld
  const welded = weld(src, tol)
  const p = welded.positions
  const V = p.length / 3
  const weldedVertices = vCount - V
  const inFaces = srcIdx.length / 3

  // 2. degenerate and duplicate faces
  let tri: number[] = []
  let degenerate = 0
  for (let f = 0; f < inFaces; f++) {
    const a = welded.map[srcIdx[f * 3]!]!, b = welded.map[srcIdx[f * 3 + 1]!]!, c = welded.map[srcIdx[f * 3 + 2]!]!
    if (a === b || b === c || a === c) { degenerate++; continue }
    const ax = p[a * 3]!, ay = p[a * 3 + 1]!, az = p[a * 3 + 2]!
    const ux = p[b * 3]! - ax, uy = p[b * 3 + 1]! - ay, uz = p[b * 3 + 2]! - az
    const vx = p[c * 3]! - ax, vy = p[c * 3 + 1]! - ay, vz = p[c * 3 + 2]! - az
    const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
    if (area2 < 2e-10) { degenerate++; continue }
    tri.push(a, b, c)
  }
  checkAbort()
  // Duplicates: the same vertex triple. Equal winding keeps one, opposite winding cancels the pair. Faces are looked up by their
  // lowest edge, so only faces that share an edge are ever compared.
  const byEdge = new Map<number, number[]>()
  let duplicate = 0, internal = 0
  const keep = new Uint8Array(tri.length / 3).fill(1)
  const sortedOf = (f: number): [number, number, number] => {
    let a = tri[f * 3]!, b = tri[f * 3 + 1]!, c = tri[f * 3 + 2]!
    if (a > b) { const x = a; a = b; b = x }
    if (b > c) { const x = b; b = c; c = x }
    if (a > b) { const x = a; a = b; b = x }
    return [a, b, c]
  }
  const parity = (f: number, s0: number, s1: number): number => {
    const a = tri[f * 3]!, b = tri[f * 3 + 1]!, c = tri[f * 3 + 2]!
    return (a === s0 && b === s1) || (b === s0 && c === s1) || (c === s0 && a === s1) ? 1 : -1
  }
  for (let f = 0; f < tri.length / 3; f++) {
    const [s0, s1, s2] = sortedOf(f)
    const key = s0 * V + s1
    const list = byEdge.get(key)
    if (list === undefined) { byEdge.set(key, [f]); continue }
    const sign = parity(f, s0, s1)
    let consumed = false
    for (const g of list) {
      if (!keep[g]) continue
      const [g0, g1, g2] = sortedOf(g)
      if (g0 !== s0 || g1 !== s1 || g2 !== s2) continue
      if (parity(g, s0, s1) === sign) { keep[f] = 0; duplicate++ } else { keep[f] = 0; keep[g] = 0; internal += 2 }
      consumed = true
      break
    }
    if (!consumed) list.push(f)
  }
  const filtered: number[] = []
  for (let f = 0; f < tri.length / 3; f++) if (keep[f]) filtered.push(tri[f * 3]!, tri[f * 3 + 1]!, tri[f * 3 + 2]!)
  tri = filtered
  let faces = tri.length / 3

  // 3. orientation: flood across manifold edges
  let t = Uint32Array.from(tri)
  let adj = adjacency(t, V)
  const flip = new Uint8Array(faces)
  const component = new Int32Array(faces).fill(-1)
  const components: number[][] = []
  const halfFrom = (f: number, h: number): readonly [number, number] => {
    const k = h - f * 3
    return [t[f * 3 + k]!, t[f * 3 + (k + 1) % 3]!]
  }
  for (let seed = 0; seed < faces; seed++) {
    if (component[seed] !== -1) continue
    checkAbort()
    const id = components.length
    const members: number[] = [seed]
    component[seed] = id
    for (let head = 0; head < members.length; head++) {
      const f = members[head]!
      for (let k = 0; k < 3; k++) {
        const h = f * 3 + k
        const o = adj.twin[h]!
        if (o < 0) continue
        const g = Math.floor(o / 3)
        if (component[g] !== -1) continue
        // Effective direction of each half-edge: flipping a face reverses all its edges.
        const [a, b] = halfFrom(f, h)
        const [c, d] = halfFrom(g, o)
        // The neighbour must run the shared edge the other way once both flips are applied: s(g) = s(f) xor (same original direction).
        flip[g] = ((a === c && b === d) ? 1 : 0) ^ flip[f]!
        component[g] = id
        members.push(g)
      }
    }
    components.push(members)
  }
  // Apply flips to the face list.
  let flipped = 0
  for (let f = 0; f < faces; f++) if (flip[f]) { const b = t[f * 3 + 1]!; t[f * 3 + 1] = t[f * 3 + 2]!; t[f * 3 + 2] = b; flipped++ }
  adj = adjacency(t, V)
  // 4. holes: directed boundary half-edges form loops (the existing face runs u->v, the patch must run v->u)
  const extraPositions: number[] = []
  const added: number[] = []
  let holesFilled = 0, holeTriangles = 0
  const holesSkipped: string[] = []
  if (options.fillHoles !== false && adj.open > 0) {
    const maxEdges = options.maxHoleEdges ?? 256
    const outgoing = new Map<number, number[]>()
    let boundaryHalf = 0
    for (let h = 0; h < t.length; h++) {
      if (adj.twin[h]! >= 0 || adj.bad[h]) continue
      const f = Math.floor(h / 3)
      const [u, v] = halfFrom(f, h)
      const list = outgoing.get(u)
      if (list === undefined) outgoing.set(u, [v]); else list.push(v)
      boundaryHalf++
    }
    const used = new Set<number>()
    const usedKey = (u: number, v: number): number => u * V + v
    let loopNo = 0
    for (const [start, firsts] of [...outgoing]) {
      for (const first of firsts) {
        if (used.has(usedKey(start, first))) continue
        checkAbort()
        loopNo++
        const loop: number[] = [start]
        used.add(usedKey(start, first))
        let cur = first
        let closed = false
        let guard = boundaryHalf + 2
        while (guard-- > 0) {
          if (cur === start) { closed = true; break }
          loop.push(cur)
          const outs = outgoing.get(cur)
          const nextV = outs?.find((w) => !used.has(usedKey(cur, w)))
          if (nextV === undefined) break
          used.add(usedKey(cur, nextV))
          cur = nextV
        }
        if (!closed) { holesSkipped.push(`boundary ${loopNo}: the open edges do not form a closed loop (${loop.length} edges)`); continue }
        if (loop.length > maxEdges) { holesSkipped.push(`boundary ${loopNo}: ${loop.length} edges, more than the ${maxEdges} that are filled`); continue }
        const reversed = loop.slice().reverse()
        const ears = earClip(p, reversed)
        if (ears === undefined) { holesSkipped.push(`boundary ${loopNo}: ${loop.length} edges that cannot be triangulated on a plane`); continue }
        for (const [a, b, c] of ears) added.push(reversed[a]!, reversed[b]!, reversed[c]!)
        holesFilled++
        holeTriangles += ears.length
      }
    }
  }
  void extraPositions
  let finalTri = t
  if (added.length > 0) {
    finalTri = new Uint32Array(t.length + added.length)
    finalTri.set(t); finalTri.set(added, t.length)
  }
  faces = finalTri.length / 3
  adj = adjacency(finalTri, V)
  // Outward: a closed shell whose volume is negative is inside-out. This runs after the holes are filled, so a shell that was open
  // when the winding was made consistent is turned as well.
  let invertedShells = 0
  let shells = 0
  {
    const seenFace = new Uint8Array(faces)
    for (let s0 = 0; s0 < faces; s0++) {
      if (seenFace[s0]) continue
      shells++
      const members = [s0]
      seenFace[s0] = 1
      let shellClosed = true
      for (let head = 0; head < members.length; head++) {
        const f = members[head]!
        for (let k = 0; k < 3; k++) {
          const o = adj.twin[f * 3 + k]!
          if (o < 0) { shellClosed = false; continue }
          const g = Math.floor(o / 3)
          if (!seenFace[g]) { seenFace[g] = 1; members.push(g) }
        }
      }
      if (shellClosed && shellVolume(p, finalTri, members) < 0) {
        for (const f of members) { const b = finalTri[f * 3 + 1]!; finalTri[f * 3 + 1] = finalTri[f * 3 + 2]!; finalTri[f * 3 + 2] = b }
        flipped += members.length
        invertedShells++
      }
    }
  }
  if (invertedShells > 0) adj = adjacency(finalTri, V)

  // Compact: drop vertices no face uses.
  const usedVertex = new Uint8Array(V)
  for (const v of finalTri) usedVertex[v] = 1
  const remap = new Uint32Array(V)
  let nv = 0
  for (let v = 0; v < V; v++) if (usedVertex[v]) remap[v] = nv++
  const outPositions = new Float64Array(nv * 3)
  for (let v = 0; v < V; v++) if (usedVertex[v]) outPositions.set(p.subarray(v * 3, v * 3 + 3), remap[v]! * 3)
  const outIndices = new Uint32Array(finalTri.length)
  for (let i = 0; i < finalTri.length; i++) outIndices[i] = remap[finalTri[i]!]!

  const closed = faces > 0 && adj.open === 0 && adj.nonManifold === 0
  const all = Array.from({ length: faces }, (_, f) => f)
  const volume = closed ? shellVolume(outPositions, outIndices, all) : 0
  // 5. self-intersections
  const selfIntersections = options.checkSelfIntersections === false || faces === 0 ? undefined : countSelfIntersections(outPositions, outIndices, options.selfIntersectionBudget ?? 5_000_000, options.signal)
  if (selfIntersections !== undefined && selfIntersections.pairs > 0) problems.push(`${selfIntersections.complete ? "" : "at least "}${selfIntersections.pairs} pair(s) of triangles cross each other: the shell intersects itself and is not repaired`)
  if (selfIntersections !== undefined && !selfIntersections.complete) problems.push(`the self-intersection search stopped after ${selfIntersections.examined} pairs (budget): the result is a lower bound`)
  if (adj.nonManifold > 0) problems.push(`${adj.nonManifold} edge(s) are shared by three or more faces: not repaired`)
  if (adj.open > 0) problems.push(`${adj.open} open edge(s) remain`)
  for (const h of holesSkipped) problems.push(`hole left open: ${h}`)
  if (faces === 0) problems.push("no triangle is left after removing the degenerate ones")
  if (closed && volume <= 0) problems.push("the closed shell encloses no volume")

  const changed = weldedVertices > 0 || degenerate > 0 || duplicate > 0 || internal > 0 || flipped > 0 || holesFilled > 0
  const unrepairable = !closed || volume <= 0 || adj.nonManifold > 0
  const report: RepairReport = {
    inputTriangles: inFaces, outputTriangles: faces, inputVertices: vCount, outputVertices: nv, weldedVertices, degenerateRemoved: degenerate,
    duplicateRemoved: duplicate, internalRemoved: internal, flippedTriangles: flipped, invertedShells, holesFilled, holeTriangles, holesSkipped,
    nonManifoldEdges: adj.nonManifold, openEdges: adj.open, shells, selfIntersections, closed, volume,
    status: unrepairable ? "unrepairable" : changed ? "repaired" : "clean", problems
  }
  return { mesh: { positions: outPositions, indices: outIndices }, report }
}
