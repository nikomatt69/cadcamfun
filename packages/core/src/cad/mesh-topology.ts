/**
 * What a triangle mesh is, topologically: is it a closed solid a machine can cut and a printer can print, or a surface with holes,
 * folds or flipped faces. Used to check every generator's output (`meshTopology(mesh).solid`) and reported to the assistant with a
 * parametric part, so a defect is said, not hidden.
 *
 * Edges are counted on vertex indices, so a mesh must be welded first (`cleanMesh`) for open seams between duplicate vertices not
 * to be reported as boundary. A closed orientable manifold has every edge used exactly twice, once each way; then each connected
 * shell has Euler characteristic 2 - 2 g, g its genus (number of through holes: a block 0, a washer 1, a plate with 4 holes 4).
 */
import type { Mesh } from "./solid.ts"

export interface MeshTopology {
  readonly vertices: number
  readonly triangles: number
  readonly edges: number
  /** Edges used by one triangle only: a hole in the surface. */
  readonly boundaryEdges: number
  /** Edges used by more than two triangles: surfaces meeting along a line, not a solid. */
  readonly nonManifoldEdges: number
  /** Edges two triangles use in the same direction: one of them is flipped. */
  readonly misorientedEdges: number
  /** Triangles with two equal vertex indices or no area. */
  readonly degenerateTriangles: number
  /** Connected pieces (through shared edges). */
  readonly shells: number
  /** V - E + F over the used vertices. */
  readonly eulerCharacteristic: number
  /** Through holes, summed over the shells, when the mesh is a closed manifold; `undefined` otherwise. */
  readonly genus: number | undefined
  /** Every edge used twice, once each way, and no degenerate triangle. */
  readonly closed: boolean
  /** Closed, and the enclosed volume is positive (faces point out). */
  readonly solid: boolean
  readonly volume: number
  readonly area: number
}

/** The topology and measures of a mesh (see the module comment). */
export const meshTopology = (mesh: Mesh): MeshTopology => {
  const idx = mesh.indices, pos = mesh.positions
  const triangles = Math.floor(idx.length / 3)
  const directed = new Map<number, number>()
  const key = (a: number, b: number): number => a * 0x4000000 + b
  const used = new Set<number>()
  let degenerate = 0, volume = 0, area = 0
  for (let t = 0; t < triangles; t++) {
    const a = idx[t * 3]!, b = idx[t * 3 + 1]!, c = idx[t * 3 + 2]!
    used.add(a); used.add(b); used.add(c)
    const ax = pos[a * 3]!, ay = pos[a * 3 + 1]!, az = pos[a * 3 + 2]!
    const ux = pos[b * 3]! - ax, uy = pos[b * 3 + 1]! - ay, uz = pos[b * 3 + 2]! - az
    const vx = pos[c * 3]! - ax, vy = pos[c * 3 + 1]! - ay, vz = pos[c * 3 + 2]! - az
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const twice = Math.hypot(nx, ny, nz)
    area += twice / 2
    volume += (ax * nx + ay * ny + az * nz) / 6
    if (a === b || b === c || a === c || twice === 0) degenerate++
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) directed.set(key(p, q), (directed.get(key(p, q)) ?? 0) + 1)
  }
  let edges = 0, boundary = 0, nonManifold = 0, misoriented = 0
  const done = new Set<number>()
  // Shells: union-find over vertices joined by an edge.
  const parent = new Map<number, number>()
  const find = (i: number): number => {
    let r = i
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!
    let j = i
    while (j !== r) { const n = parent.get(j)!; parent.set(j, r); j = n }
    return r
  }
  for (const v of used) parent.set(v, v)
  for (const [k, n] of directed) {
    const a = Math.floor(k / 0x4000000), b = k - a * 0x4000000
    const lo = Math.min(a, b), hi = Math.max(a, b)
    const u = key(lo, hi)
    if (done.has(u)) continue
    done.add(u)
    edges++
    const forward = n, backward = directed.get(key(b, a)) ?? 0
    const total = forward + backward
    if (total === 1) boundary++
    else if (total > 2) nonManifold++
    else if (forward !== 1 || backward !== 1) misoriented++
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }
  const roots = new Set<number>()
  for (const v of used) roots.add(find(v))
  const shells = roots.size
  const euler = used.size - edges + triangles
  const closed = triangles > 0 && boundary === 0 && nonManifold === 0 && misoriented === 0 && degenerate === 0
  const genus = closed && (2 * shells - euler) % 2 === 0 ? (2 * shells - euler) / 2 : undefined
  return {
    vertices: used.size, triangles, edges, boundaryEdges: boundary, nonManifoldEdges: nonManifold, misorientedEdges: misoriented,
    degenerateTriangles: degenerate, shells, eulerCharacteristic: euler, genus, closed, solid: closed && volume > 0, volume, area
  }
}

/** One line for a person or the assistant: "closed solid, 1 shell, genus 4, 812 triangles, V 12 345.6 mm³" or what is wrong. */
export const describeTopology = (t: MeshTopology): string => {
  const measures = `${t.triangles} triangles, V ${t.volume.toFixed(1)} mm³, A ${t.area.toFixed(1)} mm²`
  if (t.solid) return `closed solid, ${t.shells} shell${t.shells === 1 ? "" : "s"}, genus ${t.genus ?? "?"}, ${measures}`
  const faults = [
    t.boundaryEdges > 0 ? `${t.boundaryEdges} open edges` : "",
    t.nonManifoldEdges > 0 ? `${t.nonManifoldEdges} non-manifold edges` : "",
    t.misorientedEdges > 0 ? `${t.misorientedEdges} flipped edges` : "",
    t.degenerateTriangles > 0 ? `${t.degenerateTriangles} degenerate triangles` : "",
    t.closed && t.volume <= 0 ? "faces point inward" : ""
  ].filter((s) => s !== "")
  return `not a closed solid (${faults.join(", ")}), ${measures}`
}
