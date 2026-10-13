/**
 * Every way the core makes a 3D model, checked as a solid: primitives, Booleans, recipes, patterns and edge blends must come out
 * as closed manifold meshes (welded) with the number of shells and through holes the part really has, and the right volume.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanAll, booleanMesh, rotateMesh, translateMesh } from "./csg.ts"
import { blendEdges, findEdges } from "./edge-blend.ts"
import { historyVolume, rebuild, type Feature, type History } from "./history.ts"
import { cleanMesh } from "./mesh-clean.ts"
import { meshTopology, type MeshTopology } from "./mesh-topology.ts"
import { buildRecipe } from "./recipes.ts"
import { meshOf, meshVolume, type Mesh, type Solid } from "./solid.ts"

// Booleans of faceted solids on a machine other suites keep busy.
setDefaultTimeout(120_000)

const topo = (m: Mesh): MeshTopology => meshTopology(cleanMesh(m, { mergeCoplanar: false }))
const expectSolid = (m: Mesh, genus: number, shells = 1): MeshTopology => {
  const t = topo(m)
  expect({ solid: t.solid, shells: t.shells, genus: t.genus, open: t.boundaryEdges, nonManifold: t.nonManifoldEdges }).toEqual({ solid: true, shells, genus, open: 0, nonManifold: 0 })
  return t
}
const box = (x: number, y: number, z: number, w: number, h: number, d: number): Mesh => meshOf({ _tag: "Box", origin: { x, y, z }, size: { x: w, y: h, z: d } })
const cyl = (x: number, y: number, z: number, r: number, h: number): Mesh => meshOf({ _tag: "Cylinder", origin: { x, y, z }, radius: r, height: h, segments: 16 }, 0.01)

describe("primitives are closed solids", () => {
  const cases: Array<[string, Solid, number]> = [
    ["box", { _tag: "Box", origin: { x: 1, y: 2, z: 3 }, size: { x: 4, y: 5, z: 6 } }, 0],
    ["cylinder on z", { _tag: "Cylinder", origin: { x: 0, y: 0, z: 0 }, radius: 5, height: 9, segments: 24 }, 0],
    ["cylinder on x", { _tag: "Cylinder", origin: { x: 0, y: 0, z: 0 }, radius: 5, height: 9, segments: 24, axis: "x" }, 0],
    ["sphere", { _tag: "Sphere", center: { x: 0, y: 0, z: 0 }, radius: 7, rings: 12 }, 0],
    ["coarsest sphere", { _tag: "Sphere", center: { x: 0, y: 0, z: 0 }, radius: 7, rings: 2 }, 0],
    ["cone", { _tag: "Cone", origin: { x: 0, y: 0, z: 0 }, baseRadius: 6, topRadius: 0, height: 9, segments: 24 }, 0],
    ["frustum", { _tag: "Cone", origin: { x: 0, y: 0, z: 0 }, baseRadius: 6, topRadius: 2, height: 9, segments: 24, axis: "y" }, 0],
    ["torus", { _tag: "Torus", center: { x: 0, y: 0, z: 0 }, majorRadius: 20, minorRadius: 4, majorSegments: 24, minorSegments: 12 }, 1],
    ["concave extrusion", { _tag: "Extrude", profile: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }], height: 5 }, 0],
    ["revolution touching the axis", { _tag: "Revolve", profile: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 4, y: 12 }, { x: 0, y: 12 }], angle: 2 * Math.PI }, 0],
    ["half revolution touching the axis", { _tag: "Revolve", profile: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }], angle: Math.PI }, 0],
    ["ring revolution", { _tag: "Revolve", profile: [{ x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 5, y: 5 }], angle: 2 * Math.PI }, 1]
  ]
  for (const [name, solid, genus] of cases) test(`${name}: closed, genus ${genus}`, () => {
    expectSolid(meshOf(solid, 0.05), genus)
  })

  test("a revolution whose profile sits a hair off the axis (as a sketch solver leaves it) is cut like one on it", () => {
    for (const e of [0, 2e-12, 1e-9, 1e-6, 1e-3]) {
      const ring = (x0: number, x1: number, z0: number, z1: number) => meshOf({ _tag: "Revolve", profile: [{ x: x0, y: z0 }, { x: x1, y: z0 }, { x: x1, y: z1 }, { x: x0, y: z1 }], angle: 2 * Math.PI }, 0.01)
      const cup = booleanMesh(ring(e, 15, 0, 30), ring(e, 13, 2, 28), "subtract")
      expect(meshVolume(cup)).toBeCloseTo(meshVolume(ring(0, 15, 0, 30)) - meshVolume(ring(0, 13, 2, 28)), 0)
      expectSolid(cup, 0, 2)
    }
  })

  test("the end faces of a partial revolution face outward (their edges run against the side faces')", () => {
    for (const angle of [Math.PI / 3, Math.PI, 1.5 * Math.PI, -Math.PI]) {
      const t = topo(meshOf({ _tag: "Revolve", profile: [{ x: 2, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 2, y: 5 }], angle }, 0.05))
      expect({ misoriented: t.misorientedEdges, solid: t.solid }).toEqual({ misoriented: 0, solid: true })
    }
  })

  test("the sphere and a revolution on the axis have no triangle without area, even before welding", () => {
    for (const solid of [cases[3]![1], cases[4]![1], cases[9]![1]]) {
      const raw = meshTopology(meshOf(solid, 0.05))
      expect(raw.degenerateTriangles).toBe(0)
    }
    // The sphere is welded by construction: one vertex per pole.
    expect(meshTopology(meshOf(cases[3]![1], 0.05)).solid).toBe(true)
  })
})

describe("Booleans give closed manifold solids", () => {
  test("union, difference and intersection of two boxes at an angle: closed, the right genus, inclusion–exclusion holds", () => {
    const a = box(0, 0, 0, 12, 9, 7)
    const b = translateMesh(rotateMesh(box(0, 0, 0, 8, 8, 8), { x: 1, y: 1, z: 1 }, 0.7, { x: 4, y: 4, z: 4 }), 3, 2, 1)
    const u = booleanMesh(a, b, "union"), i = booleanMesh(a, b, "intersect"), d = booleanMesh(a, b, "subtract")
    // Two convex solids that meet unite into, and intersect in, one piece with no hole.
    expectSolid(u, 0)
    expectSolid(i, 0)
    // The turned cube stands out of the block's bottom and top (z from below 0 to above 7) inside its outline: it cuts a hole through.
    const zs = Array.from({ length: b.positions.length / 3 }, (_, k) => b.positions[k * 3 + 2]!)
    expect(Math.min(...zs)).toBeLessThan(0)
    expect(Math.max(...zs)).toBeGreaterThan(7)
    expectSolid(d, 1)
    expect(meshVolume(u) + meshVolume(i)).toBeCloseTo(meshVolume(a) + meshVolume(b), 3)
    expect(meshVolume(d)).toBeCloseTo(meshVolume(a) - meshVolume(i), 3)
  })

  test("a through hole makes genus 1, a blind hole genus 0, and a cavity a second (inner) shell", () => {
    const block = box(-10, -10, 0, 20, 20, 10)
    expectSolid(booleanMesh(block, cyl(0, 0, -1, 3, 12), "subtract"), 1)
    expectSolid(booleanMesh(block, cyl(0, 0, 4, 3, 10), "subtract"), 0)
    const hollow = booleanMesh(block, box(-5, -5, 2, 10, 10, 5), "subtract")
    const t = expectSolid(hollow, 0, 2)
    expect(t.volume).toBeCloseTo(4000 - 500, 3)
  })

  test("a plate cut by 40 holes one after the other: closed, genus 40, exact volume, triangles growing with the holes, in seconds", () => {
    const t0 = performance.now()
    let m = box(0, 0, 0, 200, 100, 10)
    for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) m = booleanMesh(m, cyl(15 + i * 24, 15 + j * 18, -1, 4, 12), "subtract")
    const elapsed = performance.now() - t0
    const t = expectSolid(m, 40)
    expect(t.volume).toBeCloseTo(200 * 100 * 10 - 40 * meshVolume(cyl(0, 0, 0, 4, 10)), 1)
    // Coplanar fragments are merged back into faces: about 185 triangles a hole, not thousands.
    expect(t.triangles).toBeLessThan(40 * 200)
    expect(elapsed).toBeLessThan(60_000)
  })

  test("a convex operand of ten thousand triangles is classified by its planes: sphere minus box in well under a second unloaded", () => {
    const sphere = meshOf({ _tag: "Sphere", center: { x: 0, y: 0, z: 0 }, radius: 10, rings: 70 })
    const t0 = performance.now()
    const half = booleanMesh(sphere, box(-20, -20, 0, 40, 40, 20), "subtract")
    expect(performance.now() - t0).toBeLessThan(15_000)
    expectSolid(half, 0)
    expect(meshVolume(half)).toBeCloseTo(meshVolume(sphere) / 2, 0)
  })

  test("merging coplanar fragments keeps the solid and drops triangles; a row of overlapping boxes is one box of 12 triangles", () => {
    const a = box(0, 0, 0, 10, 10, 10), b = box(5, 3, 0, 10, 10, 10)
    const merged = booleanMesh(a, b, "union"), raw = booleanMesh(a, b, "union", { mergeCoplanar: false })
    expect(meshVolume(merged)).toBeCloseTo(meshVolume(raw), 6)
    expect(merged.indices.length).toBeLessThan(raw.indices.length)
    const row = booleanAll(Array.from({ length: 16 }, (_, k) => box(k * 9, 0, 0, 10, 10, 10)), "union")
    const t = expectSolid(row, 0)
    expect(t.triangles).toBe(12)
    expect(t.volume).toBeCloseTo(145 * 100, 6)
  })

  test("operands that only touch, or are apart, stay correct and closed", () => {
    expectSolid(booleanMesh(box(0, 0, 0, 10, 10, 10), box(10, 0, 0, 10, 10, 10), "union"), 0)
    expectSolid(booleanMesh(box(0, 0, 0, 10, 10, 10), box(30, 0, 0, 10, 10, 10), "union"), 0, 2)
    expect(booleanMesh(box(0, 0, 0, 1, 1, 1), box(5, 5, 5, 1, 1, 1), "intersect").indices.length).toBe(0)
  })
})

describe("parametric parts are closed solids with the holes they were given", () => {
  const SHAFT = { sections: [{ diameter: 20, length: 30 }, { diameter: 30, length: 50 }, { diameter: 24, length: 40 }] }
  const cases: Array<[string, Record<string, unknown>, number]> = [
    ["mounting_plate", {}, 4],
    ["mounting_plate", { counterbore: true, cornerRadius: 8, edgeChamfer: 1 }, 4],
    ["flange", {}, 7],
    ["l_bracket", {}, 2],
    ["stepped_shaft", SHAFT, 0],
    ["stepped_shaft", { ...SHAFT, keywaySection: 1 }, 0],
    ["pipe_bend", { outerDiameter: 10, wall: 1, legA: 20, legB: 20, bendRadius: 8 }, 1],
    ["pipe_bend", {}, 1],
    ["duct_transition", {}, 1],
    ["enclosure", {}, 0]
  ]
  for (const [name, input, genus] of cases) test(`${name} ${JSON.stringify(input).slice(0, 60)}: closed, genus ${genus}`, () => {
    const r = rebuild(buildRecipe(name, input).history)
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(r.bodies.length).toBeGreaterThan(0)
    for (const b of r.bodies) expectSolid(b.mesh, genus)
  })

  test("a grid pattern of 8 x 5 holes through a plate: genus 40 and the volume of 40 holes", () => {
    const features: Feature[] = [
      { id: "s", type: "sketch", plane: "XY", sketch: { entities: [], constraints: [], shapes: [{ id: "r", kind: "rectangle", at: [0, 0], width: 200, height: 100 }] } },
      { id: "plate", type: "extrude", sketch: "s", depth: 10, operation: "new" },
      { id: "h", type: "hole", plane: "XY", offset: 10, at: [15, 15], diameter: 8, depth: 10 },
      { id: "g", type: "pattern", feature: "h", kind: "grid", count: 8, countB: 5, step: [24, 0, 0], stepB: [0, 18, 0] } as Feature
    ]
    const history: History = { parameters: {}, features }
    const single = historyVolume(rebuild({ ...history, features: features.slice(0, 3) }))
    const r = rebuild(history)
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([])
    expectSolid(r.bodies[0]!.mesh, 40)
    expect(200 * 100 * 10 - historyVolume(r)).toBeCloseTo(40 * (200 * 100 * 10 - single), 0)
  })
})

describe("edge blends", () => {
  test("every edge of a box rounded r2 (rolling-ball corners): one closed shell of genus 0, the Minkowski volume within 0.05 %", () => {
    const body = meshOf({ _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: 40, y: 30, z: 20 } }, 0.01)
    const r = blendEdges(body, findEdges(body).edges, 2)
    expect([r.blended, r.vertices]).toEqual([12, 8])
    expectSolid(r.mesh, 0)
    const i = [36, 26, 16]
    const exact = i[0]! * i[1]! * i[2]! + 2 * 2 * (i[0]! * i[1]! + i[0]! * i[2]! + i[1]! * i[2]!) + Math.PI * 4 * (i[0]! + i[1]! + i[2]!) + (4 / 3) * Math.PI * 8
    expect(Math.abs(meshVolume(r.mesh) - exact) / exact).toBeLessThan(0.0005)
  })

  test("the three edges at one corner: closed, genus 0 (no fins or tunnels where the ball meets the fillets)", () => {
    const body = meshOf({ _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: 40, y: 30, z: 20 } }, 0.01)
    const atOrigin = findEdges(body).edges.filter((e) => [e.a, e.b].some((p) => Math.hypot(p.x, p.y, p.z) < 1e-6))
    const r = blendEdges(body, atOrigin, 3)
    expect(r.vertices).toBe(1)
    expectSolid(r.mesh, 0)
  })

  test("chamfers on a box and a concave fillet on an L: closed solids", () => {
    const body = meshOf({ _tag: "Box", origin: { x: 0, y: 0, z: 0 }, size: { x: 40, y: 30, z: 20 } }, 0.01)
    expectSolid(blendEdges(body, findEdges(body).edges, 2, "chamfer").mesh, 0)
    const l = meshOf({ _tag: "Extrude", profile: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }], height: 20 }, 0.01)
    expectSolid(blendEdges(l, findEdges(l).edges.filter((e) => !e.convex), 3).mesh, 0)
  })
})
