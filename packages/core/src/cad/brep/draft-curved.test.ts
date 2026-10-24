import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep } from "./boolean.ts"
import { draftCurvedFace } from "./draft-curved.ts"
import { frame } from "./math.ts"
import { massProperties } from "./mass.ts"
import { makeBox, makeCylinder, makeSphere } from "./primitives.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(100_000)
const Z = { x: 0, y: 0, z: 1 }
const sub = (a: Brep, b: Brep): Brep => booleanBrep(a, b, "subtract").brep
const uni = (a: Brep, b: Brep): Brep => booleanBrep(a, b, "union").brep
const volume = (b: Brep) => massProperties(b).volume
const frustum = (r1: number, r2: number, h: number) => (Math.PI * h * (r1 * r1 + r1 * r2 + r2 * r2)) / 3
const tan = (deg: number) => Math.tan((deg * Math.PI) / 180)
const PLATE = 40 * 30 * 10
const ok = (r: Brep | string): Brep => { if (typeof r === "string") throw new Error(r); return r }
const draft = (b: Brep, near: { x: number; y: number; z: number }, angle: number, neutral: number, pull = Z) => draftCurvedFace(b, { near, pull, neutral, angle })

/** A 40 x 30 x 10 plate with a Ø8 hole through the top face, 10 deep (through). */
const holed = () => sub(makeBox(40, 30, 10), makeCylinder(4, 14, frame({ x: 20, y: 15, z: -2 }, Z)))
/** The same plate with a Ø8 boss 8 high standing on top. */
const bossed = () => uni(makeBox(40, 30, 10), makeCylinder(4, 8, frame({ x: 20, y: 15, z: 10 }, Z)))

describe("the draft of a hole wall", () => {
  test("pulled out of the opening, a neutral plane at the top keeps the opening and narrows the hole towards the bottom", () => {
    const r = ok(draft(holed(), { x: 24, y: 15, z: 5 }, 2, 10))
    expect(validateBrep(r).valid).toBe(true)
    expect(volume(r)).toBeCloseTo(PLATE - frustum(4, 4 - 10 * tan(2), 10), 4)
  })

  test("a neutral plane at the bottom keeps the bottom: the opening is wider by h tan(angle)", () => {
    const r = ok(draft(holed(), { x: 24, y: 15, z: 5 }, 2, 0))
    // r(h) = 4 + h tan: 4 at the bottom, 4 + 10 tan at the top; the bore is that frustum turned the other way up.
    expect(volume(r)).toBeCloseTo(PLATE - frustum(4 + 10 * tan(2), 4, 10), 4)
  })

  test("a draft that would widen the hole towards its bottom is an undercut and is refused", () => {
    expect(draft(holed(), { x: 24, y: 15, z: 5 }, -2, 10)).toMatch(/undercut/)
  })

  test("the counterbore wall of a hole is not drafted: only its drill", () => {
    const cb = sub(holed(), makeCylinder(6, 4, frame({ x: 20, y: 15, z: 6 }, Z)))
    expect(draft(cb, { x: 26, y: 15, z: 8 }, 2, 10)).toMatch(/only the drill/)
    expect(validateBrep(ok(draft(cb, { x: 24, y: 15, z: 3 }, 2, 10))).valid).toBe(true)
  })
})

describe("the draft of a boss side", () => {
  test("a boss on the plate narrows towards its free end from the neutral plane at its base", () => {
    const r = ok(draft(bossed(), { x: 24, y: 15, z: 14 }, 4, 10))
    expect(validateBrep(r).valid).toBe(true)
    expect(volume(r)).toBeCloseTo(PLATE + frustum(4, 4 - 8 * tan(4), 8), 4)
  })

  test("a neutral plane above the base makes the base wider than the nominal, and below it narrower", () => {
    const above = ok(draft(bossed(), { x: 24, y: 15, z: 14 }, 4, 14))
    expect(volume(above)).toBeCloseTo(PLATE + frustum(4 + 4 * tan(4), 4 - 4 * tan(4), 8), 4)
  })

  test("a draft that widens the boss towards its free end is an undercut and is refused", () => {
    expect(draft(bossed(), { x: 24, y: 15, z: 14 }, -4, 10)).toMatch(/widen the boss/)
  })

  test("a cylinder alone is its own cone", () => {
    const r = ok(draft(makeCylinder(5, 15), { x: 5, y: 0, z: 7 }, 3, 0))
    expect(volume(r)).toBeCloseTo(frustum(5, 5 - 15 * tan(3), 15), 4)
  })

  test("pulled the other way, the same boss narrows downwards when it hangs under the plate", () => {
    const hanging = uni(makeBox(40, 30, 10), makeCylinder(4, 8, frame({ x: 20, y: 15, z: -8 }, Z)))
    // Pulled down (the free end is the pull's end): narrower towards -Z.
    const r = ok(draft(hanging, { x: 24, y: 15, z: -4 }, 4, 0, { x: 0, y: 0, z: -1 }))
    expect(volume(r)).toBeCloseTo(PLATE + frustum(4, 4 - 8 * tan(4), 8), 4)
  })
})

describe("what is not drafted", () => {
  test("a sphere, and a cylinder that is not along the pull, have no exact draft yet", () => {
    expect(draft(makeSphere(10), { x: 10, y: 0, z: 0 }, 3, 0)).toMatch(/sphere face/)
    expect(draft(makeCylinder(5, 15), { x: 5, y: 0, z: 7 }, 3, 0, { x: 1, y: 0, z: 0 })).toMatch(/not along the pull/)
  })

  test("a zero angle leaves the solid as it is, a draft that closes the feature is refused", () => {
    const b = holed()
    expect(draft(b, { x: 24, y: 15, z: 5 }, 0, 10)).toBe(b)
    expect(draft(holed(), { x: 24, y: 15, z: 5 }, 30, 10)).toMatch(/closes the bore|negative/)
  })
})
