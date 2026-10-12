import { describe, expect, test } from "bun:test"
import { loftSolid, resampleRing, roundPath, sweepSolid, type P3 } from "./sweep-loft.ts"
import { meshVolume, type Mesh } from "./solid.ts"
import type { Vec2 } from "./vec.ts"

/** Every directed edge appears once and its reverse once: a closed, consistently oriented surface (vertices welded by index). */
const manifold = (mesh: Mesh): boolean => {
  const directed = new Map<string, number>()
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.indices[t + k]!, b = mesh.indices[t + ((k + 1) % 3)]!
      directed.set(`${a}>${b}`, (directed.get(`${a}>${b}`) ?? 0) + 1)
    }
  }
  for (const [key, n] of directed) {
    const [a, b] = key.split(">")
    if (n !== 1 || directed.get(`${b}>${a}`) !== 1) return false
  }
  return directed.size > 0
}

/** A regular n-gon of radius r in the plane through `centre` spanned by the unit vectors u and v. */
const polygon3 = (n: number, r: number, centre: P3, u: P3, v: P3): P3[] =>
  Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n
    return { x: centre.x + r * (Math.cos(a) * u.x + Math.sin(a) * v.x), y: centre.y + r * (Math.cos(a) * u.y + Math.sin(a) * v.y), z: centre.z + r * (Math.cos(a) * u.z + Math.sin(a) * v.z) }
  })
const polygon2 = (n: number, r: number): Vec2[] => Array.from({ length: n }, (_, k) => ({ x: r * Math.cos((2 * Math.PI * k) / n), y: r * Math.sin((2 * Math.PI * k) / n) }))
/** Area of a regular n-gon inscribed in a circle of radius r. */
const ngonArea = (n: number, r: number): number => 0.5 * n * r * r * Math.sin((2 * Math.PI) / n)
const lift = (ring: ReadonlyArray<Vec2>, z = 0): P3[] => ring.map((p) => ({ x: p.x, y: p.y, z }))
const rel = (got: number, want: number): number => Math.abs(got - want) / Math.abs(want)
const Z = { x: 0, y: 0, z: 1 }

const square = (half: number): Vec2[] => [{ x: -half, y: -half }, { x: half, y: -half }, { x: half, y: half }, { x: -half, y: half }]

describe("sweepSolid: straight paths", () => {
  test("a 4 x 4 square along 10 mm of Z is a 4 x 4 x 10 prism: volume 160, closed oriented surface", () => {
    const sq = square(2)
    const mesh = sweepSolid({ ring: lift(sq), ring2d: sq, normal: Z, centre: { x: 0, y: 0, z: 0 }, path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }], closed: false })
    expect(meshVolume(mesh)).toBeCloseTo(160, 6)
    expect(manifold(mesh)).toBe(true)
  })

  test("the path does not have to follow the profile's normal: the same square carried along +X has the same volume", () => {
    const sq = square(2)
    const mesh = sweepSolid({ ring: lift(sq), ring2d: sq, normal: Z, centre: { x: 0, y: 0, z: 0 }, path: [{ x: 5, y: 5, z: 5 }, { x: 15, y: 5, z: 5 }], closed: false })
    expect(meshVolume(mesh)).toBeCloseTo(160, 6)
    let minX = Infinity, maxX = -Infinity
    for (let i = 0; i < mesh.positions.length; i += 3) { minX = Math.min(minX, mesh.positions[i]!); maxX = Math.max(maxX, mesh.positions[i]!) }
    expect(minX).toBeCloseTo(5, 5)
    expect(maxX).toBeCloseTo(15, 5)
  })

  test("a path pointing against the profile's normal (a 180 degree turn of the frame) still gives a closed outward solid", () => {
    const sq = square(2)
    const mesh = sweepSolid({ ring: lift(sq), ring2d: sq, normal: Z, centre: { x: 0, y: 0, z: 0 }, path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -10 }], closed: false })
    expect(meshVolume(mesh)).toBeCloseTo(160, 6)
    expect(manifold(mesh)).toBe(true)
  })

  test("collinear intermediate points change nothing", () => {
    const sq = square(2)
    const mesh = sweepSolid({ ring: lift(sq), ring2d: sq, normal: Z, centre: { x: 0, y: 0, z: 0 }, path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 4 }, { x: 0, y: 0, z: 10 }], closed: false })
    expect(meshVolume(mesh)).toBeCloseTo(160, 5)
  })

  test("`extend` carries the path a millimetre past each end: 12 mm of prism instead of 10", () => {
    const sq = square(2)
    const base = { ring: lift(sq), ring2d: sq, normal: Z, centre: { x: 0, y: 0, z: 0 }, path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }], closed: false }
    expect(meshVolume(sweepSolid({ ...base, extend: true }))).toBeCloseTo(192, 5)
    expect(meshVolume(sweepSolid({ ...base, extend: false }))).toBeCloseTo(160, 5)
  })
})

