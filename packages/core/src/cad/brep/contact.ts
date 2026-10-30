/**
 * Designed contact between operands (spec 42 R4): two solids that touch along a curve (a cylinder tangent to a wall, two
 * boxes sharing only an edge) leave an edge that four face fragments meet at. No two-manifold solid has such an edge, and the
 * old answer was to push one operand away. Here the contact is kept where it is: the edge becomes two coincident edges, each
 * shared by the two fragments that bound one wedge of material, and a vertex where the wedges meet becomes one vertex per
 * wedge. The result is a valid manifold B-rep whose two edges touch (zero-thickness contact, within the edge tolerance);
 * the caller reports it, and the volume is exactly the operands'.
 *
 * The wedges are found from geometry: at the middle of the edge each fragment has an inward direction (in its tangent plane,
 * across the edge) and a material side (against its outward normal). Material runs from a fragment's inward direction towards
 * its material side until it meets the next fragment of the opposite sense; two fragments at the same direction (a cusp, the
 * tangent case) are a wedge of zero angle.
 */
import { cross3, dot3, normalize3, scale3, sub3, type Vec3 } from "./math.ts"
import { curvePoint, surfaceNormal, surfaceProject } from "./geom.ts"
import type { Coedge, Edge, Face, Loop } from "./topology.ts"

interface Use { readonly face: number; readonly loop: number; readonly pos: number; readonly coedge: Coedge }

export interface ContactResult {
  readonly vertices: Array<{ point: Vec3; tol: number }>
  readonly edges: Edge[]
  readonly faces: Face[]
  /** Edges that were doubled. */
  readonly separatedEdges: number
  /** Vertices that were split into one per wedge. */
  readonly splitVertices: number
}

const TAU = Math.PI * 2

/** Edges used more than twice, with their uses. */
const crowdedEdges = (edges: ReadonlyArray<Edge>, faces: ReadonlyArray<Face>): Map<number, Use[]> => {
  const uses = new Map<number, Use[]>()
  faces.forEach((f, fi) => f.loops.forEach((l, li) => l.coedges.forEach((c, pos) => {
    const u = uses.get(c.edge) ?? []
    u.push({ face: fi, loop: li, pos, coedge: c })
    uses.set(c.edge, u)
  })))
  for (const [ei, u] of uses) if (u.length <= 2 || ei >= edges.length) uses.delete(ei)
  return uses
}

/**
 * Pairs the uses of one crowded edge into wedges. Returns the pairs, or undefined when the geometry does not give a
 * consistent pairing (the caller then leaves the result alone and the operation is refused as before).
 */
