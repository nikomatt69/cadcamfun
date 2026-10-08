/**
 * Boolean operations on closed triangle meshes: union, subtraction and intersection by binary space partitioning (the classic BSP
 * algorithm of constructive solid geometry).
 *
 * What this is, and is not. It works on the triangle meshes the rest of the CAD core already produces (`meshOf`, the element
 * meshes), and gives back a closed triangle mesh whose volume, bounds and outline are those of the true result up to the meshing
 * tolerance of the inputs. It is NOT an exact boundary representation: faces are not trimmed analytic surfaces, a cylinder that was
 * cut stays a faceted cylinder, splitting leaves T-junctions on shared edges (the mesh is watertight as a set of oriented faces, not
 * a manifold with matched vertices), and there is no topology to fillet or measure a face on. Use it to show, measure and export the
 * result of a Boolean; a kernel with exact B-rep (spec 12 gate 1) is a separate piece of work. `Mesh` here never claims otherwise.
 *
 * Cost: close to n log n for the usual part. A CONVEX part with very many faces is the bad case of any BSP: every face leaves all the
 * others on one side, the tree is a chain, and building it is quadratic (a sphere of 9 000 triangles takes about ten seconds; one of
 * 1 000, a fraction of a second). Cylinders and prisms with a few hundred sides are fine.
 *
 * Input must be closed and consistently wound (outward normals counter-clockwise). Coincident faces of the two operands are the
 * hard case of any BSP Boolean: they are resolved by the planes' orientation (a face shared by two solids pointing the same way is
 * kept once in a union), within `tolerance`.
 */
import type { Mesh } from "./solid.ts"

interface V3 { readonly x: number; readonly y: number; readonly z: number }

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const lerp = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
const unit = (a: V3): V3 => { const l = Math.hypot(a.x, a.y, a.z); return l === 0 ? a : { x: a.x / l, y: a.y / l, z: a.z / l } }

const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3

class Plane {
  constructor(public normal: V3, public w: number) {}
  static fromPoints(a: V3, b: V3, c: V3): Plane | undefined {
    const n = cross(sub(b, a), sub(c, a))
    if (Math.hypot(n.x, n.y, n.z) < 1e-300) return undefined
    const u = unit(n)
    return new Plane(u, dot(u, a))
  }
  clone(): Plane { return new Plane(this.normal, this.w) }
  flip(): void { this.normal = { x: -this.normal.x, y: -this.normal.y, z: -this.normal.z }; this.w = -this.w }

  splitPolygon(polygon: Poly, eps: number, coplanarFront: Poly[], coplanarBack: Poly[], front: Poly[], back: Poly[]): void {
    let polygonType = 0
    const types: number[] = []
    for (const v of polygon.vertices) {
      const t = dot(this.normal, v) - this.w
      const type = t < -eps ? BACK : t > eps ? FRONT : COPLANAR
      polygonType |= type
      types.push(type)
    }
    switch (polygonType) {
      case COPLANAR: (dot(this.normal, polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon); break
      case FRONT: front.push(polygon); break
      case BACK: back.push(polygon); break
      default: {
        const f: V3[] = [], b: V3[] = []
        const n = polygon.vertices.length
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n
          const ti = types[i]!, tj = types[j]!
          const vi = polygon.vertices[i]!, vj = polygon.vertices[j]!
          if (ti !== BACK) f.push(vi)
          if (ti !== FRONT) b.push(vi)
          if ((ti | tj) === SPANNING) {
            const t = (this.w - dot(this.normal, vi)) / dot(this.normal, sub(vj, vi))
            const v = lerp(vi, vj, t)
            f.push(v)
            b.push(v)
          }
        }
        // Each piece owns its plane: `flip` turns it in place, and a shared one would be turned twice.
        if (f.length >= 3) front.push(new Poly(f, polygon.plane.clone()))
        if (b.length >= 3) back.push(new Poly(b, polygon.plane.clone()))
      }
    }
  }
}

class Poly {
  constructor(public vertices: V3[], public plane: Plane) {}
  flip(): void { this.vertices.reverse(); this.plane.flip() }
  clone(): Poly { return new Poly([...this.vertices], this.plane.clone()) }
}

class Node {
  plane: Plane | undefined
  front: Node | undefined
  back: Node | undefined
  polygons: Poly[] = []

  constructor(polygons: Poly[] | undefined, private readonly eps: number) {
    if (polygons !== undefined) this.build(polygons)
  }

