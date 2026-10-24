import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep } from "./boolean.ts"
import { recognizeBosses, resizeBoss } from "./boss-edit.ts"
import { frame } from "./math.ts"
import { massProperties } from "./mass.ts"
import { makeBox, makeCylinder } from "./primitives.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(100_000)
const Z = { x: 0, y: 0, z: 1 }
const union = (a: Brep, b: Brep): Brep => booleanBrep(a, b, "union").brep
const disc = (d: number, h: number) => Math.PI * (d / 2) ** 2 * h
const PLATE = 40 * 30 * 10

/** A 40 x 30 x 10 plate with a Ø10 boss 12 high standing on it. */
const bossed = () => union(makeBox(40, 30, 10), makeCylinder(5, 12, frame({ x: 20, y: 15, z: 10 }, Z)))
const only = (b: Brep) => {
  const bosses = recognizeBosses(b)
  expect(bosses).toHaveLength(1)
  return bosses[0]!
}
const ok = (r: ReturnType<typeof resizeBoss>) => { if (typeof r === "string") throw new Error(r); return r }

describe("editing a recognised boss", () => {
  test("the boss is recognised from its face: diameter, length, free end", () => {
    const boss = only(bossed())
    expect(boss.diameter).toBeCloseTo(10, 6)
    expect(boss.length).toBeCloseTo(12, 6)
    expect(boss.free).toBe("far")
    expect(boss.origin.z).toBeCloseTo(10, 6)
  })

  test("a boss grows: the volume is the plate plus the new cylinder", () => {
    const b = bossed()
    const r = ok(resizeBoss(b, only(b), 16))
    expect(massProperties(r.brep).volume).toBeCloseTo(PLATE + disc(16, 12), 4)
    expect(validateBrep(r.brep).valid).toBe(true)
    expect(only(r.brep).diameter).toBeCloseTo(16, 6)
  })

  test("a boss shrinks: the tube is cut away and the plate below it is untouched", () => {
    const b = bossed()
    const r = ok(resizeBoss(b, only(b), 6))
    expect(massProperties(r.brep).volume).toBeCloseTo(PLATE + disc(6, 12), 4)
    expect(r.volumeChange).toBeCloseTo(-(disc(10, 12) - disc(6, 12)), 4)
    expect(only(r.brep).diameter).toBeCloseTo(6, 6)
  })

  test("a shaft section between two shoulders (no free end) is resized exactly", () => {
    // Ø20 x 10, Ø10 x 15, Ø20 x 10 stacked on one axis: the middle section has material at both ends.
    const stack = [20, 10, 20].reduce<{ solid: Brep | undefined; z: number }>((acc, d, i) => {
      const h = [10, 15, 10][i]!
      const c = makeCylinder(d / 2, h, frame({ x: 0, y: 0, z: acc.z }, Z))
      return { solid: acc.solid === undefined ? c : union(acc.solid, c), z: acc.z + h }
    }, { solid: undefined, z: 0 }).solid!
    const middle = recognizeBosses(stack).find((x) => Math.abs(x.diameter - 10) < 1e-6)!
    expect(middle.free).toBe("none")
    const r = ok(resizeBoss(stack, middle, 7))
    expect(massProperties(r.brep).volume).toBeCloseTo(disc(20, 10) * 2 + disc(7, 15), 4)
  })

  test("what runs into a neighbour is refused, and a no-op returns the same solid", () => {
    const b = bossed()
    // A disc that overhangs the plate is a valid growth; one that grows into a wall standing beside the boss is not.
    const walled = union(b, makeBox(12, 30, 12, frame({ x: 28, y: 0, z: 10 }, Z)))
    const boss = recognizeBosses(walled).find((x) => Math.abs(x.diameter - 10) < 1e-6)!
    expect(resizeBoss(walled, boss, 24)).toMatch(/neighbouring feature/)
    expect(resizeBoss(b, only(b), -2)).toMatch(/positive/)
    const same = ok(resizeBoss(b, only(b), 10))
    expect(same.brep).toBe(b)
    expect(same.volumeChange).toBe(0)
  })

  test("a hole is not a boss", () => {
    const holed = booleanBrep(makeBox(40, 30, 10), makeCylinder(3, 12, frame({ x: 20, y: 15, z: -1 }, Z)), "subtract").brep
    expect(recognizeBosses(holed)).toHaveLength(0)
  })
})
