/**
 * Parametric 2D sketches: points, lines, circles and arcs held together by geometric and dimensional constraints, solved
 * numerically. Change a dimension and the whole sketch follows; leave it under-constrained and the solver says which points still
 * move freely.
 *
 * Model
 *   points   the unknowns: every point has an `x` and a `y`. Lines, circles and arcs are made of points (so two lines that share an
 *            end share the point, and moving one moves both), plus a radius for a circle.
 *   lines    two points.
 *   circles  a centre point and a radius (an unknown of its own).
 *   arcs     a centre point and two points on the circle, counter-clockwise from `start` to `end`; the radius is |start - centre| and
 *            `end` is kept on the same circle by a constraint the solver adds itself.
 *
 * Solving
 *   Every constraint is a few residual equations (zero when satisfied). The unknowns are the coordinates and radii. The solver is
 *   Levenberg-Marquardt on the residuals with a central-difference Jacobian: each step is the smallest change of the current
 *   geometry that reduces the residuals, so the sketch stays near what the user drew and a dragged point drags the rest the way it
 *   would on a drawing board. A solved sketch is then analysed from the rank of the Jacobian:
 *     degrees of freedom   unknowns - rank: how many independent ways the sketch can still change
 *     free points          the points that can still move (a null-space vector has a component on them)
 *     redundant            equations beyond the rank: consistent (harmless) or in conflict (the residual does not reach zero)
 *   Status: `fully-constrained` (no freedom, solved), `under-constrained` (freedom left, solved), `over-constrained` (redundant but
 *   consistent), `conflicting` (no solution; the constraints that miss the most are named), `failed` (did not converge).
 *
 * Dimensions are numbers; the parametric history (`history.ts`) resolves its expressions to numbers before it calls the solver.
 */
import type { Vec2 } from "./vec.ts"

export type PointId = string

export interface SketchPoint { readonly id: string; readonly kind: "point"; readonly x: number; readonly y: number }
export interface SketchLine { readonly id: string; readonly kind: "line"; readonly p1: PointId; readonly p2: PointId }
export interface SketchCircle { readonly id: string; readonly kind: "circle"; readonly center: PointId; readonly radius: number }
/** Counter-clockwise from `start` to `end` about `center`. */
export interface SketchArc { readonly id: string; readonly kind: "arc"; readonly center: PointId; readonly start: PointId; readonly end: PointId }
export type SketchEntity = SketchPoint | SketchLine | SketchCircle | SketchArc

/** A constraint, optionally named so a conflict can point at it. */
export type Constraint = (
  | { readonly type: "fixed"; readonly point: string; readonly x?: number; readonly y?: number }
  | { readonly type: "coincident"; readonly a: string; readonly b: string }
  | { readonly type: "horizontal"; readonly line: string }
  | { readonly type: "vertical"; readonly line: string }
  | { readonly type: "horizontalPoints"; readonly a: string; readonly b: string }
  | { readonly type: "verticalPoints"; readonly a: string; readonly b: string }
  | { readonly type: "distance"; readonly a: string; readonly b: string; readonly value: number }
  | { readonly type: "distanceX"; readonly a: string; readonly b: string; readonly value: number }
  | { readonly type: "distanceY"; readonly a: string; readonly b: string; readonly value: number }
  | { readonly type: "length"; readonly line: string; readonly value: number }
  | { readonly type: "parallel"; readonly a: string; readonly b: string }
  | { readonly type: "perpendicular"; readonly a: string; readonly b: string }
  | { readonly type: "equalLength"; readonly a: string; readonly b: string }
  | { readonly type: "equalRadius"; readonly a: string; readonly b: string }
  | { readonly type: "radius"; readonly circle: string; readonly value: number }
  | { readonly type: "diameter"; readonly circle: string; readonly value: number }
  /** Angle from line `a` to line `b`, counter-clockwise, radians. */
  | { readonly type: "angle"; readonly a: string; readonly b: string; readonly value: number }
  | { readonly type: "pointOnLine"; readonly point: string; readonly line: string }
  | { readonly type: "pointOnCircle"; readonly point: string; readonly circle: string }
  | { readonly type: "midpoint"; readonly point: string; readonly line: string }
  | { readonly type: "symmetric"; readonly a: string; readonly b: string; readonly line: string }
  | { readonly type: "tangentLineCircle"; readonly line: string; readonly circle: string }
  /** Two circles (or arcs) touch: externally (distance = r1 + r2) or internally (distance = |r1 - r2|). */
  | { readonly type: "tangentCircles"; readonly a: string; readonly b: string; readonly internal?: boolean }
  /** The centre of a circle or arc lies on a point (or: the circle is concentric with another). */
  | { readonly type: "concentric"; readonly a: string; readonly b: string }
) & { readonly id?: string }