  clone(): Node {
    const n = new Node(undefined, this.eps)
    n.plane = this.plane?.clone()
    n.front = this.front?.clone()
    n.back = this.back?.clone()
    n.polygons = this.polygons.map((p) => p.clone())
    return n
  }

  invert(): void {
    for (const p of this.polygons) p.flip()
    this.plane?.flip()
    this.front?.invert()
    this.back?.invert()
    const t = this.front; this.front = this.back; this.back = t
  }

  /** The parts of `polygons` that lie outside the solid this tree describes. */
  clipPolygons(polygons: Poly[]): Poly[] {
    if (this.plane === undefined) return polygons.slice()
    let front: Poly[] = [], back: Poly[] = []
    for (const p of polygons) this.plane.splitPolygon(p, this.eps, front, back, front, back)
    front = this.front !== undefined ? this.front.clipPolygons(front) : front
    back = this.back !== undefined ? this.back.clipPolygons(back) : []
    return front.concat(back)
  }

  /** Removes from this tree's polygons the parts inside `bsp`. */
  clipTo(bsp: Node): void {
    this.polygons = bsp.clipPolygons(this.polygons)
    this.front?.clipTo(bsp)
    this.back?.clipTo(bsp)
  }

  allPolygons(): Poly[] {
    const out: Poly[] = []
    const stack: Node[] = [this]
    while (stack.length > 0) {
      const n = stack.pop()!
      out.push(...n.polygons)
      if (n.front !== undefined) stack.push(n.front)
      if (n.back !== undefined) stack.push(n.back)
    }
    return out
  }

  /**
   * Splitting plane: of a spread of candidates, the one that cuts the fewest polygons and divides the rest most evenly, so the tree
   * stays shallow and the recursion safe on large meshes.
   */
  private choose(polygons: Poly[]): Plane {
    const candidates = Math.min(polygons.length, 8)
    // The candidates are scored on a sample, so choosing costs the same on a huge node as on a small one.
    const stride = Math.max(1, Math.floor(polygons.length / 128))
    let best = polygons[0]!.plane, bestScore = Infinity
    for (let c = 0; c < candidates; c++) {
      const plane = polygons[Math.floor((c * polygons.length) / candidates)]!.plane
      let front = 0, back = 0, spanning = 0
      for (let i = 0; i < polygons.length; i += stride) {
        const p = polygons[i]!
        let type = 0
        for (const v of p.vertices) {
          const t = dot(plane.normal, v) - plane.w
          type |= t < -this.eps ? BACK : t > this.eps ? FRONT : COPLANAR
        }
        if (type === SPANNING) spanning++
        else if (type === FRONT) front++
        else if (type === BACK) back++
      }
      const score = 4 * spanning + Math.abs(front - back)
      if (score < bestScore) { bestScore = score; best = plane }
    }
    return best.clone()
  }

  build(polygons: Poly[]): void {
    const stack: Array<{ node: Node; polys: Poly[] }> = [{ node: this, polys: polygons }]
    while (stack.length > 0) {
      const { node, polys } = stack.pop()!
      if (polys.length === 0) continue
      if (node.plane === undefined) node.plane = node.choose(polys)
      const front: Poly[] = [], back: Poly[] = []
      for (const p of polys) node.plane.splitPolygon(p, node.eps, node.polygons, node.polygons, front, back)
      if (front.length > 0) { node.front ??= new Node(undefined, node.eps); stack.push({ node: node.front, polys: front }) }
      if (back.length > 0) { node.back ??= new Node(undefined, node.eps); stack.push({ node: node.back, polys: back }) }
    }
  }
}

// ---------------------------------------------------------------- meshes

const polygonsOf = (mesh: Mesh): Poly[] => {
  const out: Poly[] = []
  const p = mesh.positions
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const v = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!].map((i) => ({ x: p[i * 3]!, y: p[i * 3 + 1]!, z: p[i * 3 + 2]! }))
    const plane = Plane.fromPoints(v[0]!, v[1]!, v[2]!)
    if (plane !== undefined) out.push(new Poly(v, plane))
  }
  return out
}

