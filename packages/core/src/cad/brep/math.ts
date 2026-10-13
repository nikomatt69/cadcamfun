/**
 * Numeric helpers of the exact B-rep kernel: right-handed frames (STEP's AXIS2_PLACEMENT_3D, SMLib's SmAxis2Placement),
 * small dense linear solves, and the quadrature rules the mass properties integrate with.
 *
 * The kernel's architecture follows SMLib (NVIDIA usd-brep, Apache-2.0): exact curve and surface geometry bound to a
 * face/loop/edge-use/edge/vertex topology, tolerances in model units (mm), and every algorithm checked against the
 * exact geometry rather than a mesh.
 */
import { add3, cross3, dot3, length3, normalize3, scale3, sub3, type Vec2, type Vec3 } from "../vec.ts"

export type { Vec2, Vec3 }

/** Default model tolerance (mm): two points closer than this are the same vertex. */
export const MODEL_TOL = 1e-6
/** Linear tolerance for geometry produced by numerical solvers (intersection curves, projections), mm. */
export const FIT_TOL = 1e-5
/** Angular tolerance, radians. */
export const ANGLE_TOL = 1e-9

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const X3: Vec3 = { x: 1, y: 0, z: 0 }
export const Y3: Vec3 = { x: 0, y: 1, z: 0 }
export const Z3: Vec3 = { x: 0, y: 0, z: 1 }
export const O3: Vec3 = { x: 0, y: 0, z: 0 }

/** `a + b * s`. */
export const madd3 = (a: Vec3, b: Vec3, s: number): Vec3 => ({ x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s })
export const neg3 = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z })
export const dist3 = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
export const near3 = (a: Vec3, b: Vec3, tol: number = MODEL_TOL): boolean => dist3(a, b) <= tol
export const mid3 = (a: Vec3, b: Vec3): Vec3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 })

/**
 * Default reference direction perpendicular to `n`: world X projected onto the plane normal to `n` (world Y when `n`
 * is nearly along X), as STEP's default ref_direction and every CAD placement dialog do.
 */
export const anyPerpendicular = (n: Vec3): Vec3 => {
  const u = normalize3(n)
  const helper = Math.abs(u.x) < 0.9 ? X3 : Y3
  return normalize3(sub3(helper, scale3(u, dot3(helper, u))))
}

/**
 * Right-handed orthonormal placement: `z` is the axis (normal), `x` the reference direction, `y = z × x`.
 * Plain data so it serialises unchanged.
 */
export interface Frame {
  readonly origin: Vec3
  readonly x: Vec3
  readonly y: Vec3
  readonly z: Vec3
}

/** Builds an orthonormal frame from an axis and an optional reference direction (projected to be perpendicular). */
export const frame = (origin: Vec3, axis: Vec3 = Z3, ref?: Vec3): Frame => {
  const z = normalize3(axis)
  if (length3(z) === 0) throw new RangeError("frame axis must be non-zero")
  let x = ref === undefined ? anyPerpendicular(z) : sub3(ref, scale3(z, dot3(ref, z)))
  if (length3(x) < 1e-12) x = anyPerpendicular(z)
  x = normalize3(x)
  return { origin, x, y: cross3(z, x), z }
}

export const WORLD: Frame = { origin: O3, x: X3, y: Y3, z: Z3 }

/** Point of local coordinates `(a, b, c)` in the frame. */
export const fromFrame = (f: Frame, a: number, b: number, c = 0): Vec3 => ({
  x: f.origin.x + f.x.x * a + f.y.x * b + f.z.x * c,
  y: f.origin.y + f.x.y * a + f.y.y * b + f.z.y * c,
  z: f.origin.z + f.x.z * a + f.y.z * b + f.z.z * c
})

/** Direction of local components `(a, b, c)`. */
export const dirFromFrame = (f: Frame, a: number, b: number, c = 0): Vec3 => ({
  x: f.x.x * a + f.y.x * b + f.z.x * c,
  y: f.x.y * a + f.y.y * b + f.z.y * c,
  z: f.x.z * a + f.y.z * b + f.z.z * c
})

