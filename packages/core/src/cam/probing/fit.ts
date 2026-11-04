/**
 * Geometry fits of measured points (spec 73 §5.5): what a host computes from touches the control reported (more touches than a
 * macro can fit, the rotary calibration, the inspection report). Exact for exact input; least squares otherwise. A degenerate input
 * (too few points, collinear, coincident) is refused with the reason, never fitted to a guess.
 */
import type { Vec2, Vec3 } from "../../cad/vec.ts"

export type Fit<T> = T | { readonly refused: string }
export const isRefused = <T extends object>(r: Fit<T>): r is { readonly refused: string } => "refused" in r

/** Gaussian elimination with partial pivoting; undefined for a singular matrix. `a` is row-major n x n. */
export const solveLinear = (a: ReadonlyArray<ReadonlyArray<number>>, b: ReadonlyArray<number>): number[] | undefined => {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]!])
  const scale = Math.max(1e-300, ...a.flat().map(Math.abs))
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r
    if (Math.abs(m[p]![c]!) <= 1e-13 * scale) return undefined
    ;[m[c], m[p]] = [m[p]!, m[c]!]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = m[r]![c]! / m[c]![c]!
      if (f === 0) continue
      for (let k = c; k <= n; k++) m[r]![k] = m[r]![k]! - f * m[c]![k]!
    }
  }
  return m.map((row, i) => row[n]! / row[i]!)
}

export interface Circle2 { readonly centre: Vec2; readonly radius: number }
export interface Circle2Fit extends Circle2 { readonly rms: number; readonly residuals: ReadonlyArray<number> }

/** The circle through three points (circumcircle), refused when they are collinear. */
export const circleFrom3 = (a: Vec2, b: Vec2, c: Vec2): Fit<Circle2> => {
  const bx = b.x - a.x, by = b.y - a.y, cx = c.x - a.x, cy = c.y - a.y
  const d = 2 * (bx * cy - by * cx)
  const size = Math.max(Math.hypot(bx, by), Math.hypot(cx, cy))
  if (Math.abs(d) <= 1e-12 * size * size) return { refused: "the three points are collinear: no circle passes through them" }
  const b2 = bx * bx + by * by, c2 = cx * cx + cy * cy
  const ux = (cy * b2 - by * c2) / d, uy = (bx * c2 - cx * b2) / d
  return { centre: { x: a.x + ux, y: a.y + uy }, radius: Math.hypot(ux, uy) }
}

const residualsOf = (pts: ReadonlyArray<Vec2>, c: Circle2): number[] => pts.map((p) => Math.hypot(p.x - c.centre.x, p.y - c.centre.y) - c.radius)
const rmsOf = (r: ReadonlyArray<number>): number => Math.sqrt(r.reduce((s, v) => s + v * v, 0) / Math.max(1, r.length))

/**
 * Least-squares circle: the algebraic (Kasa) fit as the start, then Gauss-Newton on the geometric distances, which removes Kasa's
 * bias on a short arc. Needs three points not all on a line.
 */
export const fitCircle2 = (pts: ReadonlyArray<Vec2>): Fit<Circle2Fit> => {
  if (pts.length < 3) return { refused: "a circle needs at least three points" }
  // Centre the data for conditioning.
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const q = pts.map((p) => ({ x: p.x - mx, y: p.y - my }))
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, sz = 0, sxz = 0, syz = 0
  for (const p of q) {
    const z = p.x * p.x + p.y * p.y
    sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y; sx += p.x; sy += p.y; sz += z; sxz += p.x * z; syz += p.y * z
  }
  // x^2 + y^2 + D x + E y + F = 0
  const sol = solveLinear([[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, q.length]], [-sxz, -syz, -sz])
  if (sol === undefined) return { refused: "the points are collinear: no circle fits them" }
  let cx = -sol[0]! / 2, cy = -sol[1]! / 2
  let r = Math.sqrt(Math.max(0, cx * cx + cy * cy - sol[2]!))
  if (!Number.isFinite(r) || r <= 0) return { refused: "the points do not describe a circle" }
  for (let it = 0; it < 50; it++) {
    // J rows: d(dist - r)/d(cx, cy, r) = (-(x-cx)/d, -(y-cy)/d, -1)
    let a11 = 0, a12 = 0, a13 = 0, a22 = 0, a23 = 0, a33 = 0, g1 = 0, g2 = 0, g3 = 0
    for (const p of q) {
      const dx = p.x - cx, dy = p.y - cy
      const d = Math.hypot(dx, dy)
      if (d === 0) continue
      const j1 = -dx / d, j2 = -dy / d, j3 = -1
      const e = d - r
      a11 += j1 * j1; a12 += j1 * j2; a13 += j1 * j3; a22 += j2 * j2; a23 += j2 * j3; a33 += j3 * j3
      g1 += j1 * e; g2 += j2 * e; g3 += j3 * e
    }
    const step = solveLinear([[a11, a12, a13], [a12, a22, a23], [a13, a23, a33]], [-g1, -g2, -g3])
    if (step === undefined) break
    cx += step[0]!; cy += step[1]!; r += step[2]!
    if (Math.hypot(step[0]!, step[1]!, step[2]!) <= 1e-15 * Math.max(1, r)) break
  }
  const circle = { centre: { x: cx + mx, y: cy + my }, radius: r }
  const residuals = residualsOf(pts, circle)
  return { ...circle, rms: rmsOf(residuals), residuals }
}

