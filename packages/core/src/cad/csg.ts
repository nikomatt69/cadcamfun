/**
 * Boolean operations on closed triangle meshes: union, subtraction and intersection by binary space partitioning (the classic BSP
 * algorithm of constructive solid geometry), followed by a clean-up that gives back a proper solid.
 *
 * What this is, and is not. It works on the triangle meshes the rest of the CAD core already produces (`meshOf`, the element
 * meshes), and gives back a closed triangle mesh whose volume, bounds and outline are those of the true result up to the meshing
 * tolerance of the inputs. It is NOT an exact boundary representation: faces are not trimmed analytic surfaces, a cylinder that was
 * cut stays a faceted cylinder, and there is no topology to fillet or measure a face on. Use it to show, measure, machine and export
 * the result of a Boolean; a kernel with exact B-rep (spec 12 gate 1) is a separate piece of work. `Mesh` here never claims otherwise.
 *
 * How. Each operand becomes a classifier: a BSP tree, or, when the operand is convex (closed, connected, every edge convex), just
 * its distinct face planes, so a box is six planes and a sphere of ten thousand triangles is classified without building the
 * quadratic chain a BSP of a convex solid degenerates to. Polygons are classified as lists (the steps of the tree form
 * `a.clipTo(b)`, `b.clipTo(a)`, `b.invert()`... without copying or inverting trees), and a polygon clear of the other operand's
 * bounding box is kept or dropped without walking anything: on a part with many features only the faces near the tool are touched.
 * The partition splits faces along infinite planes, so the raw result is a soup of slivers with T-junctions; `cleanPolygonSoup`
 * welds it, closes every T-junction and merges the coplanar fragments back into whole faces, re-triangulated. The result is a
 * closed manifold mesh when the inputs are (`meshTopology` says so), and its triangle count grows with the features, not with
 * the number of Booleans that made it: a plate with 40 holes cut one after the other is about 7 000 triangles and takes about a second.
 *
 * Input must be closed and consistently wound (outward normals counter-clockwise). Coincident faces of the two operands are the
 * hard case of any BSP Boolean: they are resolved by the planes' orientation (a face shared by two solids pointing the same way is
 * kept once in a union), within `tolerance`.
 */
import { cleanPolygonSoup } from "./mesh-clean.ts"
import { meshBounds, type Mesh } from "./solid.ts"

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

  /**
   * Sorts `polygon` against this plane, split where it spans it. `side` -1 reads the plane turned over (the plane of the
   * complement), so a tree can be used inverted without being copied.
   */
  splitPolygon(polygon: Poly, eps: number, coplanarFront: Poly[], coplanarBack: Poly[], front: Poly[], back: Poly[], side: 1 | -1 = 1): void {
    const n = this.normal, w = this.w, vs = polygon.vertices
    let polygonType = 0
    // Most polygons are not split: classify first without allocating.
    for (const v of vs) {
      const t = side * (n.x * v.x + n.y * v.y + n.z * v.z - w)
      polygonType |= t < -eps ? BACK : t > eps ? FRONT : COPLANAR
    }
    switch (polygonType) {
      case COPLANAR: (side * dot(n, polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon); break
      case FRONT: front.push(polygon); break
      case BACK: back.push(polygon); break
      default: {
        const count = vs.length
        const types: number[] = new Array(count)
        for (let i = 0; i < count; i++) {
          const t = side * (dot(n, vs[i]!) - w)
          types[i] = t < -eps ? BACK : t > eps ? FRONT : COPLANAR
        }
        const f: V3[] = [], b: V3[] = []
        for (let i = 0; i < count; i++) {
          const j = (i + 1) % count
          const ti = types[i]!, tj = types[j]!
          const vi = vs[i]!, vj = vs[j]!
          if (ti !== BACK) f.push(vi)
          if (ti !== FRONT) b.push(vi)
          if ((ti | tj) === SPANNING) {
            const t = (w - dot(n, vi)) / dot(n, sub(vj, vi))
            const v = lerp(vi, vj, t)
            f.push(v)
            b.push(v)
          }
        }
        // Each piece owns its plane: `flip` turns it in place, and a shared one would be turned twice.
        if (f.length >= 3) front.push(new Poly(f, polygon.plane.clone(), polygon.thin))
        if (b.length >= 3) back.push(new Poly(b, polygon.plane.clone(), polygon.thin))
      }
    }
  }
}

