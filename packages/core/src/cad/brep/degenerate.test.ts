import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, booleanStrict, BooleanError, frame, transformBrep, translation, makeBox, makeCylinder, makeSphere, makeTorus, massProperties, validateBrep, type Brep, type BooleanOp } from "./index.ts"

setDefaultTimeout(60_000)
const at = (x: number, y: number, z: number, a = { x: 0, y: 0, z: 1 }) => frame({ x, y, z }, a)
const PI = Math.PI

/** Boolean on axis-aligned / tangent operands: the result must be a valid solid (no mesh fallback). */
const valid = (A: Brep, B: Brep, op: BooleanOp) => {
  const r = booleanBrep(A, B, op)
  expect(validateBrep(r.brep).issues.map((i) => i.message)).toEqual([])
  return massProperties(r.brep).volume
}
// lens volume of two spheres radii R,r at distance d
const lens = (R: number, r: number, d: number) => (PI * (R + r - d) ** 2 * (d * d + 2 * d * r - 3 * r * r + 2 * d * R + 6 * r * R - 3 * R * R)) / (12 * d)

describe("degenerate alignments (R1-R5)", () => {
  test("R1 sphere u sphere on a common axis", () => {
    const v = valid(makeSphere(5), makeSphere(5, at(4, 0, 0)), "union")
    expect(Math.abs(v - (2 * (4 / 3) * PI * 125 - lens(5, 5, 4))) / v).toBeLessThan(1e-6)
  })
  test("R2 sphere u sphere, tilted frame", () => {
    const c = { x: 2, y: 2.5, z: 1.5 }
    const d = Math.hypot(c.x, c.y, c.z)
    const v = valid(makeSphere(5), makeSphere(5, frame(c, { x: 1, y: 1, z: 1 })), "union")
    expect(Math.abs(v - (2 * (4 / 3) * PI * 125 - lens(5, 5, d))) / v).toBeLessThan(1e-6)
  })
  test("R3 box u sphere centred on a face", () => {
    const v = valid(makeBox(10, 10, 10), makeSphere(4, at(5, 5, 10)), "union")
    expect(Math.abs(v - (1000 + (2 / 3) * PI * 64)) / v).toBeLessThan(1e-6)
  })
  test("R4a torus u sphere on the tube", () => {
    valid(makeTorus(10, 3), makeSphere(4, at(10.3, 0.2, 0.1)), "union")
  })
  test("R4b torus - cylinder through the tube centre line", () => {
    valid(makeTorus(10, 3), makeCylinder(2, 10, at(10, 0, -5)), "subtract")
  })
  test("R5 box - cylinder tangent to a wall: the contact is a non-manifold edge, so the cylinder is displaced and the result says so", () => {
    const r = booleanBrep(makeBox(10, 10, 10), makeCylinder(2, 10, at(2, 5, 0)), "subtract")
    expect(validateBrep(r.brep).issues).toEqual([])
    expect(r.warnings.some((w) => w.includes("degenerate alignment"))).toBe(true)
    expect(Math.abs(massProperties(r.brep).volume - (1000 - PI * 4 * 10)) / 874).toBeLessThan(1e-5)
  })

  test("a Boolean that cannot be repaired reports its stage and a remedy; the strict form reports without recovery", () => {
    let e: unknown
    try { booleanStrict(makeBox(10, 10, 10), makeCylinder(2, 10, at(2, 5, 0)), "subtract") } catch (x) { e = x }
    expect(e).toBeInstanceOf(BooleanError)
    const d = (e as BooleanError).diagnostic!
    expect(d.stage).toBe("validate")
    expect(d.hint.length).toBeGreaterThan(10)
    expect(d.attempts).toEqual([])
  })

  test("seed 114: a torus and a sphere overlapping by 0.07 mm return their lens (the coarse volume had the wrong sign)", () => {
    // Fuzz seed 114 aligned. Union and difference agreed on a 0.064 mm3 lens, but the intersection's closed shell measured
    // -2.9e-5 mm3 on the coarse tessellation (thinner than its chord), so the Boolean refused a result whose exact volume is
    // right. The exact volume now decides an orientation-only failure.
    const torus = makeTorus(6.5, 2, frame({ x: 1.5, y: 1.5, z: -0.5 }, { x: 0, y: 0, z: 1 }))
    const sphere = makeSphere(4, frame({ x: 1, y: 0.5, z: -3 }, { x: 1, y: 0, z: 0 }))
    const i = valid(torus, sphere, "intersect")
    const u = valid(torus, sphere, "union")
    const d = valid(torus, sphere, "subtract")
    expect(Math.abs(i - 0.0642)).toBeLessThan(1e-3)
    expect(Math.abs(u + i - massProperties(torus).volume - massProperties(sphere).volume)).toBeLessThan(1e-3)
    expect(Math.abs(d + i - massProperties(torus).volume)).toBeLessThan(1e-3)
  })

  test("a sphere pole on the torus surface (and across five offsets through 1e-3 mm): the recovery returns balanced volumes, not the strict 0.8 % error", () => {
    // Spec 33 §7.11/§7.18: with the pole exactly on the other solid the strict pipeline is 0.8 % high; `booleanBrep` routes
    // a pole within 2e-4 of the model size to the verified recovery. The grid estimate of the intersection is 101.845.
    for (const dz of [0, 1e-5, 5e-5, 1e-4, 1e-3]) {
      const torus = makeTorus(4.5, 2.5, frame({ x: -0.5, y: -0.5, z: -1 }, { x: 0, y: 0, z: 1 }))
      const sphere = transformBrep(makeSphere(4.5, frame({ x: -2, y: -2.5, z: 2 }, { x: 0, y: 0, z: 1 })), translation({ x: 0, y: 0, z: dz }))
      const u = valid(torus, sphere, "union"), i = valid(torus, sphere, "intersect"), d = valid(torus, sphere, "subtract")
      const vt = massProperties(torus).volume, vs = massProperties(sphere).volume
      expect(Math.abs(u + i - vt - vs)).toBeLessThan(1e-3)
      expect(Math.abs(d + i - vt)).toBeLessThan(1e-3)
      expect(Math.abs(i - 101.8)).toBeLessThan(0.1)
    }
  }, 240_000)

  test("a sphere pole a millimetre from a torus: the fragment at the pole tessellates (it was empty), so the volumes balance", () => {
    // The sphere's south pole lies 0.16 mm outside the torus; a vertex of the intersection curve a few microns off the seam near
    // the pole has a u that differs by radians, and the fragment used to come out with no triangles and no warning.
    const torus = makeTorus(4.5, 2.5, frame({ x: -0.5, y: -0.5, z: -1 }, { x: 0, y: 0, z: 1 }))
    const sphere = transformBrep(makeSphere(4.5, frame({ x: -2, y: -2.5, z: 2 }, { x: 0, y: 0, z: 1 })), translation({ x: 5e-4, y: 3e-4, z: 8e-4 }))
    const u = booleanStrict(torus, sphere, "union").brep, i = booleanStrict(torus, sphere, "intersect").brep
    const vt = massProperties(torus).volume, vs = massProperties(sphere).volume
    expect(Math.abs(massProperties(u).volume + massProperties(i).volume - vt - vs)).toBeLessThan(1e-3)
    // The grid estimate of the intersection (360^3 cells) is 101.8.
    expect(Math.abs(massProperties(i).volume - 101.78)).toBeLessThan(0.1)
  })
})