export interface Sketch {
  readonly entities: ReadonlyArray<SketchEntity>
  readonly constraints: ReadonlyArray<Constraint>
}

export type SolveStatus = "fully-constrained" | "under-constrained" | "over-constrained" | "conflicting" | "failed"

export interface SolveResult {
  readonly sketch: Sketch
  readonly status: SolveStatus
  readonly dof: number
  readonly iterations: number
  /** Largest absolute residual left. */
  readonly residual: number
  /** Ids of the points that can still move, and of the circles whose radius can still change. */
  readonly free: ReadonlyArray<string>
  /** Constraints that could not be satisfied (conflicting), worst first. */
  readonly conflicts: ReadonlyArray<string>
  /** Redundant equations (rank deficiency of the constraint set). */
  readonly redundant: number
  readonly message?: string
}

export interface SolveOptions {
  readonly maxIterations?: number
  readonly tolerance?: number
}

// ---------------------------------------------------------------- system

interface Layout {
  readonly index: Map<string, number>
  readonly names: string[]
  readonly x: Float64Array
}

const pointOf = (entities: ReadonlyArray<SketchEntity>): Map<string, SketchPoint> => {
  const m = new Map<string, SketchPoint>()
  for (const e of entities) if (e.kind === "point") m.set(e.id, e)
  return m
}

const layoutOf = (sketch: Sketch): Layout => {
  const index = new Map<string, number>()
  const names: string[] = []
  const values: number[] = []
  const add = (name: string, v: number) => { index.set(name, values.length); names.push(name); values.push(v) }
  for (const e of sketch.entities) {
    if (e.kind === "point") { add(`${e.id}.x`, e.x); add(`${e.id}.y`, e.y) }
  }
  for (const e of sketch.entities) if (e.kind === "circle") add(`${e.id}.r`, e.radius)
  return { index, names, x: Float64Array.from(values) }
}

export class SketchError extends Error {
  constructor(message: string) { super(message); this.name = "SketchError" }
}

type Residual = (x: Float64Array) => number[]