class Poly {
  /** `thin`: from a triangle so narrow that its plane is only roughly known (a poor splitting plane, an unchecked convex face). */
  constructor(public vertices: V3[], public plane: Plane, public thin = false) {}
  flip(): void { this.vertices.reverse(); this.plane.flip() }
  clone(): Poly { return new Poly([...this.vertices], this.plane.clone(), this.thin) }
}

/** Copies of the polygons, turned over. */
const flipped = (polygons: ReadonlyArray<Poly>): Poly[] => polygons.map((p) => { const c = p.clone(); c.flip(); return c })

/**
 * A BSP tree of a closed mesh, used as a classifier: below a node's plane is inside, a missing back child is solid, a missing
 * front child is empty space.
 */
class Node {
  plane: Plane | undefined
  front: Node | undefined
  back: Node | undefined
  /** Set instead of a tree when the solid is convex: its distinct face planes, inside being behind all of them. */
  convex: Plane[] | undefined

  constructor(polygons: Poly[] | undefined, private readonly eps: number) {
    if (polygons !== undefined) this.build(polygons)
  }

  /**
   * Splitting plane: of a spread of candidates, the one that cuts the fewest polygons and divides the rest most evenly, so the tree
   * stays shallow and the recursion safe on large meshes.
   */
  private choose(all: Poly[]): Plane {
    // Planes of thin triangles are cut from only while nothing better is left: a wrong splitting plane misplaces everything it sorts.
    const sound = all.filter((p) => !p.thin)
    const polygons = sound.length > 0 ? sound : all
    const candidates = Math.min(polygons.length, 8)
    // The candidates are scored on a sample, so choosing costs the same on a huge node as on a small one.
    const stride = Math.max(1, Math.floor(all.length / 128))
    let best = polygons[0]!.plane, bestScore = Infinity
    for (let c = 0; c < candidates; c++) {
      const plane = polygons[Math.floor((c * polygons.length) / candidates)]!.plane
      let front = 0, back = 0, spanning = 0
      for (let i = 0; i < all.length; i += stride) {
        const p = all[i]!
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
    const coplanar: Poly[] = []
    while (stack.length > 0) {
      const { node, polys } = stack.pop()!
      if (polys.length === 0) continue
      if (node.plane === undefined) node.plane = node.choose(polys)
      const front: Poly[] = [], back: Poly[] = []
      // The polygons on the node's plane are described by the plane itself; the classifier does not keep them.
      for (const p of polys) node.plane.splitPolygon(p, node.eps, coplanar, coplanar, front, back)
      coplanar.length = 0
      if (front.length > 0) { node.front ??= new Node(undefined, node.eps); stack.push({ node: node.front, polys: front }) }
      if (back.length > 0) { node.back ??= new Node(undefined, node.eps); stack.push({ node: node.back, polys: back }) }
    }
  }
}

// ---------------------------------------------------------------- classification

interface Box3 { readonly lo: V3; readonly hi: V3 }

const boxOf = (mesh: Mesh): Box3 => {
  const b = meshBounds(mesh)
  return { lo: { x: b.minX, y: b.minY, z: b.minZ }, hi: { x: b.maxX, y: b.maxY, z: b.maxZ } }
}
const boxesMeet = (a: Box3, b: Box3, eps: number): boolean =>
  a.lo.x <= b.hi.x + eps && b.lo.x <= a.hi.x + eps && a.lo.y <= b.hi.y + eps && b.lo.y <= a.hi.y + eps && a.lo.z <= b.hi.z + eps && b.lo.z <= a.hi.z + eps
const outsideBox = (p: Poly, box: Box3, eps: number): boolean => {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity
  for (const v of p.vertices) {
    if (v.x < x0) x0 = v.x
    if (v.x > x1) x1 = v.x
    if (v.y < y0) y0 = v.y
    if (v.y > y1) y1 = v.y
    if (v.z < z0) z0 = v.z
    if (v.z > z1) z1 = v.z
  }
  return x1 < box.lo.x - eps || x0 > box.hi.x + eps || y1 < box.lo.y - eps || y0 > box.hi.y + eps || z1 < box.lo.z - eps || z0 > box.hi.z + eps
}

/**
 * The parts of `polygons` outside the solid of `tree` (outside its complement, i.e. inside the solid, when `inverted`). A polygon
 * clear of the solid's bounding box is outside it without walking the tree: on a part with many features only the polygons near
 * the tool are classified.
 */
const outsideOf = (tree: Node, polygons: ReadonlyArray<Poly>, inverted: boolean, box: Box3, eps: number): Poly[] => {
  const kept: Poly[] = []
  const work: Poly[] = []
  for (const p of polygons) {
    if (outsideBox(p, box, eps)) { if (!inverted) kept.push(p) }
    else work.push(p)
  }
  const side = inverted ? -1 : 1
  if (tree.convex !== undefined) {
    // A chain of planes: what is in front of one is outside; what is behind all of them is inside.
    for (const p of work) {
      let pieces = [p]
      for (const plane of tree.convex) {
        if (pieces.length === 0) break
        const front: Poly[] = [], back: Poly[] = []
        for (const q of pieces) plane.splitPolygon(q, eps, front, back, front, back)
        if (!inverted) for (const q of front) kept.push(q)
        pieces = back
      }
      if (inverted) for (const q of pieces) kept.push(q)
    }
    return kept
  }
  if (tree.plane === undefined) { if (!inverted) for (const p of work) kept.push(p); return kept }
  const stack: Array<{ node: Node; polys: Poly[] }> = [{ node: tree, polys: work }]
  while (stack.length > 0) {
    const { node, polys } = stack.pop()!
    if (polys.length === 0) continue
    const front: Poly[] = [], back: Poly[] = []
    for (const p of polys) node.plane!.splitPolygon(p, eps, front, back, front, back, side)
    const f = inverted ? node.back : node.front, b = inverted ? node.front : node.back
    if (f !== undefined) stack.push({ node: f, polys: front })
    else for (const p of front) kept.push(p)
    if (b !== undefined) stack.push({ node: b, polys: back })
  }
  return kept
}

// ---------------------------------------------------------------- convex solids

/**
 * The distinct face planes of `mesh` when it is a convex solid, `undefined` otherwise. A closed connected surface whose every edge is
 * convex bounds a convex body (Tietze's theorem), so the test is local and linear: each edge must be shared by exactly two triangles,
 * the far vertex of one behind the other's plane, and the triangles must form one piece. Vertices are matched by position, so a mesh
 * that repeats vertices per face is read right.
 */
const convexPlanes = (mesh: Mesh, polygons: ReadonlyArray<Poly>, eps: number): Plane[] | undefined => {
  const p = mesh.positions, idx = mesh.indices
  if (polygons.length * 3 !== idx.length || polygons.length < 4) return undefined
  // Vertices are matched by their exact coordinates, hashed on the bits of the stored floats.
  const bits = new Int32Array(p.buffer, p.byteOffset, p.length)
  const buckets = new Map<number, number[]>()
  const firstOf: number[] = []
  const vid = (i: number): number => {
    const x = bits[i * 3]!, y = bits[i * 3 + 1]!, z = bits[i * 3 + 2]!
    const h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) | 0
    const bucket = buckets.get(h)
    if (bucket !== undefined) for (const v of bucket) { const j = firstOf[v]!; if (bits[j * 3] === x && bits[j * 3 + 1] === y && bits[j * 3 + 2] === z) return v }
    const v = firstOf.length
    firstOf.push(i)
    if (bucket === undefined) buckets.set(h, [v])
    else bucket.push(v)
    return v
  }
  const tri = Array.from({ length: polygons.length }, (_, t) => [vid(idx[t * 3]!), vid(idx[t * 3 + 1]!), vid(idx[t * 3 + 2]!)] as const)
  const edges = new Map<number, number>()
  const key = (a: number, b: number): number => a * 0x4000000 + b
  for (let t = 0; t < tri.length; t++) for (let e = 0; e < 3; e++) {
    const k = key(tri[t]![e]!, tri[t]![(e + 1) % 3]!)
    if (edges.has(k)) return undefined
    edges.set(k, t)
  }
  const parent = Int32Array.from({ length: tri.length }, (_, i) => i)
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]! } return i }
  for (let t = 0; t < tri.length; t++) for (let e = 0; e < 3; e++) {
    const a = tri[t]![e]!, b = tri[t]![(e + 1) % 3]!
    const u = edges.get(key(b, a))
    if (u === undefined) return undefined
    const far = polygons[u]!.vertices[tri[u]!.findIndex((v) => v !== a && v !== b)]!
    const plane = polygons[t]!.plane
    // A thin triangle's plane is too rough to judge an edge by; its neighbours' planes judge the same edges.
    if (!polygons[t]!.thin && dot(plane.normal, far) - plane.w > eps) return undefined
    const ra = find(t), rb = find(u)
    if (ra !== rb) parent[rb] = ra
  }
  for (let t = 1; t < tri.length; t++) if (find(t) !== find(0)) return undefined
  // Coplanar faces give one plane. The plane of a thin triangle is kept only if no vertex of the solid lies in front of it.
  const corners = [...new Set(polygons.flatMap((q) => q.vertices))]
  const planes: Plane[] = []
  const seen = new Map<string, Plane[]>()
  for (const poly of polygons) {
    const q = poly.plane
    if (poly.thin && corners.some((v) => dot(q.normal, v) - q.w > 10 * eps)) continue
    const k = `${Math.round(q.normal.x * 1e6)},${Math.round(q.normal.y * 1e6)},${Math.round(q.normal.z * 1e6)}`
    const bucket = seen.get(k) ?? []
    if (bucket.some((r) => dot(r.normal, q.normal) > 1 - 1e-12 && Math.abs(r.w - q.w) <= eps)) continue
    const c = q.clone()
    bucket.push(c)
    seen.set(k, bucket)
    planes.push(c)
  }
  return planes
}

