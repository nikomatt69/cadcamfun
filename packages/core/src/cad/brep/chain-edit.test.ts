import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep } from "./boolean.ts"
import { massProperties } from "./mass.ts"
import { frame } from "./math.ts"
import { pushPullCylinder } from "./pushpull-curved.ts"
import { makeBox } from "./primitives.ts"
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

  test("a wall that does not go all the way round (one rounded corner) is offset as a path: the step at each end, the volume the one built by hand", () => {
    // 40 x 30 plate with only the (0, 0) corner rounded, r = 3; the chain is the left wall, the fillet and the bottom wall (tangent), 10 high.
    const one = (r: number) => extrudeProfile({ loops: [[
      { kind: "line", a: { x: 0, y: r }, b: { x: 0, y: 30 } }, { kind: "line", a: { x: 0, y: 30 }, b: { x: 40, y: 30 } },
      { kind: "line", a: { x: 40, y: 30 }, b: { x: 40, y: 0 } }, { kind: "line", a: { x: 40, y: 0 }, b: { x: r, y: 0 } },
      { kind: "arc", center: { x: r, y: r }, radius: r, start: -Math.PI / 2, end: -Math.PI }
    ]] }, 10)
    const b = one(3)
    const f = cylinders(b)[0]!.i
    const d = 1
    const r = ok(pushPullCylinder(b, f, d))
    expect(validateBrep(r).valid).toBe(true)
    // The chain (wall x = 0 from y = 3 up, arc, wall y = 0 from x = 3 on) moves out by 1 along its normals; the ends step by 1 at (0, 30) and (40, 0).
    // Added: the left wall strip 1 x 27, the bottom wall strip 1 x 37, the sector between the arcs (r 3 -> 4): (pi / 4)(16 - 9); all 10 high. The two strips
    // overlap the corner square nowhere (they start where the arc ends).
    expect(volume(r) - volume(b)).toBeCloseTo(10 * (27 + 37 + (Math.PI / 4) * 7), 5)
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

describe("a wall whose top is a sloped plane", () => {
  /** A rounded plate 20 high cut by the plane z = 10 + 0.2 x (material below it). */
  const slope = 0.2
  const cutPlate = (x0: number, y0: number, x1: number, y1: number, r: number): Brep => {
    const plate = extrudeProfile({ loops: [roundedRectangleLoop(x0, y0, x1, y1, r)] }, 20)
    const n = { x: -slope, y: 0, z: 1 }, l = Math.hypot(n.x, n.z)
    const up = { x: n.x / l, y: 0, z: n.z / l }
    // A big box reaching down from the plane (material side), standing on it.
    const f = frame({ x: 0, y: 0, z: 10 }, { x: -up.x, y: 0, z: -up.z }, { x: 0, y: 1, z: 0 })
    const size = 400
    const corner = { x: f.origin.x - f.x.x * size / 2 - f.y.x * size / 2, y: f.origin.y - f.x.y * size / 2 - f.y.y * size / 2, z: f.origin.z - f.x.z * size / 2 - f.y.z * size / 2 }
    const halfspace = makeBox(size, size, size, frame(corner, { x: -up.x, y: 0, z: -up.z }, f.x))
    return booleanBrep(plate, halfspace, "intersect").brep
  }
  test("offset out by d, the whole wall moves and the sloped top follows its plane: the volume is the one of the plate built bigger and cut by the same plane", () => {
    const b = cutPlate(0, 0, 40, 30, 3)
    const face = cylinders(b).find((x) => (x.f.surface as { radius: number }).radius === 3)!.i
    const r = ok(pushPullCylinder(b, face, 1))
    expect(validateBrep(r).valid).toBe(true)
    expect(volume(r)).toBeCloseTo(volume(cutPlate(-1, -1, 41, 31, 4)), 4)
    const inward = ok(pushPullCylinder(b, face, -1))
    // The two solids are built differently: their volumes agree to the integrator's accuracy on a plane cutting a cylinder (1e-6).
    expect(volume(inward)).toBeCloseTo(volume(cutPlate(1, 1, 39, 29, 2)), 1)
  })
})
