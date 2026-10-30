/**
 * Test fixture: a solid as a foreign exporter writes it when it writes each face on its own. Every face has its own vertices,
 * moved by up to `gap` from the true corner, and its straight edges run through *those* vertices, so the copies of one edge
 * differ by the gap and the shared corner is not on the neighbouring faces' planes. Only straight edges are moved (a box or a
 * prism); curved edges keep their curve. Used by the heal and import tests.
 */
import type { Brep, Edge, Face } from "./topology.ts"

export const explodeWithGaps = (b: Brep, gap: number): Brep => {
  const vertices: Brep["vertices"][number][] = []
  const edges: Edge[] = []
  const faces: Face[] = []
  let k = 0
  b.faces.forEach((f) => {
    const vmap = new Map<number, number>()
    const vert = (v: number) => {
      let m = vmap.get(v)
      if (m === undefined) {
        const p = b.vertices[v]!.point
        const s = (k++ % 5) - 2
        m = vertices.length
        vertices.push({ point: { x: p.x + (s * gap) / 2, y: p.y - (s * gap) / 3, z: p.z + (s % 2 === 0 ? 1 : -1) * gap / 2 }, tol: 1e-6 })
        vmap.set(v, m)
      }
      return m
    }
    faces.push({
      ...f,
      loops: f.loops.map((l) => ({
        coedges: l.coedges.map((c) => {
          const e = b.edges[c.edge]!
          const v0 = vert(e.v0), v1 = vert(e.v1)
          const P0 = vertices[v0]!.point, P1 = vertices[v1]!.point
          const L = Math.hypot(P1.x - P0.x, P1.y - P0.y, P1.z - P0.z)
          edges.push({ curve: { kind: "line", origin: P0, dir: { x: (P1.x - P0.x) / L, y: (P1.y - P0.y) / L, z: (P1.z - P0.z) / L } }, t0: 0, t1: L, v0, v1, tol: 1e-6 })
          return { edge: edges.length - 1, reversed: c.reversed }
        })
      }))
    })
  })
  return { vertices, edges, faces, shells: [{ faces: faces.map((_, i) => i), closed: true }] }
}
