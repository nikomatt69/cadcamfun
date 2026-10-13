/**
 * Fillets and chamfers on the edges of any body of the feature history, not only on the end faces of an extrusion.
 *
 * A body is a triangle mesh, which has no edges of its own, so they are recovered from the geometry:
 *   1. the triangles are grouped into planar faces (same unit normal and plane offset);
 *   2. the boundary of each face is the set of triangle edges that are not shared inside the face (T-junctions of the Boolean mesh
 *      leave a few false boundary pieces inside a face; they are harmless because only pieces lying on a face/face intersection line
 *      are used);
 *   3. for every pair of non-parallel faces the line where the planes meet is a candidate edge; the pieces of that line that are on
 *      the boundary of BOTH faces are the real edges (a 1D interval intersection along the line);
 *   4. an edge is convex when the face A lies behind the plane of face B, concave otherwise.
 *
 * Only edges between two planar faces are found, which is every edge of a prismatic part, a pocketed plate, a bracket or a
 * Boolean of boxes and extrusions. An edge between a plane and a curved face is not a straight line and is counted in `skipped`.
 *
 * A convex edge is rounded by cutting away the sliver between the edge and a rolling ball of radius r tangent to both faces
 * (subtract); a concave edge is filled with the same sliver (union). A chamfer is the same with a flat instead of the arc. The
 * tool is a prism along the edge, built a little oversize across the faces so no coplanar faces meet in the Boolean.
 *
 * The blend is exact along the edge. Where several blended edges meet in a vertex the tools simply overlap, which gives the usual
 * mitred corner, not a rolling-ball vertex patch.
 */
import { booleanMesh, mergeMeshes, rotateMesh } from "./csg.ts"
import type { Mesh } from "./solid.ts"
import { meshOf } from "./solid.ts"
import { sweepSolid, type P3 } from "./sweep-loft.ts"
import type { Vec2 } from "./vec.ts"

const sub = (a: P3, b: P3): P3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a: P3, b: P3): P3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const mul = (a: P3, s: number): P3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const dot = (a: P3, b: P3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: P3, b: P3): P3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const length = (a: P3): number => Math.hypot(a.x, a.y, a.z)
const unit = (a: P3): P3 => mul(a, 1 / (length(a) || 1))

export interface BlendEdge {
  readonly a: P3
  readonly b: P3
  /** Outward unit normals of the two faces. */
  readonly nA: P3
  readonly nB: P3
  readonly convex: boolean
  readonly length: number
  /** How far each face reaches from the edge (the blend cannot be wider than this). */
  readonly reachA: number
  readonly reachB: number
  /** One of the faces is a facet of a curved surface (a tessellated cylinder, cone or fillet): the edge is a rim of a curve. */
  readonly curved: boolean
}

interface Face {
  readonly normal: P3
  readonly offset: number
  /** Boundary pieces with the vertex of their triangle that is not on the piece (to know which side the face lies). */
  readonly boundary: Array<{ readonly p: P3; readonly q: P3; readonly opposite: P3 }>
  readonly vertices: P3[]
}

const PLANE_TOLERANCE = 2e-3
const NORMAL_TOLERANCE = 1e-3
const KEY = 1e-4

