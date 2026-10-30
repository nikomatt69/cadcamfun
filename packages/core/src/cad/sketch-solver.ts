/**
 * The constraint solver of the parametric sketch (spec 45 K6, K7).
 *
 * Structure
 *   1. `compileSketch` (sketch-equations.ts) turns every constraint into scalar equations with analytic gradients.
 *   2. The equations are split into connected components (two equations are connected when they share an unknown). Components are
 *      independent: a drag or a re-solve touches one of them.
 *   3. Each component is ordered once by reverse Cuthill-McKee and its normal equations are stored in envelope (skyline) form, so a
 *      Newton step costs O(n * bandwidth^2) instead of O(n^3) and the structure is reused by every step, every re-solve and every drag.
 *   4. Levenberg-Marquardt on that structure (`J^T J + lambda I`): quadratic convergence near a solution, the smallest change of the
 *      geometry for an under-constrained sketch (a dragged sketch moves the way it would on a drawing board).
 *   5. Analysis at the solution: rank by elimination with threshold pivoting on the (banded) Jacobian, the null space (what can still
 *      move), the equations that add no rank (redundant) and, for a sketch with no solution, a minimal conflicting set by a chunked
 *      deletion filter over re-solves.
 *
 * Honest limits
 *   LM finds a solution near the drawn geometry, not all of them (a sketch has several assembly modes). A "conflict" is a conflict in
 *   that basin: the minimal set is reported for the geometry the sketch started from.
 */
import type { Vec2 } from "./vec.ts"
import { compileSketch, type CompiledEquations, type Eq } from "./sketch-equations.ts"
import { SketchError, type Sketch, type SketchDiagnostics, type SketchEntity, type SolveOptions, type SolveResult, type SolveStatus } from "./sketch-model.ts"

/** The residual under which a sketch counts as solved (a miss above it is a conflict). */
const SOLVED = 1e-6
const RANK_TOLERANCE = 1e-8

// ------------------------------------------------------------------------------------------------ structure

interface Component {
  /** Global unknown of every local (permuted) position. */
  readonly vars: Int32Array
  /** Equation indices (into `System.eqs`). */
  readonly eqs: Int32Array
  /** Local (permuted) positions of every equation's unknowns, parallel to `eqs`. */
  readonly local: Int32Array[]
  /** Envelope: first stored column of every row and the offset of its first stored entry. */
  readonly first: Int32Array
  readonly offset: Int32Array
  readonly A: Float64Array
  readonly L: Float64Array
  readonly b: Float64Array
}

interface System {
  readonly compiled: CompiledEquations
  readonly components: ReadonlyArray<Component>
  /** Component of every unknown, or -1 for an unknown no equation uses. */
  readonly componentOf: Int32Array
  /** Permuted local position of every unknown in its component. */
  readonly localOf: Int32Array
  readonly maxArity: number
}

const buildSystem = (sketch: Sketch): System => {
  const compiled = compileSketch(sketch)
  const n = compiled.layout.x.length
  const { eqs } = compiled
  // Union-find over the unknowns.
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]! } return i }
  const used = new Uint8Array(n)
  let maxArity = 1
  for (const eq of eqs) {
    maxArity = Math.max(maxArity, eq.vars.length)
    const r0 = find(eq.vars[0]!)
    used[eq.vars[0]!] = 1
    for (let k = 1; k < eq.vars.length; k++) {
      used[eq.vars[k]!] = 1
      const r = find(eq.vars[k]!)
      if (r !== r0) parent[r] = r0
    }
    // Keep the root stable after the union.
  }
  const rootIndex = new Map<number, number>()
  const members: number[][] = []
  const eqsOf: number[][] = []
  for (let v = 0; v < n; v++) {
    if (used[v] === 0) continue
    const root = find(v)
    let c = rootIndex.get(root)
    if (c === undefined) { c = members.length; rootIndex.set(root, c); members.push([]); eqsOf.push([]) }
    members[c]!.push(v)
  }
  eqs.forEach((eq, i) => eqsOf[rootIndex.get(find(eq.vars[0]!))!]!.push(i))

  const componentOf = new Int32Array(n).fill(-1)
  const localOf = new Int32Array(n).fill(-1)
  const components: Component[] = members.map((globals, c) => {
    const size = globals.length
    const pos = new Map<number, number>()
    globals.forEach((g, i) => pos.set(g, i))
    // Adjacency in the unpermuted numbering.
    const adj: Set<number>[] = Array.from({ length: size }, () => new Set<number>())
    for (const ei of eqsOf[c]!) {
      const vs = eqs[ei]!.vars
      for (let a = 0; a < vs.length; a++) for (let b = a + 1; b < vs.length; b++) {
        const pa = pos.get(vs[a]!)!, pb = pos.get(vs[b]!)!
        if (pa !== pb) { adj[pa]!.add(pb); adj[pb]!.add(pa) }
      }
    }
    const order = reverseCuthillMcKee(adj)
    const inverse = new Int32Array(size)
    order.forEach((old, newIndex) => { inverse[old] = newIndex })
    const vars = Int32Array.from(order, (old) => globals[old]!)
    const first = new Int32Array(size)
    for (let i = 0; i < size; i++) first[i] = i
    for (let old = 0; old < size; old++) {
      const i = inverse[old]!
      for (const nb of adj[old]!) { const j = inverse[nb]!; if (j < first[i]!) first[i] = j }
    }
    const offset = new Int32Array(size)
    let total = 0
    for (let i = 0; i < size; i++) { offset[i] = total; total += i - first[i]! + 1 }
    vars.forEach((g, i) => { componentOf[g] = c; localOf[g] = i })
    const local = eqsOf[c]!.map((ei) => Int32Array.from(eqs[ei]!.vars, (g) => inverse[pos.get(g)!]!))
    return { vars, eqs: Int32Array.from(eqsOf[c]!), local, first, offset, A: new Float64Array(total), L: new Float64Array(total), b: new Float64Array(size) }
  })
  return { compiled, components, componentOf, localOf, maxArity }
}

