import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, frame, makeBox, makeCylinder, massProperties, tessellateBrep, validateBrep } from "./index.ts"

setDefaultTimeout(60_000)
const at = (x: number, y: number, z: number) => frame({ x, y, z }, { x: 0, y: 0, z: 1 })

/** Per-operation gates: a generous multiple of the measured time, so only a real regression (10x) trips them. */
describe("kernel performance gates", () => {
  test("a long thin cylinder tessellates to a few thousand triangles, not a hundred thousand", () => {
    const t0 = performance.now()
    const m = tessellateBrep(makeCylinder(0.001, 10, at(5, 5, 0)), { chordTol: 0.03, angleTolDeg: 10 })
    expect(m.indices.length / 3).toBeLessThan(40_000)
    expect(performance.now() - t0).toBeLessThan(2000)
  })
  test("a 1 micron-radius bore through a 10 mm block subtracts exactly in well under a second of kernel time", () => {
    const t0 = performance.now()
    const r = booleanBrep(makeBox(10, 10, 10), makeCylinder(0.001, 10, at(5, 5, 0)), "subtract")
    expect(validateBrep(r.brep).issues).toEqual([])
    expect(Math.abs(massProperties(r.brep).volume - (1000 - Math.PI * 1e-6 * 10))).toBeLessThan(1e-6)
    expect(performance.now() - t0).toBeLessThan(2500)
  })
  test("bores from 0.01 to 3 mm each take well under a second", () => {
    for (const radius of [0.01, 0.1, 1, 3]) {
      const t0 = performance.now()
      booleanBrep(makeBox(10, 10, 10), makeCylinder(radius, 10, at(5, 5, 0)), "subtract")
      expect(performance.now() - t0).toBeLessThan(1500)
    }
  })
})
