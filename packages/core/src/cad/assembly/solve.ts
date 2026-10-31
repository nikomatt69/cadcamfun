/**
 * The mate solver (spec 46 A2): finds the rigid transforms of the free occurrences that satisfy the mates, starting from their
 * present pose (continuation: the solution nearest the pose it was in, not an enumeration of assembly modes).
 *
 * Unknowns are a translation and a small left rotation per non-grounded occurrence (6 each); the mates are rows with analytic
 * gradients (mates.ts). Levenberg-Marquardt on the normal equations per connected component, then the rank of the Jacobian gives
 * the degrees of freedom (per assembly and per occurrence), the mates that add no rank are reported redundant, and an unsatisfiable
 * set of mates is reduced to a minimal conflicting set by the same deletion filter the sketcher uses.
 */
import { type Transform } from "../brep/index.ts"
import { minimalUnsatisfiable } from "../sketch/deletion-filter.ts"
import { AssemblyError, flattenAssembly, type Assembly, type FlatOccurrence } from "./model.ts"
import { compileMates, type CompiledMates, type Mate, type MateEquation, type PoseState } from "./mates.ts"

export type AssemblyStatus = "fully-constrained" | "under-constrained" | "conflicting" | "failed"

export interface JointReading {
  readonly id: string
  readonly kind: string
  readonly angle?: number
  readonly slide?: number
  /** Set when a limit is exceeded by the solved pose. */
  readonly violation?: { readonly quantity: "angle" | "slide"; readonly value: number; readonly limit: number }
}

export interface AssemblySolution {
  /** World transform of every leaf occurrence (grounded ones unchanged). */
  readonly transforms: ReadonlyMap<string, Transform>
  readonly status: AssemblyStatus
  /** Degrees of freedom left across all free occurrences (a free-floating occurrence has 6). */
  readonly dof: number
  /** Remaining freedom of each occurrence (0 is omitted). */
  readonly freedom: Readonly<Record<string, number>>
  /** Largest absolute residual (mm for distances, radians for angles). */
  readonly residual: number
  readonly iterations: number
  /** Mates that add no constraint beyond the mates before them. */
  readonly redundantMates: ReadonlyArray<string>
  /** For a conflicting assembly: mates that cannot all hold, each necessary. */
  readonly conflictSet: ReadonlyArray<string>
  readonly minimal: boolean
  readonly joints: ReadonlyArray<JointReading>
  readonly message?: string
}

export interface SolveAssemblyOptions {
  readonly configuration?: string
  readonly tolerance?: number
  readonly maxIterations?: number
  /** Skip rank analysis and the conflict search (the pose only). */
  readonly analyze?: boolean
  readonly diagnoseBudget?: number
  readonly signal?: AbortSignal
  /** Clamp driven joint values to their limits (default true); the clamp is reported as a violation. */
  readonly enforceLimits?: boolean
  /** Starting poses by occurrence path, overriding the assembly's own (continuation along a sweep). */
  readonly start?: ReadonlyMap<string, Transform>
}

const SOLVED = 1e-6

const stateOf = (flat: ReadonlyArray<FlatOccurrence>, start?: ReadonlyMap<string, Transform>): PoseState => {
  const R = new Float64Array(flat.length * 9), t = new Float64Array(flat.length * 3)
  flat.forEach((f, i) => {
    const tr = start?.get(f.path) ?? f.transform
    for (let k = 0; k < 9; k++) R[i * 9 + k] = tr.m[k]!
    t[i * 3] = tr.t.x; t[i * 3 + 1] = tr.t.y; t[i * 3 + 2] = tr.t.z
  })
  return { R, t }
}

const transformOf = (S: PoseState, i: number): Transform => ({
  m: Array.from(S.R.subarray(i * 9, i * 9 + 9)) as unknown as Transform["m"],
  t: { x: S.t[i * 3]!, y: S.t[i * 3 + 1]!, z: S.t[i * 3 + 2]! }
})