/** Reverse Cuthill-McKee from a pseudo-peripheral node of every connected piece; small bandwidth for chain- and loop-like sketches. */
const reverseCuthillMcKee = (adj: ReadonlyArray<ReadonlySet<number>>): number[] => {
  const n = adj.length
  const degree = adj.map((s) => s.size)
  const visited = new Uint8Array(n)
  const order: number[] = []
  const bfsLevels = (start: number): { last: number; depth: number } => {
    const seen = new Uint8Array(n)
    let frontier = [start]
    seen[start] = 1
    let depth = 0, last = start
    while (frontier.length > 0) {
      last = frontier.reduce((best, v) => degree[v]! < degree[best]! ? v : best, frontier[0]!)
      const next: number[] = []
      for (const v of frontier) for (const w of adj[v]!) if (seen[w] === 0) { seen[w] = 1; next.push(w) }
      if (next.length === 0) break
      frontier = next
      depth++
    }
    return { last, depth }
  }
  for (let s = 0; s < n; s++) {
    if (visited[s] === 1) continue
    // Pseudo-peripheral start: repeat BFS from the farthest low-degree node while the depth grows.
    let root = s
    let best = bfsLevels(root)
    for (let guard = 0; guard < 4; guard++) {
      const candidate = bfsLevels(best.last)
      if (candidate.depth <= best.depth) break
      root = best.last
      best = candidate
    }
    const queue = [root]
    visited[root] = 1
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head]!
      order.push(v)
      const next = [...adj[v]!].filter((w) => visited[w] === 0).sort((p, q) => degree[p]! - degree[q]! || p - q)
      for (const w of next) { visited[w] = 1; queue.push(w) }
    }
  }
  return order.reverse()
}

// ------------------------------------------------------------------------------------------------ linear algebra

/** In-place Cholesky of an envelope-stored symmetric matrix (lower triangle by rows). False when not positive definite. */
const choleskyEnvelope = (L: Float64Array, first: Int32Array, offset: Int32Array, n: number): boolean => {
  for (let i = 0; i < n; i++) {
    const fi = first[i]!, oi = offset[i]! - fi
    for (let j = fi; j < i; j++) {
      const fj = first[j]!, oj = offset[j]! - fj
      let sum = L[oi + j]!
      for (let k = fi > fj ? fi : fj; k < j; k++) sum -= L[oi + k]! * L[oj + k]!
      L[oi + j] = sum / L[oj + j]!
    }
    let d = L[oi + i]!
    for (let k = fi; k < i; k++) d -= L[oi + k]! * L[oi + k]!
    if (!(d > 1e-300)) return false
    L[oi + i] = Math.sqrt(d)
  }
  return true
}

