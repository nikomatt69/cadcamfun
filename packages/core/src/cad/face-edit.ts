/**
 * Planar faces of a triangle mesh, found again from a point: the selection behind Fusion's Press Pull. A mesh has no face objects, so
 * a face is rebuilt from the triangles: the one nearest the point (and facing the requested way), every triangle on its plane that
 * touches it directly or through a chain of coplanar neighbours, and the outline of that set as closed loops in the plane.
 *
 * Triangles touch when they share a vertex, or when a vertex of one lies on an edge of the other (a Boolean leaves such T-junctions).
 * The boundary is the set of edges with no opposite twin once every edge has been split at the vertices on it; its loops are traced
 * and returned in the plane's own right-handed frame (u, v, normal), outer loops counter-clockwise, holes clockwise.
 */
import type { Vec2 } from "./vec.ts"
import type { Mesh } from "./solid.ts"

export interface V3 { readonly x: number; readonly y: number; readonly z: number }

export interface PlanarFace {
  /** Unit outward normal. */
  readonly normal: V3
  /** A point on the plane (a vertex of the face). */
  readonly origin: V3
  readonly u: V3
  readonly v: V3
  /** Outline loops in (u, v) about `origin`. Loops inside loops are holes. */
  readonly loops: ReadonlyArray<Vec2[]>
  /** Indices (into the mesh's triangle list, three per triangle) of the triangles of the face. */
  readonly triangles: ReadonlyArray<number>
  /** Area of the face, mm2. */
  readonly area: number
  /** How far the query point is from the face's nearest triangle, mm. */
  readonly distance: number
  /** Centre of area of the face, on its plane. */
  readonly centroid: V3
}

export interface FaceQuery {
  readonly near: V3
  /** Only faces whose outward normal points within about 60 degrees of this are considered. */
  readonly normal?: V3
}

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const norm = (a: V3): number => Math.hypot(a.x, a.y, a.z)

/** Distance from `p` to the triangle abc. */
export const distanceToTriangle = (p: V3, a: V3, b: V3, c: V3): number => {
  // Ericson, Real-Time Collision Detection: closest point on a triangle.
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a)
  const d1 = dot(ab, ap), d2 = dot(ac, ap)
  const q = (v: V3): number => norm(sub(p, v))
  if (d1 <= 0 && d2 <= 0) return q(a)
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return q(b)
  const vc = d1 * d4 - d3 * d2
  const along = (o: V3, d: V3, t: number): V3 => ({ x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t })
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return q(along(a, ab, d1 / (d1 - d3)))
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return q(c)
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return q(along(a, ac, d2 / (d2 - d6)))
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return q(along(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))))
  const denom = 1 / (va + vb + vc)
  return q(along(along(a, ab, vb * denom), ac, vc * denom))
}

