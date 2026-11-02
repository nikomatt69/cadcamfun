import { describe, expect, test } from "bun:test"
import { makePair, measurePair } from "./ssi-gate.ts"
import { intersectPatches, nurbsRange } from "./ssi.ts"
import { surfaceDistance, surfacePoint } from "./geom.ts"

// Spec 42 R5. The full gate is `bun packages/core/src/cad/brep/ssi-gate.ts 0 200` (about 12 minutes on a loaded machine; the
// measured table is in spec 42 6.3). The suite runs the first 16 pairs of it: both kinds of B (analytic and NURBS), open and
// closed curves, rational patches.
describe("patch x patch intersection (R5 gate, first 16 of 200 pairs)", () => {
  const reports = Array.from({ length: 16 }, (_, i) => measurePair(makePair(i)))

  test("no branch of the dense-grid truth is missed and no curve is spurious", () => {
    expect(reports.filter((r) => r.missed > 0 || r.spurious > 0).map((r) => `#${r.seed - 1000} ${r.kind}`)).toEqual([])
  }, 300_000)

  test("every curve point is on both surfaces and the fitted curve stays within 1e-6 mm of both between the points", () => {
    expect(reports.filter((r) => r.worstError > 1e-6).map((r) => `#${r.seed - 1000} ${r.worstError.toExponential(2)}`)).toEqual([])
  })

  test("the pairs are not all empty: the truth has branches and the kernel returns curves for them", () => {
    expect(reports.filter((r) => r.truthBranches > 0).length).toBeGreaterThanOrEqual(12)
    expect(reports.every((r) => r.truthBranches === 0 || r.curves > 0)).toBe(true)
  })
})

describe("curves stop at the patch boundary", () => {
  test("a NURBS patch against a plane: every point inside the parameter rectangle and on both surfaces", () => {
    const pair = makePair(0)
    const curves = intersectPatches(pair.a, pair.ra, pair.b, pair.rb)
    expect(curves.length).toBeGreaterThan(0)
    const r = nurbsRange(pair.a)
    for (const c of curves) for (const q of c.points) {
      expect(q.ua).toBeGreaterThanOrEqual(r.u0)
      expect(q.ua).toBeLessThanOrEqual(r.u1)
      expect(q.va).toBeGreaterThanOrEqual(r.v0)
      expect(q.va).toBeLessThanOrEqual(r.v1)
      expect(surfaceDistance(pair.b, q.p)).toBeLessThan(1e-7)
      expect(Math.hypot(surfacePoint(pair.a, q.ua, q.va).x - q.p.x, surfacePoint(pair.a, q.ua, q.va).y - q.p.y, surfacePoint(pair.a, q.ua, q.va).z - q.p.z)).toBeLessThan(1e-7)
    }
  })
})