/** R <- exp([d]x) R. */
const rotateLeft = (R: Float64Array, o: number, dx: number, dy: number, dz: number): void => {
  const angle = Math.hypot(dx, dy, dz)
  if (angle < 1e-300) return
  const kx = dx / angle, ky = dy / angle, kz = dz / angle
  const c = Math.cos(angle), s = Math.sin(angle), C = 1 - c
  const E = [
    c + kx * kx * C, kx * ky * C - kz * s, kx * kz * C + ky * s,
    ky * kx * C + kz * s, c + ky * ky * C, ky * kz * C - kx * s,
    kz * kx * C - ky * s, kz * ky * C + kx * s, c + kz * kz * C
  ]
  const old = R.slice(o, o + 9)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[o + i * 3 + j] = E[i * 3]! * old[j]! + E[i * 3 + 1]! * old[3 + j]! + E[i * 3 + 2]! * old[6 + j]!
}

/** Dense Cholesky of an SPD matrix (in place, lower), solves L L^T x = b. False when not positive definite. */
const choleskySolve = (A: Float64Array, b: Float64Array, n: number): boolean => {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * n + j]!
      for (let k = 0; k < j; k++) sum -= A[i * n + k]! * A[j * n + k]!
      if (i === j) { if (!(sum > 1e-300)) return false; A[i * n + i] = Math.sqrt(sum) } else A[i * n + j] = sum / A[j * n + j]!
    }
  }
  for (let i = 0; i < n; i++) { let sum = b[i]!; for (let k = 0; k < i; k++) sum -= A[i * n + k]! * b[k]!; b[i] = sum / A[i * n + i]! }
  for (let i = n - 1; i >= 0; i--) { let sum = b[i]!; for (let k = i + 1; k < n; k++) sum -= A[k * n + i]! * b[k]!; b[i] = sum / A[i * n + i]! }
  return true
}

interface System {
  readonly flat: ReadonlyArray<FlatOccurrence>
  readonly compiled: CompiledMates
  /** Unknown block (0-based) of an occurrence, or -1 when grounded. */
  readonly block: Int32Array
  readonly components: ReadonlyArray<{ readonly occurrences: ReadonlyArray<number>; readonly equations: ReadonlyArray<number> }>
}

const buildSystem = (flat: ReadonlyArray<FlatOccurrence>, compiled: CompiledMates): System => {
  const block = new Int32Array(flat.length).fill(-1)
  let free = 0
  flat.forEach((f, i) => { if (!f.grounded) block[i] = free++ })
  const parent = Array.from({ length: flat.length }, (_, i) => i)
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]! } return i }
  for (const e of compiled.equations) if (block[e.a]! >= 0 && block[e.b]! >= 0) parent[find(e.a)] = find(e.b)
  const byRoot = new Map<number, { occurrences: number[]; equations: number[] }>()
  flat.forEach((_, i) => {
    if (block[i]! < 0) return
    const r = find(i)
    if (!byRoot.has(r)) byRoot.set(r, { occurrences: [], equations: [] })
    byRoot.get(r)!.occurrences.push(i)
  })
  compiled.equations.forEach((e, k) => {
    const owner = block[e.a]! >= 0 ? e.a : e.b
    if (block[owner]! < 0) return // an equation between two grounded occurrences: only a residual
    byRoot.get(find(owner))!.equations.push(k)
  })
  return { flat, compiled, block, components: [...byRoot.values()] }
}

interface ComponentFit { readonly residual: number; readonly iterations: number }

/** Columns of an equation's gradient row for component-local blocks. */
const fillRow = (e: MateEquation, S: PoseState, row: Float64Array | null): number => {
  if (row !== null) row.fill(0)
  return e.f(S, row)
}

