import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep } from "./boolean.ts"
import { recognizeConeBosses } from "./boss-edit.ts"
import { draftCone, pushPullCone } from "./cone-edit.ts"
import { draftCurvedFace } from "./draft-curved.ts"
import { massProperties } from "./mass.ts"
import { frame } from "./math.ts"
import { makeBox, makeCone, makeCylinder } from "./primitives.ts"
import { pushPullFace } from "./face-edit.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(100_000)
const Z = { x: 0, y: 0, z: 1 }
const frustum = (r1: number, r2: number, h: number) => (Math.PI * h * (r1 * r1 + r1 * r2 + r2 * r2)) / 3
const PLATE = 40 * 30 * 10
/** A 40 x 30 x 10 plate with a tapered boss standing on it: radius 6 at the plate, 4 at its free end, 12 high. */
const pinned = () => booleanBrep(makeBox(40, 30, 10), makeCone(6, 4, 12, frame({ x: 20, y: 15, z: 10 }, Z)), "union").brep
const ok = (r: Brep | string): Brep => { if (typeof r === "string") throw new Error(r); return r }
const only = (b: Brep) => { const c = recognizeConeBosses(b); expect(c).toHaveLength(1); return c[0]! }

describe("the tapered boss", () => {
  test("is recognised: radius at the start, slope, length, free end", () => {
    const boss = only(pinned())
    expect(boss.diameter).toBeCloseTo(12, 6)
    expect(boss.slope).toBeCloseTo(-2 / 12, 9)
    expect(boss.length).toBeCloseTo(12, 6)
    expect(boss.free).toBe("far")
  })

  test("push/pull out grows both radii by d / cos(semi-angle); the volume is the plate plus the offset frustum", () => {
    const b = pinned()
    const cos = 1 / Math.sqrt(1 + (2 / 12) ** 2)
    for (const d of [1, 2.5, -1]) {
      const r = ok(pushPullCone(b, only(b).face, d))
      expect(validateBrep(r).valid).toBe(true)
      expect(massProperties(r).volume).toBeCloseTo(PLATE + frustum(6 + d / cos, 4 + d / cos, 12), 3)
      const boss = only(r)
      expect(boss.diameter).toBeCloseTo(2 * (6 + d / cos), 5)
      expect(boss.slope).toBeCloseTo(-2 / 12, 6) // the taper stays
    }
  })

  test("pulling it in past its narrow end is refused with the reason, not approximated", () => {
    const b = pinned()
    expect(pushPullCone(b, only(b).face, -4.5)).toMatch(/pointed|inside out/)
  })

  test("the face-edit push/pull of the named cone face is the same exact edit", () => {
    const b = pinned()
    const r = ok(pushPullFace(b, { near: { x: 26, y: 15, z: 16 }, face: only(b).face, distance: 1 }))
    expect(massProperties(r).volume).toBeCloseTo(massProperties(ok(pushPullCone(b, only(b).face, 1))).volume, 6)
  })

  test("a cone alone is the whole solid: the edit returns the new frustum", () => {
    const cone = makeCone(6, 4, 12)
    const r = ok(pushPullCone(cone, only(cone).face, 1))
    const cos = 1 / Math.sqrt(1 + (2 / 12) ** 2)
    expect(massProperties(r).volume).toBeCloseTo(frustum(6 + 1 / cos, 4 + 1 / cos, 12), 3)
  })
})

describe("the catalogue's pointed cone", () => {
  test("push/pull of its side is the same cone, bigger: base radius + d / cos, apex on the axis", () => {
    const cone = makeCone(6, 0, 12)
    const side = cone.faces.findIndex((f) => f.surface.kind === "cone")
    const cos = 1 / Math.sqrt(1 + (6 / 12) ** 2)
    for (const d of [1, -2]) {
      const r = ok(pushPullCone(cone, side, d))
      const rBase = 6 + d / cos
      expect(validateBrep(r).valid).toBe(true)
      expect(massProperties(r).volume).toBeCloseTo((Math.PI * rBase * rBase * (12 * rBase / 6)) / 3, 3)
    }
    expect(pushPullCone(cone, side, -7)).toMatch(/leaves nothing/)
  })
})

describe("drafting a tapered boss", () => {
  const draft = (b: Brep, angle: number, neutral = 10) => draftCone(b, { near: { x: 26, y: 15, z: 16 }, pull: Z, neutral, angle })

  test("turns the wall about the neutral circle to the draft angle", () => {
    const b = pinned()
    const tan = Math.tan((5 * Math.PI) / 180)
    const r = ok(draft(b, 5))
    // Neutral at the plate (t = 0): radius 6 stays, then r(t) = 6 - t tan(5 deg).
    expect(massProperties(r).volume).toBeCloseTo(PLATE + frustum(6, 6 - 12 * tan, 12), 3)
    expect(only(r).slope).toBeCloseTo(-tan, 6)
    expect(validateBrep(r).valid).toBe(true)
  })

  test("a neutral plane in the middle keeps that radius", () => {
    const b = pinned()
    const tan = Math.tan((3 * Math.PI) / 180)
    const r = ok(draft(b, 3, 16))
    // The radius at the middle (t = 6) is 5 before and after.
    expect(only(r).diameter / 2 + only(r).slope * 6).toBeCloseTo(5, 5)
    expect(only(r).slope).toBeCloseTo(-tan, 6)
  })

  test("a cylinder drafted and a cone drafted to the same angle about the same circle agree", () => {
    const tan = Math.tan((4 * Math.PI) / 180)
    const cyl = booleanBrep(makeBox(40, 30, 10), makeCylinder(5, 12, frame({ x: 20, y: 15, z: 10 }, Z)), "union").brep
    const a = ok(draftCurvedFace(cyl, { near: { x: 25, y: 15, z: 16 }, pull: Z, neutral: 10, angle: 4 }))
    const cone = booleanBrep(makeBox(40, 30, 10), makeCone(5, 4, 12, frame({ x: 20, y: 15, z: 10 }, Z)), "union").brep
    const c = ok(draftCurvedFace(cone, { near: { x: 24.6, y: 15, z: 16 }, pull: Z, neutral: 10, angle: 4 }))
    expect(massProperties(c).volume).toBeCloseTo(massProperties(a).volume, 3)
    expect(massProperties(a).volume).toBeCloseTo(PLATE + frustum(5, 5 - 12 * tan, 12), 3)
  })

  test("a draft that would widen the boss towards its free end is an undercut", () => {
    expect(draft(pinned(), -5)).toMatch(/undercut/)
  })
})