/** Symmetric 3x3 eigen-decomposition by Jacobi rotations: eigenvalues ascending with their unit eigenvectors (columns). */
export const jacobiEigen3 = (m: ReadonlyArray<ReadonlyArray<number>>): { readonly values: [number, number, number]; readonly vectors: [Vec3, Vec3, Vec3] } => {
  const a = m.map((r) => [...r])
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let sweep = 0; sweep < 64; sweep++) {
    const off = Math.abs(a[0]![1]!) + Math.abs(a[0]![2]!) + Math.abs(a[1]![2]!)
    if (off <= 1e-300) break
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      const apq = a[p]![q]!
      if (Math.abs(apq) <= 1e-300) continue
      const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq)
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1), s = t * c
      for (let k = 0; k < 3; k++) {
        const akp = a[k]![p]!, akq = a[k]![q]!
        a[k]![p] = c * akp - s * akq
        a[k]![q] = s * akp + c * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p]![k]!, aqk = a[q]![k]!
        a[p]![k] = c * apk - s * aqk
        a[q]![k] = s * apk + c * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k]![p]!, vkq = v[k]![q]!
        v[k]![p] = c * vkp - s * vkq
        v[k]![q] = s * vkp + c * vkq
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[i]![i]! - a[j]![j]!)
  const vec = (i: number): Vec3 => ({ x: v[0]![i]!, y: v[1]![i]!, z: v[2]![i]! })
  return { values: [a[order[0]!]![order[0]!]!, a[order[1]!]![order[1]!]!, a[order[2]!]![order[2]!]!], vectors: [vec(order[0]!), vec(order[1]!), vec(order[2]!)] }
}

export interface Line2Fit { readonly point: Vec2; readonly direction: Vec2; readonly rms: number; readonly straightness: number }

/** Total least-squares line (principal axis); `straightness` is the spread of the distances to it. Needs two distinct points. */
export const fitLine2 = (pts: ReadonlyArray<Vec2>): Fit<Line2Fit> => {
  if (pts.length < 2) return { refused: "a line needs at least two points" }
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length, my = pts.reduce((s, p) => s + p.y, 0) / pts.length
  let sxx = 0, sxy = 0, syy = 0
  for (const p of pts) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy }
  if (sxx + syy <= 1e-24) return { refused: "the points coincide: no line through them" }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const direction = { x: Math.cos(angle), y: Math.sin(angle) }
  const d = pts.map((p) => -(p.x - mx) * direction.y + (p.y - my) * direction.x)
  return { point: { x: mx, y: my }, direction, rms: rmsOf(d), straightness: Math.max(...d) - Math.min(...d) }
}

export interface PlaneFit {
  readonly point: Vec3
  /** Unit normal, pointing to +Z (or +X / +Y for a vertical plane). */
  readonly normal: Vec3
  /** Spread of the signed distances to the plane: max - min. */
  readonly flatness: number
  readonly rms: number
}

/** Total least-squares plane (smallest eigenvector of the scatter, Jacobi). Needs three points not on a line. */
export const fitPlane = (pts: ReadonlyArray<Vec3>): Fit<PlaneFit> => {
  if (pts.length < 3) return { refused: "a plane needs at least three points" }
  const n = pts.length
  const c = { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n, z: pts.reduce((s, p) => s + p.z, 0) / n }
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (const p of pts) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i]![j] = m[i]![j]! + d[i]! * d[j]!
  }
  const e = jacobiEigen3(m)
  const spread = e.values[2]
  if (e.values[1] <= 1e-18 * Math.max(1e-300, spread)) return { refused: "the points are on a line: no plane is defined" }
  let normal = e.vectors[0]
  const lead = Math.abs(normal.z) > 1e-9 ? normal.z : Math.abs(normal.x) > 1e-9 ? normal.x : normal.y
  if (lead < 0) normal = { x: -normal.x, y: -normal.y, z: -normal.z }
  const d = pts.map((p) => (p.x - c.x) * normal.x + (p.y - c.y) * normal.y + (p.z - c.z) * normal.z)
  return { point: c, normal, flatness: Math.max(...d) - Math.min(...d), rms: rmsOf(d) }
}

