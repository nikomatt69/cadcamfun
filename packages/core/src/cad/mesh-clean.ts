/**
 * From a soup of planar polygons to a clean closed triangle mesh: the step every Boolean, and every generator that glues pieces
 * together, needs before its result can be trusted, rendered smoothly, exported to STL or machined.
 *
 * 1. Weld: vertices closer than the tolerance become one (a grid hash looking at the 27 neighbouring cells, so two points on either
 *    side of a cell border are still found).
 * 2. T-junctions: where a polygon was split and its neighbour was not, the neighbour's edge runs past a vertex of the split one. The
 *    edges that have no twin (an opposite edge with the same ends) are the only ones that can be affected; each gets the vertices
 *    that lie on it inserted, so every edge of the result meets exactly one other.
 * 3. Coplanar faces: polygons that share an edge and lie on the same plane, facing the same way, are one face. Its boundary loops
 *    (the edges with no twin inside the face) are traced, sorted into outer rings and holes, and triangulated afresh with
 *    `triangulatePolygonChecked`. A BSP Boolean leaves hundreds of slivers on a face cut by a cylinder's facets; this gives the face
 *    back as a few triangles. If a face's loops cannot be triangulated to exactly its area, its polygons are kept as they were.
 * 4. Whatever is not a triangle yet is triangulated keeping all its vertices, so no T-junction comes back.
 *
 * Geometry never moves: the result's vertices are input vertices (welded), so volume and outline are those of the input.
 */
import type { Vec2 } from "./vec.ts"
import { triangulatePolygonChecked } from "./triangulate.ts"
import type { Mesh } from "./solid.ts"

export interface V3 { readonly x: number; readonly y: number; readonly z: number }

/** A polygon soup: `positions` holds x, y, z per vertex; each polygon lists its vertex indices counter-clockwise seen from outside. */
export interface PolygonSoup {
  readonly positions: ReadonlyArray<number>
  readonly polygons: ReadonlyArray<ReadonlyArray<number>>
}

export interface CleanOptions {
  /** Vertices closer than this are one, and a vertex this close to an edge lies on it, mm. Default 1e-7 of the soup's extent. */
  readonly tolerance?: number
  /** Merge coplanar neighbouring polygons into one re-triangulated face (default true). */
  readonly mergeCoplanar?: boolean
  /**
   * Close the holes narrower than this, mm (default 0: none): mean width (4 area / perimeter) under it, length under 500 times it.
   * A Boolean of nearly tangent faces can leave cracks a fraction of a micrometre wide between slivers; they are filled, a real
   * opening is far wider and left alone.
   */
  readonly fillHolesUpTo?: number
}

// ---------------------------------------------------------------- weld

/** Welds points closer than `tol`: returns the kept positions and, for each input point, its index among them. */
export const weldPoints = (xyz: ArrayLike<number>, tol: number): { positions: number[]; map: Int32Array } => {
  const count = Math.floor(xyz.length / 3)
  const map = new Int32Array(count)
  const positions: number[] = []
  const grid = new Map<number, number[]>()
  // Cells are hashed to a number; two cells sharing a hash share a bucket, which only costs a distance check.
  const cellKey = (x: number, y: number, z: number): number => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) | 0
  const inv = 1 / tol, tol2 = tol * tol
  for (let i = 0; i < count; i++) {
    const x = xyz[i * 3]!, y = xyz[i * 3 + 1]!, z = xyz[i * 3 + 2]!
    const cx = Math.floor(x * inv), cy = Math.floor(y * inv), cz = Math.floor(z * inv)
    let found = -1
    search: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const bucket = grid.get(cellKey(cx + dx, cy + dy, cz + dz))
      if (bucket === undefined) continue
      for (const k of bucket) {
        const ex = positions[k * 3]! - x, ey = positions[k * 3 + 1]! - y, ez = positions[k * 3 + 2]! - z
        if (ex * ex + ey * ey + ez * ez <= tol2) { found = k; break search }
      }
    }
    if (found < 0) {
      found = positions.length / 3
      positions.push(x, y, z)
      const key = cellKey(cx, cy, cz)
      const bucket = grid.get(key)
      if (bucket === undefined) grid.set(key, [found])
      else bucket.push(found)
    }
    map[i] = found
  }
  return { positions, map }
}