/** Groups the triangles of the mesh into planar faces and finds the boundary of each. */
const planarFaces = (mesh: Mesh): Face[] => {
  const p = mesh.positions, idx = mesh.indices
  interface Group { normal: P3; offset: number; triangles: number[] }
  const groups: Group[] = []
  const vertex = (i: number): P3 => ({ x: p[i * 3]!, y: p[i * 3 + 1]!, z: p[i * 3 + 2]! })
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = vertex(idx[t]!), b = vertex(idx[t + 1]!), c = vertex(idx[t + 2]!)
    const n = cross(sub(b, a), sub(c, a))
    const l = length(n)
    if (l < 1e-9) continue
    const normal = mul(n, 1 / l), offset = dot(normal, a)
    const group = groups.find((g) => dot(g.normal, normal) > 1 - NORMAL_TOLERANCE * NORMAL_TOLERANCE && Math.abs(g.offset - offset) < PLANE_TOLERANCE)
    if (group === undefined) groups.push({ normal, offset, triangles: [t] })
    else group.triangles.push(t)
  }
  return groups.map((g): Face => {
    const counts = new Map<string, { n: number; p: P3; q: P3; opposite: P3 }>()
    const vertices: P3[] = []
    for (const t of g.triangles) {
      const v = [vertex(idx[t]!), vertex(idx[t + 1]!), vertex(idx[t + 2]!)]
      vertices.push(...v)
      for (let k = 0; k < 3; k++) {
        const a = v[k]!, b = v[(k + 1) % 3]!, o = v[(k + 2) % 3]!
        const ka = `${Math.round(a.x / KEY)},${Math.round(a.y / KEY)},${Math.round(a.z / KEY)}`, kb = `${Math.round(b.x / KEY)},${Math.round(b.y / KEY)},${Math.round(b.z / KEY)}`
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
        const seen = counts.get(key)
        if (seen === undefined) counts.set(key, { n: 1, p: a, q: b, opposite: o })
        else seen.n++
      }
    }
    return { normal: g.normal, offset: g.offset, boundary: [...counts.values()].filter((e) => e.n === 1).map((e) => ({ p: e.p, q: e.q, opposite: e.opposite })), vertices }
  })
}

/** Union of intervals, sorted and merged. */
const merged = (intervals: Array<[number, number]>): Array<[number, number]> => {
  const sorted = intervals.filter(([a, b]) => b - a > 1e-6).sort((x, y) => x[0] - y[0])
  const out: Array<[number, number]> = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last !== undefined && a <= last[1] + 1e-4) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/** Straight edges between planar faces of the mesh; a facet of a tessellated curve is not an edge: neighbouring faces must differ by at least `minAngleDegrees`. */
export const findEdges = (mesh: Mesh, minAngleDegrees = 25): { readonly edges: BlendEdge[]; readonly faces: number } => {
  const faces = planarFaces(mesh)
  const found: Array<BlendEdge & { readonly i: number; readonly j: number }> = []
  const minSin = Math.sin((minAngleDegrees * Math.PI) / 180)
  const parallelSin = Math.sin((0.5 * Math.PI) / 180)
  // Faces that meet at a shallow angle are the facets of one curved surface: connect them.
  const parent = faces.map((_, k) => k)
  const root = (k: number): number => { while (parent[k] !== k) { parent[k] = parent[parent[k]!]!; k = parent[k]! } return k }
  for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
    const A = faces[i]!, B = faces[j]!
    const direction = cross(A.normal, B.normal)
    const s = length(direction)
    if (s < parallelSin) continue
    const shallow = s < minSin
    const e = mul(direction, 1 / s)
    // A point on the intersection line of the two planes.
    const base = mul(add(mul(cross(B.normal, e), A.offset), mul(cross(e, A.normal), B.offset)), 1 / s)
    const onLine = (q: P3): boolean => length(cross(sub(q, base), e)) < PLANE_TOLERANCE * 2
    const piecesOf = (face: Face) => face.boundary.filter((b) => onLine(b.p) && onLine(b.q))
    const pa = piecesOf(A), pb = piecesOf(B)
    if (pa.length === 0 || pb.length === 0) continue
    const span = (pieces: typeof pa): Array<[number, number]> => merged(pieces.map((b) => { const t0 = dot(sub(b.p, base), e), t1 = dot(sub(b.q, base), e); return t0 < t1 ? [t0, t1] : [t1, t0] }))
    const ia = span(pa), ib = span(pb)
    for (const [a0, a1] of ia) for (const [b0, b1] of ib) {
      const lo = Math.max(a0, b0), hi = Math.min(a1, b1)
      if (hi - lo < 1e-3) continue
      if (shallow) { parent[root(i)] = root(j); continue }
      // The face A lies on the side of the edge its boundary triangle points to; it is behind plane B on a convex edge.
      const witness = pa.find((b) => { const t = (dot(sub(b.p, base), e) + dot(sub(b.q, base), e)) / 2; return t >= lo - 1e-4 && t <= hi + 1e-4 }) ?? pa[0]!
      const toA = sub(witness.opposite, add(base, mul(e, dot(sub(witness.opposite, base), e))))
      const reach = (face: Face): number => face.vertices.reduce((best, v) => Math.max(best, length(cross(sub(v, base), e))), 0)
      found.push({
        a: add(base, mul(e, lo)), b: add(base, mul(e, hi)), nA: A.normal, nB: B.normal,
        convex: dot(toA, B.normal) < 0, length: hi - lo, reachA: reach(A), reachB: reach(B), curved: false, i, j
      })
    }
  }
  const size = new Map<number, number>()
  for (let k = 0; k < faces.length; k++) size.set(root(k), (size.get(root(k)) ?? 0) + 1)
  const curvedFace = (k: number): boolean => (size.get(root(k)) ?? 1) >= 3
  const edges = found.map(({ i, j, ...edge }): BlendEdge => ({ ...edge, curved: curvedFace(i) || curvedFace(j) }))
  return { edges, faces: faces.length }
}