/** Solves L L^T x = b in place (b becomes x). */
const solveEnvelope = (L: Float64Array, first: Int32Array, offset: Int32Array, n: number, b: Float64Array): void => {
  for (let i = 0; i < n; i++) {
    const fi = first[i]!, oi = offset[i]! - fi
    let sum = b[i]!
    for (let k = fi; k < i; k++) sum -= L[oi + k]! * b[k]!
    b[i] = sum / L[oi + i]!
  }
  for (let i = n - 1; i >= 0; i--) {
    const fi = first[i]!, oi = offset[i]! - fi
    const xi = b[i]! / L[oi + i]!
    b[i] = xi
    for (let k = fi; k < i; k++) b[k] = b[k]! - L[oi + k]! * xi
  }
}

// ------------------------------------------------------------------------------------------------ the Levenberg-Marquardt step

interface ExtraEq { readonly eq: Eq; readonly local: Int32Array }

interface ComponentSolve { readonly residual: number; readonly iterations: number }

/** The equation scaled by `w` (a soft objective competes with constraints weighted this much more heavily). */
const weighted = (eq: Eq, w: number): Eq => ({
  vars: eq.vars, constraint: eq.constraint,
  f: (x, v, g) => {
    const r = eq.f(x, v, g)
    if (g !== null) for (let k = 0; k < v.length; k++) g[k] = g[k]! * w
    return r * w
  }
})

const maxAbsOf = (r: Float64Array, m: number): number => { let s = 0; for (let i = 0; i < m; i++) { const a = Math.abs(r[i]!); if (a > s) s = a } return s }

/**
 * Solves one component starting from the global vector `xg` (updated in place on success or best effort). `skip` marks constraints
 * left out (for the conflict search); `extra` are temporary equations (a drag).
 */
const solveComponent = (
  sys: System, comp: Component, xg: Float64Array, tol: number, maxIterations: number,
  extra: ReadonlyArray<ExtraEq> = [], skip: Uint8Array | null = null, signal?: AbortSignal, hardWeight = 1
): ComponentSolve => {
  const { eqs } = sys.compiled
  const n = comp.vars.length
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) x[i] = xg[comp.vars[i]!]!
  // Active equations: those of the component not skipped, then the extra ones.
  const fns: Eq[] = []
  const locals: Int32Array[] = []
  for (let k = 0; k < comp.eqs.length; k++) {
    const eq = eqs[comp.eqs[k]!]!
    if (skip !== null && eq.constraint >= 0 && skip[eq.constraint] === 1) continue
    fns.push(hardWeight === 1 ? eq : weighted(eq, hardWeight)); locals.push(comp.local[k]!)
  }
  for (const e of extra) { fns.push(e.eq); locals.push(e.local) }
  const m = fns.length
  const r = new Float64Array(m), rt = new Float64Array(m)
  const g = new Float64Array(sys.maxArity)
  const evaluate = (xv: Float64Array, out: Float64Array): void => { for (let i = 0; i < m; i++) out[i] = fns[i]!.f(xv, locals[i]!, null) }
  evaluate(x, r)
  let residual = maxAbsOf(r, m)
  let iterations = 0
  if (m > 0 && residual > tol) {
    const { A, L, b, first, offset } = comp
    let lambda = 1e-6
    let cost = 0
    for (let i = 0; i < m; i++) cost += r[i]! * r[i]!
    const trial = new Float64Array(n)
    for (; iterations < maxIterations; iterations++) {
      if (signal?.aborted) break
      A.fill(0); b.fill(0)
      for (let i = 0; i < m; i++) {
        const v = locals[i]!
        const ri = fns[i]!.f(x, v, g)
        const len = v.length
        for (let p = 0; p < len; p++) {
          const gp = g[p]!
          if (gp === 0) continue
          const pi = v[p]!
          b[pi] = b[pi]! - gp * ri
          const base = offset[pi]! - first[pi]!
          for (let q = 0; q < len; q++) {
            const pj = v[q]!
            if (pj <= pi) A[base + pj] = A[base + pj]! + gp * g[q]!
          }
        }
      }
      let accepted = false
      let newCost = cost
      for (let attempt = 0; attempt < 16; attempt++) {
        L.set(A)
        for (let i = 0; i < n; i++) L[offset[i]! + i - first[i]!] = L[offset[i]! + i - first[i]!]! + lambda
        if (!choleskyEnvelope(L, first, offset, n)) { lambda *= 10; continue }
        const dx = Float64Array.from(b)
        solveEnvelope(L, first, offset, n, dx)
        for (let i = 0; i < n; i++) trial[i] = x[i]! + dx[i]!
        evaluate(trial, rt)
        let ct = 0
        for (let i = 0; i < m; i++) ct += rt[i]! * rt[i]!
        if (ct < cost) {
          x.set(trial); r.set(rt)
          newCost = ct
          lambda = Math.max(lambda / 10, 1e-12)
          accepted = true
          break
        }
        lambda *= 10
      }
      if (!accepted) break
      residual = maxAbsOf(r, m)
      const improvement = cost - newCost
      cost = newCost
      if (residual <= tol) { iterations++; break }
      if (improvement <= 1e-30 * (1 + cost)) { iterations++; break }
    }
    residual = maxAbsOf(r, m)
  }
  for (let i = 0; i < n; i++) xg[comp.vars[i]!] = x[i]!
  return { residual, iterations }
}