// ---------------------------------------------------------------- helpers

const P = (pos: ReadonlyArray<number>, i: number): V3 => ({ x: pos[i * 3]!, y: pos[i * 3 + 1]!, z: pos[i * 3 + 2]! })
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const len = (a: V3): number => Math.hypot(a.x, a.y, a.z)

/** Newell normal of a polygon: twice its vector area, pointing out of its counter-clockwise side. */
export const newellNormal = (pos: ReadonlyArray<number>, poly: ReadonlyArray<number>): V3 => {
  let x = 0, y = 0, z = 0
  for (let k = 0; k < poly.length; k++) {
    const a = P(pos, poly[k]!), b = P(pos, poly[(k + 1) % poly.length]!)
    x += (a.y - b.y) * (a.z + b.z)
    y += (a.z - b.z) * (a.x + b.x)
    z += (a.x - b.x) * (a.y + b.y)
  }
  return { x, y, z }
}

/** Removes consecutive repeats (and a closing repeat) from a welded index loop. */
const dedupe = (poly: ReadonlyArray<number>): number[] => {
  const out: number[] = []
  for (const i of poly) if (out.length === 0 || out[out.length - 1] !== i) out.push(i)
  while (out.length > 1 && out[0] === out[out.length - 1]) out.pop()
  return out
}

/** True when every vertex of the polygon lies within `tol` of the line through its two farthest vertices: it has no area. */
const isFlat = (pos: ReadonlyArray<number>, poly: ReadonlyArray<number>, tol: number): boolean => {
  if (poly.length < 3) return true
  let a = poly[0]!, b = poly[1]!, best = -1
  for (let i = 0; i < poly.length; i++) for (let j = i + 1; j < poly.length; j++) {
    const d = len(sub(P(pos, poly[i]!), P(pos, poly[j]!)))
    if (d > best) { best = d; a = poly[i]!; b = poly[j]! }
  }
  if (best <= tol) return true
  const pa = P(pos, a), ab = sub(P(pos, b), pa)
  for (const i of poly) if (len(cross(ab, sub(P(pos, i), pa))) / best > tol) return false
  return true
}

const edgeKey = (a: number, b: number): number => a * 0x4000000 + b

// ---------------------------------------------------------------- T-junctions

/**
 * Inserts into every polygon edge that has no twin the vertices lying on it (within `tol`, strictly between its ends). Returns new
 * polygons; vertex indices are those of `pos`.
 */