export interface EdgeSelector {
  /** Only edges parallel to this axis. */
  readonly parallel?: "x" | "y" | "z"
  /** Only edges lying wholly inside this box. */
  readonly within?: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }
  /** Convex (outside) edges, concave (inside) edges or both. Default convex. */
  readonly kind?: "convex" | "concave" | "both"
  /** Skip edges shorter than this, mm. */
  readonly minLength?: number
  /** Also take the rims of curved surfaces (every facet edge of a tessellated hole or cylinder). Default false. */
  readonly curved?: boolean
}

export const selectEdges = (edges: ReadonlyArray<BlendEdge>, selector: EdgeSelector = {}): BlendEdge[] => {
  const kind = selector.kind ?? "convex"
  const axis = selector.parallel === undefined ? undefined : ({ x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } } as const)[selector.parallel]
  const inside = (q: P3): boolean => selector.within === undefined || (
    q.x >= selector.within.min[0] - 1e-3 && q.x <= selector.within.max[0] + 1e-3 &&
    q.y >= selector.within.min[1] - 1e-3 && q.y <= selector.within.max[1] + 1e-3 &&
    q.z >= selector.within.min[2] - 1e-3 && q.z <= selector.within.max[2] + 1e-3)
  return edges.filter((e) =>
    (selector.curved === true || !e.curved) && (kind === "both" || (kind === "convex") === e.convex) &&
    (axis === undefined || Math.abs(dot(unit(sub(e.b, e.a)), axis)) > Math.cos((2 * Math.PI) / 180)) &&
    e.length >= (selector.minLength ?? 0) && inside(e.a) && inside(e.b))
}

export interface BlendResult {
  readonly mesh: Mesh
  readonly blended: number
  /** Right-angled convex vertices where three equal fillets meet and got their spherical corner. */
  readonly vertices: number
  /** Edges that were selected but could not be blended, with the reason. */
  readonly rejected: ReadonlyArray<string>
}

/** The cross-section of the tool for one edge, as 3D offsets from the edge line and 2D coordinates in the section's plane. */
const section = (edge: BlendEdge, radius: number, style: "fillet" | "chamfer"): { readonly points: P3[]; readonly flat: Vec2[]; readonly basis: [P3, P3] } | string => {
  const { nA, nB } = edge
  const cosA = dot(nA, nB)
  if (1 + cosA < 1e-3) return "the faces meet at a knife edge"
  const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)))
  const tangent = radius * Math.tan(alpha / 2)
  const limit = Math.min(edge.reachA, edge.reachB)
  if (style === "fillet" && tangent > limit + 1e-6) return `a radius of ${radius} mm needs ${tangent.toFixed(2)} mm of face on each side; the faces reach only ${limit.toFixed(2)} mm`
  if (style === "chamfer" && radius > limit + 1e-6) return `a chamfer of ${radius} mm is wider than the faces (${limit.toFixed(2)} mm)`
  const sign = edge.convex ? 1 : -1
  const g = Math.max(0.05, radius * 0.1)
  // Mitre point of the two planes offset by g (away from the material on a convex edge, into it on a concave one).
  const corner = mul(add(nA, nB), (sign * g) / (1 + cosA))
  const out: P3[] = [corner]
  if (style === "chamfer") {
    // Along each face, away from the edge and perpendicular to it.
    const dA = unit(add(mul(nB, -sign), mul(nA, sign * cosA))), dB = unit(add(mul(nA, -sign), mul(nB, sign * cosA)))
    const c = radius
    out.push(add(add(mul(dA, c), mul(nA, sign * g)), { x: 0, y: 0, z: 0 }), mul(dA, c), mul(dB, c), add(mul(dB, c), mul(nB, sign * g)))
  } else {
    // Rolling ball: centre at r behind (convex) or in front of (concave) the edge along the bisector.
    const centre = mul(add(nA, nB), (-sign * radius) / (1 + cosA))
    const t1 = add(centre, mul(nA, sign * radius)), t2 = add(centre, mul(nB, sign * radius))
    const steps = Math.min(48, Math.max(2, Math.ceil(alpha / Math.max(1e-3, 2 * Math.acos(Math.max(0, 1 - 0.01 / radius))))))
    out.push(add(t1, mul(nA, sign * g)), t1)
    const sinAlpha = Math.sin(alpha)
    for (let k = 1; k < steps; k++) {
      const u = k / steps
      const dir = add(mul(nA, Math.sin((1 - u) * alpha) / sinAlpha), mul(nB, Math.sin(u * alpha) / sinAlpha))
      out.push(add(centre, mul(dir, sign * radius)))
    }
    out.push(t2, add(t2, mul(nB, sign * g)))
  }
  const e = unit(cross(nA, nB))
  const u = unit(add(nA, nB)), v = cross(e, u)
  return { points: out, flat: out.map((q) => ({ x: dot(q, u), y: dot(q, v) })), basis: [u, v] }
}

