import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { blendBrep, blendCandidates, selectBlendEdges, type BlendCandidate } from "./blend.ts"
import { booleanBrep } from "./boolean.ts"
import { massProperties } from "./mass.ts"
import { frame } from "./math.ts"
import { makeBox, makeCylinder } from "./primitives.ts"
import { validateBrep } from "./validate.ts"
import type { Brep } from "./topology.ts"

// The exact Booleans of a whole rounded box take tens of seconds on a loaded machine.
setDefaultTimeout(180_000)

const PI = Math.PI
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)
/** The spandrel left between a right-angled corner and a quarter circle of radius r, and its centroid's distance from either side. */
const spandrel = (r: number) => ({ area: r * r * (1 - PI / 4), centroid: ((10 - 3 * PI) / (12 - 3 * PI)) * r })
const kinds = (b: Brep): Record<string, number> => {
  const k: Record<string, number> = {}
  for (const f of b.faces) k[f.surface.kind] = (k[f.surface.kind] ?? 0) + 1
  return k
}
const valid = (b: Brep) => expect(validateBrep(b).issues.map((i) => i.message)).toEqual([])
const near = (p: { x: number; y: number; z: number }, q: readonly [number, number, number]) => Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]) < 1e-9
const edgeBetween = (c: ReadonlyArray<BlendCandidate>, a: readonly [number, number, number], b: readonly [number, number, number]) =>
  c.find((e) => (near(e.a, a) && near(e.b, b)) || (near(e.a, b) && near(e.b, a)))!

describe("exact fillets on straight edges", () => {
  const box = makeBox(20, 15, 10)
  const all = blendCandidates(box)

  test("a box has twelve convex straight candidates", () => {
    expect(all.length).toBe(12)
    expect(all.every((e) => e.convex && e.curve === "line")).toBe(true)
  })

  test("one edge: an exact quarter cylinder, the spandrel times the length removed", () => {
    const r = 2
    const res = blendBrep(box, [edgeBetween(all, [0, 0, 0], [20, 0, 0])], r)
    expect(res.blended).toBe(1)
    expect(res.failures).toEqual([])
    valid(res.brep)
    expect(rel(massProperties(res.brep).volume, 3000 - spandrel(r).area * 20)).toBeLessThan(1e-12)
    const cyl = res.brep.faces.filter((f) => f.surface.kind === "cylinder")
    expect(cyl.length).toBe(1)
    expect(cyl[0]!.surface.kind === "cylinder" && Math.abs(cyl[0]!.surface.radius - r) < 1e-12).toBe(true)
  })

  test("two edges meeting at a corner: tools mitred on the bisector plane", () => {
    const r = 2, s = spandrel(r)
    const res = blendBrep(box, [edgeBetween(all, [0, 0, 0], [20, 0, 0]), edgeBetween(all, [20, 0, 0], [20, 15, 0])], r)
    expect(res.failures).toEqual([])
    valid(res.brep)
    // Each tool runs to the mitre plane: the spandrel's centroid sits s.centroid from it on average.
    expect(rel(massProperties(res.brep).volume, 3000 - (35 * s.area - 2 * s.area * s.centroid))).toBeLessThan(1e-9)
    expect(kinds(res.brep)).toEqual({ plane: 6, cylinder: 2 })
  })

  test("three edges at a corner: the rolling ball's spherical patch", () => {
    const r = 2, s = spandrel(r)
    const at = all.filter((e) => [e.a, e.b].some((p) => near(p, [20, 0, 0])))
    const res = blendBrep(box, at, r)
    expect(res.failures).toEqual([])
    expect(res.vertices).toBe(1)
    valid(res.brep)
    // The edge tools stop on the planes through the ball centre (18, 2, 2); the corner cube keeps the ball's octant.
    const removed = (18 + 13 + 8) * s.area + (r ** 3 - (4 / 3) * PI * r ** 3 / 8)
    expect(rel(massProperties(res.brep).volume, 3000 - removed)).toBeLessThan(1e-9)
    expect(kinds(res.brep)).toEqual({ plane: 6, cylinder: 3, sphere: 1 })
  })

  test("a fully rounded box is the Minkowski sum of the inner box and the ball", () => {
    const r = 2
    const res = blendBrep(box, all, r)
    expect(res.failures).toEqual([])
    expect(res.blended).toBe(12)
    expect(res.vertices).toBe(8)
    valid(res.brep)
    const a = 20 - 2 * r, b = 15 - 2 * r, c = 10 - 2 * r
    const v = a * b * c + 2 * r * (a * b + b * c + a * c) + PI * r * r * (a + b + c) + (4 / 3) * PI * r ** 3
    expect(rel(massProperties(res.brep).volume, v)).toBeLessThan(1e-8)
    expect(kinds(res.brep)).toEqual({ plane: 6, cylinder: 12, sphere: 8 })
  })
})

