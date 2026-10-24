/**
 * The non-uniform scale of spec 40 U4. The oracle is the closed form: a box scaled by (sx, sy, sz) has a volume of
 * sx·sy·sz times the original, and a cylinder scaled unevenly across its section is an elliptic cylinder of volume
 * π·a·b·h. Nothing here is compared with the kernel's own output.
 */
import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { scaleBrep } from "./scale.ts"
import { makeBox, makeCylinder, makeSphere } from "./primitives.ts"
import { frame } from "./math.ts"
import { massProperties } from "./mass.ts"
import { validateBrep } from "./validate.ts"

const O = { x: 0, y: 0, z: 0 }

// The mass properties of a curved face integrate over a fine triangulation: a few hundred milliseconds.
setDefaultTimeout(60_000)

describe("the non-uniform scale", () => {
  test("a box scaled by three factors has the volume of the product", () => {
    const b = makeBox(10, 20, 30)
    const scaled = scaleBrep(b, { x: 2, y: 3, z: 4 }, O)
    if (typeof scaled === "string") throw new Error(scaled)
    expect(validateBrep(scaled).issues.map((i) => i.message)).toEqual([])
    expect(massProperties(scaled).volume).toBeCloseTo(10 * 20 * 30 * 2 * 3 * 4, 3)
  })

  test("a box scaled about a point keeps that point", () => {
    const about = { x: 5, y: 5, z: 5 }
    const b = makeBox(10, 10, 10)
    const scaled = scaleBrep(b, { x: 2, y: 2, z: 2 }, about)
    if (typeof scaled === "string") throw new Error(scaled)
    // The centre of the box stays where it was.
    expect(massProperties(scaled).centroid.x).toBeCloseTo(5, 6)
    expect(massProperties(scaled).centroid.y).toBeCloseTo(5, 6)
    expect(massProperties(scaled).centroid.z).toBeCloseTo(5, 6)
  })

  test("a cylinder scaled across its section becomes an elliptic cylinder", () => {
    const b = makeCylinder(4, 10, frame({ x: 0, y: 0, z: 0 }))
    const scaled = scaleBrep(b, { x: 2, y: 3, z: 1 }, O)
    if (typeof scaled === "string") throw new Error(scaled)
    expect(validateBrep(scaled).issues.map((i) => i.message)).toEqual([])
    // π·a·b·h with a = 4·2, b = 4·3, h = 10.
    expect(massProperties(scaled).volume).toBeCloseTo(Math.PI * 8 * 12 * 10, 2)
  })

  test("a cylinder scaled along its axis stays a cylinder", () => {
    const b = makeCylinder(4, 10, frame({ x: 0, y: 0, z: 0 }))
    const scaled = scaleBrep(b, { x: 1, y: 1, z: 3 }, O)
    if (typeof scaled === "string") throw new Error(scaled)
    expect(validateBrep(scaled).issues.map((i) => i.message)).toEqual([])
    expect(massProperties(scaled).volume).toBeCloseTo(Math.PI * 16 * 30, 2)
  })

  test("a sphere scaled unevenly is refused, not approximated", () => {
    const b = makeSphere(5)
    const scaled = scaleBrep(b, { x: 1, y: 1, z: 3 }, O)
    expect(typeof scaled).toBe("string")
    if (typeof scaled !== "string") return
    expect(scaled).toContain("ellipsoid")
  })

  test("a uniform scale keeps every surface", () => {
    const b = makeCylinder(4, 10, frame({ x: 0, y: 0, z: 0 }))
    const scaled = scaleBrep(b, { x: 2, y: 2, z: 2 }, O)
    if (typeof scaled === "string") throw new Error(scaled)
    expect(scaled.faces.map((f) => f.surface.kind)).toEqual(b.faces.map((f) => f.surface.kind))
    expect(massProperties(scaled).volume).toBeCloseTo(Math.PI * 64 * 20, 2)
  })
})
