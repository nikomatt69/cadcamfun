/**
 * Non-uniform rational B-splines, after Piegl & Tiller, "The NURBS Book" (algorithm numbers in the comments).
 * Curves and surfaces of any dimension are evaluated with their derivatives; rational ones through the homogeneous
 * form. Everything is plain data (arrays of numbers) so it serialises and round-trips through STEP unchanged.
 */
import { solveDense } from "./math.ts"

/** A NURBS curve in `points[0].length` dimensions. `weights` absent means polynomial. Knots are full (clamped or not). */
export interface NurbsCurveData {
  readonly degree: number
  readonly knots: ReadonlyArray<number>
  readonly points: ReadonlyArray<ReadonlyArray<number>>
  readonly weights?: ReadonlyArray<number>
}

/** Tensor-product NURBS surface; `points[i][j]` is control point i along u, j along v. */
export interface NurbsSurfaceData {
  readonly degreeU: number
  readonly degreeV: number
  readonly knotsU: ReadonlyArray<number>
  readonly knotsV: ReadonlyArray<number>
  readonly points: ReadonlyArray<ReadonlyArray<ReadonlyArray<number>>>
  readonly weights?: ReadonlyArray<ReadonlyArray<number>>
}

// The evaluators run hundreds of thousands of times per mass integration or tessellation: plain loops, not Array.from /
// fill / map / slice, whose callbacks and copies dominated the cost.
const zeros = (n: number): number[] => { const a = new Array<number>(n); for (let i = 0; i < n; i++) a[i] = 0; return a }
const grid = (r: number, c: number): number[][] => { const a = new Array<number[]>(r); for (let i = 0; i < r; i++) a[i] = zeros(c); return a }
const head = (a: ReadonlyArray<number>, n: number, divisor = 1): number[] => { const o = new Array<number>(n); for (let i = 0; i < n; i++) o[i] = a[i]! / divisor; return o }

/** A2.1: knot span index of `u` for `n + 1` control points. */
export const findSpan = (n: number, p: number, u: number, U: ReadonlyArray<number>): number => {
  if (u >= U[n + 1]!) return n
  if (u <= U[p]!) return p
  let low = p, high = n + 1, mid = (low + high) >> 1
  while (u < U[mid]! || u >= U[mid + 1]!) {
    if (u < U[mid]!) high = mid
    else low = mid
    mid = (low + high) >> 1
  }
  return mid
}

/** A2.2: the `p + 1` non-vanishing basis functions at `u`. */
export const basisFuns = (i: number, u: number, p: number, U: ReadonlyArray<number>): number[] => {
  const N = zeros(p + 1)
  const left = zeros(p + 1)
  const right = zeros(p + 1)
  N[0] = 1
  for (let j = 1; j <= p; j++) {
    left[j] = u - U[i + 1 - j]!
    right[j] = U[i + j]! - u
    let saved = 0
    for (let r = 0; r < j; r++) {
      const denom = right[r + 1]! + left[j - r]!
      const temp = denom === 0 ? 0 : N[r]! / denom
      N[r] = saved + right[r + 1]! * temp
      saved = left[j - r]! * temp
    }
    N[j] = saved
  }
  return N
}

/** A2.3: basis functions and their derivatives up to order `n`; `ders[k][j]` is the k-th derivative of N_{i-p+j}. */
export const dersBasisFuns = (i: number, u: number, p: number, n: number, U: ReadonlyArray<number>): number[][] => {
  const ndu: number[][] = grid(p + 1, p + 1)
  const left = zeros(p + 1)
  const right = zeros(p + 1)
  ndu[0]![0] = 1
  for (let j = 1; j <= p; j++) {
    left[j] = u - U[i + 1 - j]!
    right[j] = U[i + j]! - u
    let saved = 0
    for (let r = 0; r < j; r++) {
      ndu[j]![r] = right[r + 1]! + left[j - r]!
      const temp = ndu[j]![r] === 0 ? 0 : ndu[r]![j - 1]! / ndu[j]![r]!
      ndu[r]![j] = saved + right[r + 1]! * temp
      saved = left[j - r]! * temp
    }
    ndu[j]![j] = saved
  }
  const ders: number[][] = grid(n + 1, p + 1)
  for (let j = 0; j <= p; j++) ders[0]![j] = ndu[j]![p]!
  const a: number[][] = [zeros(p + 1), zeros(p + 1)]
  for (let r = 0; r <= p; r++) {
    let s1 = 0, s2 = 1
    a[0]![0] = 1
    for (let k = 1; k <= n; k++) {
      let d = 0
      const rk = r - k, pk = p - k
      if (r >= k) {
        a[s2]![0] = ndu[pk + 1]![rk] === 0 ? 0 : a[s1]![0]! / ndu[pk + 1]![rk]!
        d = a[s2]![0]! * ndu[rk]![pk]!
      }
      const j1 = rk >= -1 ? 1 : -rk
      const j2 = r - 1 <= pk ? k - 1 : p - r
      for (let j = j1; j <= j2; j++) {
        const den = ndu[pk + 1]![rk + j]!
        a[s2]![j] = den === 0 ? 0 : (a[s1]![j]! - a[s1]![j - 1]!) / den
        d += a[s2]![j]! * ndu[rk + j]![pk]!
      }
      if (r <= pk) {
        const den = ndu[pk + 1]![r]!
        a[s2]![k] = den === 0 ? 0 : -a[s1]![k - 1]! / den
        d += a[s2]![k]! * ndu[r]![pk]!
      }
      ders[k]![r] = d
      ;[s1, s2] = [s2, s1]
    }
  }
  let r = p
  for (let k = 1; k <= n; k++) {
    for (let j = 0; j <= p; j++) ders[k]![j] = ders[k]![j]! * r
    r *= p - k
  }
  return ders
}

