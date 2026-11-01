/**
 * Repair of an imported triangle mesh (spec 50 X8): weld coincident vertices, drop degenerate and duplicate triangles, make the
 * orientation of every shell consistent and outward, and close small holes. The result carries a defect report measured before and
 * after, so an import is either a closed manifold or comes back with the list of what is still wrong. Nothing is guessed: a hole is
 * only filled when it is a simple loop of at most `maxHoleEdges` edges, and a non-manifold edge is reported, never "fixed".
 *
 * Positions are doubles in millimetres throughout (no Float32 narrowing of the model).
 */
import { weldPoints } from "../mesh-clean.ts"
import { meshTopology, type MeshTopology } from "../mesh-topology.ts"

export interface MeshData {
  readonly positions: Float64Array
  readonly indices: Uint32Array
}

export interface RepairOptions {
  /** Vertices closer than this are one, mm. Default 1e-6 of the bounding-box diagonal (at least 1e-9). */
  readonly tolerance?: number
  /** Orient every shell consistently and outward (default true). */
  readonly orient?: boolean
  /** Fill boundary loops of at most this many edges (default 0: none). */
  readonly maxHoleEdges?: number
  /** Do not fill a loop wider than this, mm (default infinite). */
  readonly maxHoleDiameter?: number
}

export interface MeshDefects {
  readonly weldedVertices: number
  readonly degenerateTriangles: number
  readonly duplicateTriangles: number
  readonly flippedTriangles: number
  readonly filledHoles: number
  readonly filledTriangles: number
  readonly boundaryEdges: number
  readonly nonManifoldEdges: number
  readonly misorientedEdges: number
  readonly shells: number
  /** Shells whose faces point inward and were turned over. */
  readonly invertedShells: number
}

export interface MeshReport {
  readonly before: MeshTopology
  readonly after: MeshTopology
  /** What was repaired (counts), and what is still wrong (`boundaryEdges`, `nonManifoldEdges`, `misorientedEdges` of the result). */
  readonly defects: MeshDefects
  /** Human-readable list of what is still wrong; empty for a closed solid. */
  readonly remaining: ReadonlyArray<string>
}

const diagonal = (p: ArrayLike<number>): number => {
  let lx = Infinity, ly = Infinity, lz = Infinity, hx = -Infinity, hy = -Infinity, hz = -Infinity
  for (let i = 0; i + 2 < p.length; i += 3) {
    lx = Math.min(lx, p[i]!); hx = Math.max(hx, p[i]!); ly = Math.min(ly, p[i + 1]!); hy = Math.max(hy, p[i + 1]!); lz = Math.min(lz, p[i + 2]!); hz = Math.max(hz, p[i + 2]!)
  }
  const d = Math.hypot(hx - lx, hy - ly, hz - lz)
  return Number.isFinite(d) ? d : 0
}

const ek = (a: number, b: number): number => a * 0x4000000 + b