const solveComponent = (
  sys: System, S: PoseState, comp: System["components"][number], skip: ReadonlySet<number> | null, tol: number, maxIterations: number, signal?: AbortSignal
): ComponentFit => {
  const local = new Map<number, number>()
  comp.occurrences.forEach((o, k) => local.set(o, k))
  const n = comp.occurrences.length * 6
  const eqs = comp.equations.filter((k) => skip === null || !skip.has(sys.compiled.equations[k]!.mate)).map((k) => sys.compiled.equations[k]!)
  const m = eqs.length
  const row = new Float64Array(12)
  const r = new Float64Array(m), rt = new Float64Array(m)
  const evaluate = (state: PoseState, out: Float64Array): void => { for (let i = 0; i < m; i++) out[i] = eqs[i]!.f(state, null) }
  evaluate(S, r)
  let residual = 0
  for (let i = 0; i < m; i++) residual = Math.max(residual, Math.abs(r[i]!))
  let iterations = 0
  if (m === 0 || residual <= tol) return { residual, iterations }
  let lambda = 1e-6
  let cost = 0
  for (let i = 0; i < m; i++) cost += r[i]! * r[i]!
  const trial: PoseState = { R: new Float64Array(S.R.length), t: new Float64Array(S.t.length) }
  const A = new Float64Array(n * n), M = new Float64Array(n * n), b = new Float64Array(n)
  for (; iterations < maxIterations; iterations++) {
    if (signal?.aborted) break
    A.fill(0); b.fill(0)
    for (let i = 0; i < m; i++) {
      const e = eqs[i]!
      const ri = fillRow(e, S, row)
      const la = local.get(e.a), lb = local.get(e.b)
      const cols: number[] = []
      const vals: number[] = []
      if (la !== undefined) for (let k = 0; k < 6; k++) { cols.push(la * 6 + k); vals.push(row[k]!) }
      if (lb !== undefined) for (let k = 0; k < 6; k++) { cols.push(lb * 6 + k); vals.push(row[6 + k]!) }
      for (let p = 0; p < cols.length; p++) {
        const gp = vals[p]!
        if (gp === 0) continue
        b[cols[p]!] = b[cols[p]!]! - gp * ri
        for (let q = 0; q < cols.length; q++) A[cols[p]! * n + cols[q]!] = A[cols[p]! * n + cols[q]!]! + gp * vals[q]!
      }
    }
    let accepted = false
    for (let attempt = 0; attempt < 16 && !accepted; attempt++) {
      M.set(A)
      for (let i = 0; i < n; i++) M[i * n + i] = M[i * n + i]! + lambda
      const dx = Float64Array.from(b)
      if (!choleskySolve(M, dx, n)) { lambda *= 10; continue }
      trial.R.set(S.R); trial.t.set(S.t)
      comp.occurrences.forEach((o, k) => {
        trial.t[o * 3] = trial.t[o * 3]! + dx[k * 6]!; trial.t[o * 3 + 1] = trial.t[o * 3 + 1]! + dx[k * 6 + 1]!; trial.t[o * 3 + 2] = trial.t[o * 3 + 2]! + dx[k * 6 + 2]!
        rotateLeft(trial.R, o * 9, dx[k * 6 + 3]!, dx[k * 6 + 4]!, dx[k * 6 + 5]!)
      })
      evaluate(trial, rt)
      let ct = 0
      for (let i = 0; i < m; i++) ct += rt[i]! * rt[i]!
      if (ct < cost) {
        S.R.set(trial.R); S.t.set(trial.t); r.set(rt)
        lambda = Math.max(lambda / 10, 1e-12)
        const improvement = cost - ct
        cost = ct
        accepted = true
        residual = 0
        for (let i = 0; i < m; i++) residual = Math.max(residual, Math.abs(r[i]!))
        if (residual <= tol || improvement <= 1e-30 * (1 + cost)) { iterations++; return { residual, iterations } }
      } else lambda *= 10
    }
    if (!accepted) break
  }
  return { residual, iterations }
}

// ------------------------------------------------------------------------------------------------ rank analysis

/** Rank of a dense matrix and a null-space basis (columns scaled to unit norm first, rows to unit max-norm). */
const rankNull = (J: Float64Array, m: number, n: number): { rank: number; basis: Float64Array[]; colScale: Float64Array } => {
  const A = Float64Array.from(J)
  const colScale = new Float64Array(n).fill(1)
  for (let j = 0; j < n; j++) {
    let s = 0
    for (let i = 0; i < m; i++) s += A[i * n + j]! * A[i * n + j]!
    s = Math.sqrt(s)
    if (s > 1e-12) { colScale[j] = s; for (let i = 0; i < m; i++) A[i * n + j] = A[i * n + j]! / s }
  }
  for (let i = 0; i < m; i++) {
    let big = 0
    for (let j = 0; j < n; j++) big = Math.max(big, Math.abs(A[i * n + j]!))
    if (big > 1e-12) for (let j = 0; j < n; j++) A[i * n + j] = A[i * n + j]! / big
  }
  const cols = Array.from({ length: n }, (_, j) => j)
  let rank = 0
  for (let step = 0; step < Math.min(m, n); step++) {
    let bi = -1, bj = -1, best = 1e-7
    for (let i = step; i < m; i++) for (let j = step; j < n; j++) { const v = Math.abs(A[i * n + j]!); if (v > best) { best = v; bi = i; bj = j } }
    if (bi < 0) break
    if (bi !== step) for (let j = 0; j < n; j++) { const t = A[step * n + j]!; A[step * n + j] = A[bi * n + j]!; A[bi * n + j] = t }
    if (bj !== step) {
      for (let i = 0; i < m; i++) { const t = A[i * n + step]!; A[i * n + step] = A[i * n + bj]!; A[i * n + bj] = t }
      const t = cols[step]!; cols[step] = cols[bj]!; cols[bj] = t
    }
    const piv = A[step * n + step]!
    for (let i = step + 1; i < m; i++) {
      const f = A[i * n + step]! / piv
      if (f === 0) continue
      for (let j = step; j < n; j++) A[i * n + j] = A[i * n + j]! - f * A[step * n + j]!
    }
    rank++
  }
  const basis: Float64Array[] = []
  for (let free = rank; free < n; free++) {
    const v = new Float64Array(n)
    v[free] = 1
    for (let i = rank - 1; i >= 0; i--) {
      let sum = 0
      for (let j = i + 1; j < n; j++) sum += A[i * n + j]! * v[j]!
      v[i] = -sum / A[i * n + i]!
    }
    const out = new Float64Array(n)
    for (let k = 0; k < n; k++) out[cols[k]!] = v[k]!
    basis.push(out)
  }
  return { rank, basis, colScale }
}

