import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep } from "./boolean.ts"
import { pushPullDome, recognizeDome } from "./dome-edit.ts"
import { massProperties } from "./mass.ts"
import { frame } from "./math.ts"
import { pushPullCylinder } from "./pushpull-curved.ts"
import { makeBox, makeCylinder, makeSphere } from "./primitives.ts"
import { revolveProfile } from "./sweep.ts"
import type { Brep } from "./topology.ts"
import { validateBrep } from "./validate.ts"

setDefaultTimeout(100_000)
const Z = { x: 0, y: 0, z: 1 }
const volume = (b: Brep) => massProperties(b).volume
const ok = (r: Brep | string): Brep => { if (typeof r === "string") throw new Error(r); return r }
const A = 5, R = 8, Q = Math.sqrt(R * R - A * A)
/** A plate with a Ø10 boss standing on it, ended by a dome of the sphere of radius 8 whose centre is on the axis (the rim is 6.245 mm above it). */
const domed = () => {
  const centre = { x: 20, y: 15, z: 16 - Q }
  const head = booleanBrep(makeSphere(R, frame(centre, Z)), makeCylinder(A, 14, frame({ x: 20, y: 15, z: 10 }, Z)), "intersect").brep
  return booleanBrep(makeBox(40, 30, 10), head, "union").brep
}
const sphereFace = (b: Brep) => b.faces.findIndex((f) => f.surface.kind === "sphere")
/** Volume of the head: cylinder from z = 10 to the sphere, as the closed form. */
const cap = (r: number) => r ** 3 - (r * r - A * A) ** 1.5

describe("the dome of a boss", () => {
  test("is recognised: centre, radius, rim circle and its height above the centre", () => {
    const b = domed()
    const d = recognizeDome(b, sphereFace(b))
    if (typeof d === "string") throw new Error(d)
    expect(d.radius).toBeCloseTo(R, 9)
    expect(d.boss).toBeCloseTo(A, 6)
    expect(d.rim).toBeCloseTo(Q, 6)
    expect(d.axis.z).toBeCloseTo(1, 9)
  })

  test("push out grows the dome: the volume moves by the closed form (2 pi / 3) [cap(R') - cap(R)]", () => {
    const b = domed()
    for (const d of [1, 3]) {
      const r = ok(pushPullDome(b, sphereFace(b), d))
      expect(validateBrep(r).valid).toBe(true)
      expect(volume(r) - volume(b)).toBeCloseTo(((2 * Math.PI) / 3) * (cap(R + d) - cap(R)), 3)
    }
  })

  test("pull in flattens the dome, with the same closed form", () => {
    const b = domed()
    for (const d of [-0.5, -1.5]) {
      const r = ok(pushPullDome(b, sphereFace(b), d))
      expect(validateBrep(r).valid).toBe(true)
      expect(volume(r) - volume(b)).toBeCloseTo(((2 * Math.PI) / 3) * (cap(R + d) - cap(R)), 3)
    }
  })

  test("the dome after the edit is the sphere of the new radius about the same centre", () => {
    const b = domed()
    const r = ok(pushPullDome(b, sphereFace(b), 2))
    const d = recognizeDome(r, sphereFace(r))
    if (typeof d === "string") throw new Error(d)
    expect(d.radius).toBeCloseTo(R + 2, 9)
    expect(d.centre.z).toBeCloseTo(16 - Q, 9)
  })

  test("it goes through the generic push/pull of a curved face", () => {
    const b = domed()
    expect(volume(ok(pushPullCylinder(b, sphereFace(b), 1)))).toBeCloseTo(volume(ok(pushPullDome(b, sphereFace(b), 1))), 6)
  })

  test("a sphere tangent to the wall, one pulled in below the boss radius and a lone ball are refused with the reason", () => {
    const b = domed()
    expect(pushPullDome(b, sphereFace(b), -(R - A) + 0.01)).toMatch(/tangent/)
    expect(pushPullDome(b, sphereFace(b), -4)).toMatch(/smaller than the wall|tangent/)
    const ball = makeSphere(5)
    expect(typeof recognizeDome(ball, 0)).toBe("string")
  })
})

/** A bore of radius 5 from the top of a 40 x 30 x 30 block, ended by a spherical bottom of radius 8 whose centre is 6.245 mm above the rim's plane... below the opening: the socket. */
const socketed = () => {
  const centre = { x: 20, y: 15, z: 14 }
  // The bore: the cylinder from the rim up to the top, and the cap of the ball inside the same cylinder below the rim.
  const cap = booleanBrep(makeSphere(8, frame(centre, Z)), makeCylinder(5, 14 - Q + 1 - 5, frame({ x: 20, y: 15, z: 5 }, Z)), "intersect").brep
  const bore = booleanBrep(makeCylinder(5, 32 - (14 - Q), frame({ x: 20, y: 15, z: 14 - Q }, Z)), cap, "union").brep
  return booleanBrep(makeBox(40, 30, 30), bore, "subtract").brep
}

