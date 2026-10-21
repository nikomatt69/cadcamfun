import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, brepLocator, extrudeProfile, frame, makeBox, makeCone, makeCylinder, makeSphere, massProperties, polygonProfileLoop, shellBrep, validateBrep, type Brep } from "./index.ts"

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
  test("what the construction cannot do is refused with a reason", () => {
    expect(shellBrep(makeSphere(10), 1)).toContain("sphere face")
    expect(shellBrep(makeCone(5, 3, 10), 1)).toContain("cone face")
    expect(shellBrep(makeBox(10, 10, 10), 5)).toContain("half the body")
    expect(shellBrep(makeBox(10, 10, 10), 0)).toContain("positive")
    expect(shellBrep(makeCylinder(1.5, 10), 2)).toContain("thinner than the wall")
  })
})
