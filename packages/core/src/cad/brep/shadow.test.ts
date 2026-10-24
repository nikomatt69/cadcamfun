import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep } from "./boolean.ts"
import { frame } from "./math.ts"
import { massProperties } from "./mass.ts"
import { makeBox, makeCone, makeCylinder, makeSphere } from "./primitives.ts"
import { shadowSolid } from "./shadow.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(100_000)
const Z = { x: 0, y: 0, z: 1 }, X = { x: 1, y: 0, z: 0 }
const sub = (a: Brep, b: Brep): Brep => booleanBrep(a, b, "subtract").brep
const uni = (a: Brep, b: Brep): Brep => booleanBrep(a, b, "union").brep
const volume = (b: Brep) => massProperties(b).volume
const disc = (d: number, h: number) => Math.PI * (d / 2) ** 2 * h
const ok = (r: ReturnType<typeof shadowSolid>) => { if (typeof r === "string") throw new Error(r); return r }

describe("the shadow of a solid from above", () => {
  test("a part with nothing hidden is its own shadow: plate, pocket with an island, a boss, a blind hole", () => {
    let p = makeBox(100, 60, 10)
    p = sub(p, makeBox(60, 40, 6, frame({ x: 20, y: 10, z: 4 }, Z)))        // pocket 6 deep
    p = uni(p, makeBox(20, 20, 6, frame({ x: 40, y: 20, z: 4 }, Z)))        // island on its floor
    p = uni(p, makeCylinder(4, 8, frame({ x: 90, y: 50, z: 10 }, Z)))       // boss on the plate
    p = sub(p, makeCylinder(3, 8, frame({ x: 10, y: 30, z: 4 }, Z)))        // blind hole 6 deep
    const sh = ok(shadowSolid(p))
    expect(volume(sh.brep)).toBeCloseTo(volume(p), 4)
    expect(validateBrep(sh.brep).valid).toBe(true)
  })

  test("a cavity under a roof is filled: the shadow is the whole block", () => {
    const hollow = sub(makeBox(40, 40, 40), makeBox(10, 10, 10, frame({ x: 15, y: 15, z: 15 }, Z)))
    expect(volume(hollow)).toBeCloseTo(40 ** 3 - 1000, 4)
    expect(volume(ok(shadowSolid(hollow)).brep)).toBeCloseTo(40 ** 3, 4)
  })

  test("a sideways pocket and a sideways hole disappear from the shadow, a hole from above stays", () => {
    let p = makeBox(100, 60, 20)
    p = sub(p, makeBox(30, 12, 8, frame({ x: 70, y: 24, z: 6 }, Z)))                  // slot cut in from the +X face, under a roof
    p = sub(p, makeCylinder(2.5, 14, frame({ x: 90, y: 10, z: 10 }, X)))             // a side hole
    p = sub(p, makeCylinder(3, 12, frame({ x: 20, y: 30, z: 8 }, Z)))                // a hole from the top, 12 deep
    const sh = ok(shadowSolid(p))
    expect(volume(sh.brep)).toBeCloseTo(100 * 60 * 20 - disc(6, 12), 4)
    expect(sh.hidden).toBeGreaterThan(0)
  })

  test("a through hole stays through: nothing above it, so nothing is filled", () => {
    const p = sub(makeBox(40, 30, 10), makeCylinder(5, 14, frame({ x: 20, y: 15, z: -2 }, Z)))
    expect(volume(ok(shadowSolid(p)).brep)).toBeCloseTo(40 * 30 * 10 - disc(10, 10), 4)
  })

  test("what could be seen from above and is not a prism is refused with its reason", () => {
    expect(shadowSolid(makeCone(10, 4, 20))).toMatch(/cone face that can be seen from above/)
    // A horizontal bore open to the top is seen, a prism it is not.
    const opened = sub(makeBox(40, 30, 20), makeCylinder(6, 50, frame({ x: 20, y: -5, z: 20 }, { x: 0, y: 1, z: 0 })))
    expect(shadowSolid(opened)).toMatch(/cylinder across Z that can be seen from above/)
    // A tapered hole that widens upwards is open to the top: its wall is seen. One that narrows towards the opening is an undercut and is filled.
    const open = sub(makeBox(40, 30, 10), makeCone(2, 8, 6, frame({ x: 20, y: 15, z: 4 }, Z)))
    expect(shadowSolid(open)).toMatch(/cone face that can be seen from above/)
    const bulb = sub(makeBox(40, 30, 10), makeCone(8, 2, 6, frame({ x: 20, y: 15, z: 4 }, Z)))
    expect(typeof shadowSolid(bulb)).toBe("object")
  })

  test("a round bar lying on the block: the columns under its upper arc are filled, the hidden cavity too (closed form)", () => {
    // A bar of radius 4 along X, 30 long, its axis 3 mm above the block's top (so it is sunk 1 mm and its face goes below the axis).
    const block = sub(makeBox(40, 40, 20), makeBox(10, 10, 6, frame({ x: 15, y: 15, z: 8 }, Z)))
    const part = uni(block, makeCylinder(4, 30, frame({ x: 5, y: 20, z: 23 }, X)))
    const sh = ok(shadowSolid(part))
    // Under the arc and above the block's top: the upper half disc plus the 3 mm strip between the top and the axis, 8 mm wide.
    expect(volume(sh.brep)).toBeCloseTo(40 * 40 * 20 + (Math.PI * 16 / 2 + 8 * 3) * 30, 3)
    expect(validateBrep(sh.brep).valid).toBe(true)
    expect(sh.hidden).toBeGreaterThan(0)
  })

  test("a dome on a pin: the column under the rim and the cap over it, revolved", () => {
    const Q = Math.sqrt(64 - 25), centre = { x: 20, y: 15, z: 16 - Q }
    const head = booleanBrep(makeSphere(8, frame(centre, Z)), makeCylinder(5, 14, frame({ x: 20, y: 15, z: 10 }, Z)), "intersect").brep
    const part = uni(sub(makeBox(40, 30, 10), makeBox(8, 8, 4, frame({ x: 5, y: 5, z: 3 }, Z))), head)
    const sh = ok(shadowSolid(part))
    const h = 8 - Q
    expect(volume(sh.brep)).toBeCloseTo(40 * 30 * 10 + Math.PI * 25 * 6 + (Math.PI * h * h * (3 * 8 - h)) / 3, 3)
    expect(validateBrep(sh.brep).valid).toBe(true)
  })
})