const binom = (n: number, k: number): number => {
  let r = 1
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i
  return r
}

export const curveDomain = (c: NurbsCurveData): readonly [number, number] => [c.knots[c.degree]!, c.knots[c.points.length]!]

/**
 * Point and derivatives up to order `d` of a (rational) curve: `out[k]` is the k-th derivative (A3.2 + A4.2).
 */
export const nurbsCurveDerivs = (c: NurbsCurveData, u: number, d: number): number[][] => {
  const p = c.degree
  const n = c.points.length - 1
  const dim = c.points[0]!.length
  const du = Math.min(d, p)
  const span = findSpan(n, p, u, c.knots)
  const nders = dersBasisFuns(span, u, p, du, c.knots)
  const w = c.weights
  // Homogeneous derivatives Aw (dim coords) and w.
  const CK: number[][] = grid(d + 1, dim + 1)
  for (let k = 0; k <= du; k++) {
    const row = CK[k]!
    for (let j = 0; j <= p; j++) {
      const idx = span - p + j
      const P = c.points[idx]!
      const wi = w === undefined ? 1 : w[idx]!
      const N = nders[k]![j]!
      for (let q = 0; q < dim; q++) row[q] = row[q]! + N * P[q]! * wi
      row[dim] = row[dim]! + N * wi
    }
  }
  if (w === undefined) { const o: number[][] = []; for (const row of CK) o.push(head(row, dim)); return o }
  const out: number[][] = []
  for (let k = 0; k <= d; k++) {
    const v = head(CK[k]!, dim)
    for (let i = 1; i <= k; i++) {
      const b = binom(k, i) * CK[i]![dim]!
      const prev = out[k - i]!
      for (let q = 0; q < dim; q++) v[q] = v[q]! - b * prev[q]!
    }
    const w0 = CK[0]![dim]!
    out.push(head(v, dim, w0))
  }
  return out
}

export const nurbsCurvePoint = (c: NurbsCurveData, u: number): number[] => nurbsCurveDerivs(c, u, 0)[0]!

export const surfaceDomain = (s: NurbsSurfaceData): readonly [number, number, number, number] => [
  s.knotsU[s.degreeU]!,
  s.knotsU[s.points.length]!,
  s.knotsV[s.degreeV]!,
  s.knotsV[s.points[0]!.length]!
]

/**
 * Surface derivatives `SKL[k][l]` = ∂^{k+l} S / ∂u^k ∂v^l for k + l ≤ d (A3.6 + A4.4).
 */