/** Repairs a mesh (see the module comment). The input is not modified. */
export const repairMesh = (mesh: MeshData, options: RepairOptions = {}): { readonly mesh: MeshData; readonly report: MeshReport } => {
  const before = meshTopology(mesh)
  const tol = options.tolerance ?? Math.max(1e-9, 1e-6 * diagonal(mesh.positions))
  const { positions: weldedPos, map } = weldPoints(mesh.positions, tol)
  const weldedVertices = mesh.positions.length / 3 - weldedPos.length / 3
  const P = Float64Array.from(weldedPos)

  // Triangles: remap, drop degenerate (repeated vertex or no area) and exact duplicates (same vertex cycle).
  const tri: number[] = []
  const seen = new Set<string>()
  let degenerate = 0, duplicate = 0
  const area2 = (a: number, b: number, c: number): number => {
    const ux = P[b * 3]! - P[a * 3]!, uy = P[b * 3 + 1]! - P[a * 3 + 1]!, uz = P[b * 3 + 2]! - P[a * 3 + 2]!
    const vx = P[c * 3]! - P[a * 3]!, vy = P[c * 3 + 1]! - P[a * 3 + 1]!, vz = P[c * 3 + 2]! - P[a * 3 + 2]!
    return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
  }
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const a = map[mesh.indices[t]!]!, b = map[mesh.indices[t + 1]!]!, c = map[mesh.indices[t + 2]!]!
    if (a === b || b === c || a === c || area2(a, b, c) <= tol * tol) { degenerate++; continue }
    // Cycle-normalised key: rotate so the smallest index is first (orientation kept).
    const m = Math.min(a, b, c)
    const key = m === a ? `${a},${b},${c}` : m === b ? `${b},${c},${a}` : `${c},${a},${b}`
    if (seen.has(key)) { duplicate++; continue }
    seen.add(key)
    tri.push(a, b, c)
  }

  // Orientation: breadth-first over edge-adjacent triangles, flipping a neighbour that traverses the shared edge the same way.
  let flipped = 0, inverted = 0
  if (options.orient !== false) {
    const n = tri.length / 3
    const edgeTris = new Map<number, number[]>()
    const undirected = (a: number, b: number): number => (a < b ? ek(a, b) : ek(b, a))
    for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
      const key = undirected(tri[t * 3 + k]!, tri[t * 3 + (k + 1) % 3]!)
      const list = edgeTris.get(key)
      if (list === undefined) edgeTris.set(key, [t]); else list.push(t)
    }
    const visited = new Uint8Array(n)
    const flip = new Uint8Array(n)
    const directed = (t: number, a: number, b: number): boolean => {
      for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === a && tri[t * 3 + (k + 1) % 3] === b) return true
      return false
    }
    for (let seed = 0; seed < n; seed++) {
      if (visited[seed] === 1) continue
      const shell: number[] = [seed]
      visited[seed] = 1
      for (let head = 0; head < shell.length; head++) {
        const t = shell[head]!
        for (let k = 0; k < 3; k++) {
          let a = tri[t * 3 + k]!, b = tri[t * 3 + (k + 1) % 3]!
          if (flip[t] === 1) { const s = a; a = b; b = s }
          const list = edgeTris.get(undirected(a, b))!
          if (list.length !== 2) continue // boundary or non-manifold: no propagation across it
          const u = list[0] === t ? list[1]! : list[0]!
          if (visited[u] === 1) continue
          // t traverses a -> b; a consistently oriented neighbour traverses b -> a. Orientation of u as stored, then possibly flipped.
          if (directed(u, a, b)) flip[u] = 1
          visited[u] = 1
          shell.push(u)
        }
      }
      // Outward: a closed shell with negative signed volume is turned over.
      let volume = 0
      for (const t of shell) {
        const a = tri[t * 3]!, b = tri[t * 3 + 1]!, c = tri[t * 3 + 2]!
        const [i, j, l] = flip[t] === 1 ? [a, c, b] : [a, b, c]
        const ax = P[i * 3]!, ay = P[i * 3 + 1]!, az = P[i * 3 + 2]!
        const ux = P[j * 3]! - ax, uy = P[j * 3 + 1]! - ay, uz = P[j * 3 + 2]! - az, vx = P[l * 3]! - ax, vy = P[l * 3 + 1]! - ay, vz = P[l * 3 + 2]! - az
        volume += (ax * (uy * vz - uz * vy) + ay * (uz * vx - ux * vz) + az * (ux * vy - uy * vx)) / 6
      }
      const closed = shell.every((t) => [0, 1, 2].every((k) => edgeTris.get(undirected(tri[t * 3 + k]!, tri[t * 3 + (k + 1) % 3]!))!.length === 2))
      if (closed && volume < 0) { for (const t of shell) flip[t] = flip[t] === 1 ? 0 : 1; inverted++ }
    }
    for (let t = 0; t < n; t++) if (flip[t] === 1) { const b = tri[t * 3 + 1]!; tri[t * 3 + 1] = tri[t * 3 + 2]!; tri[t * 3 + 2] = b; flipped++ }
  }

  // Holes: boundary loops (edges used once, directed as the triangle uses them) filled by a fan from the loop's centroid.
  let filledHoles = 0, filledTriangles = 0
  const positions: number[] = Array.from(P)
  const maxEdges = options.maxHoleEdges ?? 0
  if (maxEdges >= 3) {
    const used = new Map<number, number>()
    for (let t = 0; t < tri.length / 3; t++) for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + k]!, b = tri[t * 3 + (k + 1) % 3]!
      used.set(ek(a, b), (used.get(ek(a, b)) ?? 0) + 1)
    }
    // A boundary edge a -> b has no twin b -> a; the hole boundary runs the opposite way (b -> a) to close the surface.
    const next = new Map<number, number[]>()
    for (let t = 0; t < tri.length / 3; t++) for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + k]!, b = tri[t * 3 + (k + 1) % 3]!
      if (!used.has(ek(b, a)) && used.get(ek(a, b)) === 1) { const l = next.get(b); if (l === undefined) next.set(b, [a]); else l.push(a) }
    }
    const taken = new Set<number>()
    for (const [start] of next) {
      const loop: number[] = [start]
      let cur = start, ok = true
      for (;;) {
        const outs = next.get(cur)
        if (outs === undefined || outs.length !== 1) { ok = false; break }
        const nxt = outs[0]!
        if (nxt === start) break
        if (loop.length >= maxEdges || taken.has(nxt)) { ok = false; break }
        loop.push(nxt); cur = nxt
      }
      if (!ok || loop.length < 3 || loop.some((v) => taken.has(v))) continue
      let cx = 0, cy = 0, cz = 0
      for (const v of loop) { cx += positions[v * 3]!; cy += positions[v * 3 + 1]!; cz += positions[v * 3 + 2]! }
      cx /= loop.length; cy /= loop.length; cz /= loop.length
      let width = 0
      for (const v of loop) width = Math.max(width, 2 * Math.hypot(positions[v * 3]! - cx, positions[v * 3 + 1]! - cy, positions[v * 3 + 2]! - cz))
      if (width > (options.maxHoleDiameter ?? Infinity)) continue
      const centre = positions.length / 3
      positions.push(cx, cy, cz)
      for (let k = 0; k < loop.length; k++) tri.push(loop[k]!, loop[(k + 1) % loop.length]!, centre)
      for (const v of loop) taken.add(v)
      filledHoles++; filledTriangles += loop.length
    }
  }

  const result: MeshData = { positions: Float64Array.from(positions), indices: Uint32Array.from(tri) }
  const after = meshTopology(result)
  const remaining: string[] = []
  if (after.triangles === 0) remaining.push("the mesh has no usable triangles")
  if (after.boundaryEdges > 0) remaining.push(`${after.boundaryEdges} open boundary edge(s): the surface has holes`)
  if (after.nonManifoldEdges > 0) remaining.push(`${after.nonManifoldEdges} non-manifold edge(s): surfaces meet along a line`)
  if (after.misorientedEdges > 0) remaining.push(`${after.misorientedEdges} edge(s) with inconsistent orientation`)
  if (after.triangles > 0 && after.closed && !after.solid) remaining.push("the closed mesh encloses a non-positive volume (inside out)")
  return {
    mesh: result,
    report: {
      before, after, remaining,
      defects: {
        weldedVertices, degenerateTriangles: degenerate, duplicateTriangles: duplicate, flippedTriangles: flipped, filledHoles, filledTriangles,
        boundaryEdges: after.boundaryEdges, nonManifoldEdges: after.nonManifoldEdges, misorientedEdges: after.misorientedEdges, shells: after.shells, invertedShells: inverted
      }
    }
  }
}
