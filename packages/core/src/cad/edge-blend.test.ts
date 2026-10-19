import { describe, expect, test } from "bun:test"
import { booleanMesh } from "./csg.ts"
import { blendEdges, findEdges, selectEdges, type BlendEdge } from "./edge-blend.ts"
import { meshOf, meshVolume, type Mesh } from "./solid.ts"

const box = (x: number, y: number, z: number): Mesh => meshOf({ _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x, y, z } } as never, 0.01)
const prism = (profile: Array<{ x: number; y: number }>, height: number): Mesh => meshOf({ _tag: "Extrude", profile, height, origin: { x: 0, y: 0, z: 0 } } as never, 0.01)
const L = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }]
const BOX = 40 * 30 * 20
const rel = (got: number, want: number): number => Math.abs(got - want) / Math.abs(want)

/**
 * A closed surface: the vector area (the sum of the triangle normals x area) of a closed surface is zero. Vertex-welded checks do not
 * apply to Boolean meshes, which carry T-junctions where a triangle meets a split neighbour.
 */
const closedSurface = (mesh: Mesh): boolean => {
  const p = mesh.positions
  let sx = 0, sy = 0, sz = 0, area = 0
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const a = mesh.indices[t]! * 3, b = mesh.indices[t + 1]! * 3, c = mesh.indices[t + 2]! * 3
    const ux = p[b]! - p[a]!, uy = p[b + 1]! - p[a + 1]!, uz = p[b + 2]! - p[a + 2]!, vx = p[c]! - p[a]!, vy = p[c + 1]! - p[a + 1]!, vz = p[c + 2]! - p[a + 2]!
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    sx += nx / 2; sy += ny / 2; sz += nz / 2; area += Math.hypot(nx, ny, nz) / 2
  }
  return area > 0 && Math.hypot(sx, sy, sz) < 1e-4 * area
}
const ngon = (n: number, r: number, cx: number, cy: number) => Array.from({ length: n }, (_, k) => ({ x: cx + r * Math.cos((2 * Math.PI * k) / n), y: cy + r * Math.sin((2 * Math.PI * k) / n) }))
/** A tall prism of an n-gon, to cut a through hole whose facet count is exactly n (a `Cylinder` solid chooses its own by tolerance). */
const holeTool = (n: number): Mesh => meshOf({ _tag: "Extrude", profile: ngon(n, 5, 20, 15), height: 30, origin: { x: 0, y: 0, z: -5 } } as never, 0.01)

const dir = (e: BlendEdge) => ({ x: Math.abs(e.b.x - e.a.x) / e.length, y: Math.abs(e.b.y - e.a.y) / e.length, z: Math.abs(e.b.z - e.a.z) / e.length })

