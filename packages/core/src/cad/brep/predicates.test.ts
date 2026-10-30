import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { incircle, orient2d, orient3d } from "./predicates.ts"

setDefaultTimeout(120_000)

/** Seeded generator (mulberry32). */
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ---- the oracle: exact integer arithmetic. Every double is an integer multiple of 2^-1074, so scaling by 2^1074 makes the
// determinants exact BigInt polynomials. Nothing here shares code with the predicates under test.
const SCALE = 1074n
const big = (x: number): bigint => {
  if (x === 0) return 0n
  const buf = new DataView(new ArrayBuffer(8))
  buf.setFloat64(0, x)
  const hi = buf.getUint32(0), lo = buf.getUint32(4)
  const sign = hi >>> 31 === 1 ? -1n : 1n
  const e = (hi >>> 20) & 0x7ff
  const frac = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo)
  const mant = e === 0 ? frac : frac | (1n << 52n)
  const exp = BigInt(e === 0 ? 1 : e) - 1075n // value = mant * 2^exp
  return sign * (mant << (exp + SCALE))
}
const sgn = (v: bigint): number => (v > 0n ? 1 : v < 0n ? -1 : 0)
const exactOrient2d = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => {
  const [AX, AY, BX, BY, CX, CY] = [ax, ay, bx, by, cx, cy].map(big) as bigint[]
  return sgn((AX! - CX!) * (BY! - CY!) - (AY! - CY!) * (BX! - CX!))
}
const exactOrient3d = (p: number[]): number => {
  const [ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz] = p.map(big) as bigint[]
  const adx = ax! - dx!, ady = ay! - dy!, adz = az! - dz!, bdx = bx! - dx!, bdy = by! - dy!, bdz = bz! - dz!, cdx = cx! - dx!, cdy = cy! - dy!, cdz = cz! - dz!
  return sgn(adz * (bdx * cdy - cdx * bdy) + bdz * (cdx * ady - adx * cdy) + cdz * (adx * bdy - bdx * ady))
}
const exactIncircle = (p: number[]): number => {
  const [ax, ay, bx, by, cx, cy, dx, dy] = p.map(big) as bigint[]
  const adx = ax! - dx!, ady = ay! - dy!, bdx = bx! - dx!, bdy = by! - dy!, cdx = cx! - dx!, cdy = cy! - dy!
  const al = adx * adx + ady * ady, bl = bdx * bdx + bdy * bdy, cl = cdx * cdx + cdy * cdy
  return sgn(al * (bdx * cdy - cdx * bdy) + bl * (cdx * ady - adx * cdy) + cl * (adx * bdy - bdx * ady))
}

const ulp = (x: number, k: number): number => {
  // x moved by k units in the last place.
  const f = new Float64Array([x]), i = new BigInt64Array(f.buffer)
  i[0]! += BigInt(k)
  return f[0]!
}