// ---------------------------------------------------------------- meshes

/**
 * The triangles of `mesh` as polygons with their planes. A sliver thinner than `eps` is left out: its plane is numerical noise (a
 * ring collapsed onto an axis gives normals in any direction), and as a splitting plane or a convex face it would misclassify
 * everything; the gap it leaves is narrower than the tolerance and is closed by the clean-up.
 */
const polygonsOf = (mesh: Mesh, eps: number): Poly[] => {
  const out: Poly[] = []
  const p = mesh.positions
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const v = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!].map((i) => ({ x: p[i * 3]!, y: p[i * 3 + 1]!, z: p[i * 3 + 2]! }))
    const n = cross(sub(v[1]!, v[0]!), sub(v[2]!, v[0]!))
    const longest = Math.max(Math.hypot(v[1]!.x - v[0]!.x, v[1]!.y - v[0]!.y, v[1]!.z - v[0]!.z), Math.hypot(v[2]!.x - v[1]!.x, v[2]!.y - v[1]!.y, v[2]!.z - v[1]!.z), Math.hypot(v[0]!.x - v[2]!.x, v[0]!.y - v[2]!.y, v[0]!.z - v[2]!.z))
    const height = Math.hypot(n.x, n.y, n.z) / (longest || 1)
    if (!(longest > 0) || height < eps) continue
    const plane = Plane.fromPoints(v[0]!, v[1]!, v[2]!)
    if (plane !== undefined) out.push(new Poly(v, plane, height < 1e4 * eps))
  }
  return out
}

