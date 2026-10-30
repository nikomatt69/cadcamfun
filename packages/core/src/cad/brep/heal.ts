/**
 * Healing of foreign solids (STEP from another system): faces that were written with their own copies of every vertex and
 * edge are stitched back into one shell, and the geometry that was written slightly apart is moved together, within a tolerance.
 *
 *   1. weld vertices closer than `tol` (the first of a cluster stays);
 *   2. weld edges that are the same curve between the same vertices (a seam written twice, the shared edge of two faces
 *      written once per face), flipping the coedge sense where the copy ran the other way;
 *   3. drop the edge uses that collapsed to nothing (a zero-length edge between a welded pair of vertices);
 *   4. drop a face written twice (same edges, same sense: its edges would be used four times);
 *   5. tighten (spec 42 R6): a welded vertex sits at the mean of the curve ends that met there, which is off the faces by up to
 *      the gap that was closed. It is re-projected onto the faces around it (Gauss-Newton on the sum of squared distances to
 *      their surfaces), the straight edges are refitted through the moved vertices, and the tolerances are measured again.
 *      A vertex that would move by more than `tol` stays where the weld put it and keeps the larger tolerance.
 *   6. a face whose boundary still carries a tolerance above the loose limit is flagged `loose`.
 *
 * Geometry moves only inside `tol`: a gap above it is not closed. The result is validated; the report says what was done, how
 * far geometry moved, the largest tolerance left and, for a body that is still not a solid, why (the nearest unmatched edges
 * and the gap between them), so a caller can refuse it instead of working on it.
 */
import { dist3, dot3, MODEL_TOL, scale3, sub3, type Vec3 } from "./math.ts"
import { curvePoint, surfaceDistance, surfaceNormal, surfacePoint, surfaceProject, type Surface } from "./geom.ts"
import { compactBrep, edgePointAt, type Brep, type Coedge, type Edge, type Face, type Loop, type Vertex } from "./topology.ts"
import { validateBrep, type BrepReport } from "./validate.ts"

export interface HealOptions {
  /** Welding tolerance, mm (default 1e-5 × model size, at least 1e-6). Geometry never moves further than this. */
  readonly tol?: number
  /** Re-project welded vertices onto their faces and refit straight edges (default true). */
  readonly tighten?: boolean
  /** A face whose boundary tolerance exceeds this is flagged `loose` (default 10 × the model tolerance). */
  readonly looseTol?: number
}

export interface HealReport {
  readonly verticesWelded: number
  readonly edgesWelded: number
  readonly degenerateUsesDropped: number
  /** Faces written twice that were dropped. */
  readonly duplicateFacesDropped: number
  /** Vertices re-projected onto their faces. */
  readonly verticesTightened: number
  /** Straight edges refitted through their moved end vertices. */
  readonly edgesRefitted: number
  /** The furthest any vertex of the input ended from where it was written, mm (never above `tol`). */
  readonly maxMove: number
  /** The largest vertex or edge tolerance of the healed body, mm. */
  readonly maxTolerance: number
  /** Faces of the healed body (indices into it) whose boundary tolerance is above the loose limit. */
  readonly looseFaces: ReadonlyArray<number>
  /** The welding tolerance that was used. */
  readonly tol: number
  /** Why the body is still not a solid (empty when it is): open edges with the gap to their nearest neighbour. */
  readonly diagnostics: ReadonlyArray<string>
  /** The smallest gap between two edges that stay unmatched, mm (undefined when every edge matched): what a larger tolerance would have to close. */
  readonly closestOpenGap?: number
  readonly before: BrepReport
  readonly after: BrepReport
}

export interface HealResult {
  readonly brep: Brep
  readonly report: HealReport
}

