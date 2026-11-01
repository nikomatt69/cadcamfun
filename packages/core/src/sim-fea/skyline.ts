/**
 * Direct solver for moderate systems: reverse Cuthill–McKee ordering and an envelope (profile) Cholesky factorisation.
 * Cost is `Σ w²` flops for row widths `w`; above the budget `preconditionerFor` falls back to incomplete Cholesky + CG.
 * Used as the preconditioner of `pcg`, so one or two iterations return the direct answer and the residual is still checked.
 */
import { type Csr, type Preconditioner, incompleteCholesky } from "./sparse.ts"

const FLOP_LIMIT = 6e9
const STORAGE_LIMIT = 30_000_000

const rcm = (a: Csr): Int32Array => {
  const n = a.n, degree = new Int32Array(n)
  for (let i = 0; i < n; i++) degree[i] = a.rowPtr[i + 1]! - a.rowPtr[i]!
  const order = new Int32Array(n), seen = new Uint8Array(n)
  let count = 0
  const byDegree = Array.from({ length: n }, (_, i) => i).sort((x, y) => degree[x]! - degree[y]!)
  for (const start of byDegree) {
    if (seen[start] === 1) continue
    seen[start] = 1
    let head = count
    order[count++] = start
    while (head < count) {
      const v = order[head++]!
      const next: number[] = []
      for (let q = a.rowPtr[v]!; q < a.rowPtr[v + 1]!; q++) { const w = a.col[q]!; if (seen[w] === 0) { seen[w] = 1; next.push(w) } }
      next.sort((x, y) => degree[x]! - degree[y]!)
      for (const w of next) order[count++] = w
    }
  }
  order.reverse()
  return order
}

export interface Envelope { readonly perm: Int32Array; readonly inv: Int32Array; readonly first: Int32Array; readonly ptr: Float64Array; readonly flops: number; readonly storage: number }

const envelope = (a: Csr): Envelope => {
  const n = a.n, perm = rcm(a), inv = new Int32Array(n)
  for (let i = 0; i < n; i++) inv[perm[i]!] = i
  const first = new Int32Array(n), ptr = new Float64Array(n + 1)
  let flops = 0
  for (let i = 0; i < n; i++) {
    let lo = i
    const old = perm[i]!
    for (let q = a.rowPtr[old]!; q < a.rowPtr[old + 1]!; q++) { const j = inv[a.col[q]!]!; if (j < lo) lo = j }
    first[i] = lo
    const w = i - lo + 1
    ptr[i + 1] = ptr[i]! + w
    flops += w * w
  }
  return { perm, inv, first, ptr, flops, storage: ptr[n]! }
}

export interface Direct { solve(b: Float64Array, x: Float64Array): void }

/** Envelope Cholesky of `a`; `undefined` when a pivot is not safely positive (singular or indefinite). */
export const factorEnvelope = (a: Csr, env: Envelope = envelope(a)): Direct | undefined => {
  const n = a.n, { perm, inv, first, ptr } = env
  const L = new Float64Array(env.storage)
  for (let i = 0; i < n; i++) {
    const old = perm[i]!
    for (let q = a.rowPtr[old]!; q < a.rowPtr[old + 1]!; q++) { const j = inv[a.col[q]!]!; if (j <= i) L[ptr[i]! + (j - first[i]!)] = a.val[q]! }
  }
  const diagonal = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const fi = first[i]!, base = ptr[i]! - fi
    diagonal[i] = L[ptr[i + 1]! - 1]!
    for (let j = fi; j < i; j++) {
      const fj = first[j]!, bj = ptr[j]! - fj
      let s = L[base + j]!
      for (let k = Math.max(fi, fj); k < j; k++) s -= L[base + k]! * L[bj + k]!
      L[base + j] = s / L[ptr[j + 1]! - 1]!
    }
    let d = L[ptr[i + 1]! - 1]!
    for (let k = fi; k < i; k++) d -= L[base + k]! * L[base + k]!
    if (!(d > 1e-15 * Math.abs(diagonal[i]!))) return undefined
    L[ptr[i + 1]! - 1] = Math.sqrt(d)
  }
  const y = new Float64Array(n)
  return {
    solve: (b, x) => {
      for (let i = 0; i < n; i++) {
        const fi = first[i]!, base = ptr[i]! - fi
        let s = b[perm[i]!]!
        for (let k = fi; k < i; k++) s -= L[base + k]! * y[k]!
        y[i] = s / L[ptr[i + 1]! - 1]!
      }
      for (let i = n - 1; i >= 0; i--) {
        const fi = first[i]!, base = ptr[i]! - fi
        const xi = y[i]! / L[ptr[i + 1]! - 1]!
        x[perm[i]!] = xi
        for (let k = fi; k < i; k++) y[k]! -= L[base + k]! * xi
      }
    }
  }
}

/** Direct factorisation when it fits the budget (an exact preconditioner), incomplete Cholesky otherwise. */
export const preconditionerFor = (a: Csr): Preconditioner => {
  const env = envelope(a)
  if (env.flops <= FLOP_LIMIT && env.storage <= STORAGE_LIMIT) {
    const direct = factorEnvelope(a, env)
    if (direct !== undefined) return { apply: (r, z) => direct.solve(r, z) }
  }
  return incompleteCholesky(a)
}
