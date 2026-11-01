/**
 * Sparse symmetric matrices (CSR with the full pattern), the Dirichlet reduction, an incomplete Cholesky preconditioner and
 * preconditioned conjugate gradients. Pure functions on typed arrays; the caller polls `shouldStop` for cancellation.
 */
export interface Csr {
  readonly n: number
  readonly rowPtr: Int32Array
  readonly col: Int32Array
  val: Float64Array
}

/** Pattern of a matrix assembled from elements: `nodesPerElement` nodes each, `dpn` unknowns per node. */
export const buildPattern = (nodeCount: number, dpn: number, elements: Uint32Array, npe: number): Csr => {
  const adj: Array<Set<number>> = Array.from({ length: nodeCount }, () => new Set<number>())
  const ne = elements.length / npe
  for (let e = 0; e < ne; e++) for (let a = 0; a < npe; a++) {
    const na = elements[e * npe + a]!
    for (let b = 0; b < npe; b++) adj[na]!.add(elements[e * npe + b]!)
  }
  const n = nodeCount * dpn
  const rowPtr = new Int32Array(n + 1)
  const sorted = adj.map((s) => Int32Array.from(s).sort())
  for (let i = 0; i < nodeCount; i++) for (let c = 0; c < dpn; c++) rowPtr[i * dpn + c + 1] = rowPtr[i * dpn + c]! + sorted[i]!.length * dpn
  const col = new Int32Array(rowPtr[n]!)
  for (let i = 0; i < nodeCount; i++) for (let c = 0; c < dpn; c++) {
    let p = rowPtr[i * dpn + c]!
    for (const j of sorted[i]!) for (let d = 0; d < dpn; d++) col[p++] = j * dpn + d
  }
  return { n, rowPtr, col, val: new Float64Array(col.length) }
}

export const zeroLike = (a: Csr): Csr => ({ n: a.n, rowPtr: a.rowPtr, col: a.col, val: new Float64Array(a.val.length) })

const find = (a: Csr, row: number, col: number): number => {
  let lo = a.rowPtr[row]!, hi = a.rowPtr[row + 1]! - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, c = a.col[mid]!
    if (c === col) return mid
    if (c < col) lo = mid + 1; else hi = mid - 1
  }
  throw new Error(`sparse: entry (${row}, ${col}) is outside the pattern`)
}

/** Adds a dense element matrix `ke` (`m × m`, row-major) at the unknown indices `dofs`. */
export const addElement = (a: Csr, dofs: ArrayLike<number>, ke: Float64Array, m: number): void => {
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) a.val[find(a, dofs[i]!, dofs[j]!)]! += ke[i * m + j]!
}

export const matvec = (a: Csr, x: Float64Array, y: Float64Array): void => {
  for (let i = 0; i < a.n; i++) {
    let s = 0
    for (let p = a.rowPtr[i]!, e = a.rowPtr[i + 1]!; p < e; p++) s += a.val[p]! * x[a.col[p]!]!
    y[i] = s
  }
}

export const diagonal = (a: Csr): Float64Array => {
  const d = new Float64Array(a.n)
  for (let i = 0; i < a.n; i++) d[i] = a.val[find(a, i, i)]!
  return d
}

/** `alpha · A + beta · B` on the shared pattern. */
export const combine = (a: Csr, alpha: number, b: Csr, beta: number): Csr => {
  const val = new Float64Array(a.val.length)
  for (let i = 0; i < val.length; i++) val[i] = alpha * a.val[i]! + beta * b.val[i]!
  return { n: a.n, rowPtr: a.rowPtr, col: a.col, val }
}

/**
 * Applies Dirichlet values by elimination: the right-hand side loses `K[:, fixed] · value`, and the rows and columns of fixed
 * unknowns become identity rows. Returns the reduced matrix and right-hand side; `k` itself is untouched (reactions need it).
 */
export const applyDirichlet = (k: Csr, rhs: Float64Array, fixed: Uint8Array, values: Float64Array): { a: Csr; b: Float64Array } => {
  const b = Float64Array.from(rhs)
  const val = new Float64Array(k.val)
  for (let i = 0; i < k.n; i++) {
    for (let p = k.rowPtr[i]!, e = k.rowPtr[i + 1]!; p < e; p++) {
      const j = k.col[p]!
      if (fixed[i] === 1) { val[p] = i === j ? 1 : 0; continue }
      if (fixed[j] === 1) { b[i]! -= k.val[p]! * values[j]!; val[p] = 0 }
    }
    if (fixed[i] === 1) b[i] = values[i]!
  }
  return { a: { n: k.n, rowPtr: k.rowPtr, col: k.col, val }, b }
}

export interface Preconditioner { apply(r: Float64Array, z: Float64Array): void }

/** Jacobi (diagonal) preconditioner. */
export const jacobi = (a: Csr): Preconditioner => {
  const d = diagonal(a)
  for (let i = 0; i < d.length; i++) d[i] = d[i]! > 0 ? 1 / d[i]! : 1
  return { apply: (r, z) => { for (let i = 0; i < r.length; i++) z[i] = r[i]! * d[i]! } }
}

