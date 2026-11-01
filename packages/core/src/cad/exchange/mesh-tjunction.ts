/**
 * T-junctions: two faces that share an edge but sample it differently leave a crack in the mesh. One face has a vertex in the
 * middle of the edge, the other runs straight past it. The surface is closed; only the triangles do not meet.
 *
 * The cure is to split the triangle that runs past: a vertex that lies on its open edge becomes a corner of it. The geometry does
 * not move (the vertex is on the edge already), so the volume and the area are unchanged and the mesh closes exactly. A crack whose
 * two sides are different curves (the vertex is off the chord) is not a T-junction and is left for the hole filler.
 *
 * A triangle with no area (a repeated corner, or three collinear points: the filler some tessellators put between a split edge and a
 * whole one) is dropped first, as it covers nothing; the edges it leaves open are then T-junctions like the others.
 */
import { meshTopology } from "../mesh-topology.ts"
import type { MeshData } from "./mesh-repair.ts"

export interface TJunctionResult {
  readonly mesh: MeshData
  /** Open edges that had vertices of other faces on them and were split. */
  readonly splitEdges: number
  /** Triangles the splits added. */
  readonly addedTriangles: number
}

export interface TJunctionOptions {
  /** How far from an edge a vertex may be and still sit on it, mm. Default 1e-5 of the bounding-box diagonal. */
  readonly tolerance?: number
  /** Passes over the mesh (a triangle with two cracked edges is split once per pass). Default 4. */
  readonly passes?: number
  /** Edge x vertex tests the search may spend; over it the mesh is returned as it is. Default 4e7. */
  readonly budget?: number
}

/** Whether the triangle `(a, b, c)` covers no area: a repeated corner, or corners on one line (exactly, as `meshTopology` counts them). */
const hasNoArea = (P: ArrayLike<number>, a: number, b: number, c: number): boolean => {
  if (a === b || b === c || a === c) return true
  const ux = P[b * 3]! - P[a * 3]!, uy = P[b * 3 + 1]! - P[a * 3 + 1]!, uz = P[b * 3 + 2]! - P[a * 3 + 2]!
  const vx = P[c * 3]! - P[a * 3]!, vy = P[c * 3 + 1]! - P[a * 3 + 1]!, vz = P[c * 3 + 2]! - P[a * 3 + 2]!
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) === 0
}

const diagonal = (p: ArrayLike<number>): number => {
  let lx = Infinity, ly = Infinity, lz = Infinity, hx = -Infinity, hy = -Infinity, hz = -Infinity
  for (let i = 0; i + 2 < p.length; i += 3) {
    lx = Math.min(lx, p[i]!); hx = Math.max(hx, p[i]!); ly = Math.min(ly, p[i + 1]!); hy = Math.max(hy, p[i + 1]!); lz = Math.min(lz, p[i + 2]!); hz = Math.max(hz, p[i + 2]!)
  }
  const d = Math.hypot(hx - lx, hy - ly, hz - lz)
  return Number.isFinite(d) ? d : 0
}

interface OpenEdge { readonly tri: number; readonly from: number; readonly to: number }

/** The edges used by one triangle only, with the triangle and the direction it uses them in. */
const openEdges = (indices: ReadonlyArray<number>, vertices: number): OpenEdge[] => {
  const seen = new Map<number, { count: number; tri: number; from: number; to: number }>()
  for (let t = 0; t * 3 < indices.length; t++) {
    for (let k = 0; k < 3; k++) {
      const a = indices[t * 3 + k]!, b = indices[t * 3 + (k + 1) % 3]!
      const key = a < b ? a * vertices + b : b * vertices + a
      const e = seen.get(key)
      if (e === undefined) seen.set(key, { count: 1, tri: t, from: a, to: b })
      else e.count++
    }
  }
  return [...seen.values()].filter((e) => e.count === 1).map(({ tri, from, to }) => ({ tri, from, to }))
}

