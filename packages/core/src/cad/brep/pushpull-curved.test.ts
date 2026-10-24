import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep } from "./boolean.ts"
import { nearestFace, pushPullFace } from "./face-edit.ts"
import { frame } from "./math.ts"
import { massProperties } from "./mass.ts"
import { makeBox, makeCone, makeCylinder, makeSphere, makeTorus } from "./primitives.ts"
import { pushPullCylinder } from "./pushpull-curved.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(100_000)
const Z = { x: 0, y: 0, z: 1 }
const sub = (a: Brep, b: Brep): Brep => booleanBrep(a, b, "subtract").brep
const uni = (a: Brep, b: Brep): Brep => booleanBrep(a, b, "union").brep
const volume = (b: Brep) => massProperties(b).volume
const disc = (d: number, h: number) => Math.PI * (d / 2) ** 2 * h
const PLATE = 40 * 30 * 10
const ok = (r: Brep | string): Brep => { if (typeof r === "string") throw new Error(r); return r }
const holed = () => sub(makeBox(40, 30, 10), makeCylinder(4, 14, frame({ x: 20, y: 15, z: -2 }, Z)))
const bossed = () => uni(makeBox(40, 30, 10), makeCylinder(4, 8, frame({ x: 20, y: 15, z: 10 }, Z)))

describe("push/pull of a cylindrical wall", () => {
  test("the side of a boss moves out by the distance: the radius grows by it", () => {
    const r = ok(pushPullFace(bossed(), { near: { x: 24, y: 15, z: 14 }, distance: 1.5 }))
    expect(validateBrep(r).valid).toBe(true)
    expect(volume(r)).toBeCloseTo(PLATE + disc(8 + 3, 8), 4)
  })

  test("pulled in it shrinks, and a pull that would remove the boss is refused", () => {
    expect(volume(ok(pushPullFace(bossed(), { near: { x: 24, y: 15, z: 14 }, distance: -1 })))).toBeCloseTo(PLATE + disc(8 - 2, 8), 4)
    expect(pushPullFace(bossed(), { near: { x: 24, y: 15, z: 14 }, distance: -4 })).toMatch(/no boss/)
  })

  test("the wall of a hole pushed out of the solid (into the bore) shrinks the hole; pulled into the solid, it grows", () => {
    expect(volume(ok(pushPullFace(holed(), { near: { x: 24, y: 15, z: 5 }, distance: 1 })))).toBeCloseTo(PLATE - disc(8 - 2, 10), 4)
    expect(volume(ok(pushPullFace(holed(), { near: { x: 24, y: 15, z: 5 }, distance: -2 })))).toBeCloseTo(PLATE - disc(8 + 4, 10), 4)
    expect(pushPullFace(holed(), { near: { x: 24, y: 15, z: 5 }, distance: 4 })).toMatch(/fill the hole/)
  })

  test("a named face is pushed as well as the nearest one", () => {
    const b = bossed()
    const near = { x: 24, y: 15, z: 14 }
    const found = nearestFace(b, { near })
    expect(found && !("pick" in found)).toBe(true)
    const wall = b.faces.findIndex((f) => f.surface.kind === "cylinder")
    expect(volume(ok(pushPullFace(b, { near: { x: 0, y: 0, z: 0 }, distance: 1.5, face: wall })))).toBeCloseTo(PLATE + disc(11, 8), 4)
  })

  test("a ball and a ring alone are the same surface with the radius moved by the distance", () => {
    const ball = ok(pushPullCylinder(makeSphere(5), 0, 1.5))
    expect(volume(ball)).toBeCloseTo((4 / 3) * Math.PI * 6.5 ** 3, 3)
    expect(validateBrep(ball).valid).toBe(true)
    expect(pushPullCylinder(makeSphere(5), 0, -5)).toMatch(/leaves nothing/)
    const ring = ok(pushPullCylinder(makeTorus(10, 2), 0, 1))
    expect(volume(ring)).toBeCloseTo(2 * Math.PI ** 2 * 10 * 3 ** 2, 3)
    expect(pushPullCylinder(makeTorus(10, 2), 0, 8)).toMatch(/major radius/)
  })

  test("the counterbore wall, a countersink and a sphere are refused with the reason", () => {
    const cb = sub(holed(), makeCylinder(6, 4, frame({ x: 20, y: 15, z: 6 }, Z)))
    expect(pushPullFace(cb, { near: { x: 26, y: 15, z: 8 }, distance: 1 })).toMatch(/only the drill/)
    const sink = sub(makeBox(40, 30, 10), makeCone(2, 6, 4, frame({ x: 20, y: 15, z: 6 }, Z)))
    const sinkFace = sink.faces.findIndex((f) => f.surface.kind === "cone")
    expect(pushPullCylinder(sink, sinkFace, 1)).toMatch(/not the side of a boss/)
    const domed = uni(makeBox(40, 30, 10), makeSphere(5, frame({ x: 20, y: 15, z: 10 }, Z)))
    expect(pushPullCylinder(domed, domed.faces.findIndex((f) => f.surface.kind === "sphere"), 1)).toMatch(/no straight wall ends there/)
  })
})