/** Builds the residual function of the whole sketch, and the name of the constraint behind each equation. */
const buildSystem = (sketch: Sketch, layout: Layout): { readonly equations: Residual[]; readonly owner: string[] } => {
  const byId = new Map<string, SketchEntity>()
  for (const e of sketch.entities) {
    if (byId.has(e.id)) throw new SketchError(`Duplicate entity id '${e.id}'`)
    byId.set(e.id, e)
  }
  const idx = (name: string): number => {
    const i = layout.index.get(name)
    if (i === undefined) throw new SketchError(`Unknown unknown '${name}'`)
    return i
  }
  const point = (id: string) => {
    const e = byId.get(id)
    if (e === undefined || e.kind !== "point") throw new SketchError(`'${id}' is not a point of the sketch`)
    const ix = idx(`${id}.x`), iy = idx(`${id}.y`)
    return { x: (v: Float64Array) => v[ix]!, y: (v: Float64Array) => v[iy]! }
  }
  const line = (id: string) => {
    const e = byId.get(id)
    if (e === undefined || e.kind !== "line") throw new SketchError(`'${id}' is not a line of the sketch`)
    const a = point(e.p1), b = point(e.p2)
    return {
      a, b,
      dx: (v: Float64Array) => b.x(v) - a.x(v),
      dy: (v: Float64Array) => b.y(v) - a.y(v)
    }
  }
  /** A circle or an arc as (centre, radius function). */
  const round = (id: string) => {
    const e = byId.get(id)
    if (e === undefined || (e.kind !== "circle" && e.kind !== "arc")) throw new SketchError(`'${id}' is not a circle or an arc of the sketch`)
    const c = point(e.center)
    if (e.kind === "circle") { const ir = idx(`${e.id}.r`); return { c, r: (v: Float64Array) => v[ir]! } }
    const s = point(e.start)
    return { c, r: (v: Float64Array) => Math.hypot(s.x(v) - c.x(v), s.y(v) - c.y(v)) }
  }

  const equations: Residual[] = []
  const owner: string[] = []
  const add = (name: string, ...eq: Residual[]) => { for (const e of eq) { equations.push(e); owner.push(name) } }

  // Every arc keeps its end on the circle through its start.
  for (const e of sketch.entities) {
    if (e.kind !== "arc") continue
    const c = point(e.center), s = point(e.start), t = point(e.end)
    add(`${e.id} (arc)`, (v) => [Math.hypot(t.x(v) - c.x(v), t.y(v) - c.y(v)) - Math.hypot(s.x(v) - c.x(v), s.y(v) - c.y(v))])
  }

  let counter = 0
  for (const c of sketch.constraints) {
    const name = c.id ?? `${c.type}#${counter++}`
    switch (c.type) {
      case "fixed": {
        const p = point(c.point)
        if (c.x !== undefined) { const x0 = c.x; add(name, (v) => [p.x(v) - x0]) }
        if (c.y !== undefined) { const y0 = c.y; add(name, (v) => [p.y(v) - y0]) }
        if (c.x === undefined && c.y === undefined) {
          const e = byId.get(c.point) as SketchPoint
          const x0 = e.x, y0 = e.y
          add(name, (v) => [p.x(v) - x0], (v) => [p.y(v) - y0])
        }
        break
      }
      case "coincident": { const a = point(c.a), b = point(c.b); add(name, (v) => [a.x(v) - b.x(v)], (v) => [a.y(v) - b.y(v)]); break }
      case "horizontal": { const l = line(c.line); add(name, (v) => [l.dy(v)]); break }
      case "vertical": { const l = line(c.line); add(name, (v) => [l.dx(v)]); break }
      case "horizontalPoints": { const a = point(c.a), b = point(c.b); add(name, (v) => [a.y(v) - b.y(v)]); break }
      case "verticalPoints": { const a = point(c.a), b = point(c.b); add(name, (v) => [a.x(v) - b.x(v)]); break }
      case "distance": { const a = point(c.a), b = point(c.b), d = c.value; add(name, (v) => [Math.hypot(b.x(v) - a.x(v), b.y(v) - a.y(v)) - d]); break }
      case "distanceX": { const a = point(c.a), b = point(c.b), d = c.value; add(name, (v) => [b.x(v) - a.x(v) - d]); break }
      case "distanceY": { const a = point(c.a), b = point(c.b), d = c.value; add(name, (v) => [b.y(v) - a.y(v) - d]); break }
      case "length": { const l = line(c.line), d = c.value; add(name, (v) => [Math.hypot(l.dx(v), l.dy(v)) - d]); break }
      case "parallel": { const a = line(c.a), b = line(c.b); add(name, (v) => [a.dx(v) * b.dy(v) - a.dy(v) * b.dx(v)]); break }
      case "perpendicular": { const a = line(c.a), b = line(c.b); add(name, (v) => [a.dx(v) * b.dx(v) + a.dy(v) * b.dy(v)]); break }
      case "equalLength": { const a = line(c.a), b = line(c.b); add(name, (v) => [Math.hypot(a.dx(v), a.dy(v)) - Math.hypot(b.dx(v), b.dy(v))]); break }
      case "equalRadius": { const a = round(c.a), b = round(c.b); add(name, (v) => [a.r(v) - b.r(v)]); break }
      case "radius": { const a = round(c.circle), r0 = c.value; add(name, (v) => [a.r(v) - r0]); break }
      case "diameter": { const a = round(c.circle), r0 = c.value / 2; add(name, (v) => [a.r(v) - r0]); break }
      case "angle": {
        const a = line(c.a), b = line(c.b), t = c.value
        // The signed angle between the directions, compared to t on the circle (so 359.99 degrees is not far from 0).
        add(name, (v) => {
          const ang = Math.atan2(a.dx(v) * b.dy(v) - a.dy(v) * b.dx(v), a.dx(v) * b.dx(v) + a.dy(v) * b.dy(v))
          return [Math.atan2(Math.sin(ang - t), Math.cos(ang - t))]
        })
        break
      }
      case "pointOnLine": {
        const p = point(c.point), l = line(c.line)
        add(name, (v) => [l.dx(v) * (p.y(v) - l.a.y(v)) - l.dy(v) * (p.x(v) - l.a.x(v))])
        break
      }
      case "pointOnCircle": {
        const p = point(c.point), r = round(c.circle)
        add(name, (v) => [Math.hypot(p.x(v) - r.c.x(v), p.y(v) - r.c.y(v)) - r.r(v)])
        break
      }
      case "midpoint": {
        const p = point(c.point), l = line(c.line)
        add(name, (v) => [p.x(v) - (l.a.x(v) + l.b.x(v)) / 2], (v) => [p.y(v) - (l.a.y(v) + l.b.y(v)) / 2])
        break
      }
      case "symmetric": {
        const a = point(c.a), b = point(c.b), l = line(c.line)
        // The midpoint of a-b is on the line and a-b is perpendicular to it.
        add(name,
          (v) => [l.dx(v) * ((a.y(v) + b.y(v)) / 2 - l.a.y(v)) - l.dy(v) * ((a.x(v) + b.x(v)) / 2 - l.a.x(v))],
          (v) => [l.dx(v) * (b.x(v) - a.x(v)) + l.dy(v) * (b.y(v) - a.y(v))])
        break
      }
      case "tangentLineCircle": {
        const l = line(c.line), r = round(c.circle)
        // Distance from the centre to the line equals the radius (squared, so the sign of the side does not matter).
        add(name, (v) => {
          const cross = l.dx(v) * (r.c.y(v) - l.a.y(v)) - l.dy(v) * (r.c.x(v) - l.a.x(v))
          const len = Math.hypot(l.dx(v), l.dy(v)) || 1e-12
          return [Math.abs(cross) / len - r.r(v)]
        })
        break
      }
      case "tangentCircles": {
        const a = round(c.a), b = round(c.b), internal = c.internal === true
        add(name, (v) => {
          const d = Math.hypot(a.c.x(v) - b.c.x(v), a.c.y(v) - b.c.y(v))
          return [d - (internal ? Math.abs(a.r(v) - b.r(v)) : a.r(v) + b.r(v))]
        })
        break
      }
      case "concentric": {
        const a = round(c.a), b = round(c.b)
        add(name, (v) => [a.c.x(v) - b.c.x(v)], (v) => [a.c.y(v) - b.c.y(v)])
        break
      }
    }
  }
  return { equations, owner }
}