// ------------------------------------------------------------------------------------------------ rank analysis

interface Analysis {
  readonly rank: number
  /** Null-space basis, in the component's local numbering. */
  readonly basis: Float64Array[]
  /** Equations (indices into `System.eqs`) that add no rank. */
  readonly dependent: number[]
}

/** Rank, null space and dependent equations of the component's Jacobian at `xg` by elimination with threshold pivoting. */
const analyzeComponent = (sys: System, comp: Component, xg: Float64Array): Analysis => {
  const { eqs } = sys.compiled
  const n = comp.vars.length, m = comp.eqs.length
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) x[i] = xg[comp.vars[i]!]!
  const g = new Float64Array(sys.maxArity)
  // Rows ordered by their lowest column keeps the elimination banded; ties keep the constraint order.
  const rows = Array.from({ length: m }, (_, k) => k)
  const lowest = comp.local.map((v) => v.reduce((lo, c) => Math.min(lo, c), n))
  rows.sort((p, q) => lowest[p]! - lowest[q]! || p - q)
  const A = new Float64Array(m * n)
  const hi = new Int32Array(m)
  const rowId = new Int32Array(m)
  rows.forEach((k, i) => {
    rowId[i] = comp.eqs[k]!
    const v = comp.local[k]!
    eqs[comp.eqs[k]!]!.f(x, v, g)
    let big = 0
    for (let p = 0; p < v.length; p++) { A[i * n + v[p]!] = A[i * n + v[p]!]! + g[p]!; }
    for (let p = 0; p < v.length; p++) big = Math.max(big, Math.abs(A[i * n + v[p]!]!))
    if (big > 1e-14) for (let p = 0; p < v.length; p++) A[i * n + v[p]!] = A[i * n + v[p]!]! / big
    let h = 0
    for (let p = 0; p < v.length; p++) h = Math.max(h, v[p]!)
    hi[i] = h
  })
  // Rows that were all zero before scaling stay zero (a degenerate gradient): never a pivot.
  let rank = 0
  const pivotCols: number[] = []
  for (let col = 0; col < n && rank < m; col++) {
    let best = 0
    for (let i = rank; i < m; i++) { const a = Math.abs(A[i * n + col]!); if (a > best) best = a }
    if (best <= RANK_TOLERANCE) continue
    // Threshold pivoting that prefers the earliest equation among the acceptable ones, so later duplicates are the dependent rows.
    let pivot = -1
    for (let i = rank; i < m; i++) if (Math.abs(A[i * n + col]!) >= 0.1 * best && (pivot < 0 || rowId[i]! < rowId[pivot]!)) pivot = i
    if (pivot !== rank) {
      for (let j = 0; j < n; j++) { const t = A[rank * n + j]!; A[rank * n + j] = A[pivot * n + j]!; A[pivot * n + j] = t }
      const th = hi[rank]!; hi[rank] = hi[pivot]!; hi[pivot] = th
      const tid = rowId[rank]!; rowId[rank] = rowId[pivot]!; rowId[pivot] = tid
    }
    const pv = A[rank * n + col]!
    const hr = hi[rank]!
    for (let i = rank + 1; i < m; i++) {
      const f = A[i * n + col]! / pv
      if (f === 0) continue
      for (let j = col; j <= hr; j++) A[i * n + j] = A[i * n + j]! - f * A[rank * n + j]!
      A[i * n + col] = 0
      if (hr > hi[i]!) hi[i] = hr
    }
    pivotCols.push(col)
    rank++
  }
  const isPivot = new Uint8Array(n)
  for (const c of pivotCols) isPivot[c] = 1
  const basis: Float64Array[] = []
  for (let free = 0; free < n; free++) {
    if (isPivot[free] === 1) continue
    const v = new Float64Array(n)
    v[free] = 1
    for (let i = rank - 1; i >= 0; i--) {
      const pc = pivotCols[i]!
      let sum = 0
      const h = Math.min(hi[i]!, n - 1)
      for (let j = pc + 1; j <= h; j++) { const a = A[i * n + j]!; if (a !== 0) sum += a * v[j]! }
      v[pc] = -sum / A[i * n + pc]!
    }
    basis.push(v)
  }
  const dependent: number[] = []
  for (let i = rank; i < m; i++) dependent.push(rowId[i]!)
  return { rank, basis, dependent }
}