const solve3 = (A: number[][], b: number[]): [number, number, number] | undefined => {
  const [a, bb, c] = A[0]!, [d, e, f] = A[1]!, [g, h, i] = A[2]!
  const det = a! * (e! * i! - f! * h!) - bb! * (d! * i! - f! * g!) + c! * (d! * h! - e! * g!)
  if (Math.abs(det) < 1e-300) return undefined
  const x = (b[0]! * (e! * i! - f! * h!) - bb! * (b[1]! * i! - f! * b[2]!) + c! * (b[1]! * h! - e! * b[2]!)) / det
  const y = (a! * (b[1]! * i! - f! * b[2]!) - b[0]! * (d! * i! - f! * g!) + c! * (d! * b[2]! - b[1]! * g!)) / det
  const z = (a! * (e! * b[2]! - b[1]! * h!) - bb! * (d! * b[2]! - b[1]! * g!) + b[0]! * (d! * h! - e! * g!)) / det
  return [x, y, z]
}

/**
 * The point near `p0` that minimises the sum of squared distances to the surfaces (Gauss-Newton, regularised so that two
 * surfaces meeting in a curve give the nearest point of that curve). Undefined when it did not improve on `p0`.
 */
const reproject = (p0: Vec3, surfaces: ReadonlyArray<Surface>, size: number): Vec3 | undefined => {
  const worst = (p: Vec3) => Math.max(...surfaces.map((s) => surfaceDistance(s, p)))
  let p = p0
  for (let it = 0; it < 25; it++) {
    const A = [[1e-9, 0, 0], [0, 1e-9, 0], [0, 0, 1e-9]]
    const b = [0, 0, 0]
    for (const s of surfaces) {
      const q = surfaceProject(s, p)
      const sp = surfacePoint(s, q.u, q.v)
      const n = surfaceNormal(s, q.u, q.v)
      const d = dot3(sub3(p, sp), n)
      const nv = [n.x, n.y, n.z]
      for (let r = 0; r < 3; r++) { b[r]! += nv[r]! * d; for (let c = 0; c < 3; c++) A[r]![c]! += nv[r]! * nv[c]! }
    }
    const x = solve3(A, b)
    if (x === undefined) break
    p = { x: p.x - x[0], y: p.y - x[1], z: p.z - x[2] }
    if (Math.hypot(x[0], x[1], x[2]) < 1e-14 * size) break
  }
  return worst(p) < worst(p0) ? p : undefined
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
  const looseTol = options.looseTol ?? 10 * MODEL_TOL

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
  const faces: Face[] = b.faces.map((f) => ({
    ...f,
    loops: f.loops.map((l): Loop => ({
      coedges: l.coedges.flatMap((c): Coedge[] => {
        const r = edgeRep[c.edge]!
        if (collapsed(edges1[r]!)) { degenerateUsesDropped++; return [] }
        return [{ edge: r, reversed: flip[c.edge]! ? !c.reversed : c.reversed, ...(c.pcurve !== undefined && !flip[c.edge]! ? { pcurve: c.pcurve } : {}) }]
      })
    }))
  }))

  // 4. a face written twice: the same edges in the same sense. Its edges would be used four times; one copy goes.
  const signature = (f: Face) => `${f.reversed ? "r" : "f"}:${f.loops.map((l) => l.coedges.map((c) => `${c.edge}${c.reversed ? "'" : ""}`).sort().join(",")).sort().join("|")}`
  const seen = new Map<string, number>()
  const dropped = new Set<number>()
  // Only inside a closed shell: two identical patches of an open surface are an overlap that stitching must refuse, not a copy.
  const inClosed = new Set(b.shells.filter((s) => s.closed).flatMap((s) => s.faces))
  faces.forEach((f, i) => {
    if (f.loops.length === 0 || !inClosed.has(i)) return
    const k = signature(f)
    if (seen.has(k)) dropped.add(i)
    else seen.set(k, i)
  })
  const shells = b.shells.map((s) => ({ closed: s.closed, faces: s.faces.filter((fi) => !dropped.has(fi)) }))

  // A welded vertex sits at the mean of the curve ends that meet there, so it is on every one of its edges to within the gap
  // that was closed; its tolerance records that gap.
  const sum = b.vertices.map(() => ({ x: 0, y: 0, z: 0, n: 0 }))
  const liveEdges = new Set<number>()
  edges1.forEach((_, i) => { if (edgeRep[i] === i) liveEdges.add(i) })
  const ends = [...liveEdges].flatMap((i) => { const e = edges1[i]!; return [{ v: e.v0, p: curvePoint(e.curve, e.t0) }, { v: e.v1, p: curvePoint(e.curve, e.t1) }] })
  for (const { v, p } of ends) { const a = sum[v]!; a.x += p.x; a.y += p.y; a.z += p.z; a.n++ }
  const pos: Vec3[] = b.vertices.map((v, i) => {
    const a = sum[i]!
    return a.n === 0 || rep[i] !== i ? v.point : { x: a.x / a.n, y: a.y / a.n, z: a.z / a.n }
  })

  // 5. tighten: re-project the welded vertices onto the faces around them, refit the straight edges, measure again.
  let verticesTightened = 0
  let edgesRefitted = 0
  if (options.tighten !== false) {
    const around = new Map<number, Surface[]>()
    faces.forEach((f, fi) => {
      if (dropped.has(fi)) return
      const vs = new Set<number>()
      for (const l of f.loops) for (const c of l.coedges) { vs.add(edges1[c.edge]!.v0); vs.add(edges1[c.edge]!.v1) }
      for (const v of vs) { const l = around.get(v) ?? []; if (!l.includes(f.surface)) l.push(f.surface); around.set(v, l) }
    })
    for (const [v, surfaces] of around) {
      if (rep[v] !== v || surfaces.length < 2) continue
      const moved = reproject(pos[v]!, surfaces, size)
      // Only inside the tolerance: a vertex that wants to go further was not a gap, it is a different corner.
      if (moved !== undefined && dist3(moved, b.vertices[v]!.point) <= tol && dist3(moved, pos[v]!) > 1e-15 * size) { pos[v] = moved; verticesTightened++ }
    }
    for (const i of liveEdges) {
      const e = edges1[i]!
      if (e.curve.kind !== "line" || e.v0 === e.v1) continue
      const P0 = pos[e.v0]!, P1 = pos[e.v1]!
      const L = dist3(P0, P1)
      if (L < 1e-12) continue
      const dir = scale3(sub3(P1, P0), 1 / L)
      const origin = sub3(P0, scale3(dir, e.t0))
      edges1[i] = { ...e, curve: { kind: "line", origin, dir }, t1: e.t0 + L }
      edgesRefitted++
    }
  }

  // Tolerances: a vertex by its distance from the ends of the curves that meet there, an edge by its distance from the faces it
  // bounds.
  const gap = b.vertices.map(() => 0)
  for (const j of liveEdges) {
    const e = edges1[j]!
    gap[e.v0] = Math.max(gap[e.v0]!, dist3(curvePoint(e.curve, e.t0), pos[e.v0]!))
    gap[e.v1] = Math.max(gap[e.v1]!, dist3(curvePoint(e.curve, e.t1), pos[e.v1]!))
  }
  const vertices: Vertex[] = b.vertices.map((v, i) => ({ point: pos[i]!, tol: rep[i] === i ? Math.max(v.tol, gap[i]!) : v.tol }))
  const faceSurfacesOfEdge = new Map<number, Surface[]>()
  faces.forEach((f, fi) => {
    if (dropped.has(fi)) return
    for (const l of f.loops) for (const c of l.coedges) { const list = faceSurfacesOfEdge.get(c.edge) ?? []; list.push(f.surface); faceSurfacesOfEdge.set(c.edge, list) }
  })
  for (const i of liveEdges) {
    const e = edges1[i]!
    let dev = 0
    for (const s of faceSurfacesOfEdge.get(i) ?? []) for (let k = 0; k <= 4; k++) dev = Math.max(dev, surfaceDistance(s, curvePoint(e.curve, e.t0 + ((e.t1 - e.t0) * k) / 4)))
    edges1[i] = { ...e, tol: Math.max(e.tol, dev) }
  }

  // 6. loose faces.
  const loose = (f: Face): boolean => f.loops.some((l) => l.coedges.some((c) => {
    const e = edges1[c.edge]!
    return e.tol > looseTol || vertices[e.v0]!.tol > looseTol || vertices[e.v1]!.tol > looseTol
  }))
  const flagged: Face[] = faces.map((f) => (loose(f) ? { ...f, loose: true as const } : f))

  const healed = compactBrep({ vertices, edges: edges1, faces: flagged, shells })
  const after = validateBrep(healed)
  const looseFaces = healed.faces.flatMap((f, i) => (f.loose === true ? [i] : []))
  const maxTolerance = after.maxTolerance ?? 0
  let maxMove = 0
  b.vertices.forEach((v, i) => { maxMove = Math.max(maxMove, dist3(v.point, pos[rep[i]!]!)) })
  const { diagnostics, closestOpenGap } = after.valid ? { diagnostics: [], closestOpenGap: undefined } : explain(healed, after, tol)
  return {
    brep: healed,
    report: {
      verticesWelded, edgesWelded, degenerateUsesDropped, duplicateFacesDropped: dropped.size, verticesTightened, edgesRefitted, maxMove, maxTolerance,
      looseFaces, tol, diagnostics, ...(closestOpenGap !== undefined ? { closestOpenGap } : {}), before, after
    }
  }
}

