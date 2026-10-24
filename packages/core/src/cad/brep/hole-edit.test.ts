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

const frustum = (r1: number, r2: number, h: number) => (Math.PI * h * (r1 * r1 + r1 * r2 + r2 * r2)) / 3

describe("drafting the wall of a bore", () => {
  const tan = (deg: number) => Math.tan((deg * Math.PI) / 180)

  test("a through hole gets a 2 degree draft: the bore is the exact frustum", () => {
    const b = through()
    const r = ok(editHole(b, only(b), { kind: "resize", diameter: 8, taper: 2 }))
    const bottom = 4 - 20 * tan(2)
    expect(massProperties(r.brep).volume).toBeCloseTo(PLATE - frustum(4, bottom, 20), 4)
    expect(validateBrep(r.brep).valid).toBe(true)
    // The kernel reads the drafted wall as a cone, not a drill: the cylinder recogniser sees no hole any more.
    expect(r.brep.faces.some((f) => f.surface.kind === "cone")).toBe(true)
  })

  test("a blind hole keeps its flat bottom with a 3 degree draft", () => {
    const b = blind()
    const r = ok(editHole(b, only(b), { kind: "resize", diameter: 8, taper: 3 }))
    expect(massProperties(r.brep).volume).toBeCloseTo(PLATE - frustum(4, 4 - 12 * tan(3), 12), 4)
  })

  test("a draft that closes the bore, or one beyond 30 degrees, is refused", () => {
    const b = blind()
    expect(editHole(b, only(b), { kind: "resize", diameter: 2, taper: 29 })).toMatch(/closes the bore/)
    expect(editHole(b, only(b), { kind: "resize", diameter: 8, taper: 45 })).toMatch(/between 0 and 30/)
  })
})

describe("a body turned into each manual setup", () => {
  // The signed permutations the CAM planner turns a part by (`setupTransform`): +X, -X, +Y, -Y, -Z.
  const TURNS: ReadonlyArray<readonly [string, ReadonlyArray<number>]> = [
    ["+X", [0, 1, 0, 0, 0, 1, 1, 0, 0]], ["-X", [0, -1, 0, 0, 0, 1, -1, 0, 0]],
    ["+Y", [-1, 0, 0, 0, 0, 1, 0, 1, 0]], ["-Y", [1, 0, 0, 0, 0, 1, 0, -1, 0]], ["-Z", [1, 0, 0, 0, -1, 0, 0, 0, -1]]
  ]

  test("every hole of a part with a hole on three sides fills and keeps the solid valid, whatever the setup (one seam position hit a degenerate Boolean)", async () => {
    const { transformBrep } = await import("./topology.ts")
    let part = block()
    part = cut(part, makeCylinder(3, 12, frame({ x: 10, y: 10, z: 10 }, Z)))
    part = cut(part, makeCylinder(2, 14, frame({ x: 28, y: 15, z: 10 }, { x: 1, y: 0, z: 0 })))
    part = cut(part, makeCylinder(1.5, 14, frame({ x: 20, y: 18, z: 10 }, { x: 0, y: 1, z: 0 })))
    const volume = massProperties(part).volume
    for (const [name, m] of TURNS) {
      const turned = transformBrep(part, { m: m as never, t: { x: 0, y: 0, z: 0 } })
      for (const hole of recognizeHoles(turned)) {
        const r = editHole(turned, hole, { kind: "fill" })
        if (typeof r === "string") throw new Error(`${name} Ø${hole.diameter}: ${r}`)
        expect(validateBrep(r.brep).valid).toBe(true)
        expect(massProperties(r.brep).volume).toBeCloseTo(volume + disc(hole.diameter, hole.depth), 4)
      }
    }
  })
})