describe("sweepSolid: profiles", () => {
  test("a concave L profile (area 5) over 10 mm: volume 50 and the caps triangulate to a closed surface", () => {
    const L: Vec2[] = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }]
    const mesh = sweepSolid({ ring: lift(L), ring2d: L, normal: Z, centre: { x: 1, y: 1, z: 0 }, path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }], closed: false })
    expect(meshVolume(mesh)).toBeCloseTo(50, 6)
    expect(manifold(mesh)).toBe(true)
  })

  test("a five-pointed star: area n R r sin(pi/n), volume area x length", () => {
    const R = 3, r = 1.2, n = 5
    const star: Vec2[] = Array.from({ length: 2 * n }, (_, k) => {
      const a = (Math.PI * k) / n, rad = k % 2 === 0 ? R : r
      return { x: rad * Math.cos(a), y: rad * Math.sin(a) }
    })
    const area = n * R * r * Math.sin(Math.PI / n)
    const mesh = sweepSolid({ ring: lift(star), ring2d: star, normal: Z, centre: { x: 0, y: 0, z: 0 }, path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 7 }], closed: false })
    expect(meshVolume(mesh)).toBeCloseTo(area * 7, 5)
    expect(manifold(mesh)).toBe(true)
  })

  test("the 2D ring may be the mirror image of the 3D ring: volume is still positive and right, surface still closed", () => {
    const L: Vec2[] = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }]
    const mirrored = L.map((p) => ({ x: p.x, y: -p.y }))
    const mesh = sweepSolid({ ring: lift(L), ring2d: mirrored, normal: Z, centre: { x: 1, y: 1, z: 0 }, path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }], closed: false })
    expect(meshVolume(mesh)).toBeCloseTo(50, 6)
    expect(manifold(mesh)).toBe(true)
  })

  test("a clockwise ring (vertex order reversed) is the same solid", () => {
    const L: Vec2[] = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 3 }, { x: 0, y: 3 }].reverse()
    const mesh = sweepSolid({ ring: lift(L), ring2d: L, normal: Z, centre: { x: 1, y: 1, z: 0 }, path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }], closed: false })
    expect(meshVolume(mesh)).toBeCloseTo(50, 6)
    expect(manifold(mesh)).toBe(true)
  })
})