const meshOfPolygons = (polygons: ReadonlyArray<Poly>, weld: number): Mesh => {
  const positions: number[] = []
  const indices: number[] = []
  const seen = new Map<string, number>()
  const vertex = (v: V3): number => {
    const key = `${Math.round(v.x / weld)},${Math.round(v.y / weld)},${Math.round(v.z / weld)}`
    const hit = seen.get(key)
    if (hit !== undefined) return hit
    const i = positions.length / 3
    positions.push(v.x, v.y, v.z)
    seen.set(key, i)
    return i
  }
  for (const poly of polygons) {
    const ids = poly.vertices.map(vertex)
    for (let k = 1; k + 1 < ids.length; k++) {
      const a = ids[0]!, b = ids[k]!, c = ids[k + 1]!
      if (a !== b && b !== c && a !== c) indices.push(a, b, c)
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
}

const extent = (mesh: Mesh): number => {
  let lo = Infinity, hi = -Infinity
  for (const v of mesh.positions) { if (v < lo) lo = v; if (v > hi) hi = v }
  return Number.isFinite(hi - lo) ? Math.max(hi - lo, 1e-9) : 1
}

export type BooleanOp = "union" | "subtract" | "intersect"

export interface CsgOptions {
  /** Distance below which a point counts as on a plane, mm. The default is 1e-7 of the larger extent of the two meshes. */
  readonly tolerance?: number
}

/** `a` united with, minus, or intersected with `b`. Both must be closed meshes with outward counter-clockwise faces. */
export const booleanMesh = (a: Mesh, b: Mesh, op: BooleanOp, options: CsgOptions = {}): Mesh => {
  const scale = Math.max(extent(a), extent(b))
  const eps = options.tolerance ?? 1e-7 * scale
  const A = new Node(polygonsOf(a), eps)
  const B = new Node(polygonsOf(b), eps)
  switch (op) {
    case "union":
      A.clipTo(B); B.clipTo(A); B.invert(); B.clipTo(A); B.invert()
      A.build(B.allPolygons())
      break
    case "subtract":
      A.invert(); A.clipTo(B); B.clipTo(A); B.invert(); B.clipTo(A); B.invert()
      A.build(B.allPolygons())
      A.invert()
      break
    case "intersect":
      A.invert(); B.clipTo(A); B.invert(); A.clipTo(B); B.clipTo(A)
      A.build(B.allPolygons())
      A.invert()
      break
  }
  return meshOfPolygons(A.allPolygons(), Math.max(eps, 1e-9 * scale))
}

/** Several meshes combined by one operation, left to right. */
export const booleanAll = (meshes: ReadonlyArray<Mesh>, op: BooleanOp, options: CsgOptions = {}): Mesh => {
  if (meshes.length === 0) return { positions: new Float32Array(0), indices: new Uint32Array(0) }
  return meshes.slice(1).reduce((acc, m) => booleanMesh(acc, m, op, options), meshes[0]!)
}

/** A mesh moved by `(dx, dy, dz)`. */
export const translateMesh = (mesh: Mesh, dx: number, dy: number, dz: number): Mesh => {
  const out = Float32Array.from(mesh.positions)
  for (let i = 0; i < out.length; i += 3) { out[i] = out[i]! + dx; out[i + 1] = out[i + 1]! + dy; out[i + 2] = out[i + 2]! + dz }
  return { positions: out, indices: mesh.indices }
}

/** A mesh turned by `radians` about the axis through `origin` along the unit vector `axis` (Rodrigues). */
export const rotateMesh = (mesh: Mesh, axis: V3, radians: number, origin: V3 = { x: 0, y: 0, z: 0 }): Mesh => {
  const k = unit(axis)
  const c = Math.cos(radians), s = Math.sin(radians)
  const out = Float32Array.from(mesh.positions)
  for (let i = 0; i < out.length; i += 3) {
    const v = { x: out[i]! - origin.x, y: out[i + 1]! - origin.y, z: out[i + 2]! - origin.z }
    const kv = cross(k, v), kd = dot(k, v) * (1 - c)
    out[i] = v.x * c + kv.x * s + k.x * kd + origin.x
    out[i + 1] = v.y * c + kv.y * s + k.y * kd + origin.y
    out[i + 2] = v.z * c + kv.z * s + k.z * kd + origin.z
  }
  return { positions: out, indices: mesh.indices }
}

/** The meshes as one (no Boolean: they are only put in the same buffers). */
export const mergeMeshes = (meshes: ReadonlyArray<Mesh>): Mesh => {
  const positions: number[] = []
  const indices: number[] = []
  for (const m of meshes) {
    const base = positions.length / 3
    for (const v of m.positions) positions.push(v)
    for (const i of m.indices) indices.push(base + i)
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
}