const evaluateAll = (equations: ReadonlyArray<Residual>, x: Float64Array): Float64Array => {
  const out: number[] = []
  for (const f of equations) for (const r of f(x)) out.push(r)
  return Float64Array.from(out)
}

/** Central-difference Jacobian, m rows by n columns, row-major. */
const jacobian = (equations: ReadonlyArray<Residual>, x: Float64Array, m: number): Float64Array => {
  const n = x.length
  const J = new Float64Array(m * n)
  const work = Float64Array.from(x)
  for (let j = 0; j < n; j++) {
    const h = 1e-6 * Math.max(1, Math.abs(x[j]!))
    work[j] = x[j]! + h
    const plus = evaluateAll(equations, work)
    work[j] = x[j]! - h
    const minus = evaluateAll(equations, work)
    work[j] = x[j]!
    for (let i = 0; i < m; i++) J[i * n + j] = (plus[i]! - minus[i]!) / (2 * h)
  }
  return J
}

/** Solves the symmetric positive definite system A x = b in place by Cholesky; false when A is not positive definite. */
const cholesky = (A: Float64Array, b: Float64Array, n: number): boolean => {
  const L = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * n + j]!
      for (let k = 0; k < j; k++) sum -= L[i * n + k]! * L[j * n + k]!
      if (i === j) {
        if (!(sum > 1e-300)) return false
        L[i * n + i] = Math.sqrt(sum)
      } else L[i * n + j] = sum / L[j * n + j]!
    }
  }
  for (let i = 0; i < n; i++) {
    let sum = b[i]!
    for (let k = 0; k < i; k++) sum -= L[i * n + k]! * b[k]!
    b[i] = sum / L[i * n + i]!
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i]!
    for (let k = i + 1; k < n; k++) sum -= L[k * n + i]! * b[k]!
    b[i] = sum / L[i * n + i]!
  }
  return true
}