/** Splits the triangles of a mesh at the vertices that lie on their open edges (see the module comment). The input is not modified. */
export const splitTJunctions = (mesh: MeshData, options: TJunctionOptions = {}): TJunctionResult => {
  const P = mesh.positions
  const vertices = P.length / 3
  const tol = options.tolerance ?? Math.max(1e-9, 1e-5 * diagonal(P))
  let indices: number[] = []
  for (let t = 0; t * 3 < mesh.indices.length; t++) {
    const a = mesh.indices[t * 3]!, b = mesh.indices[t * 3 + 1]!, c = mesh.indices[t * 3 + 2]!
    if (!hasNoArea(P, a, b, c)) indices.push(a, b, c)
  }
  let splitEdges = 0, added = 0
  let spent = 0
  const budget = options.budget ?? 4e7
  for (let pass = 0; pass < (options.passes ?? 4); pass++) {
    const open = openEdges(indices, vertices)
    if (open.length === 0) break
    const boundary = [...new Set(open.flatMap((e) => [e.from, e.to]))]
    spent += open.length * boundary.length
    if (spent > budget) break
    const splitAt = new Map<number, { readonly edge: OpenEdge; readonly chain: number[] }>()
    for (const edge of open) {
      if (splitAt.has(edge.tri)) continue // one edge of a triangle per pass; the others wait for the next one
      const ax = P[edge.from * 3]!, ay = P[edge.from * 3 + 1]!, az = P[edge.from * 3 + 2]!
      const dx = P[edge.to * 3]! - ax, dy = P[edge.to * 3 + 1]! - ay, dz = P[edge.to * 3 + 2]! - az
      const len2 = dx * dx + dy * dy + dz * dz
      if (!(len2 > 0)) continue
      const hits: Array<{ readonly v: number; readonly s: number }> = []
      for (const v of boundary) {
        if (v === edge.from || v === edge.to) continue
        const px = P[v * 3]! - ax, py = P[v * 3 + 1]! - ay, pz = P[v * 3 + 2]! - az
        const s = (px * dx + py * dy + pz * dz) / len2
        if (!(s > 1e-9 && s < 1 - 1e-9)) continue
        const ex = px - s * dx, ey = py - s * dy, ez = pz - s * dz
        if (ex * ex + ey * ey + ez * ez <= tol * tol) hits.push({ v, s })
      }
      if (hits.length === 0) continue
      hits.sort((p, q) => p.s - q.s)
      splitAt.set(edge.tri, { edge, chain: [edge.from, ...hits.map((h) => h.v), edge.to] })
    }
    if (splitAt.size === 0) break
    const next: number[] = []
    for (let t = 0; t * 3 < indices.length; t++) {
      const split = splitAt.get(t)
      if (split === undefined) { next.push(indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!); continue }
      // The triangle turned so that the open edge runs first: (from, to, apex). Each piece keeps the winding.
      const tri = [indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!]
      const k = [0, 1, 2].find((i) => tri[i] === split.edge.from && tri[(i + 1) % 3] === split.edge.to)!
      const apex = tri[(k + 2) % 3]!
      for (let i = 0; i + 1 < split.chain.length; i++) if (!hasNoArea(P, split.chain[i]!, split.chain[i + 1]!, apex)) next.push(split.chain[i]!, split.chain[i + 1]!, apex)
      splitEdges++
      added += split.chain.length - 2
    }
    indices = next
  }
  return { mesh: { positions: mesh.positions, indices: Uint32Array.from(indices) }, splitEdges, addedTriangles: added }
}

/** Whether splitting the T-junctions of a mesh closes it (the mesh is returned either way). */
export const closeByTJunctions = (mesh: MeshData, options: TJunctionOptions = {}): TJunctionResult & { readonly closed: boolean } => {
  const result = splitTJunctions(mesh, options)
  return { ...result, closed: result.splitEdges > 0 && meshTopology(result.mesh).solid }
}
