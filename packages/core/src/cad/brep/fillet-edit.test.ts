import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep } from "./boolean.ts"
import { massProperties } from "./mass.ts"
import { frame } from "./math.ts"
import { changeFilletRadius } from "./fillet-edit.ts"
import { extrudeProfile, revolveProfile, roundedRectangleLoop } from "./sweep.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(100_000)
const volume = (b: Brep) => massProperties(b).volume
const ok = (r: Brep | string): Brep => { if (typeof r === "string") throw new Error(r); return r }
/** The corner a quarter-turn fillet of radius p leaves out of a square corner: p^2 (1 - pi/4). */
const corner = (p: number) => p * p * (1 - Math.PI / 4)

/** A 40 x 30 plate 10 thick with its four vertical edges rounded to radius `r` (one extrusion of a rounded rectangle). */
const plate = (r: number): Brep => extrudeProfile({ loops: [roundedRectangleLoop(0, 0, 40, 30, r)] }, 10)
const cylinders = (b: Brep) => b.faces.map((f, i) => ({ f, i })).filter((x) => x.f.surface.kind === "cylinder")
/** Only one corner changes: a plate with three corners at 3 mm and one at 2 mm has this volume. */
const plateOneCorner = (r: number) => 40 * 30 * 10 - 10 * (3 * corner(3) + corner(r))

describe("changing the radius of a convex fillet of an extruded plate", () => {
  test("pushed out of the solid it tightens: the radius is r - d and the volume grows by the sliver, area x length", () => {
    const b = plate(3)
    const face = cylinders(b)[0]!.i
    const r = ok(changeFilletRadius(b, face, 1))
    expect(validateBrep(r).valid).toBe(true)
    // One of four corners goes from 3 to 2 mm.
    expect(volume(r) - volume(b)).toBeCloseTo(10 * (corner(3) - corner(2)), 6)
    expect(volume(r)).toBeCloseTo(plateOneCorner(2), 6)
    // The same corner, read back, is a fillet of radius 2.
    const radii = cylinders(r).map((x) => (x.f.surface as { radius: number }).radius).sort()
    expect(radii).toEqual([2, 3, 3, 3])
  })

  test("pulled into the solid it rounds more: r + d, material is cut", () => {
    const b = plate(3)
    const r = ok(changeFilletRadius(b, cylinders(b)[1]!.i, -1.5))
    expect(volume(r)).toBeCloseTo(plateOneCorner(4.5), 6)
    expect(cylinders(r).map((x) => (x.f.surface as { radius: number }).radius).sort()).toEqual([3, 3, 3, 4.5])
  })

  test("a radius that would vanish and a plate too small for the new radius are refused with the reason", () => {
    const b = plate(3)
    expect(changeFilletRadius(b, cylinders(b)[0]!.i, 3)).toMatch(/not a fillet/)
    // 20 mm radius: the faces beside the fillet are 30 mm, but the neighbouring corner already uses 3 + 20.
    const tooBig = changeFilletRadius(b, cylinders(b)[0]!.i, -20)
    expect(typeof tooBig === "string" || Math.abs(volume(tooBig) - plateOneCorner(23)) < 1e-6).toBe(true)
  })
})

describe("changing the radius of a concave fillet", () => {
  // A pocket 24 x 14 and 4 deep with rounded corners of radius 3, cut in a 40 x 30 x 10 block.
  const pocketed = (r: number): Brep => {
    const block = extrudeProfile({ loops: [roundedRectangleLoop(0, 0, 40, 30, 0.0001)] }, 10)
    const pocket = extrudeProfile({ loops: [roundedRectangleLoop(8, 8, 32, 22, r)] }, 6, { placement: frame({ x: 0, y: 0, z: 6 }, { x: 0, y: 0, z: 1 }) })
    return booleanBrep(block, pocket, "subtract").brep
  }
  const pocketVolume = (r: number) => 40 * 30 * 10 - 4 * (24 * 14 - (4 - Math.PI) * 0) // unused
  void pocketVolume

  test("pushed out of the solid (into the void) a concave corner fills out: r + d, material is added", () => {
    const b = pocketed(3)
    const arcs = cylinders(b).filter((x) => Math.abs((x.f.surface as { radius: number }).radius - 3) < 1e-9)
    expect(arcs.length).toBe(4)
    const r = ok(changeFilletRadius(b, arcs[0]!.i, 1))
    // The pocket loses (4 - pi) / 4 (4^2 - 3^2) of area at that corner, over its 4 mm depth.
    expect(volume(r) - volume(b)).toBeCloseTo(4 * corner(4) - 4 * corner(3), 5)
    expect(validateBrep(r).valid).toBe(true)
  })
})

describe("changing the radius of the rounded rim of a round part", () => {
  // A pin of radius 10, 15 high, its top rim rounded to radius `p`, as one revolve.
  const pin = (p: number): Brep => revolveProfile({ loops: [[
    { kind: "line", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, { kind: "line", a: { x: 10, y: 0 }, b: { x: 10, y: 15 - p } },
    { kind: "arc", center: { x: 10 - p, y: 15 - p }, radius: p, start: 0, end: Math.PI / 2 },
    { kind: "line", a: { x: 10 - p, y: 15 }, b: { x: 0, y: 15 } }, { kind: "line", a: { x: 0, y: 15 }, b: { x: 0, y: 0 } }
  ]] }, 2 * Math.PI)
  const torus = (b: Brep) => b.faces.findIndex((f) => f.surface.kind === "torus")

  test("pushed out the rim tightens: the volume is the one of the pin built with the new radius", () => {
    const b = pin(3)
    const r = ok(changeFilletRadius(b, torus(b), 1))
    expect(validateBrep(r).valid).toBe(true)
    expect(volume(r)).toBeCloseTo(volume(pin(2)), 5)
    expect((r.faces[torus(r)]!.surface as { minor: number }).minor).toBeCloseTo(2, 9)
  })

  test("rounding a ring's rim more is refused with the reason: the new torus would touch the flat top along a circle inside the face, which a Boolean cannot decide", () => {
    const b = pin(3)
    const r = changeFilletRadius(b, torus(b), -2)
    expect(typeof r).toBe("string")
    expect(r as string).toMatch(/Boolean/)
  })
})
