import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { loftSolid } from "../sweep-loft.ts"
import { meshVolume } from "../solid.ts"
import { circleProfileLoop, frame, loftBrep, loftSection, massProperties, rectangleProfileLoop, validateBrep, type Brep, type ProfileLoop } from "./index.ts"

setDefaultTimeout(60_000)

const PI = Math.PI
const v = (x: number, y: number, z: number) => ({ x, y, z })
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b)
const at = (z: number) => frame(v(0, 0, z))
const solid = (b: Brep): number => {
  const rep = validateBrep(b)
  expect(rep.issues.map((i) => i.message)).toEqual([])
  expect(rep.manifoldSolid).toBe(true)
  return massProperties(b).volume
}
/** The mesh rebuild's loft of the same sections, from fine polygons of them. */
const meshLoft = (loops: ReadonlyArray<readonly [ProfileLoop, number]>, smooth = false): number =>
  meshVolume(loftSolid(loops.map(([l, z]) => {
    const segs = loftSection(l, at(z))
    const ring = segs.flatMap((s) => {
      const n = s.kind === "line" ? 1 : Math.ceil(s.angle / (PI / 360))
      return Array.from({ length: n }, (_, k) => s.kind === "line" ? s.a : (() => {
        const t = (s.angle * k) / n, y = { x: s.axis.y * s.x.z - s.axis.z * s.x.y, y: s.axis.z * s.x.x - s.axis.x * s.x.z, z: s.axis.x * s.x.y - s.axis.y * s.x.x }
        return v(s.center.x + s.radius * (Math.cos(t) * s.x.x + Math.sin(t) * y.x), s.center.y + s.radius * (Math.cos(t) * s.x.y + Math.sin(t) * y.y), s.center.z + s.radius * (Math.cos(t) * s.x.z + Math.sin(t) * y.z))
      })())
    })
    return { ring }
  }), { smooth, samples: 512 }))

describe("exact loft through planar sections", () => {
  test("square to square is the frustum of a pyramid, circle to circle the frustum of a cone", () => {
    const pyramid = loftBrep([loftSection(rectangleProfileLoop(-10, -10, 10, 10), at(0)), loftSection(rectangleProfileLoop(-5, -5, 5, 5), at(30))])
    expect(rel(solid(pyramid), 10 * (400 + 100 + 200))).toBeLessThan(1e-12)
    const cone = loftBrep([loftSection(circleProfileLoop({ x: 0, y: 0 }, 10), at(0)), loftSection(circleProfileLoop({ x: 0, y: 0 }, 5), at(20))])
    expect(rel(solid(cone), (PI * 20 * (100 + 50 + 25)) / 3)).toBeLessThan(1e-10)
  })

  test("circle to square: rational columns pair arcs with lines; agrees with the mesh loft within its sampling", () => {
    const sections: Array<readonly [ProfileLoop, number]> = [[circleProfileLoop({ x: 0, y: 0 }, 10), 0], [rectangleProfileLoop(-8, -8, 8, 8), 25]]
    const b = loftBrep(sections.map(([l, z]) => loftSection(l, at(z))))
    const exact = solid(b)
    expect(rel(exact, meshLoft(sections))).toBeLessThan(5e-3)
    // Bounded by the cylinder through the circle and the prism on the square.
    expect(exact).toBeLessThan(PI * 100 * 25)
    expect(exact).toBeGreaterThan(256 * 25)
  })

  test("a smooth loft through three coaxial circles is the solid of revolution of the Catmull-Rom radius", () => {
    const radii = [10, 6, 9], zs = [0, 12, 20]
    const b = loftBrep(radii.map((r, i) => loftSection(circleProfileLoop({ x: 0, y: 0 }, r), at(zs[i]!))), { smooth: true })
    // Volume = sum over spans of the integral of pi r(t)^2 z'(t) dt, the spline clamped at the ends.
    const cr = (a: number, b: number, c: number, d: number, t: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
    const crd = (a: number, b: number, c: number, d: number, t: number) => 0.5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * t + 3 * (-a + 3 * b - 3 * c + d) * t * t)
    let volume = 0
    for (let k = 0; k < 2; k++) {
      const i = [Math.max(0, k - 1), k, k + 1, Math.min(2, k + 2)]
      const R = i.map((j) => radii[j]!) as [number, number, number, number], Z = i.map((j) => zs[j]!) as [number, number, number, number]
      // Gauss-Legendre with 8 points is exact for the degree-8 integrand.
      const g = [[-0.9602898564975363, 0.1012285362903763], [-0.7966664774136267, 0.2223810344533745], [-0.5255324099163290, 0.3137066458778873], [-0.1834346424956498, 0.3626837833783620]]
      for (const [x, w] of [...g, ...g.map(([x, w]) => [-x!, w!])]) { const t = (x! + 1) / 2; volume += (w! / 2) * PI * cr(...R, t) ** 2 * crd(...Z, t) }
    }
    expect(rel(solid(b), volume)).toBeLessThan(1e-10)
  })

  test("a spline section is refused", () => {
    expect(() => loftSection([{ kind: "nurbs", data: { degree: 1, knots: [0, 0, 1, 1], points: [[0, 0], [1, 0]] } }], at(0))).toThrow(RangeError)
  })
})