/** Why a healed body is not a solid: for each open edge, the nearest other open edge and the gap between them. */
const explain = (b: Brep, report: BrepReport, tol: number): { diagnostics: string[]; closestOpenGap: number | undefined } => {
  const diagnostics: string[] = []
  const open = [...new Set(report.issues.filter((i) => i.kind === "edge-open" && i.edge !== undefined).map((i) => i.edge!))]
  const samples = (ei: number): Vec3[] => { const e = b.edges[ei]!; return Array.from({ length: 9 }, (_, k) => edgePointAt(e, k / 8)) }
  const facesOf = (ei: number): Set<number> => new Set(b.faces.flatMap((f, fi) => (f.loops.some((l) => l.coedges.some((c) => c.edge === ei)) ? [fi] : [])))
  // The partner of an open edge is the copy another face wrote of it: an open edge of a different face, close along its whole
  // length (directed Hausdorff distance both ways on nine samples). Edges of the same face that meet at a corner are not partners.
  const hausdorff = (a: Vec3[], c: Vec3[]): number => Math.max(...a.map((p) => Math.min(...c.map((q) => dist3(p, q)))), ...c.map((q) => Math.min(...a.map((p) => dist3(p, q)))))
  let closest: number | undefined
  for (const ei of open) {
    const mine = samples(ei), myFaces = facesOf(ei)
    let best = Infinity, which = -1
    for (const ej of open) {
      if (ej === ei) continue
      if ([...facesOf(ej)].some((f) => myFaces.has(f))) continue
      const d = hausdorff(mine, samples(ej))
      if (d < best) { best = d; which = ej }
    }
    if (which < 0) diagnostics.push(`edge ${ei} is used by one face only and no open edge of another face is near: a face is missing`)
    else {
      diagnostics.push(`edge ${ei} is used by one face only; its nearest copy on another face (edge ${which}) is ${best.toExponential(2)} mm away${best > tol ? `, above the healing tolerance ${tol.toExponential(1)} mm` : ""}`)
      closest = closest === undefined ? best : Math.min(closest, best)
    }
  }
  for (const i of report.issues) if (i.kind !== "edge-open") diagnostics.push(i.message)
  return { diagnostics: diagnostics.slice(0, 12), closestOpenGap: closest }
}