export interface SphereFit { readonly centre: Vec3; readonly radius: number; readonly rms: number }

/** Least-squares sphere (algebraic, then Gauss-Newton on the distances). Needs four points not on one plane. */
export const fitSphere = (pts: ReadonlyArray<Vec3>): Fit<SphereFit> => {
  if (pts.length < 4) return { refused: "a sphere needs at least four points" }
  const n = pts.length
  const mean = { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n, z: pts.reduce((s, p) => s + p.z, 0) / n }
  const q = pts.map((p) => ({ x: p.x - mean.x, y: p.y - mean.y, z: p.z - mean.z }))
  // x^2+y^2+z^2 + D x + E y + F z + G = 0
  const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
  const B = [0, 0, 0, 0]
  for (const p of q) {
    const row = [p.x, p.y, p.z, 1]
    const w = -(p.x * p.x + p.y * p.y + p.z * p.z)
    for (let i = 0; i < 4; i++) { B[i] = B[i]! + row[i]! * w; for (let j = 0; j < 4; j++) A[i]![j] = A[i]![j]! + row[i]! * row[j]! }
  }
  const s = solveLinear(A, B)
  if (s === undefined) return { refused: "the points are on one plane: no sphere is defined" }
  let cx = -s[0]! / 2, cy = -s[1]! / 2, cz = -s[2]! / 2
  let r = Math.sqrt(Math.max(0, cx * cx + cy * cy + cz * cz - s[3]!))
  if (!(r > 0)) return { refused: "the points do not describe a sphere" }
  for (let it = 0; it < 50; it++) {
    const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
    const g = [0, 0, 0, 0]
    for (const p of q) {
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz
      const d = Math.hypot(dx, dy, dz)
      if (d === 0) continue
      const j = [-dx / d, -dy / d, -dz / d, -1]
      const e = d - r
      for (let a = 0; a < 4; a++) { g[a] = g[a]! + j[a]! * e; for (let b = 0; b < 4; b++) M[a]![b] = M[a]![b]! + j[a]! * j[b]! }
    }
    const step = solveLinear(M, g.map((v) => -v))
    if (step === undefined) break
    cx += step[0]!; cy += step[1]!; cz += step[2]!; r += step[3]!
    if (Math.hypot(...step) <= 1e-15 * Math.max(1, r)) break
  }
  const centre = { x: cx + mean.x, y: cy + mean.y, z: cz + mean.z }
  const res = pts.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y, p.z - centre.z) - r)
  return { centre, radius: r, rms: rmsOf(res) }
}

export interface Circle3Fit { readonly centre: Vec3; readonly normal: Vec3; readonly radius: number; readonly rms: number }

/** A circle in space (the path of a point turned about an axis): the plane fit, then the circle fit in that plane. */
export const fitCircle3 = (pts: ReadonlyArray<Vec3>): Fit<Circle3Fit> => {
  const plane = fitPlane(pts)
  if (isRefused(plane)) return { refused: `the points do not span a circle: ${plane.refused}` }
  const n = plane.normal
  const helper = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
  const ux0 = { x: helper.y * n.z - helper.z * n.y, y: helper.z * n.x - helper.x * n.z, z: helper.x * n.y - helper.y * n.x }
  const ul = Math.hypot(ux0.x, ux0.y, ux0.z)
  const u = { x: ux0.x / ul, y: ux0.y / ul, z: ux0.z / ul }
  const v = { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x }
  const c = plane.point
  const flat = pts.map((p) => { const d = { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z }; return { x: d.x * u.x + d.y * u.y + d.z * u.z, y: d.x * v.x + d.y * v.y + d.z * v.z } })
  const circle = fitCircle2(flat)
  if (isRefused(circle)) return circle
  const centre = { x: c.x + circle.centre.x * u.x + circle.centre.y * v.x, y: c.y + circle.centre.x * u.y + circle.centre.y * v.y, z: c.z + circle.centre.x * u.z + circle.centre.y * v.z }
  const off = pts.map((p) => (p.x - c.x) * n.x + (p.y - c.y) * n.y + (p.z - c.z) * n.z)
  const rms = Math.sqrt((circle.rms ** 2 * pts.length + off.reduce((s, d) => s + d * d, 0)) / pts.length)
  return { centre, normal: n, radius: circle.radius, rms }
}