/** Dense Jacobian of a component's equations at the pose, rows in equation order. */
const denseJacobian = (sys: System, S: PoseState, comp: System["components"][number], rows: ReadonlyArray<number>): Float64Array => {
  const local = new Map<number, number>()
  comp.occurrences.forEach((o, k) => local.set(o, k))
  const n = comp.occurrences.length * 6
  const J = new Float64Array(rows.length * n)
  const row = new Float64Array(12)
  rows.forEach((k, i) => {
    const e = sys.compiled.equations[k]!
    fillRow(e, S, row)
    const la = local.get(e.a), lb = local.get(e.b)
    if (la !== undefined) for (let c = 0; c < 6; c++) J[i * n + la * 6 + c] = row[c]!
    if (lb !== undefined) for (let c = 0; c < 6; c++) J[i * n + lb * 6 + c] = row[6 + c]!
  })
  return J
}

/** Rank added by each mate to the mates before it (Gram-Schmidt over their scaled rows). */
const rankContributions = (sys: System, S: PoseState, comp: System["components"][number]): Map<number, number> => {
  const n = comp.occurrences.length * 6
  const J = denseJacobian(sys, S, comp, comp.equations)
  const basis: Float64Array[] = []
  const added = new Map<number, number>()
  const colNorm = new Float64Array(n).fill(0)
  for (let i = 0; i < comp.equations.length; i++) for (let j = 0; j < n; j++) colNorm[j] = Math.max(colNorm[j]!, Math.abs(J[i * n + j]!))
  comp.equations.forEach((k, i) => {
    const mate = sys.compiled.equations[k]!.mate
    const v = new Float64Array(n)
    let big = 0
    for (let j = 0; j < n; j++) { v[j] = colNorm[j]! > 1e-12 ? J[i * n + j]! / colNorm[j]! : 0; big = Math.max(big, Math.abs(v[j]!)) }
    if (big < 1e-12) { added.set(mate, added.get(mate) ?? 0); return }
    for (let j = 0; j < n; j++) v[j] = v[j]! / big
    for (let pass = 0; pass < 2; pass++) for (const q of basis) { let d = 0; for (let j = 0; j < n; j++) d += v[j]! * q[j]!; for (let j = 0; j < n; j++) v[j] = v[j]! - d * q[j]! }
    let norm = 0
    for (let j = 0; j < n; j++) norm += v[j]! * v[j]!
    norm = Math.sqrt(norm)
    if (norm > 1e-6) { for (let j = 0; j < n; j++) v[j] = v[j]! / norm; basis.push(v); added.set(mate, (added.get(mate) ?? 0) + 1) } else added.set(mate, added.get(mate) ?? 0)
  })
  return added
}

// ------------------------------------------------------------------------------------------------ the public solve

