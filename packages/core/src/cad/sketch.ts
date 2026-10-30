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
 * Solving (`sketch-solver.ts`)
 *   Every constraint is a few residual equations (zero when satisfied) with analytic gradients. The unknowns are the coordinates and
 *   radii. The equations split into connected components; each is solved by Levenberg-Marquardt on the sparse Jacobian (normal
 *   equations in envelope form after a reverse Cuthill-McKee ordering), so each step is the smallest change of the current geometry
 *   that reduces the residuals: the sketch stays near what the user drew. A solved sketch is then analysed from the rank of the
 *   Jacobian:
 *     degrees of freedom   unknowns - rank: how many independent ways the sketch can still change
 *     free points          the points that can still move (a null-space vector has a component on them)
 *     redundant            equations beyond the rank: consistent (harmless) or in conflict (the residual does not reach zero)
 *   Status: `fully-constrained` (no freedom, solved), `under-constrained` (freedom left, solved), `over-constrained` (redundant but
 *   consistent), `conflicting` (no solution; a minimal conflicting set is named), `failed` (did not converge).
 *   `createSketchSession` / `dragSketch` re-solve incrementally for interactive dragging (warm start, one component).
 *
 * Dimensions are numbers; the parametric history (`history.ts`) resolves its expressions to numbers before it calls the solver.
 */
import type { Vec2 } from "./vec.ts"
import { catmullRomCurves, sampleNominalCurves } from "./sketch-curves.ts"
import { SketchError, type Sketch, type SketchEntity, type SketchPoint, type SolveOptions, type SolveResult } from "./sketch-model.ts"
import { solveSketchSystem } from "./sketch-solver.ts"

export * from "./sketch-model.ts"
export { createSketchSession, dragSketch, type SketchSession, type DragResult, type DragOptions } from "./sketch-solver.ts"

/** Solves the sketch; the result carries the moved geometry, the status and the analysis. Throws `SketchError` on a malformed sketch. */
export const solveSketch = (sketch: Sketch, options: SolveOptions = {}): SolveResult => solveSketchSystem(sketch, options)

const pointOf = (entities: ReadonlyArray<SketchEntity>): Map<string, SketchPoint> => {
  const m = new Map<string, SketchPoint>()
  for (const e of entities) if (e.kind === "point") m.set(e.id, e)
  return m
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

/** Points round an ellipse, counter-clockwise, at most `tolerance` from the true curve. */
export const ellipseLoopPoints = (centre: Vec2, radiusX: number, radiusY: number, rotation = 0, tolerance = 0.01): Vec2[] => {
  const maxR = Math.max(radiusX, radiusY, 1e-9)
  const step = 2 * Math.acos(Math.max(0, 1 - tolerance / maxR))
  const n = Math.max(16, Math.ceil((2 * Math.PI) / Math.max(step, 1e-3)))
  const cos = Math.cos(rotation), sin = Math.sin(rotation)
  return Array.from({ length: n }, (_, k) => {
    const t = (2 * Math.PI * k) / n
    const lx = radiusX * Math.cos(t), ly = radiusY * Math.sin(t)
    return { x: centre.x + lx * cos - ly * sin, y: centre.y + lx * sin + ly * cos }
  })
}

/**
 * Points along a Catmull-Rom spline through `pts`. Open splines are padded by reflecting the end spans; closed ones wrap.
 * The sampled curve passes through every point of `pts`.
 */
export const splinePoints = (pts: ReadonlyArray<Vec2>, closed = false, tolerance = 0.01): Vec2[] => {
  if (pts.length < 2) return pts.map((p) => ({ ...p }))
  const at = (i: number): Vec2 => {
    if (closed) return pts[((i % pts.length) + pts.length) % pts.length]!
    return pts[Math.max(0, Math.min(pts.length - 1, i))]!
  }
  const spans = closed ? pts.length : pts.length - 1
  const out: Vec2[] = []
  for (let s = 0; s < spans; s++) {
    const p0 = at(s - 1), p1 = at(s), p2 = at(s + 1), p3 = at(s + 2)
    const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const n = Math.max(4, Math.min(64, Math.ceil(chord / Math.max(8 * tolerance, 1e-6))))
    for (let k = s === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
      })
    }
  }
  return out
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
  const open: Vec2[][] = []
  const replaced = new Set(sketch.nominalCurves?.flatMap((curve) => curve.replaces))
  for (const curve of sketch.nominalCurves ?? []) {
    const sampled = sampleNominalCurves(curve.segments, tolerance)
    if (curve.closed) { sampled.pop(); loops.push(sampled) }
    else edges.push({ a: curve.start, b: curve.end, points: (forward) => forward ? sampled : [...sampled].reverse() })
  }
  for (const e of sketch.entities) {
    if (replaced.has(e.id)) continue
    if (e.kind === "line") edges.push({ a: e.p1, b: e.p2, points: (f) => (f ? [at(e.p1), at(e.p2)] : [at(e.p2), at(e.p1)]) })
    else if (e.kind === "arc") edges.push({ a: e.start, b: e.end, points: (f) => { const p = arcPoints(at(e.center), at(e.start), at(e.end), tolerance); return f ? p : [...p].reverse() } })
    else if (e.kind === "circle") {
      const c = at(e.center)
      const step = 2 * Math.acos(Math.max(0, 1 - tolerance / Math.max(e.radius, 1e-12)))
      const n = Math.max(8, Math.ceil((2 * Math.PI) / Math.max(step, 1e-3)))
      loops.push(Array.from({ length: n }, (_, k) => ({ x: c.x + e.radius * Math.cos((2 * Math.PI * k) / n), y: c.y + e.radius * Math.sin((2 * Math.PI * k) / n) })))
    }
    else if (e.kind === "ellipse") loops.push(ellipseLoopPoints(at(e.center), e.radiusX, e.radiusY, e.rotation ?? 0, tolerance))
    else if (e.kind === "spline") {
      const sampled = sampleNominalCurves(catmullRomCurves(e.points.map(at), e.closed === true), tolerance)
      if (e.closed === true) { if (sampled.length > 1 && Math.hypot(sampled[0]!.x - sampled[sampled.length - 1]!.x, sampled[0]!.y - sampled[sampled.length - 1]!.y) < 1e-9) sampled.pop(); loops.push(sampled) }
      else edges.push({ a: e.points[0]!, b: e.points[e.points.length - 1]!, points: (forward) => forward ? sampled : [...sampled].reverse() })
    }
  }
  const used = new Set<number>()
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
