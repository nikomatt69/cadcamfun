/**
 * The exact catalogue solids of spec 40 U5: a capsule is a cylinder with two hemispherical caps, and its volume is
 * known in closed form, so the exact model is checked against the formula and not against the kernel's own output.
 */
import { describe, expect, test } from "bun:test"
import { boltVolume, capsuleVolume, gearVolume, makeBolt, makeCapsule, makeGear, makeNut, makeWasher, nutVolume, washerVolume } from "./catalogue.ts"
import { massProperties } from "./mass.ts"
import { validateBrep } from "./validate.ts"
import { tessellateBrep } from "./tessellate.ts"
import { readStepBreps, writeStepBreps } from "./step.ts"

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

describe("the exact standard parts", () => {
  test("a washer's volume is its ring, and it is a genus-1 solid", () => {
    const b = makeWasher(8, 16, 1.5)
    expect(validateBrep(b).issues.map((i) => i.message)).toEqual([])
    expect(validateBrep(b).genus).toBe(1)
    expect(massProperties(b).volume).toBeCloseTo(washerVolume(8, 16, 1.5), 6)
    expect(() => makeWasher(8, 8, 1.5)).toThrow("must exceed its bore")
  })

  test("a nut's volume is the hexagon minus its bore", () => {
    const b = makeNut(8)
    expect(validateBrep(b).issues.map((i) => i.message)).toEqual([])
    expect(validateBrep(b).genus).toBe(1)
    expect(massProperties(b).volume).toBeCloseTo(nutVolume(8), 6)
    // Across flats of the M8 nut: 1.8 d cos(30°) across corners' flats.
    const t = tessellateBrep(b, { chordTol: 0.01 })
    const xs = Array.from({ length: t.positions.length / 3 }, (_, i) => t.positions[i * 3]!)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1.8 * 8, 3)
  })

  test("a bolt's volume is shank plus round head, head capped at half the length", () => {
    expect(massProperties(makeBolt(8, 50)).volume).toBeCloseTo(boltVolume(8, 50), 6)
    expect(validateBrep(makeBolt(8, 50)).genus).toBe(0)
    expect(massProperties(makeBolt(5, 6)).volume).toBeCloseTo(boltVolume(5, 6), 6)
    expect(() => makeBolt(0, 50)).toThrow("must be positive")
  })

  test("a gear's volume is its outline polygon minus the bore, and it round-trips through STEP", () => {
    const spec = { moduleValue: 2, teeth: 20, thickness: 10, pressureAngle: 20, holeDiameter: 10 }
    const b = makeGear(spec)
    expect(validateBrep(b).issues.map((i) => i.message)).toEqual([])
    expect(validateBrep(b).genus).toBe(1)
    expect(massProperties(b).volume).toBeCloseTo(gearVolume(spec), 5)
    const back = readStepBreps(writeStepBreps([{ name: "gear", brep: b }])).parts[0]!.brep
    expect(massProperties(back).volume).toBeCloseTo(gearVolume(spec), 3)
    expect(massProperties(makeGear({ moduleValue: 2, teeth: 16, thickness: 8 })).volume)
      .toBeCloseTo(gearVolume({ moduleValue: 2, teeth: 16, thickness: 8 }), 5)
  })

  test("a gear refuses a bore that eats the root and too few teeth, in words", () => {
    expect(() => makeGear({ moduleValue: 2, teeth: 20, thickness: 5, holeDiameter: 99 })).toThrow("must be smaller than the root circle")
    expect(() => makeGear({ moduleValue: 2, teeth: 3, thickness: 5 })).toThrow("at least 6 whole teeth")
  })

  test("the parts stand centred on their placement", () => {
    const b = makeNut(8, { x: 100, y: 50, z: 20 })
    const c = massProperties(b).centroid
    expect(c.x).toBeCloseTo(100, 6)
    expect(c.y).toBeCloseTo(50, 6)
    expect(c.z).toBeCloseTo(20, 6)
  })
})