export const fixTJunctions = (pos: ReadonlyArray<number>, polygons: ReadonlyArray<ReadonlyArray<number>>, tol: number): number[][] => {
  let polys = polygons.map((p) => [...p])
  for (let pass = 0; pass < 4; pass++) {
    const edges = new Map<number, number>()
    for (const p of polys) for (let k = 0; k < p.length; k++) {
      const key = edgeKey(p[k]!, p[(k + 1) % p.length]!)
      edges.set(key, (edges.get(key) ?? 0) + 1)
    }
    const open = (a: number, b: number): boolean => (edges.get(edgeKey(b, a)) ?? 0) < (edges.get(edgeKey(a, b)) ?? 0)
    const candidates = new Set<number>()
    for (const p of polys) for (let k = 0; k < p.length; k++) {
      const a = p[k]!, b = p[(k + 1) % p.length]!
      if (open(a, b)) { candidates.add(a); candidates.add(b) }
    }
    if (candidates.size === 0) return polys
    const cand = [...candidates]
    // A uniform grid over the candidate vertices; a long edge that would visit too many cells checks them all instead.
    let lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
    for (const i of cand) {
      const v = P(pos, i)
      lo = { x: Math.min(lo.x, v.x), y: Math.min(lo.y, v.y), z: Math.min(lo.z, v.z) }
      hi = { x: Math.max(hi.x, v.x), y: Math.max(hi.y, v.y), z: Math.max(hi.z, v.z) }
    }
    const span = Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, tol)
    const cell = Math.max(span / Math.max(1, Math.cbrt(cand.length) * 2), tol * 4)
    const grid = new Map<number, number[]>()
    const ci = (v: number, o: number) => Math.floor((v - o) / cell)
    const cellKey = (x: number, y: number, z: number): number => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) | 0
    for (const i of cand) {
      const v = P(pos, i)
      const key = cellKey(ci(v.x, lo.x), ci(v.y, lo.y), ci(v.z, lo.z))
      const bucket = grid.get(key)
      if (bucket === undefined) grid.set(key, [i])
      else bucket.push(i)
    }
    const near = (a: V3, b: V3): number[] => {
      const x0 = ci(Math.min(a.x, b.x) - tol, lo.x), x1 = ci(Math.max(a.x, b.x) + tol, lo.x)
      const y0 = ci(Math.min(a.y, b.y) - tol, lo.y), y1 = ci(Math.max(a.y, b.y) + tol, lo.y)
      const z0 = ci(Math.min(a.z, b.z) - tol, lo.z), z1 = ci(Math.max(a.z, b.z) + tol, lo.z)
      if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > grid.size) return cand
      const out: number[] = []
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const bucket = grid.get(cellKey(x, y, z))
        if (bucket !== undefined) for (const i of bucket) out.push(i)
      }
      return out
    }
    let changed = false
    polys = polys.map((p) => {
      const out: number[] = []
      for (let k = 0; k < p.length; k++) {
        const a = p[k]!, b = p[(k + 1) % p.length]!
        out.push(a)
        if (!open(a, b)) continue
        const pa = P(pos, a), pb = P(pos, b), ab = sub(pb, pa), l2 = dot(ab, ab)
        if (l2 <= tol * tol) continue
        const l = Math.sqrt(l2)
        const hits: Array<[number, number]> = []
        for (const i of near(pa, pb)) {
          if (i === a || i === b) continue
          const ap = sub(P(pos, i), pa)
          const t = dot(ap, ab) / l2
          if (t * l <= tol || (1 - t) * l <= tol) continue
          if (len(cross(ab, ap)) / l <= tol) hits.push([t, i])
        }
        if (hits.length === 0) continue
        hits.sort((u, v) => u[0] - v[0])
        for (const [, i] of hits) if (out[out.length - 1] !== i) out.push(i)
        changed = true
      }
      return dedupe(out)
    })
    if (!changed) return polys
  }
  return polys
}

// ---------------------------------------------------------------- coplanar faces

class UnionFind {
  readonly parent: Int32Array
  constructor(n: number) { this.parent = Int32Array.from({ length: n }, (_, i) => i) }
  find(i: number): number {
    let r = i
    while (this.parent[r] !== r) r = this.parent[r]!
    while (this.parent[i] !== r) { const next = this.parent[i]!; this.parent[i] = r; i = next }
    return r
  }
  union(a: number, b: number): void { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.parent[rb] = ra }
}