describe("sweepSolid: bends and rings", () => {
  const r = 5, n = 96
  const circleRing = lift(polygon2(n, r))
  const circle2d = polygon2(n, r)
  const X = { x: 1, y: 0, z: 0 }
  // The circle stands in the YZ plane (normal +X), at the start of the path.
  const ringYZ = polygon3(n, r, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 })

  test.each([45, 90, 135])("an elbow turning %d degrees keeps its wall through the mitre: volume = area x (L1 + L2) within 0.5 %", (turn) => {
    const t = (turn * Math.PI) / 180
    const mesh = sweepSolid({
      ring: ringYZ, ring2d: circle2d, normal: X, centre: { x: 0, y: 0, z: 0 },
      path: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }, { x: 50 + 50 * Math.cos(t), y: 50 * Math.sin(t), z: 0 }], closed: false
    })
    expect(rel(meshVolume(mesh), ngonArea(n, r) * 100)).toBeLessThan(0.005)
    expect(manifold(mesh)).toBe(true)
  })

  test("a twisting 3D route (two bends in different planes) is still a closed solid of about area x length (within 1 %: off the plane of the bend the transported frame is a second-order approximation of the mitre shear)", () => {
    const route: P3[] = [{ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }, { x: 40, y: 40, z: 0 }, { x: 40, y: 40, z: 40 }]
    const mesh = sweepSolid({ ring: ringYZ, ring2d: circle2d, normal: X, centre: { x: 0, y: 0, z: 0 }, path: route, closed: false })
    expect(rel(meshVolume(mesh), ngonArea(n, r) * 120)).toBeLessThan(0.01)
    expect(manifold(mesh)).toBe(true)
  })

  test("a closed circular route makes a torus: volume = profile area x route length, no caps, closed surface", () => {
    const R = 30, m = 120, rr = 4, k = 48
    const route = polygon3(m, R, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
    // The profile sits in the XZ plane at the start of the route (R, 0, 0): its normal is Y.
    const ring = polygon3(k, rr, { x: R, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
    const mesh = sweepSolid({ ring, ring2d: polygon2(k, rr), normal: { x: 0, y: 1, z: 0 }, centre: { x: R, y: 0, z: 0 }, path: route, closed: true })
    const perimeter = 2 * m * R * Math.sin(Math.PI / m)
    expect(rel(meshVolume(mesh), ngonArea(k, rr) * perimeter)).toBeLessThan(0.005)
    // Against the exact torus 2 pi^2 R r^2 the meshing inscribes, so a little less.
    expect(meshVolume(mesh)).toBeLessThan(2 * Math.PI ** 2 * R * rr * rr)
    expect(meshVolume(mesh)).toBeGreaterThan(2 * Math.PI ** 2 * R * rr * rr * 0.99)
    expect(manifold(mesh)).toBe(true)
  })

  test("a route whose first point repeats as the last is accepted as a closed route", () => {
    const R = 30, m = 60, rr = 4, k = 24
    const route = polygon3(m, R, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
    const ring = polygon3(k, rr, { x: R, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
    const args = { ring, ring2d: polygon2(k, rr), normal: { x: 0, y: 1, z: 0 }, centre: { x: R, y: 0, z: 0 }, closed: true }
    const a = sweepSolid({ ...args, path: route })
    const b = sweepSolid({ ...args, path: [...route, route[0]!] })
    expect(meshVolume(b)).toBeCloseTo(meshVolume(a), 6)
    void circleRing
  })
})

describe("sweepSolid: bad input is a RangeError", () => {
  const sq = square(2)
  const base = { ring: lift(sq), ring2d: sq, normal: Z, centre: { x: 0, y: 0, z: 0 }, closed: false }

  test("a path of one point, or of points that coincide, has no direction", () => {
    expect(() => sweepSolid({ ...base, path: [{ x: 0, y: 0, z: 0 }] })).toThrow(RangeError)
    expect(() => sweepSolid({ ...base, path: [{ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }] })).toThrow(/at least two distinct points/)
  })

  test("a profile of fewer than three points is refused", () => {
    expect(() => sweepSolid({ ...base, ring: lift(sq.slice(0, 2)), ring2d: sq.slice(0, 2), path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 5 }] })).toThrow(/at least three points/)
  })

  test("a route that doubles back on itself cannot be swept (a RangeError; the message names a zero-length direction, not the dedicated 'doubles back' one)", () => {
    expect(() => sweepSolid({ ...base, path: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }] })).toThrow(RangeError)
  })

  test("a closed route needs three points", () => {
    expect(() => sweepSolid({ ...base, closed: true, path: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] })).toThrow(RangeError)
  })
})