const meshOfPolygons = (polygons: ReadonlyArray<Poly>, weld: number, clean: boolean, holes: number): Mesh => {
  const positions: number[] = []
  const soup: number[][] = []
  for (const poly of polygons) {
    const ids: number[] = []
    for (const v of poly.vertices) { ids.push(positions.length / 3); positions.push(v.x, v.y, v.z) }
    soup.push(ids)
  }
  return cleanPolygonSoup({ positions, polygons: soup }, { tolerance: weld, mergeCoplanar: clean, fillHolesUpTo: holes })
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
  /**
   * Merge the coplanar fragments the partition leaves into whole faces and re-triangulate them (default true). The result is the
   * same solid either way; merged, it has a fraction of the triangles and no slivers, which keeps the next Boolean fast.
   */
  readonly mergeCoplanar?: boolean
}

const EMPTY: Mesh = { positions: new Float32Array(0), indices: new Uint32Array(0) }

/**
 * `a` united with, minus, or intersected with `b`. Both must be closed meshes with outward counter-clockwise faces. The result is
 * welded, free of T-junctions and has its coplanar fragments merged (`cad/mesh-clean.ts`): a closed manifold mesh when the inputs are.
 */
export const booleanMesh = (a: Mesh, b: Mesh, op: BooleanOp, options: CsgOptions = {}): Mesh => {
  const emptyA = a.indices.length === 0, emptyB = b.indices.length === 0
  if (emptyA || emptyB) return op === "union" ? (emptyA ? b : a) : op === "subtract" && !emptyA ? a : EMPTY
  const scale = Math.max(extent(a), extent(b))
  const eps = options.tolerance ?? 1e-7 * scale
  const boxA = boxOf(a), boxB = boxOf(b)
  // Apart: nothing to classify.
  if (!boxesMeet(boxA, boxB, eps)) return op === "union" ? mergeMeshes([a, b]) : op === "subtract" ? a : EMPTY
  const PA = polygonsOf(a, eps), PB = polygonsOf(b, eps)
  const classifier = (mesh: Mesh, polygons: Poly[]): Node => {
    const planes = convexPlanes(mesh, polygons, eps)
    if (planes === undefined) return new Node(polygons, eps)
    const node = new Node(undefined, eps)
    node.convex = planes
    return node
  }
  const A = classifier(a, PA), B = classifier(b, PB)
  let result: Poly[]
  // The steps are those of the classic tree form (a.clipTo(b), b.clipTo(a), b.invert(), ...) on polygon lists: the trees only
  // classify, and the second pass over B drops the faces it shares with A (coplanar, same direction) so they are kept once.
  switch (op) {
    case "union": {
      const ap = outsideOf(B, PA, false, boxB, eps)
      let bp = outsideOf(A, PB, false, boxA, eps)
      bp = flipped(outsideOf(A, flipped(bp), false, boxA, eps))
      result = ap.concat(bp)
      break
    }
    case "subtract": {
      const ap = outsideOf(B, flipped(PA), false, boxB, eps)
      let bp = outsideOf(A, PB, true, boxA, eps)
      bp = flipped(outsideOf(A, flipped(bp), true, boxA, eps))
      result = flipped(ap.concat(bp))
      break
    }
    case "intersect": {
      const bp1 = flipped(outsideOf(A, PB, true, boxA, eps))
      const ap = outsideOf(B, flipped(PA), true, boxB, eps)
      const bp = outsideOf(A, bp1, true, boxA, eps)
      result = flipped(ap.concat(bp))
      break
    }
  }
  // Points the partition computed for one corner along different edges differ by a few plane tolerances: they are one vertex.
  // Gaps between slivers of nearly tangent faces are closed up to 1e-4 of the size (a micrometre on a 10 mm part).
  return meshOfPolygons(result, Math.max(10 * eps, 1e-9 * scale), options.mergeCoplanar !== false, 1e-4 * scale)
}

/**
 * Several meshes combined by one operation, left to right. A union is reduced in pairs (a balanced tree: each mesh takes part in
 * log n Booleans, not n). A subtraction and an intersection fold left to right: each tool on its own is usually convex, which the
 * classifier handles as a handful of planes, where the union of all the tools would be one large tree.
 */
export const booleanAll = (meshes: ReadonlyArray<Mesh>, op: BooleanOp, options: CsgOptions = {}): Mesh => {
  if (meshes.length === 0) return { positions: new Float32Array(0), indices: new Uint32Array(0) }
  const unite = (list: ReadonlyArray<Mesh>): Mesh => {
    let level = [...list]
    while (level.length > 1) {
      const next: Mesh[] = []
      for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? booleanMesh(level[i]!, level[i + 1]!, "union", options) : level[i]!)
      level = next
    }
    return level[0]!
  }
  switch (op) {
    case "union": return unite(meshes)
    default: return meshes.slice(1).reduce((acc, m) => booleanMesh(acc, m, op, options), meshes[0]!)
  }
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
