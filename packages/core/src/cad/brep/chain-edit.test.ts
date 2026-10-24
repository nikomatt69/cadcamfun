import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep } from "./boolean.ts"
import { massProperties } from "./mass.ts"
import { frame } from "./math.ts"
import { pushPullCylinder } from "./pushpull-curved.ts"
import { extrudeProfile, roundedRectangleLoop } from "./sweep.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(100_000)
const Z = { x: 0, y: 0, z: 1 }
const volume = (b: Brep) => massProperties(b).volume
const ok = (r: Brep | string): Brep => { if (typeof r === "string") throw new Error(r); return r }
const rounded = (x0: number, y0: number, x1: number, y1: number, r: number, h = 10): Brep => extrudeProfile({ loops: [roundedRectangleLoop(x0, y0, x1, y1, r)] }, h)
const cylinders = (b: Brep) => b.faces.map((f, i) => ({ f, i })).filter((x) => x.f.surface.kind === "cylinder")

describe("the smooth wall round a plate", () => {
  test("a fillet pushed out of the solid moves the whole outline out by d: the plate is the one built with the outline offset (corners r + d)", () => {
    const b = rounded(0, 0, 40, 30, 3)
    for (const d of [1, 2.5]) {
      const r = ok(pushPullCylinder(b, cylinders(b)[0]!.i, d))
      expect(validateBrep(r).valid).toBe(true)
      expect(volume(r)).toBeCloseTo(volume(rounded(-d, -d, 40 + d, 30 + d, 3 + d)), 5)
    }
  })

  test("pulled in the outline moves in: corners r - d", () => {
    const b = rounded(0, 0, 40, 30, 3)
    const r = ok(pushPullCylinder(b, cylinders(b)[2]!.i, -1))
    expect(volume(r)).toBeCloseTo(volume(rounded(1, 1, 39, 29, 2)), 5)
    expect(cylinders(r).map((x) => (x.f.surface as { radius: number }).radius).sort()).toEqual([2, 2, 2, 2])
  })

  test("an offset that would turn a corner arc inside out is refused with the reason", () => {
    const b = rounded(0, 0, 40, 30, 3)
    expect(pushPullCylinder(b, cylinders(b)[0]!.i, -3.5)).toMatch(/offset failed|inside out|collapse/i)
  })

  test("a wall that does not go all the way round (one rounded corner) is refused: the chain is not closed", () => {
    const one = extrudeProfile({ loops: [[
      { kind: "line", a: { x: 0, y: 3 }, b: { x: 0, y: 30 } }, { kind: "line", a: { x: 0, y: 30 }, b: { x: 40, y: 30 } },
      { kind: "line", a: { x: 40, y: 30 }, b: { x: 40, y: 0 } }, { kind: "line", a: { x: 40, y: 0 }, b: { x: 3, y: 0 } },
      { kind: "arc", center: { x: 3, y: 3 }, radius: 3, start: -Math.PI / 2, end: -Math.PI }
    ]] }, 10)
    const f = cylinders(one)[0]!.i
    expect(pushPullCylinder(one, f, 1)).toMatch(/not a closed chain|neither/)
  })
})

describe("the smooth wall of a pocket", () => {
  const pocketed = (r: number, x0: number, y0: number, x1: number, y1: number): Brep => {
    const block = rounded(0, 0, 40, 30, 0.0001)
    const pocket = extrudeProfile({ loops: [roundedRectangleLoop(x0, y0, x1, y1, r)] }, 6, { placement: frame({ x: 0, y: 0, z: 6 }, Z) })
    return booleanBrep(block, pocket, "subtract").brep
  }
  test("pushed out of the solid (into the void) the pocket shrinks: the outline moves in by d, corners r - d", () => {
    const b = pocketed(3, 8, 8, 32, 22)
    const arc = cylinders(b).find((x) => Math.abs((x.f.surface as { radius: number }).radius - 3) < 1e-9)!
    const r = ok(pushPullCylinder(b, arc.i, 1))
    expect(validateBrep(r).valid).toBe(true)
    expect(volume(r)).toBeCloseTo(volume(pocketed(2, 9, 9, 31, 21)), 4)
  })
  test("pulled in the pocket grows", () => {
    const b = pocketed(3, 8, 8, 32, 22)
    const arc = cylinders(b).find((x) => Math.abs((x.f.surface as { radius: number }).radius - 3) < 1e-9)!
    const r = ok(pushPullCylinder(b, arc.i, -1))
    expect(volume(r)).toBeCloseTo(volume(pocketed(4, 7, 7, 33, 23)), 4)
  })
})