describe("findEdges", () => {
  const found = findEdges(box(40, 30, 20))

  test("a box has six faces and twelve edges, all convex: four of 40, four of 30, four of 20 mm", () => {
    expect(found.faces).toBe(6)
    expect(found.edges).toHaveLength(12)
    expect(found.edges.every((e) => e.convex)).toBe(true)
    const lengths = found.edges.map((e) => Math.round(e.length)).sort((a, b) => a - b)
    expect(lengths).toEqual([20, 20, 20, 20, 30, 30, 30, 30, 40, 40, 40, 40])
  })

  test("the two outward normals of an edge are perpendicular unit vectors, and the edge lies on both faces", () => {
    for (const e of found.edges) {
      expect(Math.hypot(e.nA.x, e.nA.y, e.nA.z)).toBeCloseTo(1, 6)
      expect(e.nA.x * e.nB.x + e.nA.y * e.nB.y + e.nA.z * e.nB.z).toBeCloseTo(0, 6)
      // The edge reaches across the whole face on the other side: the faces are at least as wide as the shortest box side.
      expect(e.reachA).toBeGreaterThanOrEqual(20 - 1e-6)
      expect(e.reachB).toBeGreaterThanOrEqual(20 - 1e-6)
    }
  })

  test("an L-shaped extrusion has 18 edges: one concave (the inner vertical one) and 17 convex", () => {
    const l = findEdges(prism(L, 20))
    expect(l.faces).toBe(8)
    expect(l.edges).toHaveLength(18)
    const concave = l.edges.filter((e) => !e.convex)
    expect(concave).toHaveLength(1)
    expect(concave[0]!.a.x).toBeCloseTo(10, 4)
    expect(concave[0]!.a.y).toBeCloseTo(10, 4)
    expect(concave[0]!.length).toBeCloseTo(20, 4)
    expect(dir(concave[0]!).z).toBeCloseTo(1, 6)
  })

  test("a box with a fine (64-sided) through hole: the facets of the hole are one curved wall, not 64 edges; only the rim and the four corners remain", () => {
    const part = booleanMesh(box(40, 30, 20), holeTool(64), "subtract")
    const { edges } = findEdges(part)
    const vertical = edges.filter((e) => dir(e).z > 0.99)
    expect(vertical).toHaveLength(4) // the box corners only, no vertical edge between two facets of the hole
    // The rim of the hole, top and bottom, is made of the 64 facet edges each: convex edges between the plane and the facets.
    expect(edges.filter((e) => dir(e).z < 0.01 && e.length < 3)).toHaveLength(128)
  })

  test("a coarse (12-sided) hole: its 30 degree facets ARE edges (above the 25 degree threshold), 12 concave vertical ones", () => {
    const { edges } = findEdges(booleanMesh(box(40, 30, 20), holeTool(12), "subtract"))
    const vertical = edges.filter((e) => dir(e).z > 0.99)
    expect(vertical).toHaveLength(4 + 12)
    expect(vertical.filter((e) => !e.convex)).toHaveLength(12)
  })

  test("two faces that differ by less than 25 degrees (a shallow ridge) are not an edge; with a lower threshold they are", () => {
    const roof = prism([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 20, y: 23.5 }, { x: 0, y: 20 }], 30)
    const vertical = (e: BlendEdge) => dir(e).z > 0.99
    expect(findEdges(roof).edges.filter(vertical)).toHaveLength(4)
    expect(findEdges(roof, 15).edges.filter(vertical)).toHaveLength(5)
  })

  test("a mesh with no triangles has no faces and no edges", () => {
    const empty: Mesh = { positions: new Float32Array(0), indices: new Uint32Array(0) }
    expect(findEdges(empty)).toEqual({ edges: [], faces: 0 })
  })
})

describe("selectEdges", () => {
  const { edges } = findEdges(box(40, 30, 20))

  test.each([["x", 4], ["y", 4], ["z", 4]] as const)("parallel %s takes the four edges of that direction", (axis, count) => {
    const picked = selectEdges(edges, { parallel: axis })
    expect(picked).toHaveLength(count)
    expect(picked.every((e) => dir(e)[axis] > 0.99)).toBe(true)
  })

  test("within a box takes the edges that lie wholly inside it: the four top edges", () => {
    const top = selectEdges(edges, { within: { min: [-1, -1, 19], max: [41, 31, 21] } })
    expect(top).toHaveLength(4)
    expect(top.every((e) => e.a.z > 19.99 && e.b.z > 19.99)).toBe(true)
  })

  test("kind: a box has no concave edge; 'both' takes everything; the default is convex", () => {
    expect(selectEdges(edges, { kind: "concave" })).toHaveLength(0)
    expect(selectEdges(edges, { kind: "both" })).toHaveLength(12)
    expect(selectEdges(edges)).toHaveLength(12)
    const l = findEdges(prism(L, 20)).edges
    expect(selectEdges(l, { kind: "concave" })).toHaveLength(1)
    expect(selectEdges(l, { kind: "both" })).toHaveLength(18)
    expect(selectEdges(l)).toHaveLength(17)
  })

  test("minLength drops the short edges", () => {
    expect(selectEdges(edges, { minLength: 35 })).toHaveLength(4)
    expect(selectEdges(edges, { minLength: 25 })).toHaveLength(8)
    expect(selectEdges(edges, { minLength: 41 })).toHaveLength(0)
  })

  test("the criteria combine: vertical edges inside the lower half-space", () => {
    const picked = selectEdges(edges, { parallel: "z", within: { min: [-1, -1, -1], max: [41, 31, 10] } })
    expect(picked).toHaveLength(0) // a vertical edge runs the full 20 mm, so none lies within the lower 10 mm
    expect(selectEdges(edges, { parallel: "z", within: { min: [-1, -1, -1], max: [41, 31, 21] } })).toHaveLength(4)
  })
})