// ------------------------------------------------------------------------------------------------ results

const movedEntities = (sketch: Sketch, sys: System, x: Float64Array): SketchEntity[] => {
  const { index } = sys.compiled.layout
  return sketch.entities.map((e) => {
    if (e.kind === "point") return { ...e, x: x[index.get(`${e.id}.x`)!]!, y: x[index.get(`${e.id}.y`)!]! }
    if (e.kind === "circle") return { ...e, radius: Math.abs(x[index.get(`${e.id}.r`)!]!) }
    if (e.kind === "ellipse") return { ...e, radiusX: Math.abs(x[index.get(`${e.id}.rx`)!]!), radiusY: Math.abs(x[index.get(`${e.id}.ry`)!]!) }
    return e
  })
}

const entityOfUnknown = (name: string): string => name.slice(0, name.lastIndexOf("."))

/** Per-equation residuals over the whole system. */
const allResiduals = (sys: System, x: Float64Array): Float64Array => {
  const { eqs } = sys.compiled
  const out = new Float64Array(eqs.length)
  for (let i = 0; i < eqs.length; i++) out[i] = eqs[i]!.f(x, eqs[i]!.vars, null)
  return out
}

/**
 * A minimal set of constraints that cannot all hold, by a chunked deletion filter: blocks of constraints are dropped while the rest
 * stays unsatisfiable, down to single constraints. Each remaining constraint is necessary (dropping it makes the rest solvable).
 */
const minimalConflict = (
  sys: System, comp: Component, x0: Float64Array, tol: number, maxIterations: number, budget: number, signal?: AbortSignal
): { readonly constraints: number[]; readonly minimal: boolean } => {
  const { eqs } = sys.compiled
  const candidates = [...new Set([...comp.eqs].map((e) => eqs[e]!.constraint).filter((c) => c >= 0))].sort((a, b) => a - b)
  const skip = new Uint8Array(sys.compiled.constraintNames.length)
  let spent = 0
  const unsat = (): boolean => {
    spent++
    const x = Float64Array.from(x0)
    return solveComponent(sys, comp, x, tol, maxIterations, [], skip, signal).residual > SOLVED
  }
  let current = candidates
  let minimal = true
  for (let chunk = Math.ceil(current.length / 2); chunk >= 1; chunk = chunk === 1 ? 0 : Math.ceil(chunk / 2)) {
    let i = 0
    while (i < current.length) {
      if (spent >= budget || signal?.aborted) { minimal = false; break }
      const block = current.slice(i, i + chunk)
      for (const c of block) skip[c] = 1
      if (unsat()) current = current.filter((c) => !block.includes(c))
      else { for (const c of block) skip[c] = 0; i += chunk }
    }
    if (!minimal) break
  }
  return { constraints: current, minimal }
}

/** Solves the sketch; throws `SketchError` for a malformed one. */
export const solveSketchSystem = (sketch: Sketch, options: SolveOptions = {}): SolveResult => {
  const sys = buildSystem(sketch)
  return solveSystem(sketch, sys, Float64Array.from(sys.compiled.layout.x), options)
}