export const nurbsSurfaceDerivs = (s: NurbsSurfaceData, u: number, v: number, d: number): number[][][] => {
  const p = s.degreeU, q = s.degreeV
  const n = s.points.length - 1, m = s.points[0]!.length - 1
  const dim = s.points[0]![0]!.length
  const du = Math.min(d, p), dv = Math.min(d, q)
  const uspan = findSpan(n, p, u, s.knotsU)
  const vspan = findSpan(m, q, v, s.knotsV)
  const Nu = dersBasisFuns(uspan, u, p, du, s.knotsU)
  const Nv = dersBasisFuns(vspan, v, q, dv, s.knotsV)
  const W = s.weights
  const H: number[][][] = []; for (let i = 0; i <= d; i++) H.push(grid(d + 1, dim + 1))
  for (let k = 0; k <= du; k++) {
    // temp[sv] = Σ_r Nu[k][r] Pw[uspan-p+r][vspan-q+sv]
    const temp: number[][] = grid(q + 1, dim + 1)
    for (let sv = 0; sv <= q; sv++) {
      const t = temp[sv]!
      for (let r = 0; r <= p; r++) {
        const i = uspan - p + r, j = vspan - q + sv
        const P = s.points[i]![j]!
        const wi = W === undefined ? 1 : W[i]![j]!
        const N = Nu[k]![r]!
        for (let c = 0; c < dim; c++) t[c] = t[c]! + N * P[c]! * wi
        t[dim] = t[dim]! + N * wi
      }
    }
    const dd = Math.min(d - k, dv)
    for (let l = 0; l <= dd; l++) {
      const h = H[k]![l]!
      for (let sv = 0; sv <= q; sv++) {
        const N = Nv[l]![sv]!
        const t = temp[sv]!
        for (let c = 0; c <= dim; c++) h[c] = h[c]! + N * t[c]!
      }
    }
  }
  if (W === undefined) { for (const row of H) for (let l = 0; l < row.length; l++) row[l] = head(row[l]!, dim); return H }
  const S: number[][][] = []; for (let i = 0; i <= d; i++) S.push(grid(d + 1, dim))
  for (let k = 0; k <= d; k++) {
    for (let l = 0; l <= d - k; l++) {
      const v2 = head(H[k]![l]!, dim)
      for (let j = 1; j <= l; j++) {
        const b = binom(l, j) * H[0]![j]![dim]!
        const prev = S[k]![l - j]!
        for (let c = 0; c < dim; c++) v2[c] = v2[c]! - b * prev[c]!
      }
      for (let i = 1; i <= k; i++) {
        const b = binom(k, i) * H[i]![0]![dim]!
        const prev = S[k - i]![l]!
        for (let c = 0; c < dim; c++) v2[c] = v2[c]! - b * prev[c]!
        const v3 = zeros(dim)
        for (let j = 1; j <= l; j++) {
          const b2 = binom(l, j) * H[i]![j]![dim]!
          const pr = S[k - i]![l - j]!
          for (let c = 0; c < dim; c++) v3[c] = v3[c]! + b2 * pr[c]!
        }
        const bk = binom(k, i)
        for (let c = 0; c < dim; c++) v2[c] = v2[c]! - bk * v3[c]!
      }
      const w0 = H[0]![0]![dim]!
      S[k]![l] = head(v2, dim, w0)
    }
  }
  return S
}

/** Uniform clamped knot vector for `count` control points of degree `p` on [0, 1]. */
export const clampedUniformKnots = (count: number, p: number): number[] => {
  const knots: number[] = []
  const spans = count - p
  for (let i = 0; i <= p; i++) knots.push(0)
  for (let i = 1; i < spans; i++) knots.push(i / spans)
  for (let i = 0; i <= p; i++) knots.push(1)
  return knots
}

/**
 * A9.1: global interpolation through `pts` with chord-length parameters and averaged knots (degree `p`, clamped).
 * Returns the curve and the parameter of each data point.
 */
export const interpolateCurve = (
  pts: ReadonlyArray<ReadonlyArray<number>>,
  p = 3
): { readonly curve: NurbsCurveData; readonly params: ReadonlyArray<number> } => {
  const n = pts.length - 1
  if (n < 1) throw new RangeError("interpolation needs at least two points")
  const deg = Math.min(p, n)
  const dims = pts[0]!.length
  const chord: number[] = [0]
  for (let i = 1; i <= n; i++) {
    let s = 0
    for (let c = 0; c < dims; c++) s += (pts[i]![c]! - pts[i - 1]![c]!) ** 2
    chord.push(chord[i - 1]! + Math.sqrt(s))
  }
  const total = chord[n]!
  if (total === 0) throw new RangeError("interpolation points coincide")
  const params = chord.map((c) => c / total)
  const knots: number[] = []
  for (let i = 0; i <= deg; i++) knots.push(0)
  for (let j = 1; j <= n - deg; j++) {
    let s = 0
    for (let i = j; i < j + deg; i++) s += params[i]!
    knots.push(s / deg)
  }
  for (let i = 0; i <= deg; i++) knots.push(1)
  const A: number[][] = []
  for (let i = 0; i <= n; i++) {
    const row = new Array<number>(n + 1).fill(0)
    const span = findSpan(n, deg, params[i]!, knots)
    const N = basisFuns(span, params[i]!, deg, knots)
    for (let j = 0; j <= deg; j++) row[span - deg + j] = N[j]!
    A.push(row)
  }
  const ctrl = solveDense(A, pts)
  return { curve: { degree: deg, knots, points: ctrl }, params }
}