describe("blendEdges: volumes", () => {
  const body = box(40, 30, 20)
  const edges = findEdges(body).edges

  test("fillet r4 on the four vertical edges removes 4 (1 - pi/4) r^2 h = 274.7 mm3 (tessellation inscribes: within 0.05 %)", () => {
    const r = blendEdges(body, selectEdges(edges, { parallel: "z" }), 4)
    expect(r.blended).toBe(4)
    expect(r.rejected).toEqual([])
    expect(rel(meshVolume(r.mesh), BOX - 4 * (1 - Math.PI / 4) * 16 * 20)).toBeLessThan(0.0005)
    expect(closedSurface(r.mesh)).toBe(true)
  })

  test("chamfer 3 on the vertical edges removes 4 x (3 x 3 / 2) x 20 = 360 mm3 exactly", () => {
    const r = blendEdges(body, selectEdges(edges, { parallel: "z" }), 3, "chamfer")
    expect(r.blended).toBe(4)
    expect(meshVolume(r.mesh)).toBeCloseTo(BOX - 4 * 4.5 * 20, 2)
    expect(closedSurface(r.mesh)).toBe(true)
  })

  test("fillet r2 on the four top edges removes the quarter-round section (1 - pi/4) r^2 along the 140 mm perimeter", () => {
    const top = selectEdges(edges, { within: { min: [-1, -1, 19], max: [41, 31, 21] } })
    const r = blendEdges(body, top, 2)
    expect(r.blended).toBe(4)
    expect(rel(meshVolume(r.mesh), BOX - (1 - Math.PI / 4) * 4 * 140)).toBeLessThan(0.0005)
  })

  test("every convex edge r2: the rounded box (Minkowski sum) volume, within 0.1 %, with a spherical corner at each of the 8 vertices", () => {
    const r = blendEdges(body, edges, 2)
    expect(r.blended).toBe(12)
    expect(r.vertices).toBe(8)
    const i = [36, 26, 16]
    const exact = i[0]! * i[1]! * i[2]! + 2 * 2 * (i[0]! * i[1]! + i[0]! * i[2]! + i[1]! * i[2]!) + Math.PI * 4 * (i[0]! + i[1]! + i[2]!) + (4 / 3) * Math.PI * 8
    expect(rel(meshVolume(r.mesh), exact)).toBeLessThan(0.001)
  }, 60_000)

  test("a concave fillet r3 adds material: the inner corner of the L gains (1 - pi/4) r^2 h = 38.6 mm3", () => {
    const l = prism(L, 20)
    const concave = selectEdges(findEdges(l).edges, { kind: "concave" })
    const r = blendEdges(l, concave, 3)
    expect(r.blended).toBe(1)
    expect(meshVolume(l)).toBeCloseTo(12000, 3)
    expect(meshVolume(r.mesh) - 12000).toBeGreaterThan(38.6 * 0.98)
    expect(meshVolume(r.mesh) - 12000).toBeLessThan(38.6 * 1.03)
    expect(closedSurface(r.mesh)).toBe(true)
  })

  test("a concave chamfer 3 adds the triangle 3 x 3 / 2 x 20 = 90 mm3", () => {
    const l = prism(L, 20)
    const r = blendEdges(l, selectEdges(findEdges(l).edges, { kind: "concave" }), 3, "chamfer")
    expect(meshVolume(r.mesh) - 12000).toBeGreaterThan(89)
    expect(meshVolume(r.mesh) - 12000).toBeLessThan(91.5)
  })

  test("no edges selected: the same mesh comes back and nothing is blended", () => {
    const r = blendEdges(body, [], 2)
    expect(r.blended).toBe(0)
    expect(r.mesh).toBe(body)
    expect(r.rejected).toEqual([])
  })
})