const solveSystem = (sketch: Sketch, sys: System, x: Float64Array, options: SolveOptions): SolveResult => {
  const maxIterations = options.maxIterations ?? 200
  const tol = options.tolerance ?? 1e-9
  const x0 = Float64Array.from(x)
  const { layout, eqs, constraintNames, ownerNames } = sys.compiled
  let iterations = 0
  for (const comp of sys.components) {
    const solved = solveComponent(sys, comp, x, tol, maxIterations, [], null, options.signal)
    iterations = Math.max(iterations, solved.iterations)
  }
  const r = allResiduals(sys, x)
  let residual = 0
  for (const v of r) residual = Math.max(residual, Math.abs(v))
  const missed = new Map<string, number>()
  r.forEach((v, i) => { if (Math.abs(v) > SOLVED) missed.set(ownerNames[i]!, Math.max(missed.get(ownerNames[i]!) ?? 0, Math.abs(v))) })
  const conflicts = [...missed.entries()].sort((p, q) => q[1] - p[1]).map(([name]) => name)
  const solved = residual <= SOLVED
  const driven = sys.compiled.driven.map((d) => ({ id: d.id, type: d.type, value: d.measure(x) }))
  const n = x.length

  let dof = n, redundant = 0
  const free = new Set<string>()
  const freedom: Record<string, number> = {}
  const dependentConstraints: string[] = []
  if (options.analyze === false) {
    dof = -1
  } else {
    // Unknowns no equation uses are free on their own.
    let loose = 0
    for (let v = 0; v < n; v++) if (sys.componentOf[v]! < 0) { loose++; free.add(entityOfUnknown(layout.names[v]!)) }
    dof = loose
    const dependentSeen = new Set<string>()
    for (const comp of sys.components) {
      const analysis = analyzeComponent(sys, comp, x)
      dof += comp.vars.length - analysis.rank
      redundant += comp.eqs.length - analysis.rank
      for (const e of analysis.dependent) {
        const owner = eqs[e]!.constraint
        const name = owner >= 0 ? constraintNames[owner]! : ownerNames[e]!
        if (!dependentSeen.has(name)) { dependentSeen.add(name); dependentConstraints.push(name) }
      }
      const reach = new Map<string, { xx: number; xy: number; yy: number }>()
      for (const v of analysis.basis) {
        for (let k = 0; k < comp.vars.length; k++) {
          if (Math.abs(v[k]!) > 1e-6) free.add(entityOfUnknown(layout.names[comp.vars[k]!]!))
        }
      }
      // Remaining freedom of every point: the rank of its (x, y) rows over the null-space basis.
      for (let k = 0; k < comp.vars.length; k++) {
        const name = layout.names[comp.vars[k]!]!
        if (!name.endsWith(".x")) continue
        const id = entityOfUnknown(name)
        const ky = layout.index.get(`${id}.y`)
        if (ky === undefined || sys.componentOf[ky] !== sys.componentOf[comp.vars[k]!]) continue
        const ly = sys.localOf[ky]!
        let xx = 0, xy = 0, yy = 0
        for (const v of analysis.basis) { xx += v[k]! * v[k]!; xy += v[k]! * v[ly]!; yy += v[ly]! * v[ly]! }
        reach.set(id, { xx, xy, yy })
      }
      for (const [id, { xx, xy, yy }] of reach) {
        const tr = xx + yy, det = xx * yy - xy * xy
        const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det))
        const big = tr / 2 + disc, small = tr / 2 - disc
        const rank = big < 1e-12 ? 0 : small > 1e-9 * big && small > 1e-12 ? 2 : 1
        if (rank > 0) freedom[id] = rank
      }
    }
    for (const e of sketch.entities) if (e.kind === "point" && free.has(e.id) && freedom[e.id] === undefined) freedom[e.id] = 2
  }

  const analysed = options.analyze !== false
  let diagnostics: SketchDiagnostics | undefined
  if (analysed) {
    let conflictSet: string[] = []
    let minimal = true
    if (!solved && options.diagnose !== false) {
      const failing = new Set<number>()
      r.forEach((v, i) => { if (Math.abs(v) > SOLVED) failing.add(sys.componentOf[eqs[i]!.vars[0]!]!) })
      const budget = options.diagnoseBudget ?? 300
      const names = new Set<string>()
      for (const c of failing) {
        const found = minimalConflict(sys, sys.components[c]!, x0, tol, maxIterations, budget, options.signal)
        if (!found.minimal) minimal = false
        for (const k of found.constraints) names.add(constraintNames[k]!)
      }
      conflictSet = [...names]
    }
    diagnostics = { redundant: dependentConstraints, conflictSet, minimal, freedom }
  }
  // A sketch with no solution is "conflicting" when a set of constraints is found that cannot hold together (every member necessary);
  // without that evidence (or a rank deficiency) the solver only reports that it did not converge.
  const hasConflict = (diagnostics?.conflictSet.length ?? 0) > 0
  const status: SolveStatus = !solved
    ? (redundant > 0 || hasConflict ? "conflicting" : "failed")
    : !analysed ? "under-constrained"
      : dof === 0 ? (redundant > 0 ? "over-constrained" : "fully-constrained")
        : (redundant > 0 ? "over-constrained" : "under-constrained")
  const conflictNote = diagnostics !== undefined && diagnostics.conflictSet.length > 0
    ? `; ${diagnostics.minimal ? "minimal conflicting set" : "conflicting set (search budget exhausted)"}: ${diagnostics.conflictSet.join(", ")}`
    : ""
  return {
    sketch: { ...sketch, entities: movedEntities(sketch, sys, x) },
    status, dof, iterations, residual,
    free: [...free].filter((id) => sketch.entities.some((e) => e.id === id && (e.kind === "point" || e.kind === "circle" || e.kind === "ellipse"))).sort(),
    conflicts: solved ? [] : conflicts,
    redundant,
    ...(diagnostics !== undefined ? { diagnostics } : {}),
    ...(driven.length > 0 ? { driven } : {}),
    ...(status === "conflicting" ? { message: `The constraints cannot all hold; the worst miss is ${conflicts[0] ?? "unknown"}${conflictNote}` } : status === "failed" ? { message: "The solver did not converge" } : {})
  }
}

