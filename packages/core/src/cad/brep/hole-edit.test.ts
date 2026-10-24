import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep } from "./boolean.ts"
import { recognizeHoles } from "./features.ts"
import { editHole } from "./hole-edit.ts"
import { frame } from "./math.ts"
import { massProperties } from "./mass.ts"
import { makeBox, makeCylinder } from "./primitives.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(100_000)

const Z = { x: 0, y: 0, z: 1 }
const cut = (a: Brep, b: Brep): Brep => booleanBrep(a, b, "subtract").brep
const PLATE = 40 * 30 * 20
const disc = (d: number, h: number) => Math.PI * (d / 2) ** 2 * h

/** A 40 x 30 x 20 block. */
const block = () => makeBox(40, 30, 20)
const through = () => cut(block(), makeCylinder(3, 22, frame({ x: 20, y: 15, z: -1 }, Z))) // Ø6 through
const blind = () => cut(block(), makeCylinder(3, 12, frame({ x: 20, y: 15, z: 8 }, Z))) // Ø6, 12 deep from the top, flat bottom
const counterbored = () => cut(through(), makeCylinder(5, 7, frame({ x: 20, y: 15, z: 13 }, Z))) // Ø10 x 7 counterbore

const only = (b: Brep) => {
  const holes = recognizeHoles(b)
  expect(holes).toHaveLength(1)
  return holes[0]!
}
const ok = (r: ReturnType<typeof editHole>) => {
  if (typeof r === "string") throw new Error(r)
  return r
}

describe("editing a recognised hole", () => {
  test("a through hole grows: the volume is the block minus the new cylinder, and the hole is recognised at the new size", () => {
    const b = through()
    const r = ok(editHole(b, only(b), { kind: "resize", diameter: 10 }))
    expect(massProperties(r.brep).volume).toBeCloseTo(PLATE - disc(10, 20), 4)
    expect(r.volumeChange).toBeCloseTo(-(disc(10, 20) - disc(6, 20)), 4)
    expect(validateBrep(r.brep).valid).toBe(true)
    const again = only(r.brep)
    expect(again.diameter).toBeCloseTo(10, 6)
    expect(again.depth).toBeCloseTo(20, 6)
    expect(again.bottom).toBe("through")
  })

  test("a through hole shrinks: filled with its own wall and cut again", () => {
    const b = through()
    const r = ok(editHole(b, only(b), { kind: "resize", diameter: 4 }))
    expect(massProperties(r.brep).volume).toBeCloseTo(PLATE - disc(4, 20), 4)
    expect(only(r.brep).diameter).toBeCloseTo(4, 6)
  })

  test("a blind hole keeps its depth and its flat bottom when it is resized", () => {
    const b = blind()
    const grown = ok(editHole(b, only(b), { kind: "resize", diameter: 8 }))
    expect(massProperties(grown.brep).volume).toBeCloseTo(PLATE - disc(8, 12), 4)
    const h = only(grown.brep)
    expect([h.diameter, h.depth, h.bottom]).toEqual([expect.closeTo(8, 6), expect.closeTo(12, 6), "flat"])
    const shrunk = ok(editHole(b, only(b), { kind: "resize", diameter: 3 }))
    expect(massProperties(shrunk.brep).volume).toBeCloseTo(PLATE - disc(3, 12), 4)
  })

  test("a counterbore stays as it is: only the drill changes", () => {
    const b = counterbored()
    const r = ok(editHole(b, only(b), { kind: "resize", diameter: 8 }))
    const h = only(r.brep)
    expect(h.form).toBe("counterbore")
    expect(h.diameter).toBeCloseTo(8, 6)
    expect(h.headDiameter).toBeCloseTo(10, 6)
    expect(h.headDepth).toBeCloseTo(7, 6)
    expect(massProperties(r.brep).volume).toBeCloseTo(PLATE - disc(10, 7) - disc(8, 13), 4)
  })

  test("a hole is filled back to the solid block", () => {
    const b = blind()
    const r = ok(editHole(b, only(b), { kind: "fill" }))
    expect(massProperties(r.brep).volume).toBeCloseTo(PLATE, 4)
    expect(recognizeHoles(r.brep)).toHaveLength(0)
    expect(r.volumeChange).toBeCloseTo(disc(6, 12), 4)
  })

  test("what cannot be done exactly is refused with the reason", () => {
    const b = counterbored()
    expect(editHole(b, only(b), { kind: "resize", diameter: 10 })).toMatch(/break into the counterbore/)
    expect(editHole(b, only(b), { kind: "resize", diameter: -1 })).toMatch(/positive/)
    const pointed = cut(block(), makeCylinder(3, 12, frame({ x: 20, y: 15, z: 8 }, Z)))
    expect(typeof editHole(pointed, only(pointed), { kind: "resize", diameter: 4 })).not.toBe("string")
  })
})