/** The planar face of `mesh` nearest `query.near`, or a reason why there is none. */
export const findPlanarFace = (mesh: Mesh, query: FaceQuery): { readonly face: PlanarFace } | { readonly error: string } => {
  const p = mesh.positions, ix = mesh.indices
  const count = Math.floor(ix.length / 3)
  if (count === 0) return { error: "The body has no faces" }
  const vert = (i: number): V3 => ({ x: p[i * 3]!, y: p[i * 3 + 1]!, z: p[i * 3 + 2]! })
  let extent = 0
  for (const c of p) extent = Math.max(extent, Math.abs(c))
  const tol = Math.max(1e-6 * extent, 1e-7)
  const wanted = query.normal === undefined ? undefined : (() => { const l = norm(query.normal); return l === 0 ? undefined : { x: query.normal.x / l, y: query.normal.y / l, z: query.normal.z / l } })()

  const normals: Array<V3 | undefined> = []
  let best = -1, bestDistance = Infinity
  for (let t = 0; t < count; t++) {
    const a = vert(ix[t * 3]!), b = vert(ix[t * 3 + 1]!), c = vert(ix[t * 3 + 2]!)
    const n = cross(sub(b, a), sub(c, a))
    const l = norm(n)
    if (l < 1e-18) { normals.push(undefined); continue }
    const un = { x: n.x / l, y: n.y / l, z: n.z / l }
    normals.push(un)
    if (wanted !== undefined && dot(un, wanted) < 0.5) continue
    const d = distanceToTriangle(query.near, a, b, c)
    if (d < bestDistance - 1e-12) { bestDistance = d; best = t }
  }
  if (best < 0) return { error: wanted === undefined ? "The body has no usable face" : "No face of the body faces that way" }
  const n0 = normals[best]!
  const origin = vert(ix[best * 3]!)
  const planeOf = (t: number): number => dot(n0, sub(vert(ix[t * 3]!), origin))

  // Every triangle on the plane, facing the same way.
  const onPlane: number[] = []
  for (let t = 0; t < count; t++) {
    const n = normals[t]
    if (n === undefined || dot(n, n0) < 1 - 1e-6) continue
    if ([0, 1, 2].every((k) => Math.abs(dot(n0, sub(vert(ix[t * 3 + k]!), origin))) <= tol * 10)) onPlane.push(t)
  }
  void planeOf
  if (onPlane.length > 4000) return { error: "The face is made of too many triangles to select (over 4000)" }

  // Weld the vertices of the candidates.
  const key = (v: V3): string => `${Math.round(v.x / tol)},${Math.round(v.y / tol)},${Math.round(v.z / tol)}`
  const ids = new Map<string, number>()
  const points: V3[] = []
  const corner = (t: number, k: number): number => {
    const v = vert(ix[t * 3 + k]!)
    const kk = key(v)
    let id = ids.get(kk)
    if (id === undefined) { id = points.length; ids.set(kk, id); points.push(v) }
    return id
  }
  const tri = new Map<number, [number, number, number]>()
  for (const t of onPlane) tri.set(t, [corner(t, 0), corner(t, 1), corner(t, 2)])

  // A vertex lying on the open edge a-b (not at its ends).
  const onEdge = (a: number, b: number, v: number): boolean => {
    if (v === a || v === b) return false
    const pa = points[a]!, pb = points[b]!, pv = points[v]!
    const ab = sub(pb, pa), l2 = dot(ab, ab)
    if (l2 === 0) return false
    const t = dot(sub(pv, pa), ab) / l2
    if (t <= 1e-9 || t >= 1 - 1e-9) return false
    const q = { x: pa.x + ab.x * t, y: pa.y + ab.y * t, z: pa.z + ab.z * t }
    return norm(sub(pv, q)) <= tol * 10
  }

  // Connected component of the triangle nearest the point: by shared vertices, then by T-junctions.
  const byVertex = new Map<number, number[]>()
  for (const [t, c] of tri) for (const v of c) byVertex.set(v, [...(byVertex.get(v) ?? []), t])
  const members = new Set<number>([best])
  const queue = [best]
  const grow = (from: number): void => {
    const c = tri.get(from)!
    for (const v of c) for (const other of byVertex.get(v) ?? []) if (!members.has(other)) { members.add(other); queue.push(other) }
    for (let k = 0; k < 3; k++) {
      const a = c[k]!, b = c[(k + 1) % 3]!
      for (const [t, oc] of tri) {
        if (members.has(t)) continue
        if (oc.some((v) => onEdge(a, b, v))) { members.add(t); queue.push(t) }
      }
      // The reverse case: a vertex of this triangle on an edge of another.
    }
    for (const [t, oc] of tri) {
      if (members.has(t)) continue
      for (let k = 0; k < 3; k++) if (c.some((v) => onEdge(oc[k]!, oc[(k + 1) % 3]!, v))) { members.add(t); queue.push(t); break }
    }
  }
  while (queue.length > 0) grow(queue.pop()!)

  // Directed edges, each split at the vertices of the component that lie on it; edges with a twin cancel.
  const used = [...new Set([...members].flatMap((t) => tri.get(t)!))]
  const edges = new Map<string, [number, number]>()
  for (const t of members) {
    const c = tri.get(t)!
    for (let k = 0; k < 3; k++) {
      const a = c[k]!, b = c[(k + 1) % 3]!
      const pa = points[a]!, pb = points[b]!
      const inner = used.filter((v) => onEdge(a, b, v)).sort((x, y) => dot(sub(points[x]!, pa), sub(pb, pa)) - dot(sub(points[y]!, pa), sub(pb, pa)))
      const chain = [a, ...inner, b]
      for (let s = 0; s + 1 < chain.length; s++) {
        const from = chain[s]!, to = chain[s + 1]!
        if (from === to) continue
        const twin = `${to}>${from}`
        if (edges.has(twin)) edges.delete(twin)
        else edges.set(`${from}>${to}`, [from, to])
      }
    }
  }
  // Frame of the plane.
  const u0 = Math.abs(n0.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  const uu = cross(n0, cross(u0, n0))
  const ul = norm(uu)
  const u = { x: uu.x / ul, y: uu.y / ul, z: uu.z / ul }
  const v = cross(n0, u)
  const to2 = (pt: V3): Vec2 => { const d = sub(pt, origin); return { x: dot(d, u), y: dot(d, v) } }

  const next = new Map<number, number[]>()
  for (const [a, b] of edges.values()) next.set(a, [...(next.get(a) ?? []), b])
  const loops: Vec2[][] = []
  const taken = new Set<string>()
  for (const [a0, b0] of edges.values()) {
    if (taken.has(`${a0}>${b0}`)) continue
    const ring: number[] = [a0]
    let a = a0, b = b0
    for (let guard = 0; guard < edges.size + 2; guard++) {
      taken.add(`${a}>${b}`)
      if (b === a0) break
      ring.push(b)
      const options = (next.get(b) ?? []).filter((c) => !taken.has(`${b}>${c}`))
      if (options.length === 0) { ring.length = 0; break }
      // At a vertex where several loops touch, take the sharpest turn to the left so each loop stays a simple ring.
      let pick = options[0]!
      if (options.length > 1) {
        const pa = to2(points[a]!), pb = to2(points[b]!)
        const heading = Math.atan2(pb.y - pa.y, pb.x - pa.x)
        let bestTurn = -Infinity
        for (const c of options) {
          const pc = to2(points[c]!)
          let turn = Math.atan2(pc.y - pb.y, pc.x - pb.x) - heading
          while (turn > Math.PI) turn -= 2 * Math.PI
          while (turn <= -Math.PI) turn += 2 * Math.PI
          if (turn > bestTurn) { bestTurn = turn; pick = c }
        }
      }
      a = b; b = pick
    }
    if (ring.length >= 3) loops.push(ring.map((i) => to2(points[i]!)))
  }
  // Drop vertices in the middle of a straight run of a loop (the T-junction points).
  const straighten = (loop: Vec2[]): Vec2[] => loop.filter((q, i) => {
    const a = loop[(i + loop.length - 1) % loop.length]!, b = loop[(i + 1) % loop.length]!
    return Math.abs((q.x - a.x) * (b.y - q.y) - (q.y - a.y) * (b.x - q.x)) > 1e-9 * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y) ** 2)
  })
  const cleaned = loops.map(straighten).filter((l) => l.length >= 3)
  if (cleaned.length === 0) return { error: "The face has no closed outline (the mesh is not watertight there)" }
  let area = 0
  let cx = 0, cy = 0, cz = 0
  for (const t of members) {
    const c = tri.get(t)!
    const a = points[c[0]!]!, b = points[c[1]!]!, d = points[c[2]!]!
    const part = norm(cross(sub(b, a), sub(d, a))) / 2
    area += part
    cx += (part * (a.x + b.x + d.x)) / 3; cy += (part * (a.y + b.y + d.y)) / 3; cz += (part * (a.z + b.z + d.z)) / 3
  }
  return { face: { normal: n0, origin, u, v, loops: cleaned, triangles: [...members], area, distance: bestDistance, centroid: { x: cx / area, y: cy / area, z: cz / area } } }
}
