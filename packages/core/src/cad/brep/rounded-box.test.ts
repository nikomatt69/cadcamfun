import { describe, expect, test } from "bun:test"
import { blendBrep, blendCandidates, booleanCounters, makeBox, massProperties, resetBooleanCounters, validateBrep } from "./index.ts"

// Spec 42 R8 residual: the 32 Booleans of a fully rounded box all run on the plain pipeline. Before, four of them (the corner
// tools meeting equal-radius fillet cylinders and the corner sphere tangentially) were solved by displacing an operand and the
// volume was only right to 2e-5.
describe("fully rounded box (equal-radius fillets and corner spheres)", () => {
  const closedForm = (x: number, y: number, z: number, r: number): number => {
    const a = x - 2 * r, b = y - 2 * r, c = z - 2 * r
    return a * b * c + 2 * r * (a * b + b * c + a * c) + Math.PI * r * r * (a + b + c) + (4 / 3) * Math.PI * r ** 3
  }

  test("40 x 30 x 20, radius 3: no displacement, no warning, volume exact", () => {
    const box = makeBox(40, 30, 20)
    resetBooleanCounters()
    const res = blendBrep(box, blendCandidates(box), 3)
    const counters = booleanCounters()
    expect(res.failures).toEqual([])
    expect(res.blended).toBe(12)
    expect(res.vertices).toBe(8)
    expect(validateBrep(res.brep).issues).toEqual([])
    expect(counters.recoveredByDisplacement).toBe(0)
    expect(counters.failed).toBe(0)
    expect(counters.strictFailure).toBe(0)
    expect(counters.exact).toBe(counters.calls)
    const expected = closedForm(40, 30, 20, 3)
    expect(Math.abs(massProperties(res.brep).volume - expected) / expected).toBeLessThan(1e-6)
  }, 120_000)
})