const clampJointValues = (mates: ReadonlyArray<Mate>): { mates: Mate[]; clamped: Array<{ id: string; quantity: "angle" | "slide"; value: number; limit: number }> } => {
  const clamped: Array<{ id: string; quantity: "angle" | "slide"; value: number; limit: number }> = []
  let counter = 0
  const out = mates.map((m) => {
    const id = m.id ?? `${m.kind}#${counter++}`
    if (m.kind === "revolute" && m.value !== undefined && m.limits !== undefined) {
      const v = Math.min(m.limits.max, Math.max(m.limits.min, m.value))
      if (v !== m.value) { clamped.push({ id, quantity: "angle", value: m.value, limit: v }); return { ...m, value: v } }
    }
    if (m.kind === "slider" && m.value !== undefined && m.limits !== undefined) {
      const v = Math.min(m.limits.max, Math.max(m.limits.min, m.value))
      if (v !== m.value) { clamped.push({ id, quantity: "slide", value: m.value, limit: v }); return { ...m, value: v } }
    }
    if (m.kind === "cylindrical") {
      let next = m
      if (m.angle !== undefined && m.angleLimits !== undefined) {
        const v = Math.min(m.angleLimits.max, Math.max(m.angleLimits.min, m.angle))
        if (v !== m.angle) { clamped.push({ id, quantity: "angle", value: m.angle, limit: v }); next = { ...next, angle: v } }
      }
      if (m.slide !== undefined && m.slideLimits !== undefined) {
        const v = Math.min(m.slideLimits.max, Math.max(m.slideLimits.min, m.slide))
        if (v !== m.slide) { clamped.push({ id, quantity: "slide", value: m.slide, limit: v }); next = { ...next, slide: v } }
      }
      return next
    }
    return m
  })
  return { mates: out, clamped }
}

/** Solves the mates of an assembly; the result carries the world transforms, the freedom left and the diagnostics. */
export const solveAssembly = (assembly: Assembly, mates: ReadonlyArray<Mate>, options: SolveAssemblyOptions = {}): AssemblySolution => {
  const tol = options.tolerance ?? 1e-10
  const maxIterations = options.maxIterations ?? 100
  const flat = flattenAssembly(assembly, options.configuration)
  const index = new Map(flat.map((f, i) => [f.path, i] as const))
  const initial = stateOf(flat)
  const { mates: driven, clamped } = options.enforceLimits === false ? { mates: [...mates], clamped: [] } : clampJointValues(mates)
  const compiled = compileMates(driven, index, initial)
  const sys = buildSystem(flat, compiled)
  const S = stateOf(flat, options.start)
  let iterations = 0
  for (const comp of sys.components) iterations = Math.max(iterations, solveComponent(sys, S, comp, null, tol, maxIterations, options.signal).iterations)
  let residual = 0
  for (const e of compiled.equations) residual = Math.max(residual, Math.abs(e.f(S, null)))
  const solved = residual <= SOLVED

  let dof = 0
  const freedom: Record<string, number> = {}
  const redundantMates: string[] = []
  let conflictSet: string[] = []
  let minimal = true
  if (options.analyze !== false) {
    // Occurrences no mate touches float with 6 degrees of freedom.
    const inComponent = new Set(sys.components.flatMap((c) => c.occurrences))
    flat.forEach((f, i) => { if (!f.grounded && !inComponent.has(i)) { dof += 6; freedom[f.path] = 6 } })
    for (const comp of sys.components) {
      const n = comp.occurrences.length * 6
      const J = denseJacobian(sys, S, comp, comp.equations)
      const { rank, basis, colScale } = comp.equations.length === 0
        ? { rank: 0, basis: Array.from({ length: n }, (_, k) => { const v = new Float64Array(n); v[k] = 1; return v }), colScale: new Float64Array(n).fill(1) }
        : rankNull(J, comp.equations.length, n)
      dof += n - rank
      comp.occurrences.forEach((o, k) => {
        // Freedom of one occurrence: the rank of the null-space basis restricted to its six unknowns.
        const rows = basis.length
        if (rows === 0) return
        const sub = new Float64Array(rows * 6)
        basis.forEach((v, bi) => { for (let c = 0; c < 6; c++) sub[bi * 6 + c] = v[k * 6 + c]! / (colScale[k * 6 + c]! > 0 ? 1 : 1) })
        const f = rankNull(sub, rows, 6).rank
        if (f > 0) freedom[flat[o]!.path] = f
      })
      if (comp.equations.length > 0) {
        const added = rankContributions(sys, S, comp)
        for (const [mate, count] of added) if (count === 0) redundantMates.push(compiled.names[mate]!)
      }
    }
    if (!solved && options.diagnoseBudget !== 0) {
      const failing = new Set<number>()
      sys.compiled.equations.forEach((e) => { if (Math.abs(e.f(S, null)) > SOLVED) failing.add(e.mate) })
      const candidates = [...new Set(compiled.equations.map((e) => e.mate))].filter((mate) => sys.components.some((c) => c.equations.some((k) => compiled.equations[k]!.mate === mate)))
      const found = minimalUnsatisfiable(
        candidates,
        (active) => {
          const skip = new Set(candidates.filter((c) => !active.has(c)))
          const trial = stateOf(flat, options.start)
          let worst = 0
          for (const comp of sys.components) worst = Math.max(worst, solveComponent(sys, trial, comp, skip, tol, maxIterations, options.signal).residual)
          return worst > SOLVED
        },
        options.diagnoseBudget ?? 300, options.signal
      )
      conflictSet = found.items.map((mate) => compiled.names[mate]!)
      minimal = found.minimal
    }
  } else dof = -1

  const joints: JointReading[] = compiled.joints.map((j) => {
    const value = j.measure(S)
    const violation = (() => {
      if (value.angle !== undefined && j.limits !== undefined && j.kind !== "slider" && (value.angle < j.limits.min - 1e-6 || value.angle > j.limits.max + 1e-6)) return { quantity: "angle" as const, value: value.angle, limit: value.angle < j.limits.min ? j.limits.min : j.limits.max }
      if (value.slide !== undefined) {
        const lim = j.kind === "cylindrical" ? j.slideLimits : j.limits
        if (lim !== undefined && (value.slide < lim.min - 1e-6 || value.slide > lim.max + 1e-6)) return { quantity: "slide" as const, value: value.slide, limit: value.slide < lim.min ? lim.min : lim.max }
      }
      return undefined
    })()
    const requested = clamped.find((c) => c.id === j.id)
    return {
      id: j.id, kind: j.kind,
      ...(value.angle !== undefined ? { angle: value.angle } : {}), ...(value.slide !== undefined ? { slide: value.slide } : {}),
      ...(violation !== undefined ? { violation } : requested !== undefined ? { violation: { quantity: requested.quantity, value: requested.value, limit: requested.limit } } : {})
    }
  })
  const transforms = new Map<string, Transform>()
  flat.forEach((f, i) => transforms.set(f.path, f.grounded ? f.transform : transformOf(S, i)))
  const status: AssemblyStatus = !solved ? (conflictSet.length > 0 ? "conflicting" : "failed") : options.analyze === false ? "under-constrained" : dof === 0 ? "fully-constrained" : "under-constrained"
  return {
    transforms, status, dof, freedom, residual, iterations, redundantMates, conflictSet, minimal, joints,
    ...(status === "conflicting" ? { message: `The mates cannot all hold; ${minimal ? "minimal conflicting set" : "conflicting set (search budget exhausted)"}: ${conflictSet.join(", ")}` } : status === "failed" ? { message: "The mate solver did not converge" } : {})
  }
}