describe("blendEdges: what cannot be blended", () => {
  const body = box(40, 30, 20)
  const edges = findEdges(body).edges

  test("a radius wider than the faces is rejected with the reason, and the body is left as it was", () => {
    const r = blendEdges(body, selectEdges(edges, { parallel: "z" }), 50)
    expect(r.blended).toBe(0)
    expect(r.rejected).toHaveLength(4)
    expect(r.rejected[0]).toMatch(/needs 50\.00 mm of face on each side; the faces reach only/)
    expect(meshVolume(r.mesh)).toBeCloseTo(BOX, 6)
  })

  test("a chamfer wider than the faces says so", () => {
    const r = blendEdges(body, selectEdges(edges, { parallel: "z" }), 45, "chamfer")
    expect(r.blended).toBe(0)
    expect(r.rejected[0]).toMatch(/chamfer of 45\.00 mm is wider than its first face/)
  })

  test("two faces folded onto each other (a knife edge) cannot take a blend", () => {
    const knife: BlendEdge = { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 10 }, nA: { x: 0, y: 1, z: 0 }, nB: { x: 0, y: -1, z: 1e-4 }, convex: true, length: 10, reachA: 20, reachB: 20, curved: false }
    const r = blendEdges(body, [knife], 1)
    expect(r.blended).toBe(0)
    expect(r.rejected[0]).toMatch(/knife edge/)
  })

  test("some edges blend and some are rejected: on a 40 x 8 x 20 box a radius of 9 fits the faces along Y (reach 20) but not the 8 mm faces", () => {
    const narrow = box(40, 8, 20)
    const r = blendEdges(narrow, findEdges(narrow).edges, 9)
    expect(r.blended).toBe(4) // the four edges along Y, between a 20 mm wall and a 40 mm face
    expect(r.rejected).toHaveLength(8) // the four vertical and the four along X, each next to an 8 mm face
    expect(r.rejected.every((m) => m.startsWith("edge ") && /the faces reach only 8\.00 mm/.test(m))).toBe(true)
    expect(meshVolume(r.mesh)).toBeLessThan(40 * 8 * 20)
    expect(closedSurface(r.mesh)).toBe(true)
  })

  test.each([0, -1, Number.NaN])("a size of %s is a RangeError", (size) => {
    expect(() => blendEdges(body, edges, size)).toThrow(RangeError)
    expect(() => blendEdges(body, edges, size, "chamfer")).toThrow(/positive size/)
  })
})

describe("curved surfaces are not edges to fillet", () => {
  // A plate with a drilled hole: the hole wall is a ring of facets, and each facet meets the top face at 90 degrees.
  const plate = booleanMesh(box(60, 40, 10), holeTool(48), "subtract")
  const { edges } = findEdges(plate)

  test("the rim of a tessellated hole is marked curved and left out of a default selection", () => {
    const curved = edges.filter((e) => e.curved)
    expect(curved.length).toBeGreaterThanOrEqual(48) // one rim edge per facet on the top and the bottom face
    const picked = selectEdges(edges)
    expect(picked.every((e) => !e.curved)).toBe(true)
    expect(picked).toHaveLength(12) // the twelve edges of the block
  })

  test("asking for curved edges explicitly takes the rim as well", () => {
    expect(selectEdges(edges, { curved: true }).length).toBe(edges.filter((e) => e.convex).length)
  })

  test("a plain block has no curved edge", () => {
    expect(findEdges(box(40, 30, 20)).edges.every((e) => !e.curved)).toBe(true)
  })

  test("a two-facet chamfer is not mistaken for a curve", () => {
    const chamfered = blendEdges(box(40, 30, 20), selectEdges(findEdges(box(40, 30, 20)).edges, { parallel: "z" }), 3, "chamfer").mesh
    const after = findEdges(chamfered).edges
    expect(after.some((e) => e.curved)).toBe(false)
  })

  test("a filleted edge becomes a curved surface: its facets are not edges to blend again", () => {
    const b = box(40, 30, 20)
    const rounded = blendEdges(b, selectEdges(findEdges(b).edges, { parallel: "z" }), 6, "fillet").mesh
    const again = selectEdges(findEdges(rounded).edges, { parallel: "z" })
    expect(again).toHaveLength(0)
  })
})