/** Local coordinates of a world point. */
export const toFrame = (f: Frame, p: Vec3): Vec3 => {
  const d = sub3(p, f.origin)
  return { x: dot3(d, f.x), y: dot3(d, f.y), z: dot3(d, f.z) }
}

// ---------------------------------------------------------------- rigid transforms

/** Affine map `p -> R p + t`, with `R` a rotation (or a uniform scale times a rotation). Row-major 3×3. */
export interface Transform {
  readonly m: readonly [number, number, number, number, number, number, number, number, number]
  readonly t: Vec3
}

export const IDENTITY: Transform = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: O3 }

export const translation = (d: Vec3): Transform => ({ m: IDENTITY.m, t: d })

/** Rotation by `angle` about the line through `origin` along `axis` (right-hand rule). */
export const rotation = (axis: Vec3, angle: number, origin: Vec3 = O3): Transform => {
  const k = normalize3(axis)
  const c = Math.cos(angle), s = Math.sin(angle), C = 1 - c
  const m = [
    c + k.x * k.x * C, k.x * k.y * C - k.z * s, k.x * k.z * C + k.y * s,
    k.y * k.x * C + k.z * s, c + k.y * k.y * C, k.y * k.z * C - k.x * s,
    k.z * k.x * C - k.y * s, k.z * k.y * C + k.x * s, c + k.z * k.z * C
  ] as const
  const ro = applyLinear(m, origin)
  return { m, t: sub3(origin, ro) }
}

export const uniformScale = (factor: number, origin: Vec3 = O3): Transform => ({
  m: [factor, 0, 0, 0, factor, 0, 0, 0, factor],
  t: scale3(origin, 1 - factor)
})

const applyLinear = (m: Transform["m"], v: Vec3): Vec3 => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
  y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
  z: m[6] * v.x + m[7] * v.y + m[8] * v.z
})

export const applyPoint = (tr: Transform, p: Vec3): Vec3 => add3(applyLinear(tr.m, p), tr.t)
export const applyDir = (tr: Transform, v: Vec3): Vec3 => applyLinear(tr.m, v)
/** Uniform scale factor of the linear part (1 for a rotation). */
export const scaleOf = (tr: Transform): number => Math.cbrt(Math.abs(det3(tr.m)))
const det3 = (m: Transform["m"]): number =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])

/** `a` then `b`. */
export const compose = (a: Transform, b: Transform): Transform => {
  const A = a.m, B = b.m
  const m = [
    B[0] * A[0] + B[1] * A[3] + B[2] * A[6], B[0] * A[1] + B[1] * A[4] + B[2] * A[7], B[0] * A[2] + B[1] * A[5] + B[2] * A[8],
    B[3] * A[0] + B[4] * A[3] + B[5] * A[6], B[3] * A[1] + B[4] * A[4] + B[5] * A[7], B[3] * A[2] + B[4] * A[5] + B[5] * A[8],
    B[6] * A[0] + B[7] * A[3] + B[8] * A[6], B[6] * A[1] + B[7] * A[4] + B[8] * A[7], B[6] * A[2] + B[7] * A[5] + B[8] * A[8]
  ] as const
  return { m, t: applyPoint(b, a.t) }
}

/** Frame carried by a similarity transform; axes stay unit length. */
export const transformFrame = (tr: Transform, f: Frame): Frame => ({
  origin: applyPoint(tr, f.origin),
  x: normalize3(applyDir(tr, f.x)),
  y: normalize3(applyDir(tr, f.y)),
  z: normalize3(applyDir(tr, f.z))
})

// ---------------------------------------------------------------- linear algebra

