import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep } from "./boolean.ts"
import { brepToObj, brepToStl } from "./export-mesh.ts"
import { frame } from "./math.ts"
import { curvePoint, surfaceProject } from "./geom.ts"
import { massProperties } from "./mass.ts"
import { makeBox, makeCone, makeCylinder, makeSphere } from "./primitives.ts"
import { bodyTessellation, derivedStats, faceBoundaries, faceMeshReuse, meshEdgeDefects, tessellateBrep } from "./tessellate.ts"
import type { Brep } from "./topology.ts"
import { buildRecipe } from "../recipes.ts"
import { rebuildExact } from "../history-brep.ts"

setDefaultTimeout(100_000)
const Z = { x: 0, y: 0, z: 1 }

/** Volume of the welded triangle mesh by the divergence theorem (signed tetrahedra against the origin). */
const meshVolume = (t: { positions: Float64Array; indices: Uint32Array }): number => {
  let v = 0
  for (let i = 0; i < t.indices.length; i += 3) {
    const a = t.indices[i]! * 3, b = t.indices[i + 1]! * 3, c = t.indices[i + 2]! * 3
    const p = t.positions
    v += (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) / 6
  }
  return v
}

const FIXTURES: ReadonlyArray<readonly [string, () => Brep]> = [
  ["box", () => makeBox(40, 30, 20)],
  ["box with a through hole", () => booleanBrep(makeBox(40, 30, 20), makeCylinder(5, 24, frame({ x: 20, y: 15, z: -2 }, Z)), "subtract").brep],
  ["pin on a plate", () => booleanBrep(makeBox(40, 30, 10), makeCylinder(6, 14, frame({ x: 20, y: 15, z: 10 }, Z)), "union").brep],
  ["cone frustum", () => makeCone(10, 4, 25)],
  ["sphere", () => makeSphere(12)]
]