describe("exact chamfers", () => {
  const box = makeBox(20, 15, 10)
  const all = blendCandidates(box)

  test("one edge: a 45-degree flat, c^2/2 times the length removed", () => {
    const res = blendBrep(box, [edgeBetween(all, [0, 0, 0], [20, 0, 0])], 2, "chamfer")
    valid(res.brep)
    expect(rel(massProperties(res.brep).volume, 3000 - 2 * 20)).toBeLessThan(1e-12)
  })

  test("every edge: the box cut by its twelve chamfer planes (inclusion-exclusion at the corners)", () => {
    const c = 2
    const res = blendBrep(box, all, c, "chamfer")
    expect(res.failures).toEqual([])
    valid(res.brep)
    expect(rel(massProperties(res.brep).volume, 3000 - 2 * c * c * (20 + 15 + 10) + 6 * c ** 3)).toBeLessThan(1e-9)
    // The three chamfer planes of a corner meet in one point: no corner face.
    expect(kinds(res.brep)).toEqual({ plane: 6 + 12 })
  })
})

describe("exact blends of rims", () => {
  // A 40 x 30 x 10 plate with a through hole of radius 6 at its centre.
  const plate = booleanBrep(makeBox(40, 30, 10), makeCylinder(6, 14, frame({ x: 20, y: 15, z: -2 })), "subtract").brep

  test("the hole's two mouths are rims, taken only when curved edges are asked for", () => {
    const c = blendCandidates(plate)
    expect(selectBlendEdges(c).every((e) => e.curve === "line")).toBe(true)
    const rims = selectBlendEdges(c, { curved: true }).filter((e) => e.curve === "circle")
    expect(rims.length).toBe(2)
    expect(rims.every((e) => e.convex && Math.abs(e.axis!.radius - 6) < 1e-12)).toBe(true)
  })

  test("a fillet on the top mouth is an exact torus; Pappus gives the removed volume", () => {
    const r = 1.5, s = spandrel(r)
    const top = selectBlendEdges(blendCandidates(plate), { curved: true }).find((e) => e.curve === "circle" && e.a.z > 5)!
    const res = blendBrep(plate, [top], r)
    expect(res.failures).toEqual([])
    valid(res.brep)
    const before = massProperties(plate).volume
    expect(rel(massProperties(res.brep).volume, before - 2 * PI * (6 + s.centroid) * s.area)).toBeLessThan(1e-8)
    const torus = res.brep.faces.filter((f) => f.surface.kind === "torus")
    expect(torus.length).toBe(1)
    expect(torus[0]!.surface.kind === "torus" && Math.abs(torus[0]!.surface.minor - r) < 1e-12 && Math.abs(torus[0]!.surface.major - (6 + r)) < 1e-12).toBe(true)
  })

  test("a chamfer on the mouth is an exact cone", () => {
    const c = 1
    const top = selectBlendEdges(blendCandidates(plate), { curved: true }).find((e) => e.curve === "circle" && e.a.z > 5)!
    const res = blendBrep(plate, [top], c, "chamfer")
    valid(res.brep)
    // The removed ring: a right triangle of legs c, centroid at c/3 from the wall.
    expect(rel(massProperties(res.brep).volume, massProperties(plate).volume - 2 * PI * (6 + c / 3) * (c * c) / 2)).toBeLessThan(1e-8)
    expect(res.brep.faces.some((f) => f.surface.kind === "cone")).toBe(true)
  })
})

describe("what is not blended is reported, never approximated", () => {
  test("a radius wider than the faces is refused with the reason", () => {
    const thin = makeBox(20, 15, 1)
    const res = blendBrep(thin, blendCandidates(thin), 3)
    expect(res.blended).toBeLessThan(12)
    expect(res.rejected.some((r) => r.includes("needs") && r.includes("reach only"))).toBe(true)
    valid(res.brep)
  })

  test("a non-positive size throws", () => {
    expect(() => blendBrep(makeBox(1, 1, 1), [], 0)).toThrow()
  })
})
