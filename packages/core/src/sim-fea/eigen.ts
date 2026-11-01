/**
 * Generalised eigenproblems for modal and buckling studies: block inverse (subspace) iteration with Rayleigh–Ritz on the
 * `p`-dimensional subspace. Dense `p × p` pieces use a Cholesky reduction and cyclic Jacobi rotations.
 */
import { type Csr, type Preconditioner, matvec, pcg } from "./sparse.ts"

/** Cyclic Jacobi on a symmetric `n × n` matrix; returns eigenvalues and eigenvectors (columns of `v`, row-major). */
export const jacobiEigen = (a: Float64Array, n: number): { values: Float64Array; vectors: Float64Array } => {
  const A = Float64Array.from(a), V = new Float64Array(n * n)
  for (let i = 0; i < n; i++) V[i * n + i] = 1
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i * n + j]! * A[i * n + j]!
    if (off < 1e-26) break
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      const apq = A[p * n + q]!
      if (Math.abs(apq) < 1e-300) continue
      const theta = (A[q * n + q]! - A[p * n + p]!) / (2 * apq)
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1), s = t * c
      for (let k = 0; k < n; k++) { const akp = A[k * n + p]!, akq = A[k * n + q]!; A[k * n + p] = c * akp - s * akq; A[k * n + q] = s * akp + c * akq }
      for (let k = 0; k < n; k++) { const apk = A[p * n + k]!, aqk = A[q * n + k]!; A[p * n + k] = c * apk - s * aqk; A[q * n + k] = s * apk + c * aqk }
      for (let k = 0; k < n; k++) { const vkp = V[k * n + p]!, vkq = V[k * n + q]!; V[k * n + p] = c * vkp - s * vkq; V[k * n + q] = s * vkp + c * vkq }
    }
  }
  const values = new Float64Array(n)
  for (let i = 0; i < n; i++) values[i] = A[i * n + i]!
  return { values, vectors: V }
}

/** Lower Cholesky factor of an SPD `n × n` matrix, or `undefined` when it is not positive definite. */
const cholesky = (a: Float64Array, n: number): Float64Array | undefined => {
  const L = new Float64Array(n * n)
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = a[i * n + j]!
    for (let k = 0; k < j; k++) s -= L[i * n + k]! * L[j * n + k]!
    if (i === j) { if (!(s > 0)) return undefined; L[i * n + i] = Math.sqrt(s) } else L[i * n + j] = s / L[j * n + j]!
  }
  return L
}

/** Solves `T z = μ S z` for SPD `S`: `μ` and `z` (columns, S-orthonormal), unsorted. */
export const denseGeneralised = (s: Float64Array, t: Float64Array, n: number): { values: Float64Array; vectors: Float64Array } | undefined => {
  const L = cholesky(s, n)
  if (L === undefined) return undefined
  // C = L⁻¹ T L⁻ᵀ
  const Y = new Float64Array(n * n), C = new Float64Array(n * n)
  for (let c = 0; c < n; c++) for (let i = 0; i < n; i++) { let v = t[i * n + c]!; for (let k = 0; k < i; k++) v -= L[i * n + k]! * Y[k * n + c]!; Y[i * n + c] = v / L[i * n + i]! }
  for (let r = 0; r < n; r++) for (let i = 0; i < n; i++) { let v = Y[r * n + i]!; for (let k = 0; k < i; k++) v -= L[i * n + k]! * C[r * n + k]!; C[r * n + i] = v / L[i * n + i]! }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const m = (C[i * n + j]! + C[j * n + i]!) / 2; C[i * n + j] = m; C[j * n + i] = m }
  const e = jacobiEigen(C, n)
  // z = L⁻ᵀ v
  const Z = new Float64Array(n * n)
  for (let c = 0; c < n; c++) for (let i = n - 1; i >= 0; i--) { let v = e.vectors[i * n + c]!; for (let k = i + 1; k < n; k++) v -= L[k * n + i]! * Z[k * n + c]!; Z[i * n + c] = v / L[i * n + i]! }
  return { values: e.values, vectors: Z }
}

export interface SubspaceInput {
  /** SPD operator that is inverted (shifted `K`, or `K` for buckling), with the Dirichlet rows already identity. */
  readonly a: Csr
  readonly pre: Preconditioner
  /** Applies the right-hand operator `B x` (mass, or `-Kg`) with fixed unknowns zeroed. */
  readonly applyB: (x: Float64Array, y: Float64Array) => void
  readonly free: Uint8Array
  readonly count: number
  /** Rigid-body vectors to project out (free-free modal): made B-orthonormal here. */
  readonly deflate?: ReadonlyArray<Float64Array>
  /** Which end to keep: smallest `θ` of `A z = θ B z` (modal) or largest `1/λ` (buckling). */
  readonly mode: "smallest" | "largest-positive"
  readonly shouldStop?: () => boolean
  readonly onIteration?: (iteration: number) => void
}