describe("the derived tessellation of a body", () => {
  test("unresolvable tessellation settings fail before sampling instead of hanging", () => {
    const body = makeCylinder(5, 12)
    for (const options of [
      { chordTol: 0 }, { chordTol: NaN }, { chordTol: Infinity }, { chordTol: 1e-30 },
      { angleTolDeg: -1 }, { angleTolDeg: 181 }, { angleTolDeg: NaN },
      { maxEdge: -1 }, { maxEdge: 1e-300 }, { maxPointsPerFace: 0 }, { paramStep: 0 }
    ]) {
      expect(() => tessellateBrep(body, options)).toThrow(RangeError)
      expect(() => faceBoundaries(body, options)).toThrow(RangeError)
    }
    expect(tessellateBrep(body, { angleTolDeg: 0 }).indices.length).toBeGreaterThan(0)
  })
  test("recipe meshes remain watertight where normals meet the angular limit", () => {
    for (const name of ["flange", "enclosure", "duct_transition"] as const) {
      const body = rebuildExact(buildRecipe(name, {}).history).bodies[0]?.brep
      expect(body).toBeDefined()
      if (body === undefined) throw new Error(`${name} has no exact body`)
      const mesh = bodyTessellation(body, { chordTol: 0.05 })
      expect(mesh.warnings).toEqual([])
      expect(meshEdgeDefects(mesh.indices)).toEqual({ open: 0, nonManifold: 0, misoriented: 0 })
      const mass = massProperties(body)
      expect(Math.abs(meshVolume(mesh) - mass.volume)).toBeLessThanOrEqual(0.05 * mass.area)
    }
  })

  test("a NURBS loft shares samples on straight edges as the normal tolerance changes", () => {
    const body = rebuildExact(buildRecipe("duct_transition", {}).history).bodies[0]?.brep
    if (body === undefined) throw new Error("duct transition has no exact body")
    for (const angleTolDeg of [0, 10, 15, 30]) {
      const mesh = tessellateBrep(body, { chordTol: 0.05, angleTolDeg })
      expect(mesh.warnings).toEqual([])
      expect(meshEdgeDefects(mesh.indices)).toEqual({ open: 0, nonManifold: 0, misoriented: 0 })
      if (angleTolDeg > 0) for (const face of mesh.faces) {
        const local = new Map(Array.from(face.global, (g, i) => [g, i] as const))
        for (const loop of body.faces[face.face]!.loops) for (const coedge of loop.coedges) {
          const points = mesh.edges[coedge.edge]!.points
          for (let i = 1; i < points.length; i++) {
            const a = local.get(points[i - 1]!), b = local.get(points[i]!)
            expect(a).toBeDefined(); expect(b).toBeDefined()
            if (a === undefined || b === undefined) continue
            const n = face.normals
            const dot = n[a * 3]! * n[b * 3]! + n[a * 3 + 1]! * n[b * 3 + 1]! + n[a * 3 + 2]! * n[b * 3 + 2]!
            expect(dot).toBeGreaterThanOrEqual(Math.cos(angleTolDeg * Math.PI / 180) - 2e-6)
          }
        }
      }
    }
    // Reused face meshes must retain the same shared boundary samples as a fresh tessellation.
    tessellateBrep(body, { chordTol: 0.05, reuse: true })
    const reused = tessellateBrep(body, { chordTol: 0.05, reuse: true })
    expect(reused.warnings).toEqual([])
    expect(meshEdgeDefects(reused.indices)).toEqual({ open: 0, nonManifold: 0, misoriented: 0 })
  })
  test("one tessellation per body and options: the same object comes back, a different tolerance is another entry", () => {
    const b = makeBox(40, 30, 20)
    const hits = derivedStats.hits, misses = derivedStats.misses
    const a = bodyTessellation(b, { chordTol: 0.05 })
    expect(bodyTessellation(b, { chordTol: 0.05 })).toBe(a)
    expect(bodyTessellation(b, { chordTol: 0.05 })).toBe(a)
    expect(bodyTessellation(b, { chordTol: 0.01 })).not.toBe(a)
    expect(derivedStats.misses - misses).toBe(2)
    expect(derivedStats.hits - hits).toBe(2)
  })

  test("another body is another entry, and a partial or reused tessellation is never derived", () => {
    const b = makeBox(40, 30, 20), c = makeBox(40, 30, 20)
    expect(bodyTessellation(b)).not.toBe(bodyTessellation(c))
    const partial = bodyTessellation(b, { faces: new Set([0]) })
    expect(partial).not.toBe(bodyTessellation(b, { faces: new Set([0]) }))
    expect(partial.faces).toHaveLength(1)
  })

  test("it is the tessellation the kernel makes, nothing else", () => {
    const b = makeCylinder(5, 12)
    const direct = tessellateBrep(b, { chordTol: 0.02 }), derived = bodyTessellation(b, { chordTol: 0.02 })
    expect(Array.from(derived.positions)).toEqual(Array.from(direct.positions))
    expect(Array.from(derived.indices)).toEqual(Array.from(direct.indices))
  })

  test("the face cache does not reuse a mesh after its parameter-space boundary changes", () => {
    const body = makeBox(10, 12, 14)
    tessellateBrep(body, { reuse: true })
    const face = body.faces[0]!, loop = face.loops[0]!, coedge = loop.coedges[0]!, edge = body.edges[coedge.edge]!
    const a = surfaceProject(face.surface, curvePoint(edge.curve, edge.t0))
    const b = surfaceProject(face.surface, curvePoint(edge.curve, edge.t1))
    const dir = { x: (b.u - a.u) / (edge.t1 - edge.t0), y: (b.v - a.v) / (edge.t1 - edge.t0) }
    const pcurve = { kind: "line2" as const, origin: { x: a.u - dir.x * edge.t0, y: a.v - dir.y * edge.t0 }, dir }
    const changed = { ...body, faces: body.faces.map((f, i) => i === 0 ? { ...f, loops: f.loops.map((l, j) => j === 0 ? { ...l, coedges: l.coedges.map((c, k) => k === 0 ? { ...c, pcurve } : c) } : l) } : f) }
    const misses = faceMeshReuse.misses
    const mesh = tessellateBrep(changed, { reuse: true })
    expect(faceMeshReuse.misses - misses).toBe(1)
    expect(mesh.warnings).toEqual([])
    expect(meshEdgeDefects(mesh.indices)).toEqual({ open: 0, nonManifold: 0, misoriented: 0 })
  })

  for (const [name, make] of FIXTURES) {
    test(`${name}: the mesh volume agrees with the exact volume within the chord bound`, () => {
      const b = make()
      const exact = massProperties(b).volume
      const chord = 0.01
      const t = bodyTessellation(b, { chordTol: chord })
      const area = massProperties(b).area
      // The inscribed mesh is inside the surface by at most `chord` everywhere: |dV| <= chord x area.
      expect(Math.abs(meshVolume(t) - exact)).toBeLessThanOrEqual(chord * area)
      expect(meshVolume(t)).toBeGreaterThan(0)
    })
  }

  test("the exports read the derived tessellation (the second export, in another format, does not tessellate again)", () => {
    const b = booleanBrep(makeBox(40, 30, 10), makeCylinder(6, 14, frame({ x: 20, y: 15, z: 10 }, Z)), "union").brep
    const stl = brepToStl(b, { chordTol: 0.05 })
    const misses = derivedStats.misses
    const obj = brepToObj(b, { chordTol: 0.05 })
    expect(derivedStats.misses).toBe(misses)
    expect(stl.data.length).toBeGreaterThan(0)
    expect(obj.data.length).toBeGreaterThan(0)
  })
})
