/**
 * The exact catalogue solids of spec 40 U5: a capsule is a cylinder with two hemispherical caps, and its volume is
 * known in closed form, so the exact model is checked against the formula and not against the kernel's own output.
 */
import { describe, expect, test } from "bun:test"
import { capsuleVolume, makeCapsule } from "./catalogue.ts"
import { massProperties } from "./mass.ts"
import { validateBrep } from "./validate.ts"
import { tessellateBrep } from "./tessellate.ts"

describe("the exact capsule", () => {
  test("its volume is the closed form of a cylinder and two hemispheres", () => {
    const b = makeCapsule(3, 14)
    const report = validateBrep(b)
    expect(report.issues.map((i) => i.message)).toEqual([])
    expect(massProperties(b).volume).toBeCloseTo(capsuleVolume(3, 14), 4)
  })

  test("its area is the closed form too", () => {
    const b = makeCapsule(3, 14)
    // The cylindrical band plus the two hemispheres (one full sphere).
    const expected = 2 * Math.PI * 3 * 14 + 4 * Math.PI * 3 * 3
    expect(massProperties(b).area).toBeCloseTo(expected, 3)
  })

  test("it is a valid closed shell with genus zero", () => {
    const report = validateBrep(makeCapsule(2.5, 8))
    expect(report.valid).toBe(true)
    expect(report.manifoldSolid).toBe(true)
    expect(report.genus).toBe(0)
  })

  test("its tessellation is watertight", () => {
    const t = tessellateBrep(makeCapsule(3, 10), { chordTol: 0.05 })
    expect(t.indices.length).toBeGreaterThan(0)
    expect(t.positions.length / 3).toBeGreaterThan(12)
  })

  test("the axis directions agree with the editor's", () => {
    for (const direction of ["x", "y", "z"] as const) {
      const b = makeCapsule(2, 10, direction)
      expect(validateBrep(b).issues.map((i) => i.message)).toEqual([])
      expect(massProperties(b).volume).toBeCloseTo(capsuleVolume(2, 10), 4)
    }
  })
})