export interface JointSweepFrame { readonly value: number; readonly solution: AssemblySolution }

/**
 * Moves one driven joint (a revolute or slider mate by id) through `values`, each solve starting from the previous pose, and returns
 * the frames. Stops at the first frame that fails to solve (reported as the last frame).
 */
export const sweepJoint = (
  assembly: Assembly, mates: ReadonlyArray<Mate>, jointId: string, values: ReadonlyArray<number>, options: SolveAssemblyOptions = {}
): JointSweepFrame[] => {
  let counter = 0
  const target = mates.findIndex((m) => (m.id ?? `${m.kind}#${counter++}`) === jointId)
  if (target < 0) throw new AssemblyError(`No joint '${jointId}'`)
  const joint = mates[target]!
  if (joint.kind !== "revolute" && joint.kind !== "slider") throw new AssemblyError(`'${jointId}' is a ${joint.kind}: only revolute and slider joints can be swept`)
  const frames: JointSweepFrame[] = []
  let start: ReadonlyMap<string, Transform> | undefined
  for (const value of values) {
    const driven = mates.map((m, i) => (i === target ? { ...m, value } as Mate : m))
    const solution = solveAssembly(assembly, driven, { ...options, analyze: false, ...(start !== undefined ? { start } : {}) })
    frames.push({ value, solution })
    if (solution.status === "failed" || solution.status === "conflicting" || solution.residual > SOLVED) break
    start = solution.transforms
  }
  return frames
}
