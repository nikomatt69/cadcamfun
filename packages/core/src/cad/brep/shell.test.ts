import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, brepLocator, extrudeProfile, frame, makeBox, makeCone, makeCylinder, makeSphere, makeTorus, massProperties, polygonProfileLoop, shellBrep, validateBrep, type Brep } from "./index.ts"

setDefaultTimeout(120_000)
const W = frame({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
const ok = (r: ReturnType<typeof shellBrep>) => {
  if (typeof r === "string") throw new Error(r)
  expect(validateBrep(r.brep).issues.map((i) => i.message)).toEqual([])
  return r
}
const topFace = (b: Brep, z: number) => b.faces.findIndex((f) => f.surface.kind === "plane" && Math.abs(f.surface.frame.origin.z - z) < 1e-9 && Math.abs(f.surface.frame.z.z) > 0.9)

describe("exact shell by dilation of the boundary", () => {
  test("a closed box: two shells (outside and cavity), cavity the eroded box", () => {
    const r = ok(shellBrep(makeBox(30, 20, 10), 2))
    expect(r.brep.shells.length).toBe(2)
    expect(massProperties(r.cavity).volume).toBeCloseTo(26 * 16 * 6, 6)
    expect(massProperties(r.brep).volume).toBeCloseTo(6000 - 26 * 16 * 6, 6)
  })
  test("an open top: one shell, the cavity runs out through the face", () => {
    const box = makeBox(30, 20, 10)
    const r = ok(shellBrep(box, 2, { open: [topFace(box, 10)] }))
    expect(r.brep.shells.length).toBe(1)
    expect(massProperties(r.brep).volume).toBeCloseTo(6000 - 26 * 16 * 8, 6)
  })
  test("an L bracket rounds its re-entrant corner: the cavity is the eroded L to the grid's accuracy", () => {
    const L = extrudeProfile({ loops: [polygonProfileLoop([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 15 }, { x: 15, y: 15 }, { x: 15, y: 40 }, { x: 0, y: 40 }])] }, 12, { placement: W, name: "L" })
    const r = ok(shellBrep(L, 2))
    // Area of the L eroded by t: the polygon's area minus P t plus t^2 (sum over convex corners of cot(a/2) - re-entrant corner's (pi/2 + cot...)),
    // evaluated by a fine grid of the distance to the outline: 671.857 mm2 (5374.858 / 8).
    expect(Math.abs(massProperties(r.cavity).volume - 5374.858)).toBeLessThan(0.1)
    expect(r.cavity.faces.some((f) => f.surface.kind === "cylinder")).toBe(true)
  })
  test("a plate with a through hole: the hole's wall moves out by the wall, exactly", () => {
    const plate = booleanBrep(makeBox(40, 30, 10), makeCylinder(5, 10, frame({ x: 20, y: 15, z: 0 }, { x: 0, y: 0, z: 1 })), "subtract").brep
    const r = ok(shellBrep(plate, 2))
    expect(massProperties(r.cavity).volume).toBeCloseTo((36 * 26 - Math.PI * 49) * 6, 6)
  })
  test("a boss on a plate: the foot of the boss is re-entrant and its cavity is rounded by a torus (checked against the exact point location)", () => {
    const body = booleanBrep(makeBox(40, 30, 10), makeCylinder(6, 10, frame({ x: 20, y: 15, z: 10 }, { x: 0, y: 0, z: 1 })), "union").brep
    const t = 2
    const r = ok(shellBrep(body, t))
    expect(r.cavity.faces.some((f) => f.surface.kind === "torus")).toBe(true)
    // Cavity volume against the points of the body that are at least t from its surface.
    const loc = brepLocator(body)
    const halton = (i: number, base: number): number => { let f = 1, v = 0; for (let k = i; k > 0; k = Math.floor(k / base)) { f /= base; v += f * (k % base) } return v }
    const N = 6000, box = { x: 40, y: 30, z: 20 }
    let hits = 0
    for (let i = 1; i <= N; i++) {
      const p = { x: box.x * halton(i, 2), y: box.y * halton(i, 3), z: box.z * halton(i, 5) }
      if (loc.classify(p, 1e-9) === "in" && loc.closest(p).distance >= t) hits++
    }
    const f = hits / N, est = f * 40 * 30 * 20, sigma = 40 * 30 * 20 * Math.sqrt(f * (1 - f) / N)
    expect(Math.abs(massProperties(r.cavity).volume - est)).toBeLessThan(4 * sigma + 20)
  })
  test("faces of revolution: a ball, a frustum and a ring shell to the eroded solid exactly", () => {
    const ball = ok(shellBrep(makeSphere(10), 2))
    expect(massProperties(ball.cavity).volume).toBeCloseTo((4 / 3) * Math.PI * 8 ** 3, 6)
    expect(new Set(ball.cavity.faces.map((f) => f.surface.kind))).toEqual(new Set(["sphere"]))
    // A frustum 6 -> 3 over 10, wall 1: the side moves in by 1 / cos(alpha), the ends by 1.
    const al = Math.atan(3 / 10), d = 1 / Math.cos(al), lo = 6 - 0.3 - d, hi = 6 - 0.3 * 9 - d
    const frustum = ok(shellBrep(makeCone(6, 3, 10), 1))
    expect(massProperties(frustum.cavity).volume).toBeCloseTo(((Math.PI * 8) / 3) * (lo * lo + lo * hi + hi * hi), 6)
    const ring = ok(shellBrep(makeTorus(10, 3), 1))
    expect(massProperties(ring.cavity).volume).toBeCloseTo(2 * Math.PI ** 2 * 10 * 4, 6)
  })
  test("a dome on a plate and a countersunk plate (checked against the exact point location)", () => {
    const halton = (i: number, base: number): number => { let f = 1, v = 0; for (let k = i; k > 0; k = Math.floor(k / base)) { f /= base; v += f * (k % base) } return v }
    const check = (body: Brep, t: number, box: { x: number; y: number; z: number }, cavity: Brep) => {
      const loc = brepLocator(body)
      const N = 20000
      let hits = 0
      for (let i = 1; i <= N; i++) {
        const p = { x: box.x * halton(i, 2), y: box.y * halton(i, 3), z: box.z * halton(i, 5) }
        if (loc.classify(p, 1e-9) === "in" && loc.closest(p).distance >= t) hits++
      }
      const f = hits / N, V = box.x * box.y * box.z
      expect(Math.abs(massProperties(cavity).volume - f * V)).toBeLessThan(5 * V * Math.sqrt(f * (1 - f) / N) + 1)
    }
    const dome = booleanBrep(makeBox(30, 30, 10), makeSphere(8, frame({ x: 15, y: 15, z: 10 }, { x: 0, y: 0, z: 1 })), "union").brep
    check(dome, 2, { x: 30, y: 30, z: 18 }, ok(shellBrep(dome, 2)).cavity)
    const countersunk = booleanBrep(makeBox(30, 30, 10), makeCone(3, 7, 4, frame({ x: 15, y: 15, z: 6 }, { x: 0, y: 0, z: 1 })), "subtract").brep
    check(countersunk, 1.5, { x: 30, y: 30, z: 10 }, ok(shellBrep(countersunk, 1.5)).cavity)
  })
  test("what the construction cannot do is refused with a reason", () => {
    expect(shellBrep(makeSphere(10), 11)).toContain("thinner than the wall")
    expect(shellBrep(makeBox(10, 10, 10), 5)).toContain("half the body")
    expect(shellBrep(makeBox(10, 10, 10), 0)).toContain("positive")
    expect(shellBrep(makeCylinder(1.5, 10), 2)).toContain("thinner than the wall")
  })
})