/**
 * Rank and null space of J (m x n) by Gaussian elimination with full pivoting on a scaled copy. Returns the rank and a basis of the
 * null space as columns of n-vectors.
 */
const nullSpace = (J: Float64Array, m: number, n: number, tol: number): { readonly rank: number; readonly basis: Float64Array[] } => {
  const A = Float64Array.from(J)
  const cols = Array.from({ length: n }, (_, i) => i)
  let rank = 0
  for (let step = 0; step < Math.min(m, n); step++) {
    let bi = -1, bj = -1, best = tol
    for (let i = step; i < m; i++) for (let j = step; j < n; j++) {
      const v = Math.abs(A[i * n + j]!)
      if (v > best) { best = v; bi = i; bj = j }
    }
    if (bi < 0) break
    if (bi !== step) for (let j = 0; j < n; j++) { const t = A[step * n + j]!; A[step * n + j] = A[bi * n + j]!; A[bi * n + j] = t }
    if (bj !== step) {
      for (let i = 0; i < m; i++) { const t = A[i * n + step]!; A[i * n + step] = A[i * n + bj]!; A[i * n + bj] = t }
      const t = cols[step]!; cols[step] = cols[bj]!; cols[bj] = t
    }
    const pivot = A[step * n + step]!
    for (let i = step + 1; i < m; i++) {
      const f = A[i * n + step]! / pivot
      if (f === 0) continue
      for (let j = step; j < n; j++) A[i * n + j] = A[i * n + j]! - f * A[step * n + j]!
    }
    rank++
  }
  // Back-substitute for the free columns: x_pivots = -R11^-1 R12 x_free.
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
  return { rank, basis }
}