describe("resampleRing", () => {
  const ring: P3[] = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }, { x: 0, y: 10, z: 0 }]

  test("n points, the first at the ring's first point, spaced a perimeter / n apart along the outline", () => {
    const out = resampleRing(ring, 8)
    expect(out).toHaveLength(8)
    expect(out[0]).toEqual(ring[0]!)
    const expected = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5]]
    out.forEach((p, i) => { expect(p.x).toBeCloseTo(expected[i]![0]!, 9); expect(p.y).toBeCloseTo(expected[i]![1]!, 9); expect(p.z).toBe(0) })
  })

  test("the spacing along the outline is uniform even when the corners do not line up with the samples", () => {
    const out = resampleRing(ring, 7)
    const step = 40 / 7
    // Arc distance of a point on the square outline, counter-clockwise from the origin.
    const arc = (p: P3): number => (p.y === 0 || Math.abs(p.y) < 1e-9 ? p.x : Math.abs(p.x - 10) < 1e-9 ? 10 + p.y : Math.abs(p.y - 10) < 1e-9 ? 20 + (10 - p.x) : 30 + (10 - p.y))
    out.forEach((p, i) => expect(arc(p)).toBeCloseTo(step * i, 6))
  })

  test("a ring of zero length is refused", () => {
    expect(() => resampleRing([{ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }], 8)).toThrow(RangeError)
  })
})

describe("loftSolid", () => {
  const sectionAt = (half: number, z: number) => ({ ring: lift(square(half), z) })

  test("two squares (half 10 at z=0, half 5 at z=30) make the frustum h/3 (A1 + A2 + sqrt(A1 A2)) = 7000, closed surface", () => {
    const mesh = loftSolid([sectionAt(10, 0), sectionAt(5, 30)])
    expect(meshVolume(mesh)).toBeCloseTo(7000, 4)
    expect(manifold(mesh)).toBe(true)
  })

  test("the order of the vertices, their direction and their starting point do not twist or flip the solid", () => {
    const base = square(5).map((p) => ({ x: p.x, y: p.y, z: 30 }))
    const rotated = [...base.slice(2), ...base.slice(0, 2)]
    for (const second of [base, [...base].reverse(), rotated, [...rotated].reverse()]) {
      const mesh = loftSolid([sectionAt(10, 0), { ring: second }])
      expect(meshVolume(mesh)).toBeCloseTo(7000, 3)
      expect(manifold(mesh)).toBe(true)
    }
  })

  test("a square end lofted to a circle: bigger than the cylinder of the circle, smaller than the prism of the square, and monotone in the radius", () => {
    const circle = (r: number): P3[] => lift(polygon2(96, r), 30)
    const v = (r: number) => meshVolume(loftSolid([sectionAt(10, 0), { ring: circle(r) }]))
    const v10 = v(10)
    expect(v10).toBeGreaterThan(Math.PI * 100 * 30 * 0.99 - 1e-9)
    expect(v10).toBeLessThan(20 * 20 * 30)
    expect(v(8)).toBeLessThan(v10)
    expect(v(6)).toBeLessThan(v(8))
  })

  test("a circle to a circle is a cone frustum: pi h/3 (R^2 + R r + r^2) of the inscribed polygons", () => {
    const n = 96
    const mesh = loftSolid([{ ring: lift(polygon2(n, 10), 0) }, { ring: lift(polygon2(n, 5), 30) }])
    const a1 = ngonArea(n, 10), a2 = ngonArea(n, 5)
    expect(mesh).toBeDefined()
    expect(rel(meshVolume(mesh), (30 / 3) * (a1 + a2 + Math.sqrt(a1 * a2)))).toBeLessThan(0.002)
  })

  test("`smooth` passes a Catmull-Rom curve through the sections: more rings, and the same solid when the sections are scaled linearly", () => {
    const sections = [sectionAt(10, 0), sectionAt(7.5, 15), sectionAt(5, 30)]
    const ruled = loftSolid(sections)
    const smooth = loftSolid(sections, { smooth: true })
    expect(smooth.positions.length).toBeGreaterThan(ruled.positions.length)
    expect(meshVolume(ruled)).toBeCloseTo(7000, 3)
    expect(rel(meshVolume(smooth), 7000)).toBeLessThan(0.001)
    expect(manifold(smooth)).toBe(true)
  })

  test("`samples` sets the points per section", () => {
    const coarse = loftSolid([sectionAt(10, 0), sectionAt(5, 30)], { samples: 16 })
    const fine = loftSolid([sectionAt(10, 0), sectionAt(5, 30)], { samples: 128 })
    expect(fine.positions.length).toBeGreaterThan(coarse.positions.length)
    expect(meshVolume(coarse)).toBeCloseTo(7000, 3)
  })

  test("fewer than two sections is a RangeError", () => {
    expect(() => loftSolid([sectionAt(10, 0)])).toThrow(RangeError)
    expect(() => loftSolid([])).toThrow(/at least two sections/)
  })

  test("a section of no length is refused", () => {
    expect(() => loftSolid([sectionAt(10, 0), { ring: [{ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 5 }] }])).toThrow(RangeError)
  })

  test("three sections that go out and back (a vase) are two frusta: 2 x 15/3 (100 + 400 + 200) = 7000, one closed solid", () => {
    const mesh = loftSolid([sectionAt(5, 0), sectionAt(10, 15), sectionAt(5, 30)])
    expect(meshVolume(mesh)).toBeCloseTo(7000, 3)
    expect(manifold(mesh)).toBe(true)
  })
})

