import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, frame, makeBox, makeCylinder, makeSphere, massProperties, validateBrep, type Brep } from "./index.ts"
import { agreesWithOperands, booleanCounters, booleanStrict, resetBooleanCounters, VERIFY_FACES } from "./boolean.ts"
import { fuzzPair } from "./fuzz-sweep.ts"

setDefaultTimeout(120_000)

const at = (x: number, y: number, z: number) => frame({ x, y, z }, { x: 0, y: 0, z: 1 })
const vol = (b: Brep) => (b.faces.length === 0 ? 0 : massProperties(b).volume)

describe("valid-but-wrong detection (spec 42 R7)", () => {
  test("the sampled check accepts the result of each operation and rejects a valid solid that is another operation's", () => {
    const A = makeBox(10, 10, 10), B = makeSphere(6, at(8, 5, 5))
    const r = { union: booleanStrict(A, B, "union").brep, intersect: booleanStrict(A, B, "intersect").brep, subtract: booleanStrict(A, B, "subtract").brep }
    for (const op of ["union", "intersect", "subtract"] as const) {
      for (const [name, brep] of Object.entries(r)) {
        // Every result is a valid solid; only the one computed for `op` is the answer for `op`.
        expect(validateBrep(brep).issues).toEqual([])
        expect(agreesWithOperands(A, B, op, brep)).toBe(name === op)
      }
    }
  })

  test("a valid solid 30 % off is rejected, the exact one is accepted (the sample resolves gross errors; identities resolve 1e-6)", () => {
    const A = makeBox(10, 10, 10), B = makeCylinder(3, 10, at(5, 5, 0))
    const right = booleanStrict(A, B, "subtract").brep
    expect(agreesWithOperands(A, B, "subtract", right)).toBe(true)
    // A bore of radius 4 leaves 30 % less material: valid, closed, wrong for this pair.
    const wrong = booleanStrict(A, makeCylinder(4, 10, at(5, 5, 0)), "subtract").brep
    expect(validateBrep(wrong).issues).toEqual([])
    expect(vol(wrong) / vol(right)).toBeLessThan(0.7)
    expect(agreesWithOperands(A, B, "subtract", wrong)).toBe(false)
  })

  test("verify: sampled and identities return the same solid as off and count what they checked", () => {
    const A = makeBox(10, 10, 10), B = makeSphere(6, at(8, 5, 5))
    for (const op of ["union", "intersect", "subtract"] as const) {
      const off = booleanBrep(A, B, op, { verify: "off" })
      resetBooleanCounters()
      const sampled = booleanBrep(A, B, op, { verify: "sampled" })
      expect(booleanCounters().verified).toBe(1)
      const ids = booleanBrep(A, B, op, { verify: "identities" })
      expect(booleanCounters().verified).toBe(2)
      expect(booleanCounters().verifyRejected).toBe(0)
      expect(vol(sampled.brep)).toBeCloseTo(vol(off.brep), 9)
      expect(vol(ids.brep)).toBeCloseTo(vol(off.brep), 9)
    }
  })

  test("the sampled check runs by default above the face count and not below it", () => {
    const small = [makeBox(10, 10, 10), makeCylinder(2, 10, at(5, 5, 0))] as const
    resetBooleanCounters()
    booleanBrep(small[0], small[1], "subtract")
    expect(booleanCounters().verified).toBe(0)
    // Two plates with a row of bores each: more than VERIFY_FACES faces together.
    const plateWith = (y: number, x0: number) => {
      let plate = makeBox(190, 20, 6, at(0, y, 0))
      for (let i = 0; i < 20; i++) plate = booleanBrep(plate, makeCylinder(2, 6, at(x0 + i * 9, y + 10, 0)), "subtract", { verify: "off" }).brep
      return plate
    }
    const p1 = plateWith(0, 8), p2 = plateWith(12, 12)
    expect(p1.faces.length + p2.faces.length).toBeGreaterThanOrEqual(VERIFY_FACES)
    resetBooleanCounters()
    const r = booleanBrep(p1, p2, "union")
    expect(validateBrep(r.brep).issues).toEqual([])
    expect(booleanCounters().verified).toBe(1)
    expect(booleanCounters().verifyRejected).toBe(0)
  })

  test("identities mode over aligned and generic fuzz pairs: nothing valid-but-wrong, nothing rejected", () => {
    resetBooleanCounters()
    let checked = 0
    for (const aligned of [true, false]) {
      for (let seed = 1; seed <= 5; seed++) {
        const [A, B] = fuzzPair(seed, aligned)
        for (const op of ["union", "intersect", "subtract"] as const) {
          const r = booleanBrep(A, B, op, { verify: "identities" })
          expect(r.warnings.filter((w) => w.includes("degenerate alignment"))).toEqual([])
          checked++
        }
      }
    }
    expect(booleanCounters().verifyRejected).toBe(0)
    expect(booleanCounters().verified).toBe(checked)
  })
})
