import { describe, expect, test } from "bun:test"
import { booleanBrep, circleProfileLoop, frame, loopMoments, makeBox, makeCylinder, massProperties, nearestFace, planarFaceFrame, pushPullFace, type ProfileLoop } from "./index.ts"

const PI = Math.PI
const v = (x: number, y: number, z: number) => ({ x, y, z })

describe("exact face moments and frames", () => {
  test("a half disc has its centre of area 4r / 3 pi above the diameter", () => {
    const r = 3
    const half: ProfileLoop = [{ kind: "line", a: { x: -r, y: 0 }, b: { x: r, y: 0 } }, { kind: "arc", center: { x: 0, y: 0 }, radius: r, start: 0, end: PI }]
    const m = loopMoments(half)
    expect(Math.abs(m.area - (PI * r * r) / 2)).toBeLessThan(1e-12)
    expect(Math.abs(m.mx)).toBeLessThan(1e-12)
    expect(Math.abs(m.my / m.area - (4 * r) / (3 * PI))).toBeLessThan(1e-12)
    const disc = loopMoments(circleProfileLoop({ x: 2, y: -1 }, 1.5))
    expect(Math.abs(disc.mx / disc.area - 2) + Math.abs(disc.my / disc.area + 1)).toBeLessThan(1e-12)
  })

  test("the top face of a bored block: area and centre of area with the bore taken out", () => {
    const bored = booleanBrep(makeBox(40, 20, 10), makeCylinder(4, 30, frame(v(10, 10, -10))), "subtract").brep
    const found = nearestFace(bored, { near: v(30, 10, 10) })
    if (found === undefined || !("pick" in found)) throw new Error("the top face was not found")
    const f = planarFaceFrame(bored, found.pick)
    if (typeof f === "string") throw new Error(f)
    const area = 800 - 16 * PI
    expect(Math.abs(f.area - area)).toBeLessThan(1e-9)
    expect(Math.abs(f.centroid.x - (800 * 20 - 16 * PI * 10) / area)).toBeLessThan(1e-9)
    expect(Math.abs(f.centroid.y - 10) + Math.abs(f.centroid.z - 10)).toBeLessThan(1e-9)
    // Pulled up 5: the bore runs on through the added ring.
    const pulled = pushPullFace(bored, { near: v(30, 10, 10), distance: 5 })
    if (typeof pulled === "string") throw new Error(pulled)
    expect(Math.abs(massProperties(pulled).volume - area * 15) / (area * 15)).toBeLessThan(1e-12)
  })
})