/** Solves the sketch; the result carries the moved geometry, the status and the analysis. Throws `SketchError` on a malformed sketch. */
export const solveSketch = (sketch: Sketch, options: SolveOptions = {}): SolveResult => {
  const maxIterations = options.maxIterations ?? 200
  const tol = options.tolerance ?? 1e-9
  const layout = layoutOf(sketch)
  const { equations, owner } = buildSystem(sketch, layout)
  let x = Float64Array.from(layout.x)
  const n = x.length
  let r = evaluateAll(equations, x)
  const m = r.length
  const norm = (v: Float64Array): number => { let s = 0; for (const e of v) s += e * e; return Math.sqrt(s) }
  const maxAbs = (v: Float64Array): number => { let s = 0; for (const e of v) s = Math.max(s, Math.abs(e)); return s }
  let iterations = 0
  if (m > 0 && maxAbs(r) > tol) {
    let lambda = 1e-3
    for (; iterations < maxIterations; iterations++) {
      const J = jacobian(equations, x, m)
      // Normal equations (J^T J + lambda I) dx = -J^T r.
      const A = new Float64Array(n * n)
      const g = new Float64Array(n)
      for (let i = 0; i < m; i++) {
        for (let a = 0; a < n; a++) {
          const ja = J[i * n + a]!
          if (ja === 0) continue
          g[a] = g[a]! - ja * r[i]!
          for (let b = 0; b <= a; b++) A[a * n + b] = A[a * n + b]! + ja * J[i * n + b]!
        }
      }
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) A[a * n + b] = A[b * n + a]!
      const before = norm(r)
      let improved = false
      for (let attempt = 0; attempt < 12; attempt++) {
        const M = Float64Array.from(A)
        for (let a = 0; a < n; a++) M[a * n + a] = M[a * n + a]! + lambda * Math.max(1, A[a * n + a]!)
        const dx = Float64Array.from(g)
        if (!cholesky(M, dx, n)) { lambda *= 10; continue }
        const trial = Float64Array.from(x, (v, k) => v + dx[k]!)
        const rt = evaluateAll(equations, trial)
        if (norm(rt) < before) {
          x = trial
          r = rt
          lambda = Math.max(lambda / 5, 1e-12)
          improved = true
          break
        }
        lambda *= 10
      }
      if (!improved || maxAbs(r) <= tol) break
    }
  }
  const residual = maxAbs(r)

  // Analysis at the solution.
  const J = m > 0 ? jacobian(equations, x, m) : new Float64Array(0)
  const { rank, basis } = m > 0 ? nullSpace(J, m, n, 1e-7) : { rank: 0, basis: Array.from({ length: n }, (_, i) => { const v = new Float64Array(n); v[i] = 1; return v }) }
  const dof = n - rank
  const redundant = m - rank
  const freePoints = new Set<string>()
  for (const v of basis) {
    for (let k = 0; k < n; k++) {
      if (Math.abs(v[k]!) > 1e-6) {
        const name = layout.names[k]!
        freePoints.add(name.slice(0, name.lastIndexOf(".")))
      }
    }
  }

  // Conflicts: the constraints whose equations still miss.
  const missed = new Map<string, number>()
  { let row = 0; for (const f of equations) for (const val of f(x)) { if (Math.abs(val) > 1e-6) missed.set(owner[row]!, Math.max(missed.get(owner[row]!) ?? 0, Math.abs(val))); row++ } }
  const conflicts = [...missed.entries()].sort((p, q) => q[1] - p[1]).map(([name]) => name)

  const solved = residual <= 1e-6
  const status: SolveStatus = !solved
    ? (redundant > 0 ? "conflicting" : "failed")
    : dof === 0 ? (redundant > 0 ? "over-constrained" : "fully-constrained")
      : (redundant > 0 ? "over-constrained" : "under-constrained")

  const moved = (e: SketchEntity): SketchEntity => {
    if (e.kind === "point") return { ...e, x: x[layout.index.get(`${e.id}.x`)!]!, y: x[layout.index.get(`${e.id}.y`)!]! }
    if (e.kind === "circle") return { ...e, radius: Math.abs(x[layout.index.get(`${e.id}.r`)!]!) }
    return e
  }
  return {
    sketch: { entities: sketch.entities.map(moved), constraints: sketch.constraints },
    status, dof, iterations, residual,
    free: [...freePoints].filter((id) => sketch.entities.some((e) => e.id === id && (e.kind === "point" || e.kind === "circle"))).sort(),
    conflicts: solved ? [] : conflicts,
    redundant,
    ...(status === "conflicting" ? { message: `The constraints cannot all hold; the worst miss is ${conflicts[0] ?? "unknown"}` } : status === "failed" ? { message: "The solver did not converge" } : {})
  }
}

// ---------------------------------------------------------------- profiles

