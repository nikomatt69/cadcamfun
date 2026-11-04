import { describe, expect, test } from "bun:test"
import { assemblyVolume } from "../kernel/assembly.ts"
import { ballProfile, barrelProfile, contains, lollipopProfile, profileVolume, radiusAt, sweptProfile, taperedBallProfile, toAssemblyProfile } from "./swept-profile.ts"

describe("swept profile", () => {
  test("a ball end matches the analytic volume of a hemisphere plus cylinder", () => {
    const p = ballProfile(10, 20, 96)
    const expected = (2 / 3) * Math.PI * 125 + Math.PI * 25 * 15
    expect(Math.abs(profileVolume(p) - expected) / expected).toBeLessThan(2e-3)
    expect(radiusAt(p, 5)).toBeCloseTo(5, 6)
    expect(radiusAt(p, 0)).toBeCloseTo(0, 9)
    expect(radiusAt(p, 25)).toBe(0)
    expect(assemblyVolume(toAssemblyProfile(p))).toBeCloseTo(profileVolume(p), 9)
  })
  test("a barrel bulges to its diameter at mid height and is narrower at the ends", () => {
    const p = barrelProfile(12, 10, 40)
    expect(p.maxRadius).toBeCloseTo(6, 9)
    expect(radiusAt(p, 5)).toBeCloseTo(6, 3)
    expect(radiusAt(p, 0.01)).toBeLessThan(radiusAt(p, 5))
    expect(contains(p, 5.9, 5)).toBe(true)
    expect(contains(p, 6.2, 5)).toBe(false)
  })
  test("a lollipop is a ball on a thinner neck", () => {
    const p = lollipopProfile(10, 4, 20)
    expect(p.maxRadius).toBeCloseTo(5, 9)
    expect(radiusAt(p, p.height - 1)).toBeCloseTo(2, 9)
    expect(radiusAt(p, 5)).toBeCloseTo(5, 3)
    expect(() => lollipopProfile(10, 12, 5)).toThrow()
  })
  test("a tapered ball end reaches its diameter at the end of the cone", () => {
    const p = taperedBallProfile(4, 5, 12, 60)
    expect(p.maxRadius).toBeCloseTo(6, 9)
    expect(radiusAt(p, 60)).toBeCloseTo(6, 9)
    expect(radiusAt(p, 10)).toBeLessThan(6)
    expect(() => taperedBallProfile(4, 5, 12, 10)).toThrow(/above the stated height/)
  })
  test("bad profiles are refused with the reason", () => {
    expect(() => sweptProfile([{ r: 1, z: 0 }])).toThrow(/two points/)
    expect(() => sweptProfile([{ r: 1, z: 1 }, { r: 1, z: 2 }])).toThrow(/tip/)
    expect(() => sweptProfile([{ r: 0, z: 0 }, { r: 2, z: 3 }, { r: 2, z: 2 }])).toThrow(/go[es]* back down/)
    expect(() => sweptProfile([{ r: 0, z: 0 }, { r: -1, z: 1 }])).toThrow(/negative/)
  })
})
