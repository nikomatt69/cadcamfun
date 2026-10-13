/**
 * Shading normals for a CAD solid: smooth across the facets of a curved surface, sharp along a real edge. Averaging the normals of
 * every face around a welded vertex (what a viewer does by default) rounds off the edges of a box and darkens its faces near them;
 * one normal per face makes a cylinder look like a prism. The usual answer is a crease angle: around each corner of each triangle,
 * only the faces whose normal is within the angle of this triangle's own are averaged (weighted by the corner angle, so a fan of
 * thin triangles does not outweigh one wide one), and a vertex is split where its corners end up with different normals.
 *
 * Positions are welded first, so a mesh that repeats its vertices per face (most generators do) is smoothed too, and a Boolean
 * result (welded) gets its sharp edges back.
 */
import type { Mesh } from "./solid.ts"
import { weldPoints } from "./mesh-clean.ts"

export interface ShadedMesh {
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly indices: Uint32Array
}

/** `mesh` with a normal per vertex, split along edges sharper than `creaseDegrees` (default 30°). */
export const creasedNormals = (mesh: Mesh, creaseDegrees = 30): ShadedMesh => {
  const tris = Math.floor(mesh.indices.length / 3)
  let lo = Infinity, hi = -Infinity
  for (const v of mesh.positions) { if (v < lo) lo = v; if (v > hi) hi = v }
  const scale = Number.isFinite(hi - lo) ? Math.max(hi - lo, 1e-9) : 1
  const { positions: pos, map } = weldPoints(mesh.positions, 1e-6 * scale)
  const corner = new Uint32Array(tris * 3)
  for (let k = 0; k < tris * 3; k++) corner[k] = map[mesh.indices[k]!]!
  // Unit face normals and the angle of each corner.
  const fn = new Float64Array(tris * 3)
  const angle = new Float64Array(tris * 3)
  for (let t = 0; t < tris; t++) {
    const ids = [corner[t * 3]!, corner[t * 3 + 1]!, corner[t * 3 + 2]!]
    const p = ids.map((i) => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!] as const)
    const u = [p[1]![0] - p[0]![0], p[1]![1] - p[0]![1], p[1]![2] - p[0]![2]]
    const v = [p[2]![0] - p[0]![0], p[2]![1] - p[0]![1], p[2]![2] - p[0]![2]]
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
    const l = Math.hypot(n[0]!, n[1]!, n[2]!)
    if (l > 0) { fn[t * 3] = n[0]! / l; fn[t * 3 + 1] = n[1]! / l; fn[t * 3 + 2] = n[2]! / l }
    for (let c = 0; c < 3; c++) {
      const a = p[c]!, b = p[(c + 1) % 3]!, d = p[(c + 2) % 3]!
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]]
      const l1 = Math.hypot(e1[0]!, e1[1]!, e1[2]!), l2 = Math.hypot(e2[0]!, e2[1]!, e2[2]!)
      angle[t * 3 + c] = l1 > 0 && l2 > 0 ? Math.acos(Math.max(-1, Math.min(1, (e1[0]! * e2[0]! + e1[1]! * e2[1]! + e1[2]! * e2[2]!) / (l1 * l2)))) : 0
    }
  }
  // The triangles around each welded vertex.
  const vertexCount = pos.length / 3
  const start = new Uint32Array(vertexCount + 1)
  for (let k = 0; k < tris * 3; k++) start[corner[k]! + 1]!++
  for (let i = 0; i < vertexCount; i++) start[i + 1]! += start[i]!
  const fill = start.slice(0, vertexCount)
  const around = new Uint32Array(tris * 3)
  for (let k = 0; k < tris * 3; k++) around[fill[corner[k]!]!++] = k
  const cosCrease = Math.cos((creaseDegrees * Math.PI) / 180)
  const outPos: number[] = [], outNrm: number[] = [], outIdx = new Uint32Array(tris * 3)
  const split = new Map<string, number>()
  for (let k = 0; k < tris * 3; k++) {
    const t = Math.floor(k / 3), v = corner[k]!
    let nx = 0, ny = 0, nz = 0
    for (let j = start[v]!; j < start[v + 1]!; j++) {
      const other = around[j]!, s = Math.floor(other / 3)
      const c = fn[t * 3]! * fn[s * 3]! + fn[t * 3 + 1]! * fn[s * 3 + 1]! + fn[t * 3 + 2]! * fn[s * 3 + 2]!
      if (s !== t && c < cosCrease) continue
      const w = angle[other]!
      nx += fn[s * 3]! * w; ny += fn[s * 3 + 1]! * w; nz += fn[s * 3 + 2]! * w
    }
    const l = Math.hypot(nx, ny, nz)
    if (l > 0) { nx /= l; ny /= l; nz /= l } else { nx = fn[t * 3]!; ny = fn[t * 3 + 1]!; nz = fn[t * 3 + 2]! }
    // Corners of one vertex with the same normal share an output vertex.
    const key = `${v}:${Math.round(nx * 1e4)},${Math.round(ny * 1e4)},${Math.round(nz * 1e4)}`
    let out = split.get(key)
    if (out === undefined) {
      out = outPos.length / 3
      outPos.push(pos[v * 3]!, pos[v * 3 + 1]!, pos[v * 3 + 2]!)
      outNrm.push(nx, ny, nz)
      split.set(key, out)
    }
    outIdx[k] = out
  }
  return { positions: Float32Array.from(outPos), normals: Float32Array.from(outNrm), indices: outIdx }
}
