import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, frame, makeBox, makeCylinder, makeSphere, makeTorus, massProperties, validateBrep, type Brep, type BooleanOp } from "./index.ts"

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
})