/** Incomplete Cholesky IC(0) with a growing diagonal shift when a pivot goes non-positive; falls back to Jacobi. */
export const incompleteCholesky = (a: Csr): Preconditioner => {
  const n = a.n
  // lower triangle (including the diagonal) as its own CSR; columns are ascending because the pattern is sorted
  const lp = new Int32Array(n + 1)
  for (let i = 0; i < n; i++) {
    let c = 0
    for (let p = a.rowPtr[i]!, e = a.rowPtr[i + 1]!; p < e; p++) if (a.col[p]! <= i) c++
    lp[i + 1] = lp[i]! + c
  }
  const lc = new Int32Array(lp[n]!), base = new Float64Array(lp[n]!)
  for (let i = 0; i < n; i++) {
    let q = lp[i]!
    for (let p = a.rowPtr[i]!, e = a.rowPtr[i + 1]!; p < e; p++) if (a.col[p]! <= i) { lc[q] = a.col[p]!; base[q] = a.val[p]!; q++ }
  }
  for (let shift = 0, tries = 0; tries < 8; tries++, shift = shift === 0 ? 1e-4 : shift * 10) {
    const lv = Float64Array.from(base)
    let ok = true
    for (let i = 0; i < n && ok; i++) {
      const rs = lp[i]!, re = lp[i + 1]! - 1
      for (let p = rs; p < re; p++) {
        const j = lc[p]!
        // sum over k < j common to rows i and j
        let s = lv[p]!, pi = rs, pj = lp[j]!
        const ej = lp[j + 1]! - 1
        while (pi < p && pj < ej) {
          const ci = lc[pi]!, cj = lc[pj]!
          if (ci === cj) { s -= lv[pi]! * lv[pj]!; pi++; pj++ } else if (ci < cj) pi++; else pj++
        }
        lv[p] = s / lv[ej]!
      }
      let d = base[re]! * (1 + shift)
      for (let p = rs; p < re; p++) d -= lv[p]! * lv[p]!
      if (!(d > 1e-300)) { ok = false; break }
      lv[re] = Math.sqrt(d)
    }
    if (!ok) continue
    const y = new Float64Array(n)
    return {
      apply: (r, z) => {
        for (let i = 0; i < n; i++) {
          let s = r[i]!
          const rs = lp[i]!, re = lp[i + 1]! - 1
          for (let p = rs; p < re; p++) s -= lv[p]! * y[lc[p]!]!
          y[i] = s / lv[re]!
        }
        for (let i = n - 1; i >= 0; i--) {
          const rs = lp[i]!, re = lp[i + 1]! - 1
          const zi = y[i]! / lv[re]!
          z[i] = zi
          for (let p = rs; p < re; p++) y[lc[p]!]! -= lv[p]! * zi
        }
      }
    }
  }
  return jacobi(a)
}

export interface PcgOptions {
  readonly tolerance?: number
  readonly maxIterations?: number
  readonly shouldStop?: () => boolean
}

export interface PcgResult { readonly iterations: number; readonly residual: number; readonly converged: boolean; readonly stopped: boolean }

/** Solves `A x = b` in place in `x` (initial guess on entry). The residual is relative to `‖b‖`. */
export const pcg = (a: Csr, b: Float64Array, x: Float64Array, pre: Preconditioner, options: PcgOptions = {}): PcgResult => {
  const n = a.n, tol = options.tolerance ?? 1e-10, maxIt = options.maxIterations ?? Math.max(500, 4 * Math.ceil(Math.sqrt(n)) * 10)
  const r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), ap = new Float64Array(n)
  matvec(a, x, ap)
  let bn = 0
  for (let i = 0; i < n; i++) { r[i] = b[i]! - ap[i]!; bn += b[i]! * b[i]! }
  bn = Math.sqrt(bn)
  if (bn === 0) { x.fill(0); return { iterations: 0, residual: 0, converged: true, stopped: false } }
  pre.apply(r, z)
  p.set(z)
  let rz = 0
  for (let i = 0; i < n; i++) rz += r[i]! * z[i]!
  let res = 0
  for (let it = 0; it < maxIt; it++) {
    let rn = 0
    for (let i = 0; i < n; i++) rn += r[i]! * r[i]!
    res = Math.sqrt(rn) / bn
    if (res <= tol) return { iterations: it, residual: res, converged: true, stopped: false }
    if (options.shouldStop !== undefined && it % 8 === 0 && options.shouldStop()) return { iterations: it, residual: res, converged: false, stopped: true }
    matvec(a, p, ap)
    let pap = 0
    for (let i = 0; i < n; i++) pap += p[i]! * ap[i]!
    if (!(pap > 0)) return { iterations: it, residual: res, converged: false, stopped: false }
    const alpha = rz / pap
    for (let i = 0; i < n; i++) { x[i]! += alpha * p[i]!; r[i]! -= alpha * ap[i]! }
    pre.apply(r, z)
    let rzNew = 0
    for (let i = 0; i < n; i++) rzNew += r[i]! * z[i]!
    const beta = rzNew / rz
    rz = rzNew
    for (let i = 0; i < n; i++) p[i] = z[i]! + beta * p[i]!
  }
  return { iterations: maxIt, residual: res, converged: res <= tol, stopped: false }
}
