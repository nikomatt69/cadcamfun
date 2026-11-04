import { describe, expect, test } from "bun:test"
import { circleFrom3, fitCircle2, fitCircle3, fitLine2, fitPlane, fitSphere, isRefused, solveLinear } from "./fit.ts"

const rng = (seed: number) => {
  let s = seed
  const u = (): number => { s = (s * 1103515245 + 12345) % 2147483648; return (s + 0.5) / 2147483648 }
  return { u, gauss: (): number => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) }
}
const ok = <T extends object>(r: T | { readonly refused: string }): T => {
  if (isRefused(r)) throw new Error(r.refused)
  return r as T
}
const SIGMA = 0.001

describe("fits", () => {
  test("solveLinear", () => {
    expect(solveLinear([[2, 1], [1, 3]], [3, 5])!.map((v) => Number(v.toFixed(12)))).toEqual([0.8, 1.4])
    expect(solveLinear([[1, 2], [2, 4]], [1, 2])).toBeUndefined()
  })

  test("circle: exact, noisy within 3 sigma, degenerate refused", () => {
    const c = { x: 12.345, y: -6.789 }, r = 9.876
    const at = (a: number, n = 0) => ({ x: c.x + (r + n) * Math.cos(a), y: c.y + (r + n) * Math.sin(a) })
    const three = ok(circleFrom3(at(0.1), at(2.2), at(4.4)))
    expect(Math.abs(three.centre.x - c.x) + Math.abs(three.centre.y - c.y) + Math.abs(three.radius - r)).toBeLessThan(1e-9)
    const exact = ok(fitCircle2([0.3, 0.9, 1.4, 2.0, 2.6].map((a) => at(a))))
    expect(Math.abs(exact.centre.x - c.x) + Math.abs(exact.centre.y - c.y) + Math.abs(exact.radius - r)).toBeLessThan(1e-9)
    const g = rng(7)
    const n = 24
    const noisy = ok(fitCircle2(Array.from({ length: n }, (_, i) => at((i / n) * 2 * Math.PI, SIGMA * g.gauss()))))
    // centre std ~ sigma * sqrt(2/n), radius ~ sigma / sqrt(n)
    expect(Math.hypot(noisy.centre.x - c.x, noisy.centre.y - c.y)).toBeLessThan(3 * SIGMA * Math.sqrt(2 / n) * Math.SQRT2)
    expect(Math.abs(noisy.radius - r)).toBeLessThan(3 * SIGMA / Math.sqrt(n))
    expect(isRefused(circleFrom3({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }))).toBe(true)
    expect(isRefused(fitCircle2([{ x: 0, y: 0 }, { x: 1, y: 1 }]))).toBe(true)
    expect(isRefused(fitCircle2([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 3, y: 3 }, { x: 4, y: 4 }]))).toBe(true)
  })

  test("line", () => {
    const a = 0.3
    const pts = [0, 5, 10, 20].map((t) => ({ x: 3 + t * Math.cos(a), y: -1 + t * Math.sin(a) }))
    const l = ok(fitLine2(pts))
    expect(Math.abs(Math.abs(Math.atan2(l.direction.y, l.direction.x)) - a)).toBeLessThan(1e-12)
    expect(l.straightness).toBeLessThan(1e-12)
    expect(isRefused(fitLine2([{ x: 1, y: 1 }, { x: 1, y: 1 }]))).toBe(true)
  })

  test("plane with flatness", () => {
    const n = { x: 0.01, y: -0.02, z: 1 }
    const l = Math.hypot(n.x, n.y, n.z)
    const z = (x: number, y: number) => 5 - (n.x * x + n.y * y) / n.z
    const pts = [[0, 0], [50, 0], [50, 30], [0, 30], [25, 15]].map(([x, y]) => ({ x: x!, y: y!, z: z(x!, y!) }))
    const p = ok(fitPlane(pts))
    expect(Math.abs(p.normal.x - n.x / l) + Math.abs(p.normal.y - n.y / l) + Math.abs(p.normal.z - n.z / l)).toBeLessThan(1e-9)
    expect(p.flatness).toBeLessThan(1e-9)
    const bumped = ok(fitPlane(pts.map((q, i) => (i === 4 ? { ...q, z: q.z + 0.01 * n.z / l } : q))))
    expect(bumped.flatness).toBeGreaterThan(0.009)
    expect(bumped.flatness).toBeLessThan(0.0101)
    expect(isRefused(fitPlane([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 }]))).toBe(true)
  })

  test("sphere and circle in space", () => {
    const c = { x: 10, y: -20, z: 5 }, r = 12.7
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0.6, 0.48, 0.64], [-0.36, 0.8, 0.48]]
    const s = ok(fitSphere(dirs.map(([x, y, z]) => { const l = Math.hypot(x!, y!, z!); return { x: c.x + (r * x!) / l, y: c.y + (r * y!) / l, z: c.z + (r * z!) / l } })))
    expect(Math.abs(s.centre.x - c.x) + Math.abs(s.centre.y - c.y) + Math.abs(s.centre.z - c.z) + Math.abs(s.radius - r)).toBeLessThan(1e-9)
    expect(isRefused(fitSphere([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }]))).toBe(true)
    // a point turned about an axis through (1,2,3) along (0, sin t, cos t)
    const t = 0.2
    const axis = { x: 0, y: Math.sin(t), z: Math.cos(t) }
    const u = { x: 1, y: 0, z: 0 }, v = { x: 0, y: Math.cos(t), z: -Math.sin(t) }
    const ring = [0, 30, 60, 90, 120].map((deg) => { const a = (deg * Math.PI) / 180; return { x: 1 + 40 * (Math.cos(a) * u.x + Math.sin(a) * v.x) + 7 * axis.x, y: 2 + 40 * (Math.cos(a) * u.y + Math.sin(a) * v.y) + 7 * axis.y, z: 3 + 40 * (Math.cos(a) * u.z + Math.sin(a) * v.z) + 7 * axis.z } })
    const f = ok(fitCircle3(ring))
    expect(Math.abs(f.radius - 40)).toBeLessThan(1e-9)
    expect(Math.abs(Math.abs(f.normal.y) - axis.y) + Math.abs(Math.abs(f.normal.z) - axis.z)).toBeLessThan(1e-9)
    expect(Math.hypot(f.centre.x - (1 + 7 * axis.x), f.centre.y - (2 + 7 * axis.y), f.centre.z - (3 + 7 * axis.z))).toBeLessThan(1e-9)
  })
})