describe("the socket that ends a bore", () => {
  test("is recognised: concave, the pole at the bottom, the rim between the centre and the pole", () => {
    const b = socketed()
    const d = recognizeDome(b, sphereFace(b))
    if (typeof d === "string") throw new Error(d)
    expect(d.concave).toBe(true)
    expect(d.radius).toBeCloseTo(R, 9)
    expect(d.boss).toBeCloseTo(A, 6)
    expect(d.axis.z).toBeCloseTo(-1, 9)
    expect(d.rim).toBeCloseTo(Q, 6)
  })

  test("pushed out of the solid the bottom comes up (material enters the bore), pulled it goes deeper: the closed form (2 pi / 3) [cap(R') - cap(R)], signs turned", () => {
    const b = socketed()
    for (const d of [1, 2, -1, -3]) {
      const r = ok(pushPullDome(b, sphereFace(b), d))
      expect(validateBrep(r).valid).toBe(true)
      expect(volume(r) - volume(b)).toBeCloseTo(-((2 * Math.PI) / 3) * (cap(R - d) - cap(R)), 3)
    }
    const up = ok(pushPullDome(b, sphereFace(b), 2))
    const d = recognizeDome(up, sphereFace(up))
    if (typeof d === "string") throw new Error(d)
    expect(d.radius).toBeCloseTo(R - 2, 9)
    expect(d.centre.z).toBeCloseTo(14, 9)
  })

  test("a bottom raised to the wall's radius would leave a shoulder and is refused", () => {
    const b = socketed()
    expect(pushPullDome(b, sphereFace(b), R - A)).toMatch(/tangent|smaller than the wall/)
    expect(pushPullDome(b, sphereFace(b), 5)).toMatch(/smaller than the wall/)
  })
})

describe("the hemisphere that ends a pin or a bore (the rim through the centre)", () => {
  // A ball-nose pin of radius 5 on a plate, and a ball-end bore of radius 5 in a block, both built as one revolved profile: exactly tangent.
  const pinned = () => {
    const pin = revolveProfile({ loops: [[
      { kind: "line", a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }, { kind: "line", a: { x: 5, y: 0 }, b: { x: 5, y: 6 } },
      { kind: "arc", center: { x: 0, y: 6 }, radius: 5, start: 0, end: Math.PI / 2 }, { kind: "line", a: { x: 0, y: 11 }, b: { x: 0, y: 0 } }
    ]] }, 2 * Math.PI, { origin: { x: 20, y: 15, z: 10 } })
    return booleanBrep(makeBox(40, 30, 10), pin, "union").brep
  }
  const ballEnd = () => {
    const tool = revolveProfile({ loops: [[
      { kind: "line", a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }, { kind: "line", a: { x: 5, y: 0 }, b: { x: 5, y: 12 } },
      { kind: "line", a: { x: 5, y: 12 }, b: { x: 0, y: 12 } }, { kind: "line", a: { x: 0, y: 12 }, b: { x: 0, y: 0 } }
    ]] }, 2 * Math.PI, { origin: { x: 20, y: 15, z: 18 } })
    return booleanBrep(makeBox(40, 30, 30), booleanBrep(tool, makeSphere(5, frame({ x: 20, y: 15, z: 18 }, Z)), "union").brep, "subtract").brep
  }

  test("a hemispherical pin end is recognised from the wall it ends and can grow", () => {
    const b = pinned()
    const d = recognizeDome(b, sphereFace(b))
    if (typeof d === "string") throw new Error(d)
    expect(d.rim).toBe(0)
    expect(d.axis.z).toBeCloseTo(1, 9)
    const r = ok(pushPullDome(b, sphereFace(b), 1))
    expect(volume(r) - volume(b)).toBeCloseTo(((2 * Math.PI) / 3) * (cap(6) - cap(5)), 3)
    expect(pushPullDome(b, sphereFace(b), -1)).toMatch(/smaller than the wall/)
  })

  test("a ball-end bore bottom is recognised and can go deeper", () => {
    const b = ballEnd()
    const d = recognizeDome(b, sphereFace(b))
    if (typeof d === "string") throw new Error(d)
    expect(d.concave).toBe(true)
    expect(d.axis.z).toBeCloseTo(-1, 9)
    const r = ok(pushPullDome(b, sphereFace(b), -1.5))
    expect(volume(r) - volume(b)).toBeCloseTo(-((2 * Math.PI) / 3) * (cap(6.5) - cap(5)), 3)
    expect(pushPullDome(b, sphereFace(b), 1)).toMatch(/smaller than the wall/)
  })
})