/** Points round an arc, counter-clockwise from `start` to `end`, at most `tolerance` from the true arc. */
const arcPoints = (c: Vec2, s: Vec2, e: Vec2, tolerance: number): Vec2[] => {
  const r = Math.hypot(s.x - c.x, s.y - c.y)
  const a0 = Math.atan2(s.y - c.y, s.x - c.x)
  let sweep = Math.atan2(e.y - c.y, e.x - c.x) - a0
  while (sweep <= 1e-12) sweep += 2 * Math.PI
  const step = 2 * Math.acos(Math.max(0, 1 - tolerance / Math.max(r, 1e-12)))
  const n = Math.max(2, Math.ceil(sweep / Math.max(step, 1e-3)))
  return Array.from({ length: n + 1 }, (_, k) => k === 0 ? { x: s.x, y: s.y } : k === n ? { x: e.x, y: e.y } : { x: c.x + r * Math.cos(a0 + (sweep * k) / n), y: c.y + r * Math.sin(a0 + (sweep * k) / n) })
}

/**
 * The closed profiles of a (solved) sketch: lines and arcs chained end to end through their shared points, and every circle on its
 * own, as polygons within `tolerance` of the true outline. An open chain (a dangling end) is returned in `open`.
 */
export const sketchProfiles = (sketch: Sketch, tolerance = 0.01): { readonly loops: Vec2[][]; readonly open: Vec2[][] } => {
  const pts = pointOf(sketch.entities)
  const at = (id: string): Vec2 => {
    const p = pts.get(id)
    if (p === undefined) throw new SketchError(`'${id}' is not a point of the sketch`)
    return p
  }
  interface Edge { readonly a: string; readonly b: string; readonly points: (forward: boolean) => Vec2[] }
  const edges: Edge[] = []
  const loops: Vec2[][] = []
  for (const e of sketch.entities) {
    if (e.kind === "line") edges.push({ a: e.p1, b: e.p2, points: (f) => (f ? [at(e.p1), at(e.p2)] : [at(e.p2), at(e.p1)]) })
    else if (e.kind === "arc") edges.push({ a: e.start, b: e.end, points: (f) => { const p = arcPoints(at(e.center), at(e.start), at(e.end), tolerance); return f ? p : [...p].reverse() } })
    else if (e.kind === "circle") {
      const c = at(e.center)
      const step = 2 * Math.acos(Math.max(0, 1 - tolerance / Math.max(e.radius, 1e-12)))
      const n = Math.max(8, Math.ceil((2 * Math.PI) / Math.max(step, 1e-3)))
      loops.push(Array.from({ length: n }, (_, k) => ({ x: c.x + e.radius * Math.cos((2 * Math.PI * k) / n), y: c.y + e.radius * Math.sin((2 * Math.PI * k) / n) })))
    }
  }
  const used = new Set<number>()
  const open: Vec2[][] = []
  const incident = (pid: string): number[] => edges.flatMap((ed, i) => (!used.has(i) && (ed.a === pid || ed.b === pid) ? [i] : []))
  for (let i = 0; i < edges.length; i++) {
    if (used.has(i)) continue
    used.add(i)
    const first = edges[i]!
    const chain: Vec2[] = [...first.points(true)]
    let head = first.b
    const start = first.a
    for (;;) {
      if (head === start) break
      const next = incident(head)[0]
      if (next === undefined) break
      used.add(next)
      const ed = edges[next]!
      const forward = ed.a === head
      chain.push(...ed.points(forward).slice(1))
      head = forward ? ed.b : ed.a
    }
    if (head === start) { chain.pop(); loops.push(chain) } else open.push(chain)
  }
  return { loops, open }
}

/** Signed area of a polygon (positive counter-clockwise). */
export const polygonArea = (ring: ReadonlyArray<Vec2>): number => {
  let a = 0
  for (let i = 0; i < ring.length; i++) { const p = ring[i]!, q = ring[(i + 1) % ring.length]!; a += p.x * q.y - q.x * p.y }
  return a / 2
}
