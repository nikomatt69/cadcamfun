import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, frame, healBrep, makeBox, makeCylinder, massProperties, validateBrep, type Brep, type Edge, type Face } from "./index.ts"

setDefaultTimeout(60_000)

/**
 * What a foreign exporter writes: every face with its own vertices and its own copy of each edge. `jitter` moves each copy of a
 * vertex by up to that much (a unit conversion or a coarse exporter), `flipEvery` writes every n-th copy backwards.
 */
const explode = (b: Brep, jitter: number): Brep => {
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
        const j = ((k++ % 7) - 3) * (jitter / 3)
        m = vertices.length
        vertices.push({ point: { x: p.x + j, y: p.y - j, z: p.z + j }, tol: 1e-6 })
        vmap.set(v, m)
      }
      return m
    }
    faces.push({
      ...f,
      loops: f.loops.map((l) => ({
        coedges: l.coedges.map((c) => {
          const e = b.edges[c.edge]!
          edges.push({ ...e, v0: vert(e.v0), v1: vert(e.v1) })
          return { edge: edges.length - 1, reversed: c.reversed }
        })
      }))
    })
  })
  return { vertices, edges, faces, shells: [{ faces: faces.map((_, i) => i), closed: true }] }
}

describe("healBrep", () => {
  test("a box written face by face is stitched back into a valid closed solid of the same volume", () => {
    const exploded = explode(makeBox(10, 20, 30), 0)
    expect(validateBrep(exploded).valid).toBe(false)
    const { brep, report } = healBrep(exploded)
    expect(report.after.issues.map((i) => i.message)).toEqual([])
    expect(brep.vertices.length).toBe(8)
    expect(brep.edges.length).toBe(12)
    expect(Math.abs(massProperties(brep).volume - 6000)).toBeLessThan(1e-6)
  })
  test("vertices that differ by a few micrometres are welded within the tolerance", () => {
    const { brep, report } = healBrep(explode(makeBox(10, 20, 30), 2e-5), { tol: 1e-4 })
    expect(report.verticesWelded).toBeGreaterThan(0)
    expect(report.after.valid).toBe(true)
    expect(Math.abs(massProperties(brep).volume - 6000) / 6000).toBeLessThan(1e-5)
  })
  test("a cylinder with its seam and circles written per face (curved faces, closed edges) heals", () => {
    const { brep, report } = healBrep(explode(makeCylinder(5, 12), 0))
    expect(report.after.issues.map((i) => i.message)).toEqual([])
    expect(Math.abs(massProperties(brep).volume - Math.PI * 25 * 12) / (Math.PI * 300)).toBeLessThan(1e-9)
  })
  test("a healed body takes part in a Boolean like the original", () => {
    const { brep } = healBrep(explode(makeBox(10, 10, 10), 0))
    const r = booleanBrep(brep, makeCylinder(2, 10, frame({ x: 5, y: 5, z: 0 }, { x: 0, y: 0, z: 1 })), "subtract")
    expect(Math.abs(massProperties(r.brep).volume - (1000 - Math.PI * 4 * 10))).toBeLessThan(1e-6)
  })
  test("a body that is not repairable is reported, not hidden", () => {
    const open = explode(makeBox(10, 10, 10), 0)
    const cut = { ...open, faces: open.faces.slice(0, 5), shells: [{ faces: [0, 1, 2, 3, 4], closed: true }] }
    expect(healBrep(cut).report.after.valid).toBe(false)
  })
})