// ------------------------------------------------------------------------------------------------ interactive sessions (K7)

export interface DragOptions {
  readonly tolerance?: number
  readonly maxIterations?: number
}

export interface DragResult {
  /** True when the dragged entity reached the target. */
  readonly reached: boolean
  /** Fraction of the way from the start to the target that the constraints allowed (1 when reached). */
  readonly fraction: number
  /** When the target was not reached: the constraints that stopped the drag. */
  readonly blockedBy: ReadonlyArray<string>
  /** Every point whose position changed, with its new position (only the dragged component can change). */
  readonly moved: Readonly<Record<string, Vec2>>
  readonly iterations: number
  readonly residual: number
}

export interface SketchSession {
  /** The sketch with the session's current positions. */
  readonly sketch: () => Sketch
  /** Full solve from the current positions (updates the session). */
  readonly solve: (options?: SolveOptions) => SolveResult
  /**
   * Drags `entityId` (a point; a line moves both ends; a circle, arc or ellipse moves its centre) to `target`. A hard drag: every
   * constraint keeps holding. A target the constraints forbid is approached as far as they allow (never relaxing one) and reported.
   */
  readonly drag: (entityId: string, target: Vec2, options?: DragOptions) => DragResult
  /** The unknown count and the number of independent components. */
  readonly stats: () => { readonly unknowns: number; readonly equations: number; readonly components: number }
}