describe("roundPath: the bends of a pipe route", () => {
  const dist = (a: P3, b: P3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  const L: P3[] = [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 100, z: 0 }]
  const length = (path: ReadonlyArray<P3>): number => path.slice(1).reduce((sum, p, i) => sum + dist(p, path[i]!), 0)

  test("a right angle with R30: the arc starts on the first run at 100 - 30 and ends on the second at 30, on a circle of radius 30 about (70, 30)", () => {
    const out = roundPath(L, 30)
    expect(out[0]).toEqual(L[0]!)
    expect(out[out.length - 1]).toEqual(L[2]!)
    const t1 = out[1]!, t2 = out[out.length - 2]!
    expect(t1.x).toBeCloseTo(70, 9); expect(t1.y).toBeCloseTo(0, 9)
    expect(t2.x).toBeCloseTo(100, 9); expect(t2.y).toBeCloseTo(30, 9)
    // Every point between the two tangent points is on the bend circle.
    for (const p of out.slice(1, -1)) expect(Math.hypot(p.x - 70, p.y - 30)).toBeCloseTo(30, 9)
    expect(out.every((p) => p.z === 0)).toBe(true)
  })

  test("the arc is a polyline within the 0.01 mm chord tolerance: its length is R x pi/2 less at most a part in a thousand, and the points are in order", () => {
    const out = roundPath(L, 30)
    const arc = out.slice(1, -1)
    expect(arc.length).toBeGreaterThan(10)
    expect(arc.length).toBeLessThanOrEqual(97)
    const arcLength = length(arc)
    expect(arcLength).toBeLessThan(30 * Math.PI / 2)
    expect(arcLength).toBeGreaterThan((30 * Math.PI / 2) * 0.999)
    // The sagitta of every chord is within the tolerance.
    for (let i = 1; i < arc.length; i++) {
      const mid = { x: (arc[i]!.x + arc[i - 1]!.x) / 2, y: (arc[i]!.y + arc[i - 1]!.y) / 2 }
      expect(30 - Math.hypot(mid.x - 70, mid.y - 30)).toBeLessThanOrEqual(0.0101)
    }
    // Total length: the two runs shortened by the setback, plus the arc.
    expect(length(out)).toBeCloseTo(100 - 30 + 100 - 30 + arcLength, 9)
  })

  test("tangent continuity: the first chord of the arc leaves along the first run (within half a step) and the last arrives along the second", () => {
    const out = roundPath(L, 30)
    const first = { x: out[2]!.x - out[1]!.x, y: out[2]!.y - out[1]!.y }
    const last = { x: out[out.length - 2]!.x - out[out.length - 3]!.x, y: out[out.length - 2]!.y - out[out.length - 3]!.y }
    const step = Math.PI / 2 / (out.length - 3 - 1 + 1)
    expect(Math.abs(Math.atan2(first.y, first.x))).toBeLessThanOrEqual(step)
    expect(Math.abs(Math.atan2(last.y, last.x) - Math.PI / 2)).toBeLessThanOrEqual(step)
  })

  test("a larger radius takes a longer arc and fewer straight points are needed: R60 on a 135 degree turn also sits on its own circle", () => {
    const path: P3[] = [{ x: 0, y: 0, z: 0 }, { x: 200, y: 0, z: 0 }, { x: 200 + 100 * Math.cos(Math.PI / 4), y: 100 * Math.sin(Math.PI / 4), z: 0 }]
    const out = roundPath(path, 60)
    const setback = 60 * Math.tan(Math.PI / 8) // the path turns 45 degrees
    expect(out[1]!.x).toBeCloseTo(200 - setback, 6)
    const centre = { x: 200 - setback, y: 60, z: 0 }
    for (const p of out.slice(1, -1)) expect(dist(p, centre)).toBeCloseTo(60, 6)
  })

  test("a bend in 3D keeps the arc in the plane of the two runs", () => {
    const path: P3[] = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }, { x: 100, y: 0, z: 100 }]
    for (const p of roundPath(path, 25)) expect(p.y).toBe(0)
  })

  test("a corner that turns less than 5 degrees is left a corner; a path of two points comes back as it is", () => {
    const shallow: P3[] = [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 200, y: 2, z: 0 }]
    expect(roundPath(shallow, 30)).toEqual(shallow)
    const two: P3[] = [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }]
    expect(roundPath(two, 30)).toEqual(two)
  })

  test("two bends that share a run: a U with a 60 mm run takes R30 exactly (2 x 30), and R31 needs 62 mm and names the run", () => {
    const U: P3[] = [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 100, y: 60, z: 0 }, { x: 0, y: 60, z: 0 }]
    const out = roundPath(U, 30)
    expect(out.length).toBeGreaterThan(40)
    expect(out[0]).toEqual(U[0]!)
    expect(out[out.length - 1]).toEqual(U[3]!)
    expect(() => roundPath(U, 31)).toThrow(RangeError)
    expect(() => roundPath(U, 31)).toThrow(/needs 62\.00 mm of the 60\.00 mm straight run 2/)
  })

  test("a bend too big for the first run names run 1", () => {
    expect(() => roundPath(L, 120)).toThrow(/needs 120\.00 mm of the 100\.00 mm straight run 1/)
  })

  test("a path that doubles back, and a radius of zero or less, are RangeErrors", () => {
    expect(() => roundPath([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0.0001 }], 5)).toThrow(/doubles back/)
    for (const radius of [0, -3, Number.NaN]) expect(() => roundPath(L, radius)).toThrow(RangeError)
    expect(() => roundPath(L, 0)).toThrow(/must be positive/)
  })

  test("a swept pipe along a rounded route has the Pappus volume: area x (70 + 70 + R x pi/2), within 0.3 %", () => {
    const n = 96, r = 10
    const ringYZ = Array.from({ length: n }, (_, k) => ({ x: 0, y: r * Math.cos((2 * Math.PI * k) / n), z: r * Math.sin((2 * Math.PI * k) / n) }))
    const mesh = sweepSolid({ ring: ringYZ, ring2d: polygon2(n, r), normal: { x: 1, y: 0, z: 0 }, centre: { x: 0, y: 0, z: 0 }, path: roundPath(L, 30), closed: false })
    expect(rel(meshVolume(mesh), ngonArea(n, r) * (70 + 70 + (Math.PI / 2) * 30))).toBeLessThan(0.003)
    expect(manifold(mesh)).toBe(true)
  })
})