interface Basis { readonly o: V3; readonly u: V3; readonly v: V3; readonly n: V3 }
const basisOf = (n0: V3, o: V3): Basis => {
  const l = len(n0)
  const n = { x: n0.x / l, y: n0.y / l, z: n0.z / l }
  const a = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  const u0 = cross(a, n), lu = len(u0)
  const u = { x: u0.x / lu, y: u0.y / lu, z: u0.z / lu }
  return { o, u, v: cross(n, u), n }
}
const to2 = (b: Basis, p: V3): Vec2 => { const d = sub(p, b.o); return { x: dot(d, b.u), y: dot(d, b.v) } }
const area2 = (ring: ReadonlyArray<Vec2>): number => {
  let s = 0
  for (let i = 0; i < ring.length; i++) { const p = ring[i]!, q = ring[(i + 1) % ring.length]!; s += p.x * q.y - q.x * p.y }
  return s / 2
}
const insideRing = (ring: ReadonlyArray<Vec2>, p: Vec2): boolean => {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** The boundary loops of a set of polygons: the directed edges without a twin in the set, chained so that touching loops stay apart. */
const boundaryLoops = (pos: ReadonlyArray<number>, polys: ReadonlyArray<ReadonlyArray<number>>, basis: Basis): number[][] | undefined => {
  const count = new Map<number, number>()
  for (const p of polys) for (let k = 0; k < p.length; k++) {
    const key = edgeKey(p[k]!, p[(k + 1) % p.length]!)
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  const out = new Map<number, number[]>()
  let edges = 0
  const seen = new Set<number>()
  for (const p of polys) for (let k = 0; k < p.length; k++) {
    const a = p[k]!, b = p[(k + 1) % p.length]!
    if (seen.has(edgeKey(a, b))) continue
    seen.add(edgeKey(a, b))
    // An edge is boundary as many times as it outnumbers its twin.
    for (let s = (count.get(edgeKey(a, b)) ?? 0) - (count.get(edgeKey(b, a)) ?? 0); s > 0; s--) {
      const list = out.get(a)
      if (list === undefined) out.set(a, [b])
      else list.push(b)
      edges++
    }
  }
  const loops: number[][] = []
  const flat = new Map<number, Vec2>()
  const at = (i: number): Vec2 => { let q = flat.get(i); if (q === undefined) { q = to2(basis, P(pos, i)); flat.set(i, q) } return q }
  let guard = edges + 1
  for (const [start] of out) {
    while ((out.get(start)?.length ?? 0) > 0) {
      const loop: number[] = [start]
      let prev = start, cur = out.get(start)!.pop()!
      while (cur !== start) {
        if (--guard < 0) return undefined
        loop.push(cur)
        const next = out.get(cur)
        if (next === undefined || next.length === 0) return undefined
        let pick = 0
        if (next.length > 1) {
          // The smallest clockwise turn from the way back: the loop keeps the face on its left and does not cross into another.
          const c = at(cur), back = at(prev)
          const d0 = { x: back.x - c.x, y: back.y - c.y }
          let best = Infinity
          for (let k = 0; k < next.length; k++) {
            const q = at(next[k]!)
            const d1 = { x: q.x - c.x, y: q.y - c.y }
            const ccw = Math.atan2(d0.x * d1.y - d0.y * d1.x, d0.x * d1.x + d0.y * d1.y)
            const cw = ccw < 0 ? -ccw : ccw === 0 ? 2 * Math.PI : 2 * Math.PI - ccw
            if (cw < best) { best = cw; pick = k }
          }
        }
        prev = cur
        cur = next.splice(pick, 1)[0]!
      }
      if (loop.length >= 3) loops.push(loop)
    }
  }
  return loops
}

/** Distance of `v` from the segment p-q when it projects strictly inside it, Infinity otherwise. */
const offSegment = (p: V3, q: V3, v: V3): number => {
  const pq = sub(q, p), l2 = dot(pq, pq)
  if (l2 === 0) return Infinity
  const t = dot(sub(v, p), pq) / l2
  return t > 0 && t < 1 ? len(cross(pq, sub(v, p))) / Math.sqrt(l2) : Infinity
}

/** A loop without the vertices lying (within `tol`) on the segment between their neighbours. */
const dropStraight = (pos: ReadonlyArray<number>, loop: ReadonlyArray<number>, tol: number): number[] => {
  const out = [...loop]
  for (let changed = true; changed && out.length > 3;) {
    changed = false
    for (let k = 0; k < out.length && out.length > 3; k++) {
      const p = out[(k + out.length - 1) % out.length]!, v = out[k]!, q = out[(k + 1) % out.length]!
      if (offSegment(P(pos, p), P(pos, q), P(pos, v)) <= tol) { out.splice(k, 1); k--; changed = true }
    }
  }
  return out
}

/** One face (coplanar polygons) triangulated from its boundary loops, or `undefined` when that cannot be done exactly. */
const retriangulateFace = (pos: ReadonlyArray<number>, polys: ReadonlyArray<ReadonlyArray<number>>, normal: V3, tol: number): number[][] | undefined => {
  const basis = basisOf(normal, P(pos, polys[0]![0]!))
  // Every vertex must lie on the face's plane: a chain of nearly coplanar neighbours may drift.
  for (const p of polys) for (const i of p) if (Math.abs(dot(sub(P(pos, i), basis.o), basis.n)) > tol) return undefined
  const raw = boundaryLoops(pos, polys, basis)
  if (raw === undefined || raw.length === 0) return undefined
  let expected = 0
  for (const p of polys) expected += area2(p.map((i) => to2(basis, P(pos, i))))
  const rawTotal = raw.reduce((s, loop) => s + area2(loop.map((i) => to2(basis, P(pos, i)))), 0)
  if (!(expected > 0) || Math.abs(rawTotal - expected) > 1e-6 * expected + tol * tol) return undefined
  // Vertices on a straight run of the boundary are left out: a nearly collinear triple would be cut off as a sliver, and the
  // neighbouring face (which drops them too) would cut the mirror sliver. Where another face needs one, the T-junction pass
  // puts it back into this face's edge.
  const loops: number[][] = []
  for (const loop of raw) {
    const kept = dropStraight(pos, loop, tol)
    if (kept.length >= 3) loops.push(kept)
  }
  if (loops.length === 0) return undefined
  const rings = loops.map((loop) => loop.map((i) => to2(basis, P(pos, i))))
  const areas = rings.map(area2)
  const outers = areas.map((a, k) => (a > 0 ? k : -1)).filter((k) => k >= 0)
  const holesOf = new Map<number, number[]>(outers.map((k) => [k, []]))
  for (let k = 0; k < rings.length; k++) {
    if (areas[k]! > 0) continue
    // The smallest outer ring that holds most of the hole's vertices.
    let owner = -1, ownerArea = Infinity
    for (const o of outers) {
      let votes = 0
      for (const q of rings[k]!) if (insideRing(rings[o]!, q)) votes++
      if (votes * 2 >= rings[k]!.length && areas[o]! < ownerArea) { owner = o; ownerArea = areas[o]! }
    }
    if (owner < 0) return undefined
    holesOf.get(owner)!.push(k)
  }
  const tris: number[][] = []
  for (const o of outers) {
    const holes = holesOf.get(o)!
    const ids = [...loops[o]!, ...holes.flatMap((h) => loops[h]!)]
    const t = triangulatePolygonChecked(rings[o]!, holes.map((h) => rings[h]!))
    if (t === undefined) return undefined
    for (const [a, b, c] of t) tris.push([ids[a]!, ids[b]!, ids[c]!])
  }
  return tris
}

/** Polygons merged into faces where they are coplanar neighbours facing the same way, each face re-triangulated. */
const mergeCoplanar = (pos: ReadonlyArray<number>, polys: ReadonlyArray<ReadonlyArray<number>>, tol: number): number[][] => {
  const normals = polys.map((p) => { const n = newellNormal(pos, p); const l = len(n); return { x: n.x / l, y: n.y / l, z: n.z / l } })
  const offsets = polys.map((p, k) => dot(normals[k]!, P(pos, p[0]!)))
  const owner = new Map<number, number>()
  for (let k = 0; k < polys.length; k++) {
    const p = polys[k]!
    for (let e = 0; e < p.length; e++) owner.set(edgeKey(p[e]!, p[(e + 1) % p.length]!), k)
  }
  const uf = new UnionFind(polys.length)
  for (let k = 0; k < polys.length; k++) {
    const p = polys[k]!
    for (let e = 0; e < p.length; e++) {
      const j = owner.get(edgeKey(p[(e + 1) % p.length]!, p[e]!))
      if (j === undefined || j === k) continue
      if (dot(normals[k]!, normals[j]!) > 1 - 1e-9 && Math.abs(offsets[k]! - offsets[j]!) <= tol) uf.union(k, j)
    }
  }
  const groups = new Map<number, number[]>()
  for (let k = 0; k < polys.length; k++) {
    const r = uf.find(k)
    const g = groups.get(r)
    if (g === undefined) groups.set(r, [k])
    else g.push(k)
  }
  const out: number[][] = []
  for (const g of groups.values()) {
    if (g.length === 1) { out.push([...polys[g[0]!]!]); continue }
    const members = g.map((k) => polys[k]!)
    let n = { x: 0, y: 0, z: 0 }
    for (const p of members) { const m = newellNormal(pos, p); n = { x: n.x + m.x, y: n.y + m.y, z: n.z + m.z } }
    const face = len(n) > 0 ? retriangulateFace(pos, members, n, tol) : undefined
    if (face === undefined) for (const p of members) out.push([...p])
    else out.push(...face)
  }
  return out
}

/**
 * A convex polygon (a partition fragment, or a triangle with vertices inserted on its edges) as triangles that use all its
 * vertices, collinear ones too, so no T-junction is made. Ears are cut at true corners only, and never so that what is left is
 * flat: a triangle a-m-b-c with m on a-b is cut at a or b, not at c.
 */
const triangulateKeepingVertices = (pos: ReadonlyArray<number>, poly: ReadonlyArray<number>, tol: number): number[][] => {
  if (poly.length === 3) return [[poly[0]!, poly[1]!, poly[2]!]]
  const n = newellNormal(pos, poly)
  const ring = [...poly]
  const out: number[][] = []
  let total = len(n) / 2
  while (ring.length > 3) {
    let cut = -1
    for (let k = 0; k < ring.length; k++) {
      const p = P(pos, ring[(k + ring.length - 1) % ring.length]!), v = P(pos, ring[k]!), q = P(pos, ring[(k + 1) % ring.length]!)
      const e = cross(sub(v, p), sub(q, v))
      if (dot(e, n) <= 0) continue
      const ear = len(e) / 2, pq = len(sub(q, p))
      // A true corner (off the line of its neighbours), and something with area left after it.
      if (pq === 0 || (2 * ear) / pq <= tol || total - ear <= tol * pq) continue
      cut = k
      total -= ear
      break
    }
    if (cut < 0) break
    const k = cut
    out.push([ring[(k + ring.length - 1) % ring.length]!, ring[k]!, ring[(k + 1) % ring.length]!])
    ring.splice(k, 1)
  }
  // What is left (if anything) is fanned from the vertex whose thinnest triangle is the thickest.
  let apex = 0, bestHeight = -1
  for (let s0 = 0; s0 < ring.length && ring.length > 3; s0++) {
    let thinnest = Infinity
    for (let k = 1; k + 1 < ring.length; k++) {
      const a = P(pos, ring[s0]!), b = P(pos, ring[(s0 + k) % ring.length]!), c = P(pos, ring[(s0 + k + 1) % ring.length]!)
      const twice = len(cross(sub(b, a), sub(c, a)))
      const longest = Math.max(len(sub(b, a)), len(sub(c, b)), len(sub(a, c)))
      thinnest = Math.min(thinnest, longest > 0 ? twice / longest : 0)
    }
    if (thinnest > bestHeight) { bestHeight = thinnest; apex = s0 }
  }
  for (let k = 1; k + 1 < ring.length; k++) out.push([ring[apex]!, ring[(apex + k) % ring.length]!, ring[(apex + k + 1) % ring.length]!])
  return out
}

/**
 * Fills, in place, the holes of a triangle list whose boundary loop is no wider than `size`. The boundary edges (no twin) are
 * chained into loops; each small loop is triangulated in its best-fit plane, turned so the new triangles use its edges the other way.
 */
const fillSmallHoles = (pos: ReadonlyArray<number>, indices: number[], size: number): void => {
  const count = new Map<number, number>()
  for (let t = 0; t + 2 < indices.length; t += 3) for (let e = 0; e < 3; e++) {
    const k = edgeKey(indices[t + e]!, indices[t + ((e + 1) % 3)]!)
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  const next = new Map<number, number[]>()
  for (const [k, n] of count) {
    const a = Math.floor(k / 0x4000000), b = k - a * 0x4000000
    for (let s = n - (count.get(edgeKey(b, a)) ?? 0); s > 0; s--) {
      const list = next.get(a)
      if (list === undefined) next.set(a, [b])
      else list.push(b)
    }
  }
  for (const [start] of next) {
    while ((next.get(start)?.length ?? 0) > 0) {
      const loop = [start]
      let cur = next.get(start)!.pop()!, ok = true
      while (cur !== start) {
        if (loop.length > 1024) { ok = false; break }
        loop.push(cur)
        const out = next.get(cur)
        if (out === undefined || out.length === 0) { ok = false; break }
        cur = out.pop()!
      }
      if (!ok || loop.length < 3) continue
      // A hole is small when it is narrow: its mean width (4 area / perimeter, the diameter of a round hole, twice the width of a
      // crack) is under `size`, and it is not long either (500 `size`), so a twisted large opening is never taken for a crack.
      let diameter = 0, perimeter = 0
      for (let i = 0; i < loop.length; i++) perimeter += len(sub(P(pos, loop[(i + 1) % loop.length]!), P(pos, loop[i]!)))
      for (let i = 0; i < loop.length && diameter <= 500 * size; i++) for (let j = i + 1; j < loop.length; j++) diameter = Math.max(diameter, len(sub(P(pos, loop[i]!), P(pos, loop[j]!))))
      const width = perimeter > 0 ? (4 * (len(newellNormal(pos, loop)) / 2)) / perimeter : 0
      if (diameter > 500 * size || width > size) continue
      const hole = [...loop].reverse()
      const n = newellNormal(pos, hole)
      let tris: ReadonlyArray<readonly [number, number, number]> | undefined
      if (len(n) > 0) {
        const basis = basisOf(n, P(pos, hole[0]!))
        tris = triangulatePolygonChecked(hole.map((i) => to2(basis, P(pos, i))))
      }
      if (tris === undefined) tris = Array.from({ length: hole.length - 2 }, (_, k) => [0, k + 1, k + 2] as const)
      for (const [a, b, c] of tris) if (hole[a] !== hole[b] && hole[b] !== hole[c] && hole[a] !== hole[c]) indices.push(hole[a]!, hole[b]!, hole[c]!)
    }
  }
}

/** Polygons without the pairs on the same vertices facing opposite ways: a flat pillow two slivers leave, enclosing nothing. */
const removePillows = (polys: ReadonlyArray<ReadonlyArray<number>>): number[][] => {
  const keep = polys.map(() => true)
  const byKey = new Map<string, number[]>()
  polys.forEach((p, k) => {
    const key = [...p].sort((a, b) => a - b).join(",")
    const list = byKey.get(key)
    if (list === undefined) byKey.set(key, [k])
    else list.push(k)
  })
  for (const list of byKey.values()) {
    if (list.length < 2) continue
    // Same vertex set: opposite when one is the other read backwards from the same start.
    const used = new Set<number>()
    for (const i of list) for (const j of list) {
      if (i >= j || used.has(i) || used.has(j)) continue
      const p = polys[i]!, q = polys[j]!
      if (p.length !== q.length) continue
      const s = q.indexOf(p[0]!)
      if (p.every((v, k) => q[(s - k + q.length * 2) % q.length] === v)) { used.add(i); used.add(j); keep[i] = false; keep[j] = false }
    }
  }
  return polys.filter((_, k) => keep[k]).map((p) => [...p])
}

/**
 * Collapses, in place, the edges shorter than `limit`: their two ends become one vertex (the lower index, which stays where it is),
 * and the triangles on the edge disappear. Unlike welding by distance this follows the surface, so two sheets that merely pass
 * close to each other are not glued. Two points a few tolerances apart are what is left of one corner computed twice.
 */
const collapseShortEdges = (pos: ReadonlyArray<number>, indices: number[], limit: number): void => {
  const parent = new Map<number, number>()
  const find = (i: number): number => {
    let r = i
    while (parent.has(r)) r = parent.get(r)!
    while (parent.has(i)) { const n = parent.get(i)!; if (n !== r) parent.set(i, r); i = n }
    return r
  }
  let any = false
  for (let t = 0; t + 2 < indices.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = indices[t + e]!, b = indices[t + ((e + 1) % 3)]!
    if (len(sub(P(pos, a), P(pos, b))) >= limit) continue
    const ra = find(a), rb = find(b)
    if (ra === rb) continue
    if (ra < rb) parent.set(rb, ra)
    else parent.set(ra, rb)
    any = true
  }
  if (!any) return
  const out: number[] = []
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = find(indices[t]!), b = find(indices[t + 1]!), c = find(indices[t + 2]!)
    if (a !== b && b !== c && a !== c) out.push(a, b, c)
  }
  indices.length = 0
  for (const i of out) indices.push(i)
}

/**
 * Removes, in place, the triangles that cover nothing while keeping the surface closed: flat triangles (all three vertices on one
 * line, within `tol`) and opposite pairs go, then the T-junction pass puts the vertices they had into the edges of their neighbours
 * (a cap a-c-b with c on a-b leaves its neighbour across a-b with c inserted), and the polygons that made are split keeping all
 * their vertices. Repeated while that leaves flat triangles, at most three times.
 */
const removeDegenerate = (pos: ReadonlyArray<number>, indices: number[], tol: number): void => {
  // Flat means flat to the precision of the coordinates (a tenth of the weld distance): a thin sliver is still a triangle.
  const flat = (t: ReadonlyArray<number>): boolean => isFlat(pos, t, tol / 10)
  for (let round = 0; round < 3; round++) {
    collapseShortEdges(pos, indices, 4 * tol)
    let polys: number[][] = []
    let degenerate = false
    for (let t = 0; t + 2 < indices.length; t += 3) {
      const tri = [indices[t]!, indices[t + 1]!, indices[t + 2]!]
      if (flat(tri)) degenerate = true
      else polys.push(tri)
    }
    const before = polys.length
    polys = removePillows(polys)
    if (!degenerate && polys.length === before) return
    polys = fixTJunctions(pos, polys, tol)
    indices.length = 0
    for (const p of polys) for (const [a, b, c] of triangulateKeepingVertices(pos, p, tol / 10)) if (a !== b && b !== c && a !== c) indices.push(a!, b!, c!)
  }
}

/** Bounding-box diagonal scale of a flat xyz array. */
const extentOf = (xyz: ArrayLike<number>): number => {
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < xyz.length; i++) { const v = xyz[i]!; if (v < lo) lo = v; if (v > hi) hi = v }
  return Number.isFinite(hi - lo) ? Math.max(hi - lo, 1e-9) : 1
}

/** A polygon soup as a clean triangle mesh (see the module comment). */
export const cleanPolygonSoup = (soup: PolygonSoup, options: CleanOptions = {}): Mesh => {
  const tol = options.tolerance ?? 1e-7 * extentOf(soup.positions)
  const { positions: pos, map } = weldPoints(soup.positions, tol)
  let polys: number[][] = []
  for (const p of soup.polygons) {
    const q = dedupe(p.map((i) => map[i]!))
    if (q.length >= 3 && !isFlat(pos, q, tol)) polys.push(q)
  }
  polys = fixTJunctions(pos, polys, tol)
  if (options.mergeCoplanar !== false) {
    polys = mergeCoplanar(pos, polys, tol)
    polys = fixTJunctions(pos, polys, tol)
  }
  const indices: number[] = []
  for (const p of polys) for (const [a, b, c] of triangulateKeepingVertices(pos, p, tol / 10)) if (a !== b && b !== c && a !== c) indices.push(a!, b!, c!)
  if ((options.fillHolesUpTo ?? 0) > 0) fillSmallHoles(pos, indices, options.fillHolesUpTo!)
  removeDegenerate(pos, indices, tol)
  // Only the vertices the triangles use are kept.
  const used = new Int32Array(pos.length / 3).fill(-1)
  const out: number[] = []
  for (const i of indices) if (used[i] === -1) { used[i] = out.length / 3; out.push(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!) }
  return { positions: Float32Array.from(out), indices: Uint32Array.from(indices, (i) => used[i]!) }
}

/** A triangle mesh cleaned the same way: welded, T-junctions closed, coplanar triangles merged into faces and re-triangulated. */
export const cleanMesh = (mesh: Mesh, options: CleanOptions = {}): Mesh => {
  const polygons: number[][] = []
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) polygons.push([mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!])
  return cleanPolygonSoup({ positions: Array.from(mesh.positions), polygons }, options)
}