/** A5.1 (curve knot insertion, `r` times at `u`). */
export const insertKnot = (c: NurbsCurveData, u: number, r = 1): NurbsCurveData => {
  const p = c.degree
  const n = c.points.length - 1
  const U = c.knots
  const k = findSpan(n, p, u, U)
  let s = 0
  for (const x of U) if (x === u) s++
  if (r + s > p) r = p - s
  if (r <= 0) return c
  const dim = c.points[0]!.length
  const W = c.weights
  const Pw = c.points.map((P, i) => {
    const w = W === undefined ? 1 : W[i]!
    return [...P.map((x) => x * w), w]
  })
  const UQ = [...U.slice(0, k + 1), ...new Array<number>(r).fill(u), ...U.slice(k + 1)]
  const Qw: number[][] = new Array(n + 1 + r)
  for (let i = 0; i <= k - p; i++) Qw[i] = Pw[i]!
  for (let i = k - s; i <= n; i++) Qw[i + r] = Pw[i]!
  const Rw: number[][] = []
  for (let i = 0; i <= p - s; i++) Rw[i] = [...Pw[k - p + i]!]
  let L = 0
  for (let j = 1; j <= r; j++) {
    L = k - p + j
    for (let i = 0; i <= p - j - s; i++) {
      const alpha = (u - U[L + i]!) / (U[i + k + 1]! - U[L + i]!)
      Rw[i] = Rw[i + 1]!.map((x, q) => alpha * x + (1 - alpha) * Rw[i]![q]!)
    }
    Qw[L] = Rw[0]!
    Qw[k + r - j - s] = Rw[p - j - s]!
  }
  for (let i = L + 1; i < k - s; i++) Qw[i] = Rw[i - L]!
  const points = Qw.map((q) => q.slice(0, dim).map((x) => x / q[dim]!))
  return W === undefined ? { degree: p, knots: UQ, points } : { degree: p, knots: UQ, points, weights: Qw.map((q) => q[dim]!) }
}

/** The part of a clamped curve on `[a, b]`, re-clamped by knot insertion (exact). */
export const subCurve = (c: NurbsCurveData, a: number, b: number): NurbsCurveData => {
  const p = c.degree
  const split = (curve: NurbsCurveData, u: number, keep: "left" | "right"): NurbsCurveData => {
    let mult = 0
    for (const x of curve.knots) if (x === u) mult++
    const full = insertKnot(curve, u, p - mult)
    // After insertion the curve passes through a control point at u; cut the knot vector there.
    const K = full.knots
    let first = -1
    for (let i = 0; i < K.length; i++) if (K[i] === u) { first = i; break }
    if (keep === "left") {
      const knots = [...K.slice(0, first + p), u]
      const count = knots.length - p - 1
      const points = full.points.slice(0, count)
      return full.weights === undefined ? { degree: p, knots, points } : { degree: p, knots, points, weights: full.weights.slice(0, count) }
    }
    const knots = [u, ...K.slice(first)]
    const count = knots.length - p - 1
    const start = full.points.length - count
    const points = full.points.slice(start)
    return full.weights === undefined ? { degree: p, knots, points } : { degree: p, knots, points, weights: full.weights.slice(start) }
  }
  const [lo, hi] = curveDomain(c)
  let out = c
  if (b < hi) out = split(out, b, "left")
  if (a > lo) out = split(out, a, "right")
  return out
}

/** Rational quadratic arc of `sweep` ≤ 2π as control points in the plane (x, y), weights and knots (A7.1). */
export const arcControl = (
  radius: number,
  start: number,
  sweep: number
): { readonly points: number[][]; readonly weights: number[]; readonly knots: number[] } => {
  const narcs = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9))
  const dtheta = sweep / narcs
  const w1 = Math.cos(dtheta / 2)
  const points: number[][] = [[radius * Math.cos(start), radius * Math.sin(start)]]
  const weights = [1]
  let angle = start
  for (let i = 0; i < narcs; i++) {
    const mid = angle + dtheta / 2
    const r = radius / w1
    points.push([r * Math.cos(mid), r * Math.sin(mid)])
    weights.push(w1)
    angle += dtheta
    points.push([radius * Math.cos(angle), radius * Math.sin(angle)])
    weights.push(1)
  }
  const knots = [0, 0, 0]
  for (let i = 1; i < narcs; i++) knots.push(i / narcs, i / narcs)
  knots.push(1, 1, 1)
  return { points, weights, knots }
}
