import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, frame, healBrep, makeBox, makeCylinder, massProperties, validateBrep, type Brep, type Edge, type Face } from "./index.ts"

setDefaultTimeout(60_000)

/**
 * A cylinder written face by face with the circles of each face shifted in their plane by up to `gap` (each face has its own
 * copy of the rim, with its vertex on that copy) and the seam written through the shifted vertices.
 */
const explodeCylinderWithGaps = (b: Brep, gap: number): Brep => {
  const vertices: Brep["vertices"][number][] = []
  const edges: Edge[] = []
  const faces: Face[] = []
  let k = 0
  b.faces.forEach((f) => {
    const shift = { x: (((k++ % 5) - 2) * gap) / 2, y: (((k % 3) - 1) * gap) / 3 }
    const vmap = new Map<number, number>()
    const vert = (v: number) => {
      let m = vmap.get(v)
      if (m === undefined) {
        const p = b.vertices[v]!.point
        m = vertices.length
        vertices.push({ point: { x: p.x + shift.x, y: p.y + shift.y, z: p.z }, tol: 1e-6 })
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
          if (e.curve.kind === "circle") {
            const fr = e.curve.frame
            edges.push({ ...e, curve: { ...e.curve, frame: { ...fr, origin: { x: fr.origin.x + shift.x, y: fr.origin.y + shift.y, z: fr.origin.z } } }, v0, v1 })
          } else {
            const P0 = vertices[v0]!.point, P1 = vertices[v1]!.point
            const L = Math.hypot(P1.x - P0.x, P1.y - P0.y, P1.z - P0.z)
            edges.push({ curve: { kind: "line", origin: P0, dir: { x: (P1.x - P0.x) / L, y: (P1.y - P0.y) / L, z: (P1.z - P0.z) / L } }, t0: 0, t1: L, v0, v1, tol: 1e-6 })
          }
          return { edge: edges.length - 1, reversed: c.reversed }
        })
      }))
    })
  })
  return { vertices, edges, faces, shells: [{ faces: faces.map((_, i) => i), closed: true }] }
}

describe("healBrep refits circles within the tolerance (spec 42 R6)", () => {
  test("a cylinder whose rims are shifted per face heals: the circles are moved onto the corrected vertices", () => {
    const exploded = explodeCylinderWithGaps(makeCylinder(5, 12), 3e-5)
    expect(validateBrep(exploded).valid).toBe(false)
    const { brep, report } = healBrep(exploded, { tol: 1e-4 })
    expect(report.after.issues.map((i) => i.message)).toEqual([])
    expect(report.diagnostics).toEqual([])
    expect(report.circlesRefitted).toBeGreaterThan(0)
    expect(report.curveMove).toBeGreaterThan(0)
    expect(report.curveMove).toBeLessThanOrEqual(1e-4)
    expect(report.refitNotes).toEqual([])
    expect(Math.abs(massProperties(brep).volume - Math.PI * 25 * 12) / (Math.PI * 300)).toBeLessThan(1e-6)
    // The refit circle is within tolerance of the cylinder wall: the measured edge deviation is what the tolerance now records.
    expect(report.maxTolerance).toBeLessThan(1e-4)
  })

  test("arcs (a half hole through a box edge) are refitted through both end vertices", () => {
    const half = booleanBrep(makeBox(20, 20, 10), makeCylinder(4, 10, frame({ x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 1 })), "subtract").brep
    const exact = massProperties(half).volume
    expect(half.edges.some((e) => e.curve.kind === "circle" && e.v0 !== e.v1)).toBe(true)
    const exploded = explodeCylinderWithGaps(half, 3e-5)
    expect(validateBrep(exploded).valid).toBe(false)
    const { brep, report } = healBrep(exploded, { tol: 1e-4 })
    expect(report.after.issues.map((i) => i.message)).toEqual([])
    expect(report.circlesRefitted).toBeGreaterThanOrEqual(2)
    expect(report.refitNotes).toEqual([])
    expect(Math.abs(massProperties(brep).volume - exact) / exact).toBeLessThan(1e-6)
    expect(report.maxTolerance).toBeLessThan(1e-4)
  })

  test("a gap above the tolerance is refused with diagnostics, not smoothed over", () => {
    const { report } = healBrep(explodeCylinderWithGaps(makeCylinder(5, 12), 3e-4), { tol: 1e-5 })
    expect(report.after.valid).toBe(false)
    expect(report.circlesRefitted).toBe(0)
    expect(report.diagnostics.some((d) => d.includes("above the healing tolerance"))).toBe(true)
    expect(report.closestOpenGap!).toBeGreaterThan(1e-5)
  })
})
