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

/**
 * Exploded STEP in the style of a foreign exporter that writes each face on its own: every face has its own vertices, moved by
 * up to `gap` from the true corner, and its straight edges are written through *those* vertices, so the copies of one edge differ
 * by the gap and the shared corner is not on the neighbouring faces' planes.
 */
const explodeWithGaps = (b: Brep, gap: number): Brep => {
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
        vertices.push({ point: { x: p.x + s * gap / 2, y: p.y - s * gap / 3, z: p.z + (s % 2 === 0 ? 1 : -1) * gap / 2 }, tol: 1e-6 })
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
          const dir = { x: (P1.x - P0.x) / L, y: (P1.y - P0.y) / L, z: (P1.z - P0.z) / L }
          edges.push({ curve: { kind: "line", origin: P0, dir }, t0: 0, t1: L, v0, v1, tol: 1e-6 })
          return { edge: edges.length - 1, reversed: c.reversed }
        })
      }))
    })
  })
  return { vertices, edges, faces, shells: [{ faces: faces.map((_, i) => i), closed: true }] }
}

describe("healBrep moves geometry within the tolerance (spec 42 R6)", () => {
  test("an exploded box with 30 micrometre gaps heals to the exact solid, the corners re-projected onto the planes", () => {
    const exploded = explodeWithGaps(makeBox(10, 20, 30), 3e-5)
    expect(validateBrep(exploded).valid).toBe(false)
    const { brep, report } = healBrep(exploded, { tol: 1e-4 })
    expect(report.after.issues.map((i) => i.message)).toEqual([])
    expect(report.diagnostics).toEqual([])
    expect(report.verticesTightened).toBe(8)
    expect(report.edgesRefitted).toBe(12)
    // Geometry moved, but never further than the tolerance.
    expect(report.maxMove).toBeGreaterThan(1e-6)
    expect(report.maxMove).toBeLessThanOrEqual(1e-4)
    // Re-projection removed the gap: the corners are the box's, so the volume is exact and the tolerances are the model's.
    expect(Math.abs(massProperties(brep).volume - 6000) / 6000).toBeLessThan(1e-9)
    expect(report.maxTolerance).toBeLessThan(2e-6)
    expect(report.looseFaces).toEqual([])
    for (const v of brep.vertices) expect([0, 10].includes(Math.round(v.point.x * 1e6) / 1e6)).toBe(true)
  })

  test("without tightening the same body only welds: the gap stays in the tolerances and the faces are flagged loose", () => {
    const loose = healBrep(explodeWithGaps(makeBox(10, 20, 30), 3e-5), { tol: 1e-4, tighten: false })
    const tight = healBrep(explodeWithGaps(makeBox(10, 20, 30), 3e-5), { tol: 1e-4 })
    expect(loose.report.verticesTightened).toBe(0)
    expect(loose.report.maxTolerance).toBeGreaterThan(10 * tight.report.maxTolerance)
    expect(loose.report.looseFaces.length).toBeGreaterThan(0)
    expect(loose.brep.faces.some((f) => f.loose === true)).toBe(true)
    expect(tight.brep.faces.some((f) => f.loose === true)).toBe(false)
  })

  test("a healed exploded body takes part in a Boolean with the exact answer", () => {
    const { brep, report } = healBrep(explodeWithGaps(makeBox(10, 10, 10), 3e-5), { tol: 1e-4 })
    expect(report.after.valid).toBe(true)
    const cut = booleanBrep(brep, makeCylinder(2, 10, frame({ x: 5, y: 5, z: 0 }, { x: 0, y: 0, z: 1 })), "subtract")
    expect(cut.warnings).toEqual([])
    expect(Math.abs(massProperties(cut.brep).volume - (1000 - Math.PI * 40)) / 874).toBeLessThan(1e-9)
    const joined = booleanBrep(brep, makeBox(10, 10, 10, frame({ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })), "union")
    expect(Math.abs(massProperties(joined.brep).volume - 2000) / 2000).toBeLessThan(1e-9)
  })

  test("a face written twice is dropped, not left to use every edge four times", () => {
    const e = explode(makeBox(10, 10, 10), 0)
    const dup = { ...e, faces: [...e.faces, e.faces[0]!], shells: [{ faces: [0, 1, 2, 3, 4, 5, 6], closed: true }] }
    const { brep, report } = healBrep(dup)
    expect(report.duplicateFacesDropped).toBe(1)
    expect(report.after.valid).toBe(true)
    expect(brep.faces.length).toBe(6)
  })

  test("a gap above the tolerance is not closed: the body is refused with the gap and the edges that are open", () => {
    const { report } = healBrep(explodeWithGaps(makeBox(10, 10, 10), 3e-3), { tol: 1e-5 })
    expect(report.after.valid).toBe(false)
    expect(report.diagnostics.length).toBeGreaterThan(0)
    expect(report.diagnostics.some((d) => d.includes("above the healing tolerance"))).toBe(true)
    expect(report.closestOpenGap!).toBeGreaterThan(1e-5)
    // The same body with a tolerance that covers the gap heals.
    expect(healBrep(explodeWithGaps(makeBox(10, 10, 10), 3e-3), { tol: 2e-2 }).report.after.valid).toBe(true)
  })
})
