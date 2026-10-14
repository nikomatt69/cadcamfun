/**
 * Sewing two solids that meet face to face (the pieces of a sweep, a stack of extrusions): when a planar face of one is the
 * same face as a planar face of the other, seen from the other side (same plane, opposite normals, edge for edge the same
 * curves), the union is the two shells with that pair of faces taken out and their edges identified. No intersection is
 * computed, so it costs nothing next to a Boolean; anything short of an exact match returns undefined and the caller does
 * the Boolean.
 */
import { dot3 } from "../vec.ts"
import { dist3, type Vec3 } from "./math.ts"
import { compactBrep, edgePointAt, mergeBreps, type Brep, type Coedge, type Edge, type Face } from "./topology.ts"
import { validateBrep } from "./validate.ts"

const planeOf = (f: Face): { readonly n: Vec3; readonly o: Vec3 } | undefined =>
  f.surface.kind !== "plane" ? undefined : { n: f.reversed ? { x: -f.surface.frame.z.x, y: -f.surface.frame.z.y, z: -f.surface.frame.z.z } : f.surface.frame.z, o: f.surface.frame.origin }

const faceEdges = (f: Face): number[] => f.loops.flatMap((l) => l.coedges.map((c) => c.edge))

/** Whether two edges are the same curve between the same points; `flip` when they run opposite ways. */
const twin = (b: Brep, e1: Edge, e2: Edge, tol: number): { readonly flip: boolean } | undefined => {
  const p = (e: Edge, v: number) => b.vertices[v === 0 ? e.v0 : e.v1]!.point
  if (dist3(edgePointAt(e1, 0.5), edgePointAt(e2, 0.5)) > tol) return undefined
  const closed1 = e1.v0 === e1.v1, closed2 = e2.v0 === e2.v1
  if (closed1 !== closed2) return undefined
  if (closed1) {
    if (dist3(p(e1, 0), p(e2, 0)) > tol) return undefined
    if (dist3(edgePointAt(e1, 0.25), edgePointAt(e2, 0.25)) <= tol) return { flip: false }
    if (dist3(edgePointAt(e1, 0.25), edgePointAt(e2, 0.75)) <= tol) return { flip: true }
    return undefined
  }
  if (dist3(p(e1, 0), p(e2, 0)) <= tol && dist3(p(e1, 1), p(e2, 1)) <= tol) return { flip: false }
  if (dist3(p(e1, 0), p(e2, 1)) <= tol && dist3(p(e1, 1), p(e2, 0)) <= tol) return { flip: true }
  return undefined
}

/** The union of two closed solids glued along one shared planar face, or undefined when they share none exactly. */
export const sewSolids = (a: Brep, b: Brep, tol = 1e-7): Brep | undefined => {
  const m = mergeBreps([a, b])
  const fo = a.faces.length
  for (let i = 0; i < a.faces.length; i++) {
    const pa = planeOf(a.faces[i]!)
    if (pa === undefined) continue
    for (let j = 0; j < b.faces.length; j++) {
      const pb = planeOf(b.faces[j]!)
      if (pb === undefined || dot3(pa.n, pb.n) > -1 + 1e-12) continue
      const d = { x: pb.o.x - pa.o.x, y: pb.o.y - pa.o.y, z: pb.o.z - pa.o.z }
      if (Math.abs(dot3(d, pa.n)) > tol) continue
      const ea = faceEdges(m.faces[i]!), eb = faceEdges(m.faces[fo + j]!)
      if (ea.length !== eb.length) continue
      // Every edge of b's face has its twin on a's face.
      const edgeMap = new Map<number, { readonly to: number; readonly flip: boolean }>()
      const vertexMap = new Map<number, number>()
      let ok = true
      for (const y of eb) {
        const ey = m.edges[y]!
        const x = ea.find((x) => ![...edgeMap.values()].some((v) => v.to === x) && twin(m, m.edges[x]!, ey, tol) !== undefined)
        if (x === undefined) { ok = false; break }
        const t = twin(m, m.edges[x]!, ey, tol)!
        edgeMap.set(y, { to: x, flip: t.flip })
        const ex = m.edges[x]!
        vertexMap.set(ey.v0, t.flip ? ex.v1 : ex.v0)
        vertexMap.set(ey.v1, t.flip ? ex.v0 : ex.v1)
      }
      if (!ok) continue
      const edges = m.edges.map((e) => ({ ...e, v0: vertexMap.get(e.v0) ?? e.v0, v1: vertexMap.get(e.v1) ?? e.v1 }))
      const faces: Face[] = m.faces.filter((_, k) => k !== i && k !== fo + j).map((f) => ({
        ...f,
        loops: f.loops.map((l) => ({
          coedges: l.coedges.map((c): Coedge => {
            const to = edgeMap.get(c.edge)
            return to === undefined ? c : { edge: to.to, reversed: to.flip ? !c.reversed : c.reversed }
          })
        }))
      }))
      const sewn = compactBrep({ vertices: m.vertices, edges, faces, shells: [{ faces: faces.map((_, k) => k), closed: true }] })
      const rep = validateBrep(sewn, { coarseVolume: true })
      return rep.valid ? sewn : undefined
    }
  }
  return undefined
}