/** Solves `A x = b` by Gaussian elimination with partial pivoting; `A` is n×n row-major. Throws on a singular matrix. */
export const solveDense = (A: ReadonlyArray<ReadonlyArray<number>>, b: ReadonlyArray<ReadonlyArray<number>>): number[][] => {
  const n = A.length
  const M = A.map((row) => [...row])
  const R = b.map((row) => [...row])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r
    if (Math.abs(M[piv]![col]!) < 1e-300) throw new RangeError("singular system")
    if (piv !== col) {
      ;[M[piv], M[col]] = [M[col]!, M[piv]!]
      ;[R[piv], R[col]] = [R[col]!, R[piv]!]
    }
    const pr = M[col]!, rr = R[col]!
    for (let r = col + 1; r < n; r++) {
      const row = M[r]!
      const f = row[col]! / pr[col]!
      if (f === 0) continue
      for (let c = col; c < n; c++) row[c] = row[c]! - f * pr[c]!
      const rrow = R[r]!
      for (let c = 0; c < rrow.length; c++) rrow[c] = rrow[c]! - f * rr[c]!
    }
  }
  const X: number[][] = R.map((row) => row.map(() => 0))
  for (let r = n - 1; r >= 0; r--) {
    const row = M[r]!
    for (let c = 0; c < X[r]!.length; c++) {
      let s = R[r]![c]!
      for (let k = r + 1; k < n; k++) s -= row[k]! * X[k]![c]!
      X[r]![c] = s / row[r]!
    }
  }
  return X
}

/** 2×2 solve; `undefined` when singular. */
export const solve2 = (a: number, b: number, c: number, d: number, e: number, f: number): readonly [number, number] | undefined => {
  const det = a * d - b * c
  if (Math.abs(det) < 1e-300) return undefined
  return [(e * d - b * f) / det, (a * f - e * c) / det]
}

// ---------------------------------------------------------------- quadrature

/** Gauss–Legendre nodes and weights on [-1, 1]. */
export const gaussLegendre = (n: number): { readonly x: ReadonlyArray<number>; readonly w: ReadonlyArray<number> } => {
  const cached = glCache.get(n)
  if (cached !== undefined) return cached
  const x: number[] = [], w: number[] = []
  for (let i = 1; i <= n; i++) {
    let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5))
    let pp = 0
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0
      for (let j = 1; j <= n; j++) {
        const p3 = p2
        p2 = p1
        p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j
      }
      pp = (n * (z * p1 - p2)) / (z * z - 1)
      const z1 = z
      z = z1 - p1 / pp
      if (Math.abs(z - z1) < 1e-15) break
    }
    x.push(z)
    w.push(2 / ((1 - z * z) * pp * pp))
  }
  const out = { x, w }
  glCache.set(n, out)
  return out
}
const glCache = new Map<number, { readonly x: ReadonlyArray<number>; readonly w: ReadonlyArray<number> }>()

/**
 * Dunavant's degree-8 rule on the reference triangle (16 points): barycentric `(a, b, c)` and weights summing to 1.
 * Exact for polynomials of total degree 8, which keeps the per-triangle error of the mass integrals far below the
 * trimming error.
 */
export const TRIANGLE_RULE: ReadonlyArray<readonly [number, number, number, number]> = (() => {
  const out: Array<readonly [number, number, number, number]> = []
  const push3 = (a: number, w: number) => {
    const b = (1 - a) / 2
    out.push([a, b, b, w], [b, a, b, w], [b, b, a, w])
  }
  const push6 = (a: number, b: number, w: number) => {
    const c = 1 - a - b
    out.push([a, b, c, w], [a, c, b, w], [b, a, c, w], [b, c, a, w], [c, a, b, w], [c, b, a, w])
  }
  out.push([1 / 3, 1 / 3, 1 / 3, 0.144315607677787])
  push3(0.081414823414554, 0.095091634267285)
  push3(0.658861384496480, 0.103217370534718)
  push3(0.898905543365938, 0.032458497623198)
  push6(0.008394777409958, 0.263112829634638, 0.027230314174435)
  return out
})()

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)

/** `x` wrapped into `[lo, lo + period)`. */
export const wrap = (x: number, lo: number, period: number): number => {
  const t = (x - lo) % period
  return lo + (t < 0 ? t + period : t)
}

/** The representative of `x` (mod `period`) closest to `ref`. */
export const unwrapNear = (x: number, ref: number, period: number): number => x + Math.round((ref - x) / period) * period

export { add3, cross3, dot3, length3, normalize3, scale3, sub3 }