/**
 * Blends the selected edges of the mesh. Each edge is cut (convex) or filled (concave) in turn; an edge that cannot be blended
 * (the radius is wider than the faces, or the faces are nearly parallel) is left alone and named in `rejected`.
 */
export const blendEdges = (mesh: Mesh, edges: ReadonlyArray<BlendEdge>, radius: number, style: "fillet" | "chamfer" = "fillet"): BlendResult => {
  if (!(radius > 0)) throw new RangeError(`A ${style} needs a positive size (it is ${radius})`)
  let current = mesh
  let blended = 0
  const rejected: string[] = []
  let vertices = 0
  const done: BlendEdge[] = []
  for (const edge of edges) {
    const name = `edge ${edge.a.x.toFixed(2)},${edge.a.y.toFixed(2)},${edge.a.z.toFixed(2)} to ${edge.b.x.toFixed(2)},${edge.b.y.toFixed(2)},${edge.b.z.toFixed(2)}`
    const cut = section(edge, radius, style)
    if (typeof cut === "string") { rejected.push(`${name}: ${cut}`); continue }
    const e = unit(sub(edge.b, edge.a))
    const overrun = 0.01
    try {
      const tool = sweepSolid({
        ring: cut.points.map((q) => add(edge.a, q)), ring2d: cut.flat, normal: e, centre: edge.a, path: [sub(edge.a, mul(e, overrun)), add(edge.b, mul(e, overrun))], closed: false
      })
      current = booleanMesh(current, tool, edge.convex ? "subtract" : "union")
      blended++
      done.push(edge)
    } catch (error) {
      rejected.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (style === "fillet") {
    const corners = blendVertices(current, done.filter((e) => e.convex), radius)
    current = corners.mesh
    vertices = corners.count
  }
  return { mesh: current, blended, vertices, rejected }
}

/** A prism of the polygon `ring` (in the plane through `origin` perpendicular to `axis`) carried `distance` along `axis`. */
const slab = (ring: ReadonlyArray<P3>, ring2d: ReadonlyArray<Vec2>, origin: P3, axis: P3, distance: number): Mesh =>
  sweepSolid({ ring, ring2d, normal: axis, centre: origin, path: [origin, add(origin, mul(axis, distance))], closed: false })

/**
 * The rolling-ball corner where three filleted edges of equal radius meet at a right-angled convex vertex. The three edge tools
 * keep the intersection of three cylinders there (a Steinmetz solid); the ball that rolled along the edges would keep only its
 * own octant. So the tricylinder part of the corner cube outside the sphere is removed.
 */
const blendVertices = (mesh: Mesh, edges: ReadonlyArray<BlendEdge>, radius: number): { readonly mesh: Mesh; readonly count: number } => {
  const key = (p: P3): string => `${Math.round(p.x / 1e-3)},${Math.round(p.y / 1e-3)},${Math.round(p.z / 1e-3)}`
  const at = new Map<string, { readonly point: P3; readonly edges: BlendEdge[] }>()
  for (const edge of edges) for (const point of [edge.a, edge.b]) {
    const k = key(point)
    const entry = at.get(k)
    if (entry === undefined) at.set(k, { point, edges: [edge] })
    else entry.edges.push(edge)
  }
  let current = mesh
  let count = 0
  const regions: Mesh[] = []
  for (const { point, edges: incident } of at.values()) {
    if (incident.length !== 3) continue
    const normals: P3[] = []
    for (const e of incident) for (const n of [e.nA, e.nB]) if (!normals.some((m) => dot(m, n) > 0.999)) normals.push(n)
    if (normals.length !== 3) continue
    const [n1, n2, n3] = normals as [P3, P3, P3]
    if (Math.abs(dot(n1, n2)) > 1e-3 || Math.abs(dot(n1, n3)) > 1e-3 || Math.abs(dot(n2, n3)) > 1e-3) continue
    const r = radius
    const centre = sub(point, mul(add(add(n1, n2), n3), r))
    // The corner cube: from a little outside the vertex to r inside along each face normal, built as a slab along -n1.
    const g = 0.05
    const cubeCentre = sub(point, mul(add(add(n1, n2), n3), r / 2 - g / 2))
    const half = r / 2 + g / 2
    const cubeRing = [[-half, -half], [half, -half], [half, half], [-half, half]] as const
    const cubeStart = add(cubeCentre, mul(n1, half))
    let region = slab(cubeRing.map(([a, b]) => add(add(cubeStart, mul(n2, a)), mul(n3, b))), cubeRing.map(([a, b]) => ({ x: a, y: b })), cubeStart, mul(n1, -1), 2 * half)
    // The three cylinders, along the three edge directions through the ball centre.
    const axes: Array<[P3, P3, P3]> = [[n1, n2, n3], [n2, n1, n3], [n3, n1, n2]]
    for (const [axis, u, v] of axes) {
      // The region must hold everything of the body in the corner cube outside the ball, so its cylinders lie wholly outside the
      // filleted faces (whatever their facets): 48 sides, circumscribed with 0.4 % to spare. Faces on the body's own, or dipping
      // under them between vertices, would leave fins and tunnels of no thickness along the fillets.
      const sides = 48
      const rc = (r * 1.004) / Math.cos(Math.PI / sides)
      const circle = Array.from({ length: sides }, (_, k) => ({ x: rc * Math.cos((2 * Math.PI * k) / sides), y: rc * Math.sin((2 * Math.PI * k) / sides) }))
      // The edge direction (cross of the other two normals) is parallel to `axis`: n1 x n2 = +-n3 for a right-angled frame.
      const start = sub(centre, mul(axis, 2 * r))
      const cyl = slab(circle.map((c) => add(add(start, mul(u, c.x)), mul(v, c.y))), circle, start, axis, 4 * r)
      region = booleanMesh(region, cyl, "intersect")
    }
    // The ball is turned off-axis so none of its vertices lies on a plane of the corner cube (coincident planes make the Boolean
    // crawl), and it is meshed coarsely: the sliver it leaves is a few cubic millimetres, so a 0.05 mm chord is far below any effect.
    // It is circumscribed: the faces of a meshed sphere sink up to about 0.5 % of the radius below it (24 rings), and a ball that
    // dips under the region's cylinders along the circles where it should touch them cuts the corner into fins of no thickness.
    // 2 % larger, the ball covers them there and leaves a clean corner; it removes 2 % of r less at the very corner.
    const ball = rotateMesh(meshOf({ _tag: "Sphere", center: centre, radius: r * 1.02, rings: 24 } as never, 0.05), { x: 1, y: 2, z: 3 }, 0.37, centre)
    region = booleanMesh(region, ball, "subtract")
    regions.push(region)
    count++
  }
  // The corner regions are far apart (one per vertex): one cut of the big body instead of one per vertex.
  if (regions.length > 0) current = booleanMesh(current, mergeMeshes(regions), "subtract")
  return { mesh: current, count }
}
