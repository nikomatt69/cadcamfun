import { describe, expect, test } from "bun:test"
import { cleanMesh, cleanPolygonSoup, fixTJunctions, weldPoints } from "./mesh-clean.ts"
import { creasedNormals } from "./mesh-normals.ts"
import { describeTopology, meshTopology } from "./mesh-topology.ts"
import { mergeMeshes, translateMesh } from "./csg.ts"
import { meshOf, meshVolume, type Mesh } from "./solid.ts"

const box = (x: number, y: number, z: number, w: number, h: number, d: number): Mesh => meshOf({ _tag: "Box", origin: { x, y, z }, size: { x: w, y: h, z: d } })

/** A box whose six faces are each a fan of four triangles about the face centre (sixteen extra vertices, 24 triangles). */
const fannedBox = (s: number): Mesh => {
  const c = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]]
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
  const positions: number[] = [], indices: number[] = []
  for (const f of faces) {
    const base = positions.length / 3
    for (const k of f) positions.push(...(c[k] as [number, number, number]))
    const m = [0, 1, 2].map((a) => f.reduce((sum, k) => sum + c[k]![a]!, 0) / 4)
    positions.push(...m)
    for (let e = 0; e < 4; e++) indices.push(base + e, base + ((e + 1) % 4), base + 4)
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) }
}

describe("mesh topology", () => {
  test("a box is a closed solid of one shell and genus 0, with its volume and area", () => {
    const t = meshTopology(cleanMesh(box(0, 0, 0, 10, 20, 30)))
    expect([t.closed, t.solid, t.shells, t.genus, t.boundaryEdges, t.nonManifoldEdges]).toEqual([true, true, 1, 0, 0, 0])
    expect(t.volume).toBeCloseTo(6000, 6)
    expect(t.area).toBeCloseTo(2 * (200 + 600 + 300), 6)
    expect(describeTopology(t)).toMatch(/^closed solid, 1 shell, genus 0/)
  })

  test("a torus has genus 1 and two separate boxes are two shells", () => {
    const torus = meshTopology(cleanMesh(meshOf({ _tag: "Torus", center: { x: 0, y: 0, z: 0 }, majorRadius: 20, minorRadius: 5, majorSegments: 32, minorSegments: 16 })))
    expect([torus.solid, torus.genus]).toEqual([true, 1])
    const two = meshTopology(cleanMesh(mergeMeshes([box(0, 0, 0, 1, 1, 1), box(5, 0, 0, 1, 1, 1)])))
    expect([two.solid, two.shells, two.genus]).toEqual([true, 2, 0])
  })

  test("a missing face is reported as open edges, a flipped triangle as flipped edges, inside-out as not solid", () => {
    const b = cleanMesh(box(0, 0, 0, 1, 1, 1))
    const open = meshTopology({ positions: b.positions, indices: b.indices.slice(0, b.indices.length - 6) })
    expect(open.closed).toBe(false)
    expect(open.boundaryEdges).toBe(4)
    expect(describeTopology(open)).toContain("4 open edges")
    const flippedIdx = Uint32Array.from(b.indices)
    const t = flippedIdx[1]!; flippedIdx[1] = flippedIdx[2]!; flippedIdx[2] = t
    expect(meshTopology({ positions: b.positions, indices: flippedIdx }).misorientedEdges).toBe(3)
    const inside = Uint32Array.from(b.indices)
    for (let i = 0; i < inside.length; i += 3) { const u = inside[i + 1]!; inside[i + 1] = inside[i + 2]!; inside[i + 2] = u }
    const inv = meshTopology({ positions: b.positions, indices: inside })
    expect([inv.closed, inv.solid]).toEqual([true, false])
  })
})