const pairWedges = (edge: Edge, faces: ReadonlyArray<Face>, uses: ReadonlyArray<Use>): Array<[Use, Use]> | undefined => {
  if (uses.length % 2 !== 0) return undefined
  const tm = (edge.t0 + edge.t1) / 2
  const P = curvePoint(edge.curve, tm)
  const h = (edge.t1 - edge.t0) * 1e-6
  const T = normalize3(sub3(curvePoint(edge.curve, tm + h), curvePoint(edge.curve, tm - h)))
  const seed = Math.abs(T.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  const B1 = normalize3(sub3(seed, scale3(T, dot3(seed, T))))
  const B2 = cross3(T, B1)
  const info = uses.map((u) => {
    const f = faces[u.face]!
    const q = surfaceProject(f.surface, P)
    const nRaw = surfaceNormal(f.surface, q.u, q.v)
    const n = f.reversed ? scale3(nRaw, -1) : nRaw
    // Direction of travel of this use; the material is on the left when seen from outside, i.e. along n x travel.
    const travel = u.coedge.reversed ? scale3(T, -1) : T
    const d = normalize3(cross3(n, travel))
    const m = scale3(n, -1)
    const theta = Math.atan2(dot3(d, B2), dot3(d, B1))
    // Rotating from the inward direction to the material side: counter-clockwise about T (+1) or clockwise (-1).
    const sense = Math.sign(dot3(cross3(d, m), T))
    return { u, theta, sense }
  })
  const plus = info.filter((i) => i.sense > 0), minus = info.filter((i) => i.sense < 0)
  if (plus.length !== minus.length || plus.length * 2 !== info.length) return undefined
  const ccw = (from: number, to: number): number => {
    let a = (to - from) % TAU
    if (a < 0) a += TAU
    return a > TAU - 1e-7 ? 0 : a
  }
  const taken = new Set<number>()
  const pairs: Array<[Use, Use]> = []
  for (const p of plus) {
    let best = -1, bestA = Infinity
    minus.forEach((m, k) => { if (!taken.has(k)) { const a = ccw(p.theta, m.theta); if (a < bestA) { bestA = a; best = k } } })
    if (best < 0) return undefined
    taken.add(best)
    const m = minus[best]!
    // A wedge is bounded by one use in each direction of travel.
    if (p.u.coedge.reversed === m.u.coedge.reversed) return undefined
    pairs.push([p.u, m.u])
  }
  return pairs
}

/**
 * Doubles every edge that more than two fragments meet at (when the geometry pairs them into wedges), then splits the
 * vertices of those edges into one vertex per connected fan of faces. Returns undefined when nothing needs doing or when a
 * crowded edge cannot be paired.
 */
export const separateContacts = (
  vertices: ReadonlyArray<{ readonly point: Vec3; readonly tol: number }>,
  edges: ReadonlyArray<Edge>,
  faces: ReadonlyArray<Face>
): ContactResult | undefined => {
  const crowded = crowdedEdges(edges, faces)
  if (crowded.size === 0) return undefined
  const outEdges: Edge[] = edges.slice()
  const outVerts = vertices.map((v) => ({ point: v.point, tol: v.tol }))
  const loops: Coedge[][][] = faces.map((f) => f.loops.map((l) => l.coedges.slice()))
  const touched = new Set<number>()
  let separatedEdges = 0
  for (const [ei, uses] of crowded) {
    const pairs = pairWedges(edges[ei]!, faces, uses)
    if (pairs === undefined) return undefined
    touched.add(edges[ei]!.v0); touched.add(edges[ei]!.v1)
    pairs.forEach((pair, k) => {
      if (k === 0) return
      outEdges.push({ ...edges[ei]! })
      const copy = outEdges.length - 1
      for (const u of pair) loops[u.face]![u.loop]![u.pos] = { ...u.coedge, edge: copy }
      separatedEdges++
    })
  }
  const outFaces: Face[] = faces.map((f, fi) => ({ ...f, loops: loops[fi]!.map((coedges): Loop => ({ coedges })) }))
  const splitVertices = splitFans(outVerts, outEdges, outFaces, touched)
  return { vertices: outVerts, edges: outEdges, faces: outFaces, separatedEdges, splitVertices }
}

/**
 * Splits every vertex whose faces form more than one fan (two shells touching at a point: a cavity whose wall meets the outer
 * wall in one point, two spheres tangent outside). Returns undefined when every vertex has one fan.
 */
export const separateTouchingVertices = (
  vertices: ReadonlyArray<{ readonly point: Vec3; readonly tol: number }>,
  edges: ReadonlyArray<Edge>,
  faces: ReadonlyArray<Face>
): ContactResult | undefined => {
  const outVerts = vertices.map((v) => ({ point: v.point, tol: v.tol }))
  const outEdges = edges.slice()
  const splitVertices = splitFans(outVerts, outEdges, faces, new Set(vertices.map((_, i) => i)))
  if (splitVertices === 0) return undefined
  return { vertices: outVerts, edges: outEdges, faces: faces.slice(), separatedEdges: 0, splitVertices }
}

/**
 * Gives each connected fan of faces at a vertex its own copy of the vertex. A fan is the set of edge ends that the corners of
 * the face loops join: two corners are in one fan when they share an edge end. A closed edge has two ends, so its start and its
 * end can belong to different fans.
 */
const splitFans = (
  vertices: Array<{ point: Vec3; tol: number }>,
  edges: Edge[],
  faces: ReadonlyArray<Face>,
  only: ReadonlySet<number>
): number => {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while ((parent.get(r) ?? r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  const union = (a: string, b: string): void => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra) }
  const vertexOfSlot = (slot: string): number => {
    const [e, k] = slot.split(":").map(Number)
    return k === 0 ? edges[e!]!.v0 : edges[e!]!.v1
  }
  // End slot of a coedge's travel and start slot of the next one.
  const endSlot = (c: Coedge) => `${c.edge}:${c.reversed ? 0 : 1}`
  const startSlot = (c: Coedge) => `${c.edge}:${c.reversed ? 1 : 0}`
  const slots = new Set<string>()
  for (const f of faces) for (const l of f.loops) {
    const n = l.coedges.length
    for (let i = 0; i < n; i++) {
      const a = endSlot(l.coedges[i]!), b = startSlot(l.coedges[(i + 1) % n]!)
      if (!only.has(vertexOfSlot(a))) continue
      slots.add(a); slots.add(b)
      union(a, b)
    }
  }
  const fans = new Map<number, Map<string, string[]>>()
  for (const s of slots) {
    const v = vertexOfSlot(s)
    const byRoot = fans.get(v) ?? new Map<string, string[]>()
    const root = find(s)
    byRoot.set(root, [...(byRoot.get(root) ?? []), s])
    fans.set(v, byRoot)
  }
  let split = 0
  for (const [v, byRoot] of fans) {
    let first = true
    for (const members of byRoot.values()) {
      if (first) { first = false; continue }
      vertices.push({ point: vertices[v]!.point, tol: vertices[v]!.tol })
      const copy = vertices.length - 1
      for (const s of members) {
        const [e, k] = s.split(":").map(Number)
        const old = edges[e!]!
        edges[e!] = k === 0 ? { ...old, v0: copy } : { ...old, v1: copy }
      }
      split++
    }
  }
  return split
}