export interface SubspaceResult {
  /** Eigenvalues of `A x = θ B x` ordered as requested. */
  readonly values: number[]
  readonly vectors: Float64Array[]
  readonly iterations: number
  readonly converged: boolean
  readonly stopped: boolean
}

/** Block inverse iteration for `A x = θ B x`. Returns the `count` eigenpairs at the requested end of the spectrum. */
export const subspaceIteration = (input: SubspaceInput): SubspaceResult | undefined => {
  const { a, pre, applyB, free } = input, n = a.n
  const freeCount = free.reduce((s, v) => s + v, 0)
  const p = Math.min(Math.max(input.count + Math.max(4, input.count), 6), 24, freeCount - (input.deflate?.length ?? 0))
  if (p < 1) return undefined
  const basis: Float64Array[] = []
  const bq = new Float64Array(n)
  const project = (x: Float64Array): void => {
    for (const q of basis) { applyB(x, bq); let c = 0; for (let i = 0; i < n; i++) c += q[i]! * bq[i]!; for (let i = 0; i < n; i++) x[i]! -= c * q[i]! }
  }
  for (const v of input.deflate ?? []) {
    const q = Float64Array.from(v)
    project(q); project(q)
    applyB(q, bq)
    let norm = 0
    for (let i = 0; i < n; i++) norm += q[i]! * bq[i]!
    if (norm > 1e-20) { const s = 1 / Math.sqrt(norm); for (let i = 0; i < n; i++) q[i]! *= s; basis.push(q) }
  }
  let seed = 12345
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5 }
  let X: Float64Array[] = Array.from({ length: p }, () => { const v = new Float64Array(n); for (let i = 0; i < n; i++) if (free[i] === 1) v[i] = rnd(); project(v); return v })
  const tmp = new Float64Array(n), by = new Float64Array(n)
  let previous: number[] = [], values: number[] = []
  let iterations = 0, converged = false, stopped = false
  for (; iterations < 60; iterations++) {
    if (input.shouldStop?.() === true) { stopped = true; break }
    input.onIteration?.(iterations)
    const Y: Float64Array[] = []
    for (let k = 0; k < p; k++) {
      applyB(X[k]!, by)
      const y = Float64Array.from(X[k]!)
      const r = pcg(a, by, y, pre, { tolerance: 1e-11, maxIterations: 4000, ...(input.shouldStop !== undefined ? { shouldStop: input.shouldStop } : {}) })
      if (r.stopped) { stopped = true; break }
      if (!r.converged) return undefined
      project(y)
      Y.push(y)
    }
    if (stopped) break
    // Rayleigh–Ritz: A_r = Yᵀ A Y, B_r = Yᵀ B Y
    const Ar = new Float64Array(p * p), Br = new Float64Array(p * p)
    for (let j = 0; j < p; j++) {
      matvec(a, Y[j]!, tmp); applyB(Y[j]!, by)
      for (let i = 0; i < p; i++) { let sa = 0, sb = 0; const yi = Y[i]!; for (let q = 0; q < n; q++) { sa += yi[q]! * tmp[q]!; sb += yi[q]! * by[q]! } Ar[i * p + j] = sa; Br[i * p + j] = sb }
    }
    const small = input.mode === "smallest" ? denseGeneralised(Br, Ar, p) : denseGeneralised(Ar, Br, p)
    if (small === undefined) return undefined
    // modal: Ar z = θ Br z, ascending θ.  buckling: Br z = μ Ar z with μ = 1/θ-like (θ = 1/μ), largest positive μ first.
    const order = Array.from({ length: p }, (_, i) => i)
    const theta = (i: number) => input.mode === "smallest" ? small.values[i]! : (small.values[i]! > 0 ? 1 / small.values[i]! : Infinity)
    order.sort((i, j) => theta(i) - theta(j))
    const next: Float64Array[] = []
    values = []
    for (const idx of order) {
      const x = new Float64Array(n)
      for (let k = 0; k < p; k++) { const z = small.vectors[k * p + idx]!; if (z !== 0) { const yk = Y[k]!; for (let q = 0; q < n; q++) x[q]! += z * yk[q]! } }
      next.push(x); values.push(theta(idx))
    }
    X = next
    const shown = values.slice(0, input.count)
    if (previous.length === shown.length && shown.every((v, i) => Math.abs(v - previous[i]!) <= 1e-9 * Math.max(1e-30, Math.abs(v)))) { converged = true; iterations++; break }
    previous = shown
  }
  return { values: values.slice(0, input.count), vectors: X.slice(0, input.count), iterations, converged, stopped }
}