describe("mesh clean-up", () => {
  test("welding finds points on either side of a grid cell border", () => {
    const { positions, map } = weldPoints([0.0099, 0, 0, 0.0101, 0, 0, 0.5, 0, 0], 0.01)
    expect(positions.length / 3).toBe(2)
    expect(map[0]).toBe(map[1])
    expect(map[2]).not.toBe(map[0])
  })

  test("a T-junction gets the vertex inserted into the long edge", () => {
    // Left square (0..1, 0..2) as one polygon; right side split in two at y = 1.
    const pos = [0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 2, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0, 2, 2, 0]
    const fixed = fixTJunctions(pos, [[0, 1, 2, 3], [1, 4, 5, 6], [6, 5, 7, 2]], 1e-9)
    expect(fixed[0]).toEqual([0, 1, 6, 2, 3])
    expect(fixed[1]).toEqual([1, 4, 5, 6])
  })

  test("a box made of per-face vertices and fanned faces cleans to the 12 triangles of a welded closed box", () => {
    const fanned = fannedBox(10)
    expect(meshTopology(fanned).closed).toBe(false) // not welded: every edge is open
    const clean = cleanMesh(fanned)
    const t = meshTopology(clean)
    expect([t.solid, t.genus, t.triangles, t.vertices]).toEqual([true, 0, 12, 8])
    expect(meshVolume(clean)).toBeCloseTo(1000, 6)
    // Without merging, the faces keep their fans but are welded and closed.
    const unmerged = meshTopology(cleanMesh(fanned, { mergeCoplanar: false }))
    expect([unmerged.solid, unmerged.triangles]).toEqual([true, 24])
  })

  test("a crack narrower than the limit is closed, a real opening is left alone", () => {
    const b = cleanMesh(box(0, 0, 0, 10, 10, 10), { mergeCoplanar: false })
    const without = { positions: b.positions, indices: b.indices.slice(3) } // one triangle missing: a hole half a face wide
    expect(meshTopology(cleanMesh(without, { fillHolesUpTo: 1e-3 })).closed).toBe(false)
    expect(meshTopology(cleanMesh(without, { fillHolesUpTo: 20 })).solid).toBe(true)
    // A pair of opposite triangles on the same vertices (a flat pillow) is removed.
    const pillow = { positions: b.positions, indices: Uint32Array.from([...b.indices, 0, 1, 2, 0, 2, 1]) }
    expect(meshTopology(cleanMesh(pillow)).solid).toBe(true)
  })

  test("soup polygons with no area are dropped without opening the surface", () => {
    const b = box(0, 0, 0, 2, 2, 2)
    const polygons: number[][] = []
    for (let t = 0; t < b.indices.length; t += 3) polygons.push([b.indices[t]!, b.indices[t + 1]!, b.indices[t + 2]!])
    const positions = [...Array.from(b.positions), 0, 0, 0, 1, 0, 0, 2, 0, 0]
    const n = b.positions.length / 3
    polygons.push([n, n + 1, n + 2])
    expect(meshTopology(cleanPolygonSoup({ positions, polygons })).solid).toBe(true)
  })
})

describe("shading normals", () => {
  test("a box keeps sharp edges: 4 vertices per face, each with the face's normal", () => {
    const s = creasedNormals(box(0, 0, 0, 1, 1, 1))
    expect(s.positions.length / 3).toBe(24)
    for (let i = 0; i < s.normals.length; i += 3) {
      const n = [s.normals[i]!, s.normals[i + 1]!, s.normals[i + 2]!].map(Math.abs).sort((a, b) => b - a)
      expect(n[0]).toBeCloseTo(1, 9)
      expect(n[1]).toBeCloseTo(0, 9)
    }
    // With a crease of 180 degrees every vertex is smoothed: the 8 corners.
    expect(creasedNormals(box(0, 0, 0, 1, 1, 1), 180).positions.length / 3).toBe(8)
  })

  test("a fine cylinder is smooth round its side (normals radial) and sharp at its rims", () => {
    const cyl = meshOf({ _tag: "Cylinder", origin: { x: 0, y: 0, z: 0 }, radius: 10, height: 5, segments: 64 })
    const s = creasedNormals(cyl)
    let radial = 0, axial = 0
    for (let i = 0; i < s.positions.length; i += 3) {
      const x = s.positions[i]!, y = s.positions[i + 1]!, nz = s.normals[i + 2]!
      if (Math.abs(nz) > 0.999) { axial++; continue }
      const r = Math.hypot(x, y)
      // Smooth: the normal points away from the axis through the vertex, within half a degree.
      expect((s.normals[i]! * x + s.normals[i + 1]! * y) / r).toBeGreaterThan(Math.cos(Math.PI / 360))
      radial++
    }
    expect(radial).toBe(128) // one per side vertex: shared by the facets on either side
    expect(axial).toBeGreaterThanOrEqual(128)
    expect(s.indices.length).toBe(cyl.indices.length)
  })

  test("the shaded mesh is the same surface: same triangles, same volume", () => {
    const m = translateMesh(meshOf({ _tag: "Sphere", center: { x: 0, y: 0, z: 0 }, radius: 5, rings: 12 }), 3, 4, 5)
    const s = creasedNormals(m)
    expect(meshVolume({ positions: s.positions, indices: s.indices })).toBeCloseTo(meshVolume(m), 6)
  })
})