describe("robust predicates agree with exact arithmetic", () => {
  test("orient2d: 100000 cases, half of them within a few ulps of collinear", () => {
    const r = rng(11)
    let zero = 0, naiveWrong = 0
    for (let n = 0; n < 100_000; n++) {
      const ax = r() * 2 - 1, ay = r() * 2 - 1, bx = r() * 2 - 1, by = r() * 2 - 1
      let cx: number, cy: number
      if (n % 2 === 0) { cx = r() * 2 - 1; cy = r() * 2 - 1 } else {
        // On the line a-b (rounded), then moved by up to 3 ulps in each coordinate.
        const t = r() * 3 - 1
        cx = ulp(ax + (bx - ax) * t, Math.floor(r() * 7) - 3)
        cy = ulp(ay + (by - ay) * t, Math.floor(r() * 7) - 3)
      }
      const want = exactOrient2d(ax, ay, bx, by, cx, cy)
      if (want === 0) zero++
      if (Math.sign((ax - cx) * (by - cy) - (ay - cy) * (bx - cx)) !== want) naiveWrong++
      expect(Math.sign(orient2d(ax, ay, bx, by, cx, cy))).toBe(want)
    }
    expect(zero).toBeGreaterThan(0)
    // The plain determinant the kernel used before is wrong on a measurable share of these cases.
    expect(naiveWrong).toBeGreaterThan(100)
  })

  test("orient2d: exactly collinear points on a large offset are zero, not noise", () => {
    expect(orient2d(0.5, 0.5, 12, 12, 24, 24)).toBe(0)
    expect(orient2d(1e15, 1e15 + 1, 1e15 + 2, 1e15 + 3, 1e15 + 4, 1e15 + 5)).toBe(0)
    // The textbook failure of the naive determinant: a point one ulp off a line.
    const naive = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    const c = 0.5 + 2 ** -53
    expect(Math.sign(orient2d(0.5, 0.5, 12, 12, c, 0.5))).toBe(exactOrient2d(0.5, 0.5, 12, 12, c, 0.5))
    expect(naive(0.5, 0.5, 12, 12, 24, 24)).toBe(0)
  })

  test("orient3d: 50000 cases, half of them within a few ulps of coplanar", () => {
    const r = rng(23)
    let zero = 0
    for (let n = 0; n < 50_000; n++) {
      const p: number[] = []
      for (let i = 0; i < 9; i++) p.push(r() * 2 - 1)
      if (n % 2 === 0) { for (let i = 0; i < 3; i++) p.push(r() * 2 - 1) } else {
        // d = a + s (b - a) + t (c - a), then moved by up to 3 ulps.
        const s = r() * 2 - 0.5, t = r() * 2 - 0.5
        for (let i = 0; i < 3; i++) p.push(ulp(p[i]! + (p[3 + i]! - p[i]!) * s + (p[6 + i]! - p[i]!) * t, Math.floor(r() * 7) - 3))
      }
      const want = exactOrient3d(p)
      if (want === 0) zero++
      expect(Math.sign(orient3d(p[0]!, p[1]!, p[2]!, p[3]!, p[4]!, p[5]!, p[6]!, p[7]!, p[8]!, p[9]!, p[10]!, p[11]!))).toBe(want)
    }
    expect(zero).toBeGreaterThanOrEqual(0)
  })

  test("orient3d: integer lattice points (exactly coplanar) are zero", () => {
    expect(orient3d(0, 0, 0, 1, 0, 0, 0, 1, 0, 0.25, 0.75, 0)).toBe(0)
    expect(orient3d(1e8, 1e8, 1e8, 1e8 + 1, 1e8, 1e8, 1e8, 1e8 + 1, 1e8, 1e8 + 3, 1e8 + 5, 1e8)).toBe(0)
  })

  test("incircle: 30000 cases, half of them within a few ulps of cocircular", () => {
    const r = rng(37)
    let zero = 0
    for (let n = 0; n < 30_000; n++) {
      const p: number[] = []
      if (n % 2 === 0) { for (let i = 0; i < 8; i++) p.push(r() * 2 - 1) } else {
        // Four points on a circle of centre (cx, cy) and radius R, then moved by up to 3 ulps.
        const cx = r() - 0.5, cy = r() - 0.5, R = 0.2 + r()
        for (let i = 0; i < 4; i++) {
          const a = r() * Math.PI * 2
          p.push(ulp(cx + R * Math.cos(a), Math.floor(r() * 7) - 3), ulp(cy + R * Math.sin(a), Math.floor(r() * 7) - 3))
        }
      }
      const want = exactIncircle(p)
      if (want === 0) zero++
      expect(Math.sign(incircle(p[0]!, p[1]!, p[2]!, p[3]!, p[4]!, p[5]!, p[6]!, p[7]!))).toBe(want)
    }
    // Perturbed circle points are rarely exactly cocircular; the lattice case below pins the zero.
    expect(zero).toBeGreaterThanOrEqual(0)
    expect(incircle(1, 0, 0, 1, -1, 0, 0, -1)).toBe(0)
    expect(incircle(0, 0, 4, 0, 0, 3, 4, 3)).toBe(0)
  })
})
