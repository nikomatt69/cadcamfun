/**
 * Curved faces of a triangle mesh, found again from a point, and the solid between two offsets of one: what Press Pull needs on a face
 * that is not flat (the side of a boss, the wall of a hole, a fillet).
 *
 * A face is grown from the triangle nearest the point across every edge where the two triangles meet at less than `creaseDegrees`, so a
 * faceted cylinder is one face and its rims (90 degrees) bound it. A chain of tangent faces (a fillet running into the flats it blends)
 * is one face too, as in Fusion's tangent chain. Each vertex of the face moves along its normal, the area-weighted mean of the normals of
 * the face's triangles round it: radial on a faceted cylinder, so an offset of `d` changes the radius by exactly `d` at the vertices.
 */
import { cleanMesh } from "./mesh-clean.ts"
import { meshVolume, type Mesh } from "./solid.ts"
import { distanceToTriangle, type V3 } from "./face-edit.ts"

export interface SmoothFace {
  /** Every triangle of the face has the same normal. */
  readonly planar: boolean
  readonly triangles: number
  readonly area: number
  /** How far the query point is from the face's nearest triangle, mm. */
  readonly distance: number
  /**
   * The closed solid swept by the face between the offsets `from` and `to` along its vertex normals (`from < to` at every vertex). An
   * offset may be a function of the vertex, and `direction` may replace the vertex normal (a draft moves vertices square to the pull).
   */
  readonly slab: (from: Offset, to: Offset, direction?: (p: V3, n: V3) => V3) => Mesh
  /** The vertices of the face, for an offset that depends on where a vertex is. */
  readonly vertices: ReadonlyArray<{ readonly p: V3; readonly n: V3 }>
}

export type Offset = number | ((p: V3, n: V3) => number)

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })

export const findSmoothFace = (mesh: Mesh, query: { readonly near: V3; readonly normal?: V3 }, creaseDegrees = 20): { readonly face: SmoothFace } | { readonly error: string } => {
  const welded = cleanMesh(mesh, { mergeCoplanar: false })
  const p = welded.positions, ix = welded.indices
  const count = Math.floor(ix.length / 3)
  if (count === 0) return { error: "The body has no faces" }
  const vert = (i: number): V3 => ({ x: p[i * 3]!, y: p[i * 3 + 1]!, z: p[i * 3 + 2]! })
  const wanted = query.normal === undefined ? undefined : (() => { const l = Math.hypot(query.normal.x, query.normal.y, query.normal.z); return l === 0 ? undefined : { x: query.normal.x / l, y: query.normal.y / l, z: query.normal.z / l } })()
  const normals: Array<V3 | undefined> = [], areas: number[] = []
  let seed = -1, best = Infinity
  for (let t = 0; t < count; t++) {
    const a = vert(ix[t * 3]!), b = vert(ix[t * 3 + 1]!), c = vert(ix[t * 3 + 2]!)
    const n = cross(sub(b, a), sub(c, a))
    const l = Math.hypot(n.x, n.y, n.z)
    areas.push(l / 2)
    if (l < 1e-18) { normals.push(undefined); continue }
    const un = { x: n.x / l, y: n.y / l, z: n.z / l }
    normals.push(un)
    if (wanted !== undefined && dot(un, wanted) < 0.5) continue
    const d = distanceToTriangle(query.near, a, b, c)
    if (d < best - 1e-12) { best = d; seed = t }
  }
  if (seed < 0) return { error: wanted === undefined ? "The body has no usable face" : "No face of the body faces that way" }
  // Grow across smooth edges.
  const key = (a: number, b: number): number => (a < b ? a * 0x4000000 + b : b * 0x4000000 + a)
  const owners = new Map<number, number[]>()
  for (let t = 0; t < count; t++) {
    if (normals[t] === undefined) continue
    for (let k = 0; k < 3; k++) {
      const kk = key(ix[t * 3 + k]!, ix[t * 3 + ((k + 1) % 3)]!)
      const list = owners.get(kk)
      if (list === undefined) owners.set(kk, [t]); else list.push(t)
    }
  }
  const cosCrease = Math.cos((creaseDegrees * Math.PI) / 180)
  const inFace = new Set<number>([seed])
  const queue = [seed]
  while (queue.length > 0) {
    const t = queue.pop()!
    for (let k = 0; k < 3; k++) {
      const list = owners.get(key(ix[t * 3 + k]!, ix[t * 3 + ((k + 1) % 3)]!)) ?? []
      if (list.length !== 2) continue
      const o = list[0] === t ? list[1]! : list[0]!
      if (inFace.has(o) || dot(normals[t]!, normals[o]!) < cosCrease) continue
      inFace.add(o); queue.push(o)
    }
  }
  const tris = [...inFace]
  const n0 = normals[seed]!
  const planar = tris.every((t) => dot(normals[t]!, n0) > 1 - 1e-9)
  // Vertex normals over the face.
  const vn = new Map<number, V3>()
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const v = ix[t * 3 + k]!, n = normals[t]!, w = areas[t]!
    const acc = vn.get(v) ?? { x: 0, y: 0, z: 0 }
    vn.set(v, { x: acc.x + n.x * w, y: acc.y + n.y * w, z: acc.z + n.z * w })
  }
  for (const [v, n] of vn) { const l = Math.hypot(n.x, n.y, n.z); vn.set(v, { x: n.x / l, y: n.y / l, z: n.z / l }) }
  // Boundary: directed edges of the face whose reverse is not in the face.
  const directed = new Set<string>()
  for (const t of tris) for (let k = 0; k < 3; k++) directed.add(`${ix[t * 3 + k]!}>${ix[t * 3 + ((k + 1) % 3)]!}`)
  const boundary: Array<[number, number]> = []
  for (const e of directed) { const [a, b] = e.split(">").map(Number) as [number, number]; if (!directed.has(`${b}>${a}`)) boundary.push([a, b]) }
  const area = tris.reduce((s, t) => s + areas[t]!, 0)

  const slab = (from: Offset, to: Offset, direction?: (p: V3, n: V3) => V3): Mesh => {
    const value = (o: Offset, v: number): number => (typeof o === "number" ? o : o(vert(v), vn.get(v)!))
    const along = (v: number): V3 => (direction === undefined ? vn.get(v)! : direction(vert(v), vn.get(v)!))
    const ids = [...vn.keys()]
    for (const v of ids) if (!(value(to, v) > value(from, v))) throw new RangeError("A slab needs from < to at every vertex")
    const at = new Map<number, number>(ids.map((v, i) => [v, i]))
    const positions: number[] = []
    for (const o of [from, to]) for (const v of ids) { const q = vert(v), n = along(v), s = value(o, v); positions.push(q.x + n.x * s, q.y + n.y * s, q.z + n.z * s) }
    const lower = (v: number): number => at.get(v)!, upper = (v: number): number => ids.length + at.get(v)!
    const indices: number[] = []
    // A triangle whose offset copy turns over means the offset folds the face onto itself (a hole pulled shut, a boss pushed past its axis).
    const flipped = (t: number, o: Offset): boolean => {
      const q = [0, 1, 2].map((k) => { const v = ix[t * 3 + k]!, a = vert(v), n = along(v), s = value(o, v); return { x: a.x + n.x * s, y: a.y + n.y * s, z: a.z + n.z * s } })
      return dot(cross(sub(q[1]!, q[0]!), sub(q[2]!, q[0]!)), normals[t]!) <= 0
    }
    for (const t of tris) {
      if (flipped(t, from) || flipped(t, to)) throw new RangeError("The face folds onto itself at this distance (a hole pulled shut, or a boss pushed through its axis)")
      const a = ix[t * 3]!, b = ix[t * 3 + 1]!, c = ix[t * 3 + 2]!
      indices.push(upper(a), upper(b), upper(c), lower(a), lower(c), lower(b))
    }
    for (const [a, b] of boundary) indices.push(lower(a), lower(b), upper(b), lower(a), upper(b), upper(a))
    const m: Mesh = { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
    if (meshVolume(m) < 0) for (let i = 0; i + 2 < m.indices.length; i += 3) { const x = m.indices[i + 1]!; m.indices[i + 1] = m.indices[i + 2]!; m.indices[i + 2] = x }
    return m
  }
  return { face: { planar, triangles: tris.length, area, distance: best, slab, vertices: [...vn.entries()].map(([v, n]) => ({ p: vert(v), n })) } }
}