/** Compiles the sketch once; drags and re-solves reuse the compiled equations, the component split and the sparse structure. */
export const createSketchSession = (initial: Sketch): SketchSession => {
  const sys = buildSystem(initial)
  const x = Float64Array.from(sys.compiled.layout.x)
  const { layout, eqs, constraintNames } = sys.compiled
  const byId = new Map(initial.entities.map((e) => [e.id, e] as const))

  const handles = (id: string): string[] => {
    const e = byId.get(id)
    if (e === undefined) throw new SketchError(`'${id}' is not an entity of the sketch`)
    switch (e.kind) {
      case "point": return [e.id]
      case "line": return [e.p1, e.p2]
      case "circle": case "arc": case "ellipse": return [e.center]
      case "spline": return [...e.points]
    }
  }
  const currentSketch = (): Sketch => ({ ...initial, entities: movedEntities(initial, sys, x) })

  const drag = (entityId: string, target: Vec2, options: DragOptions = {}): DragResult => {
    const tol = options.tolerance ?? 1e-9
    const maxIterations = options.maxIterations ?? 60
    const ids = handles(entityId)
    const first = ids[0]!
    const fx = layout.index.get(`${first}.x`)!, fy = layout.index.get(`${first}.y`)!
    const dx = target.x - x[fx]!, dy = target.y - x[fy]!
    const starts = ids.map((id) => ({ ix: layout.index.get(`${id}.x`)!, iy: layout.index.get(`${id}.y`)!, x0: x[layout.index.get(`${id}.x`)!]!, y0: x[layout.index.get(`${id}.y`)!]! }))
    const comps = new Set(starts.flatMap((s) => [sys.componentOf[s.ix]!, sys.componentOf[s.iy]!]))
    // A point no constraint uses moves freely.
    const free = starts.filter((s) => sys.componentOf[s.ix]! < 0)
    for (const s of free) { x[s.ix] = s.x0 + dx; x[s.iy] = s.y0 + dy }
    const active = [...comps].filter((c) => c >= 0)
    const snapshot = Float64Array.from(x)
    const pins = (t: number): ExtraEq[][] => active.map((c) => {
      const list: ExtraEq[] = []
      for (const s of starts) {
        if (sys.componentOf[s.ix] !== c) continue
        list.push({ eq: { vars: Int32Array.of(s.ix), f: (xv, v, g) => { if (g !== null) g[0] = 1; return xv[v[0]!]! - (s.x0 + t * dx) }, constraint: -1 }, local: Int32Array.of(sys.localOf[s.ix]!) })
        list.push({ eq: { vars: Int32Array.of(s.iy), f: (xv, v, g) => { if (g !== null) g[0] = 1; return xv[v[0]!]! - (s.y0 + t * dy) }, constraint: -1 }, local: Int32Array.of(sys.localOf[s.iy]!) })
      }
      return list
    })
    let iterations = 0, residual = 0
    const attempt = (t: number): boolean => {
      const trial = Float64Array.from(x)
      const extras = pins(t)
      let ok = true
      active.forEach((c, k) => {
        const solved = solveComponent(sys, sys.components[c]!, trial, tol, maxIterations, extras[k]!)
        iterations += solved.iterations
        residual = Math.max(residual, solved.residual)
        if (solved.residual > Math.max(tol, 1e-9)) ok = false
      })
      if (ok) x.set(trial)
      return ok
    }
    let fraction = 1
    let blockedBy: string[] = []
    residual = 0
    if (dx === 0 && dy === 0 && active.length === 0) return { reached: true, fraction: 1, blockedBy, moved: {}, iterations: 0, residual: 0 }
    // A long move may leave Newton's basin: follow the path in 4, then 16 equal steps, each warm-started from the last.
    const followPath = (): boolean => {
      for (const steps of [4, 16]) {
        x.set(snapshot)
        let ok = true
        for (let i = 1; i <= steps && ok; i++) ok = attempt(i / steps)
        if (ok) return true
      }
      x.set(snapshot)
      return false
    }
    if (!attempt(1) && !followPath()) {
      // The constraints forbid the target. Name what misses at the pinned target, then move to the nearest feasible pose: a soft
      // pull toward the target against heavily weighted constraints, followed by a projection onto the constraints alone.
      const pinned = Float64Array.from(x)
      const extras = pins(1)
      const missing = new Set<string>()
      active.forEach((c, k) => {
        const comp = sys.components[c]!
        solveComponent(sys, comp, pinned, tol, maxIterations, extras[k]!)
        for (const ei of comp.eqs) {
          const eq = eqs[ei]!
          if (Math.abs(eq.f(pinned, eq.vars, null)) > 1e-6) missing.add(eq.constraint >= 0 ? constraintNames[eq.constraint]! : sys.compiled.ownerNames[ei]!)
        }
      })
      blockedBy = [...missing]
      const trial = Float64Array.from(x)
      let ok = true
      active.forEach((c, k) => {
        const comp = sys.components[c]!
        solveComponent(sys, comp, trial, tol, 400, extras[k]!, null, undefined, 1e4)
        const polished = solveComponent(sys, comp, trial, tol, maxIterations)
        iterations += polished.iterations
        if (polished.residual > Math.max(tol, 1e-9)) ok = false
      })
      if (ok) x.set(trial)
      const total = dx * dx + dy * dy
      fraction = total > 0 ? Math.max(0, Math.min(1, ((x[fx]! - starts[0]!.x0) * dx + (x[fy]! - starts[0]!.y0) * dy) / total)) : 1
      if (fraction < 1e-9) fraction = 0
      residual = 0
    }
    const moved: Record<string, Vec2> = {}
    for (const e of initial.entities) {
      if (e.kind !== "point") continue
      const ix = layout.index.get(`${e.id}.x`)!, iy = layout.index.get(`${e.id}.y`)!
      if (Math.abs(x[ix]! - snapshot[ix]!) > 1e-12 || Math.abs(x[iy]! - snapshot[iy]!) > 1e-12) moved[e.id] = { x: x[ix]!, y: x[iy]! }
    }
    return { reached: blockedBy.length === 0, fraction, blockedBy, moved, iterations, residual }
  }

  return {
    sketch: currentSketch,
    solve: (options = {}) => {
      const result = solveSystem(currentSketch(), sys, x, options)
      return result
    },
    drag,
    stats: () => ({ unknowns: x.length, equations: eqs.length, components: sys.components.length })
  }
}

/** One-shot drag: compiles, drags, returns the moved sketch. Use `createSketchSession` for a stream of drag events. */
export const dragSketch = (sketch: Sketch, entityId: string, target: Vec2, options?: DragOptions): DragResult & { readonly sketch: Sketch } => {
  const session = createSketchSession(sketch)
  const result = session.drag(entityId, target, options)
  return { ...result, sketch: session.sketch() }
}
