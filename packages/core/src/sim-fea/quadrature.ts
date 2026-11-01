/**
 * Integration rules for the 10-node tetrahedron and the 6-node triangle (spec 48 §2 step 3).
 *
 * Tetrahedron points are barycentric `[L1, L2, L3, L4]`; weights sum to 1/6 (the volume of the reference tetrahedron), so a
 * physical integral is `6 · V · Σ w f`. Triangle weights sum to 1 (`A · Σ w f`).
 */
export interface TetRule {
  readonly points: ReadonlyArray<readonly [number, number, number, number]>
  readonly weights: Float64Array
}

export interface TriRule {
  readonly points: ReadonlyArray<readonly [number, number, number]>
  readonly weights: Float64Array
}

/** Gauss–Legendre nodes and weights on [0, 1], Newton on the Legendre polynomial. */
const gaussLegendre01 = (n: number): { x: number[]; w: number[] } => {
  const x: number[] = [], w: number[] = []
  for (let i = 0; i < n; i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5))
    let dp = 1
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = z
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2 }
      dp = n * (z * p1 - p0) / (z * z - 1)
      const dz = p1 / dp
      z -= dz
      if (Math.abs(dz) < 1e-15) break
    }
    x.push((1 - z) / 2)
    w.push(1 / ((1 - z * z) * dp * dp))
  }
  return { x, w }
}

/** Collapsed (conical) product rule: exact for polynomials up to degree `2n - 3` on the tetrahedron. */
export const conicalTetRule = (n: number): TetRule => {
  const g = gaussLegendre01(n)
  const points: Array<[number, number, number, number]> = []
  const weights: number[] = []
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const u = g.x[i]!, v = g.x[j]!, w = g.x[k]!
    const x = u, y = v * (1 - u), z = w * (1 - u) * (1 - v)
    points.push([1 - x - y - z, x, y, z])
    weights.push(g.w[i]! * g.w[j]! * g.w[k]! * (1 - u) * (1 - u) * (1 - v))
  }
  return { points, weights: Float64Array.from(weights) }
}

const A4 = 0.5854101966249685
const B4 = 0.1381966011250105

/** Four-point degree-2 rule: exact for the stiffness of a straight-sided quadratic tetrahedron. */
export const TET4: TetRule = {
  points: [[A4, B4, B4, B4], [B4, A4, B4, B4], [B4, B4, A4, B4], [B4, B4, B4, A4]],
  weights: Float64Array.from([1 / 24, 1 / 24, 1 / 24, 1 / 24])
}
/** 27-point rule (exact to degree 3): the thermal load and the geometric stiffness. */
export const TET27: TetRule = conicalTetRule(3)
/** 64-point rule (exact to degree 5): consistent mass and heat capacity. */
export const TET64: TetRule = conicalTetRule(4)

const TA = 0.445948490915965
const TB = 0.091576213509771
/** Six-point degree-4 triangle rule. */
export const TRI6: TriRule = {
  points: [
    [TA, TA, 1 - 2 * TA], [TA, 1 - 2 * TA, TA], [1 - 2 * TA, TA, TA],
    [TB, TB, 1 - 2 * TB], [TB, 1 - 2 * TB, TB], [1 - 2 * TB, TB, TB]
  ],
  weights: Float64Array.from([0.223381589678011, 0.223381589678011, 0.223381589678011, 0.109951743655322, 0.109951743655322, 0.109951743655322])
}
