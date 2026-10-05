import { describe, expect, test } from "bun:test"
import { baseEntity, type SplineEntity } from "../src/cad/entities.ts"
import { evaluateSpline, splinePolyline } from "../src/cad/spline.ts"
import { ellipsePoints, ellipseSegmentCount, tessellate } from "../src/cad/tessellate.ts"
import type { Vec2 } from "../src/cad/vec.ts"
import { makeRng, pointSeg } from "./cam/fixtures.ts"

const distanceToPolyline = (p: Vec2, poly: ReadonlyArray<Vec2>, closed: boolean): number => {
  let best = Infinity
  const n = closed ? poly.length : poly.length - 1
  for (let i = 0; i < n; i++) best = Math.min(best, pointSeg(p, poly[i]!, poly[(i + 1) % poly.length]!))
  return best
}

describe("splinePolyline", () => {
  test("property: every point of the true curve is within the tolerance of the polyline", () => {
    const rng = makeRng(99)
    for (let trial = 0; trial < 40; trial++) {
      const degree = 1 + Math.floor(rng() * 5)
      const closed = rng() < 0.4
      const count = degree + 1 + Math.floor(rng() * 6)
      const cps: Vec2[] = Array.from({ length: count }, () => ({ x: rng() * 100, y: rng() * 100 }))
      const tol = [0.5, 0.05, 0.005][trial % 3]!
      const poly = splinePolyline(cps, degree, closed, tol)
      for (let k = 0; k <= 1500; k++) {
        const p = evaluateSpline(cps, degree, closed, k / 1500)
        expect(distanceToPolyline(p, poly, closed)).toBeLessThanOrEqual(tol + 1e-9)
      }
    }
  })

  test("a repeated interior knot (a corner) is respected span by span", () => {
    const cps: Vec2[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 20 }, { x: 30, y: 0 }, { x: 40, y: 0 }]
    // Degree 2, interior knot 0.5 with multiplicity 2: the curve touches the middle control point.
    const knots = [0, 0, 0, 0.5, 0.5, 1, 1, 1]
    const poly = splinePolyline(cps, 2, false, 0.01, knots)
    expect(poly.some((p) => Math.hypot(p.x - 20, p.y - 20) < 1e-9)).toBe(true)
    for (let k = 0; k <= 800; k++) {
      expect(distanceToPolyline(evaluateSpline(cps, 2, false, k / 800, knots), poly, false)).toBeLessThanOrEqual(0.01 + 1e-9)
    }
  })

  test("a degree-1 spline is its control polyline", () => {
    const cps: Vec2[] = [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }]
    expect(splinePolyline(cps, 1, false, 0.001)).toEqual(cps)
  })

  test("open splines end exactly on the last control point, closed ones do not repeat the start", () => {
    const cps: Vec2[] = [{ x: 0, y: 0 }, { x: 5, y: 8 }, { x: 10, y: 0 }]
    const open = splinePolyline(cps, 2, false, 0.01)
    expect(open.at(-1)!.x).toBeCloseTo(10, 9)
    const ring = splinePolyline([{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }], 3, true, 0.01)
    expect(Math.hypot(ring[0]!.x - ring.at(-1)!.x, ring[0]!.y - ring.at(-1)!.y)).toBeGreaterThan(1e-6)
  })

  test("tessellate uses it: a tighter tolerance means more points", () => {
    const s: SplineEntity = { ...baseEntity("s"), _tag: "Spline", controlPoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }], degree: 2, closed: false }
    expect(tessellate(s, 0.001)[0]!.length).toBeGreaterThan(tessellate(s, 1)[0]!.length)
  })
})

describe("ellipse tessellation", () => {
  test("property: the polygon stays within the tolerance, even for very flat ellipses", () => {
    const rng = makeRng(5)
    for (let trial = 0; trial < 30; trial++) {
      const rx = 1 + rng() * 99
      const ry = rx / (1 + rng() * 199)
      const rot = rng() * 6
      const tol = [0.1, 0.01][trial % 2]!
      const n = ellipseSegmentCount(rx, ry, tol)
      const poly = ellipsePoints({ x: 3, y: -2 }, rx, ry, rot, n)
      const c = Math.cos(rot)
      const s = Math.sin(rot)
      for (let k = 0; k < 2000; k++) {
        const t = (k / 2000) * 2 * Math.PI
        const x = rx * Math.cos(t)
        const y = ry * Math.sin(t)
        const p = { x: 3 + x * c - y * s, y: -2 + x * s + y * c }
        expect(distanceToPolyline(p, poly, true)).toBeLessThanOrEqual(tol + 1e-9)
      }
    }
  })
})
