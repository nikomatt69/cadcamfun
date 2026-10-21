/**
 * Healing of foreign solids (STEP from another system): faces that were written with their own copies of every vertex and
 * edge are stitched back into one shell. Three passes, each only within the tolerance and never moving geometry:
 *
 *   1. weld vertices closer than `tol` (the first of a cluster stays);
 *   2. weld edges that are the same curve between the same vertices (a seam written twice, the shared edge of two faces
 *      written once per face), flipping the coedge sense where the copy ran the other way;
 *   3. drop the edge uses that collapsed to nothing (a zero-length edge between a welded pair of vertices).
 *
 * The result is validated; `report` says what was done and what remains, so a caller can refuse a body that is still
 * not a solid instead of working on it.
 */
import { dist3, type Vec3 } from "./math.ts"
import { curvePoint } from "./geom.ts"
import { compactBrep, edgePointAt, type Brep, type Coedge, type Edge, type Loop } from "./topology.ts"
import { validateBrep, type BrepReport } from "./validate.ts"

export interface HealOptions {
  /** Welding tolerance, mm (default 1e-5 × model size, at least 1e-6). */
  readonly tol?: number
}

export interface HealReport {
  readonly verticesWelded: number
  readonly edgesWelded: number
  readonly degenerateUsesDropped: number
  readonly before: BrepReport
  readonly after: BrepReport
}

export interface HealResult {
  readonly brep: Brep
  readonly report: HealReport
}

export const healBrep = (b: Brep, options: HealOptions = {}): HealResult => {
  const before = validateBrep(b, { skipVolume: true })
  let lo = { x: Infinity, y: Infinity, z: Infinity }, hi = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const v of b.vertices) {
    lo = { x: Math.min(lo.x, v.point.x), y: Math.min(lo.y, v.point.y), z: Math.min(lo.z, v.point.z) }
    hi = { x: Math.max(hi.x, v.point.x), y: Math.max(hi.y, v.point.y), z: Math.max(hi.z, v.point.z) }
  }
  const size = b.vertices.length === 0 ? 1 : Math.max(1e-3, dist3(lo, hi))
  const tol = options.tol ?? Math.max(1e-6, size * 1e-5)

  // 1. vertices, bucketed on a grid of one tolerance so the welding is linear.
  const cell = (p: Vec3) => `${Math.floor(p.x / tol)},${Math.floor(p.y / tol)},${Math.floor(p.z / tol)}`
  const grid = new Map<string, number[]>()
  const rep: number[] = b.vertices.map((_, i) => i)
  let verticesWelded = 0
  b.vertices.forEach((v, i) => {
    const cx = Math.floor(v.point.x / tol), cy = Math.floor(v.point.y / tol), cz = Math.floor(v.point.z / tol)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
        if (rep[i] === i && rep[j] === j && dist3(b.vertices[j]!.point, v.point) <= tol) { rep[i] = j; verticesWelded++ }
      }
    }
    const k = cell(v.point)
    grid.set(k, [...(grid.get(k) ?? []), i])
  })
  const edges1: Edge[] = b.edges.map((e) => ({ ...e, v0: rep[e.v0]!, v1: rep[e.v1]! }))

  // 2. edges: same end vertices and the same curve in between.
  const edgeRep: number[] = edges1.map((_, i) => i)
  const flip: boolean[] = edges1.map(() => false)
  const byEnds = new Map<string, number[]>()
  let edgesWelded = 0
  edges1.forEach((e, i) => {
    const k = e.v0 < e.v1 ? `${e.v0}_${e.v1}` : `${e.v1}_${e.v0}`
    const group = byEnds.get(k) ?? []
    for (const j of group) {
      if (edgeRep[j] !== j) continue
      const f = edges1[j]!
      const sameDir = e.v0 === f.v0 && e.v1 === f.v1
      const closed = e.v0 === e.v1
      // Compare at the middle and quarter points, in the direction the end vertices say (a closed edge: either way).
      const q = (g: Edge, t: number) => edgePointAt(g, t)
      const ok = (dir: boolean) => dist3(q(e, 0.5), q(f, 0.5)) <= tol * 10 && dist3(q(e, 0.25), q(f, dir ? 0.25 : 0.75)) <= tol * 10
      if (!closed && ok(sameDir)) { edgeRep[i] = j; flip[i] = !sameDir; edgesWelded++; break }
      if (closed && (ok(true) || ok(false))) { edgeRep[i] = j; flip[i] = !ok(true); edgesWelded++; break }
    }
    group.push(i)
    byEnds.set(k, group)
  })

  // 3. loops on the welded edges; collapsed uses (an edge whose two ends are one vertex and whose curve does not leave it) go.
  let degenerateUsesDropped = 0
  const collapsed = (e: Edge): boolean => e.v0 === e.v1 && dist3(curvePoint(e.curve, e.t0), curvePoint(e.curve, (e.t0 + e.t1) / 2)) <= tol
  const faces = b.faces.map((f) => ({
    ...f,
    loops: f.loops.map((l): Loop => ({
      coedges: l.coedges.flatMap((c): Coedge[] => {
        const r = edgeRep[c.edge]!
        if (collapsed(edges1[r]!)) { degenerateUsesDropped++; return [] }
        return [{ edge: r, reversed: flip[c.edge]! ? !c.reversed : c.reversed, ...(c.pcurve !== undefined && !flip[c.edge]! ? { pcurve: c.pcurve } : {}) }]
      })
    }))
  }))
  // A welded vertex sits at the mean of the curve ends that meet there, so it is on every one of its edges to within the gap
  // that was closed; its tolerance records that gap.
  const sum = b.vertices.map(() => ({ x: 0, y: 0, z: 0, n: 0 }))
  const ends = edges1.flatMap((e, i) => (edgeRep[i] === i ? [{ v: e.v0, p: curvePoint(e.curve, e.t0) }, { v: e.v1, p: curvePoint(e.curve, e.t1) }] : []))
  for (const { v, p } of ends) { const a = sum[v]!; a.x += p.x; a.y += p.y; a.z += p.z; a.n++ }
  const vertices = b.vertices.map((v, i) => {
    const a = sum[i]!
    if (a.n === 0 || rep[i] !== i) return v
    const point = { x: a.x / a.n, y: a.y / a.n, z: a.z / a.n }
    const gap = Math.max(...ends.filter((x) => x.v === i).map((x) => dist3(x.p, point)))
    return { point, tol: Math.max(v.tol, gap) }
  })
  const healed = compactBrep({ vertices, edges: edges1, faces, shells: b.shells })
  return { brep: healed, report: { verticesWelded, edgesWelded, degenerateUsesDropped, before, after: validateBrep(healed) } }
}
