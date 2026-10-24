import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { booleanBrep, frame, makeBox, makeCone, makeSphere, makeTorus, massProperties, rotation, transformBrep, uniformScale, compose, validateBrep } from "./index.ts"

setDefaultTimeout(60_000)

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)

describe("transformBrep with a scaling", () => {
  // A line is parametrised by arc length, so scaling must scale the edge bounds, not only the points.
  const about = { x: 3, y: -2, z: 5 }
  const cases: ReadonlyArray<readonly [string, () => ReturnType<typeof makeBox>]> = [
    ["box", () => makeBox(4, 3, 2)],
    ["cylinder", () => makeCone(2, 2, 5)],
    ["cone", () => makeCone(3, 1, 4)],
    ["sphere", () => makeSphere(2)],
    ["torus", () => makeTorus(5, 1)],
    ["box minus cylinder", () => booleanBrep(makeBox(10, 10, 4), makeCone(2, 2, 6, frame({ x: 5, y: 5, z: -1 })), "subtract").brep]
  ]
  for (const factor of [1.5, 0.4, 3]) {
    for (const [name, make] of cases) {
      test(`${name} scaled by ${factor}`, () => {
        const body = make()
        const before = massProperties(body)
        const out = transformBrep(body, uniformScale(factor, about))
        const report = validateBrep(out)
        expect(report.issues.map((i) => i.message)).toEqual([])
        const after = massProperties(out)
        expect(rel(after.volume, before.volume * factor ** 3)).toBeLessThan(1e-9)
        expect(rel(after.area, before.area * factor ** 2)).toBeLessThan(1e-9)
        // The centroid is scaled about the fixed point.
        expect(after.centroid.x).toBeCloseTo(about.x + (before.centroid.x - about.x) * factor, 8)
        expect(after.centroid.y).toBeCloseTo(about.y + (before.centroid.y - about.y) * factor, 8)
        expect(after.centroid.z).toBeCloseTo(about.z + (before.centroid.z - about.z) * factor, 8)
      })
    }
  }

  test("a rotation with a scaling keeps the body valid and the volume exact", () => {
    const tr = compose(rotation({ x: 0, y: 0, z: 1 }, 0.7), uniformScale(2, about))
    const out = transformBrep(makeBox(4, 3, 2), tr)
    expect(validateBrep(out).issues.map((i) => i.message)).toEqual([])
    expect(rel(massProperties(out).volume, 24 * 8)).toBeLessThan(1e-9)
  })

  test("a rigid transform leaves the edge bounds and tolerances alone", () => {
    const body = makeBox(4, 3, 2)
    const out = transformBrep(body, rotation({ x: 0, y: 0, z: 1 }, 0.3))
    expect(out.edges.map((e) => [e.t0, e.t1, e.tol])).toEqual(body.edges.map((e) => [e.t0, e.t1, e.tol]))
  })
})
