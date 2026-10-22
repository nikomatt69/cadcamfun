import { describe, expect, test } from "bun:test"
import { curveDomain, nurbsCurvePoint } from "./brep/nurbs.ts"
import { controlledCurves, ellipseCurves, sampleNominalCurves } from "./sketch-curves.ts"
import { evaluateSpline } from "./spline.ts"

describe("nominal curve conversion and conservative sampling", () => {
  test("open and periodic B-splines preserve the independently evaluated source curve", () => {
    const points = [{ x: 0, y: 0 }, { x: 4, y: 9 }, { x: 13, y: 8 }, { x: 20, y: 0 }, { x: 7, y: -5 }, { x: 1, y: -7 }, { x: -5, y: -3 }, { x: -9, y: 1 }, { x: -3, y: 7 }]
    for (const closed of [false, true]) for (const degree of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const spans = controlledCurves("nurbs", points, closed, degree)
      for (let k = 0; k <= 100; k++) {
        const t = k / 100, index = Math.min(spans.length - 1, Math.floor(t * spans.length))
        const span = spans[index]!, [a, b] = curveDomain(span)
        const actual = nurbsCurvePoint(span, a + (b - a) * (t * spans.length - index))
        const expected = evaluateSpline(points, degree, closed, t)
        expect(actual[0]!).toBeCloseTo(expected.x, 9)
        expect(actual[1]!).toBeCloseTo(expected.y, 9)
      }
    }
  })

  test("sampling resolves an S curve whose midpoint lies exactly on its endpoint chord", () => {
    const curves = controlledCurves("bezier", [{ x: 0, y: 0 }, { x: 3, y: 10 }, { x: 7, y: -10 }, { x: 10, y: 0 }], false, 3)
    const sampled = sampleNominalCurves(curves, 0.01)
    expect(sampled.length).toBeGreaterThan(10)
    expect(Math.max(...sampled.map((p) => p.y))).toBeGreaterThan(2)
    expect(Math.min(...sampled.map((p) => p.y))).toBeLessThan(-2)
  })

  test("a tighter tolerance refines the same curve and invalid budgets are rejected", () => {
    const ellipse = ellipseCurves({ x: 0, y: 0 }, 10, 2)
    expect(sampleNominalCurves(ellipse, 0.001).length).toBeGreaterThan(sampleNominalCurves(ellipse, 0.1).length)
    for (const tolerance of [0, -1, NaN, Infinity]) expect(() => sampleNominalCurves(ellipse, tolerance)).toThrow("tolerance")
    expect(() => sampleNominalCurves(ellipse, 1e-30)).toThrow("budget")
  })
})
