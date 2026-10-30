/**
 * The equations behind the sketch constraints, each with an analytic gradient.
 *
 * An equation is a scalar residual of a few unknowns, `f(x, v, g)`: `v` lists the positions in `x` of its unknowns (the same
 * unknown may appear twice when two lines share a point; the gradient entries then add), the value is returned and, when `g` is
 * given, `g[k]` receives d f / d x[v[k]]. The same function therefore serves the global unknown vector and the permuted local
 * vector of one component (`sketch-solver.ts`). Scale-free forms are used where a constraint is geometric (parallel is the sine of
 * the angle, point-on-line the signed distance) so that every row of the Jacobian is O(1) whatever the size of the drawing.
 *
 * Every gradient here is checked against central differences for every constraint kind in `sketch-solver.test.ts`.
 */
import { SketchError, type Constraint, type Sketch, type SketchEntity, type SketchPoint } from "./sketch-model.ts"

export type EqFn = (x: Float64Array, v: Int32Array, g: Float64Array | null) => number

export interface Eq {
  /** Global positions of the unknowns, in the order `f` reads them. */
  readonly vars: Int32Array
  readonly f: EqFn
  /** Index of the constraint in `sketch.constraints`, or -1 for an equation the solver adds itself (arc closure). */
  readonly constraint: number
}

export interface Layout {
  readonly index: Map<string, number>
  readonly names: string[]
  readonly x: Float64Array
}

export interface Driven { readonly id: string; readonly type: string; readonly measure: (x: Float64Array) => number }

export interface CompiledEquations {
  readonly layout: Layout
  readonly eqs: ReadonlyArray<Eq>
  /** Name of every constraint (its id, or `type#n`), by constraint index. */
  readonly constraintNames: ReadonlyArray<string>
  /** Display name of the owner of equation `i`: the constraint name or `<arc> (arc)`. */
  readonly ownerNames: ReadonlyArray<string>
  readonly driven: ReadonlyArray<Driven>
}

export const layoutOf = (sketch: Sketch): Layout => {
  const index = new Map<string, number>()
  const names: string[] = []
  const values: number[] = []
  const add = (name: string, v: number) => { index.set(name, values.length); names.push(name); values.push(v) }
  for (const e of sketch.entities) if (e.kind === "point") { add(`${e.id}.x`, e.x); add(`${e.id}.y`, e.y) }
  for (const e of sketch.entities) if (e.kind === "circle") add(`${e.id}.r`, e.radius)
  for (const e of sketch.entities) if (e.kind === "ellipse") { add(`${e.id}.rx`, e.radiusX); add(`${e.id}.ry`, e.radiusY) }
  return { index, names, x: Float64Array.from(values) }
}

const TINY = 1e-12

// ------------------------------------------------------------------------------------------------ primitive equations

/** x[v1] - x[v0] - d. */
const diff = (d: number): EqFn => (x, v, g) => {
  if (g !== null) { g[0] = -1; g[1] = 1 }
  return x[v[1]!]! - x[v[0]!]! - d
}
/** x[v0] - c. */
const pin = (c: number): EqFn => (x, v, g) => {
  if (g !== null) g[0] = 1
  return x[v[0]!]! - c
}
/** |b - a| - d on unknowns [ax, ay, bx, by]. */
const dist = (d: number): EqFn => (x, v, g) => {
  const dx = x[v[2]!]! - x[v[0]!]!, dy = x[v[3]!]! - x[v[1]!]!
  const len = Math.hypot(dx, dy)
  if (g !== null) {
    const ux = len > TINY ? dx / len : 1, uy = len > TINY ? dy / len : 0
    g[0] = -ux; g[1] = -uy; g[2] = ux; g[3] = uy
  }
  return len - d
}
/** |b - a| - |d - c| on unknowns [ax, ay, bx, by, cx, cy, dx, dy]. */
const equalDist: EqFn = (x, v, g) => {
  const ax = x[v[2]!]! - x[v[0]!]!, ay = x[v[3]!]! - x[v[1]!]!, bx = x[v[6]!]! - x[v[4]!]!, by = x[v[7]!]! - x[v[5]!]!
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by)
  if (g !== null) {
    const uax = la > TINY ? ax / la : 1, uay = la > TINY ? ay / la : 0, ubx = lb > TINY ? bx / lb : 1, uby = lb > TINY ? by / lb : 0
    g[0] = -uax; g[1] = -uay; g[2] = uax; g[3] = uay
    g[4] = ubx; g[5] = uby; g[6] = -ubx; g[7] = -uby
  }
  return la - lb
}
/** |t - c| - |s - c| on [tx, ty, cx, cy, sx, sy] (the end of an arc stays on the circle through its start). */
const arcClosure: EqFn = (x, v, g) => {
  const cx = x[v[2]!]!, cy = x[v[3]!]!
  const tx = x[v[0]!]! - cx, ty = x[v[1]!]! - cy, sx = x[v[4]!]! - cx, sy = x[v[5]!]! - cy
  const lt = Math.hypot(tx, ty), ls = Math.hypot(sx, sy)
  if (g !== null) {
    const utx = lt > TINY ? tx / lt : 1, uty = lt > TINY ? ty / lt : 0, usx = ls > TINY ? sx / ls : 1, usy = ls > TINY ? sy / ls : 0
    g[0] = utx; g[1] = uty; g[2] = -utx + usx; g[3] = -uty + usy; g[4] = -usx; g[5] = -usy
  }
  return lt - ls
}

/**
 * sin and cos of the angle between direction (d1) and (d2): cross/(|d1||d2|) and dot/(|d1||d2|), each with the gradient with
 * respect to (d1x, d1y, d2x, d2y) written to `out` (4 entries). Returns the value.
 */
const crossUnit = (d1x: number, d1y: number, d2x: number, d2y: number, out: Float64Array | null): number => {
  const l1 = Math.max(Math.hypot(d1x, d1y), TINY), l2 = Math.max(Math.hypot(d2x, d2y), TINY)
  const n = d1x * d2y - d1y * d2x, den = l1 * l2
  if (out !== null) {
    const dl1x = d1x / l1, dl1y = d1y / l1, dl2x = d2x / l2, dl2y = d2y / l2
    const k = n / (den * den)
    out[0] = d2y / den - k * l2 * dl1x
    out[1] = -d2x / den - k * l2 * dl1y
    out[2] = -d1y / den - k * l1 * dl2x
    out[3] = d1x / den - k * l1 * dl2y
  }
  return n / den
}
const dotUnit = (d1x: number, d1y: number, d2x: number, d2y: number, out: Float64Array | null): number => {
  const l1 = Math.max(Math.hypot(d1x, d1y), TINY), l2 = Math.max(Math.hypot(d2x, d2y), TINY)
  const n = d1x * d2x + d1y * d2y, den = l1 * l2
  if (out !== null) {
    const dl1x = d1x / l1, dl1y = d1y / l1, dl2x = d2x / l2, dl2y = d2y / l2
    const k = n / (den * den)
    out[0] = d2x / den - k * l2 * dl1x
    out[1] = d2y / den - k * l2 * dl1y
    out[2] = d1x / den - k * l1 * dl2x
    out[3] = d1y / den - k * l1 * dl2y
  }
  return n / den
}

const scratch4 = new Float64Array(4)
/** Scatters a gradient wrt the two direction vectors (b - a) of two lines to the eight end-point unknowns. */
const scatterDirections = (g: Float64Array, d: Float64Array): void => {
  g[0] = -d[0]!; g[1] = -d[1]!; g[2] = d[0]!; g[3] = d[1]!
  g[4] = -d[2]!; g[5] = -d[3]!; g[6] = d[2]!; g[7] = d[3]!
}
const directions = (x: Float64Array, v: Int32Array): [number, number, number, number] => [
  x[v[2]!]! - x[v[0]!]!, x[v[3]!]! - x[v[1]!]!, x[v[6]!]! - x[v[4]!]!, x[v[7]!]! - x[v[5]!]!
]

/** Sine of the angle between two lines on [a1x, a1y, b1x, b1y, a2x, a2y, b2x, b2y]. */
const parallel: EqFn = (x, v, g) => {
  const [d1x, d1y, d2x, d2y] = directions(x, v)
  const r = crossUnit(d1x, d1y, d2x, d2y, g === null ? null : scratch4)
  if (g !== null) scatterDirections(g, scratch4)
  return r
}
/** Cosine of the angle between two lines. */
const perpendicular: EqFn = (x, v, g) => {
  const [d1x, d1y, d2x, d2y] = directions(x, v)
  const r = dotUnit(d1x, d1y, d2x, d2y, g === null ? null : scratch4)
  if (g !== null) scatterDirections(g, scratch4)
  return r
}
/** Signed angle from line 1 to line 2 minus `t`, wrapped to (-pi, pi]. */
const angle = (t: number): EqFn => (x, v, g) => {
  const [d1x, d1y, d2x, d2y] = directions(x, v)
  const cross = d1x * d2y - d1y * d2x, dot = d1x * d2x + d1y * d2y
  const ang = Math.atan2(cross, dot)
  if (g !== null) {
    const q = cross * cross + dot * dot
    if (q > TINY) {
      // d ang = (dot dcross - cross ddot) / (cross^2 + dot^2)
      const s = scratch4
      s[0] = (dot * d2y - cross * d2x) / q
      s[1] = (dot * -d2x - cross * d2y) / q
      s[2] = (dot * -d1y - cross * d1x) / q
      s[3] = (dot * d1x - cross * d1y) / q
      scatterDirections(g, s)
    } else g.fill(0, 0, 8)
  }
  return Math.atan2(Math.sin(ang - t), Math.cos(ang - t))
}

const scratch6 = new Float64Array(6)
/**
 * Signed distance of a point (px, py) from the line a-b (positive on the left of a -> b), with the gradient wrt
 * (px, py, ax, ay, bx, by) written to `out`.
 */
const signedDistance = (px: number, py: number, ax: number, ay: number, bx: number, by: number, out: Float64Array | null): number => {
  const dx = bx - ax, dy = by - ay
  const len = Math.max(Math.hypot(dx, dy), TINY)
  const wx = px - ax, wy = py - ay
  const n = dx * wy - dy * wx
  if (out !== null) {
    const kx = dx / len, ky = dy / len, q = n / (len * len)
    out[0] = -dy / len
    out[1] = dx / len
    out[2] = (-wy + dy) / len + q * kx
    out[3] = (wx - dx) / len + q * ky
    out[4] = wy / len - q * kx
    out[5] = -wx / len - q * ky
  }
  return n / len
}

/** Distance of a point from a line: [px, py, ax, ay, bx, by]. */
const pointOnLine: EqFn = (x, v, g) => {
  const r = signedDistance(x[v[0]!]!, x[v[1]!]!, x[v[2]!]!, x[v[3]!]!, x[v[4]!]!, x[v[5]!]!, g === null ? null : g)
  return r
}

/** The mid point of A, B on the line a-b: [Ax, Ay, Bx, By, ax, ay, bx, by]. */
const symmetricMidpoint: EqFn = (x, v, g) => {
  const mx = (x[v[0]!]! + x[v[2]!]!) / 2, my = (x[v[1]!]! + x[v[3]!]!) / 2
  const r = signedDistance(mx, my, x[v[4]!]!, x[v[5]!]!, x[v[6]!]!, x[v[7]!]!, g === null ? null : scratch6)
  if (g !== null) {
    const s = scratch6
    g[0] = s[0]! / 2; g[1] = s[1]! / 2; g[2] = s[0]! / 2; g[3] = s[1]! / 2
    g[4] = s[2]!; g[5] = s[3]!; g[6] = s[4]!; g[7] = s[5]!
  }
  return r
}
/** (B - A) . (b - a) / |b - a|: the join of A, B is perpendicular to the line. [Ax, Ay, Bx, By, ax, ay, bx, by]. */
const symmetricPerpendicular: EqFn = (x, v, g) => {
  const ex = x[v[2]!]! - x[v[0]!]!, ey = x[v[3]!]! - x[v[1]!]!
  const dx = x[v[6]!]! - x[v[4]!]!, dy = x[v[7]!]! - x[v[5]!]!
  const len = Math.max(Math.hypot(dx, dy), TINY)
  const m = ex * dx + ey * dy
  if (g !== null) {
    const kx = dx / len, ky = dy / len, q = m / (len * len)
    g[0] = -dx / len; g[1] = -dy / len; g[2] = dx / len; g[3] = dy / len
    // d(m/len) wrt d = (e - q d) / len ... with d = b - a
    const gdx = ex / len - q * kx, gdy = ey / len - q * ky
    g[4] = -gdx; g[5] = -gdy; g[6] = gdx; g[7] = gdy
  }
  return m / len
}

// ------------------------------------------------------------------------------------------------ radius sources

/** A circle's radius is an unknown of its own; an arc's is the distance of its start from its centre. */
interface Radius {
  /** Unknowns read, in order: the radius for a circle; centre x, y and start x, y for an arc. */
  readonly vars: ReadonlyArray<number>
  /** The value, with its gradient added (times `scale`) to g[at..] when g is given. */
  readonly eval: (x: Float64Array, v: Int32Array, at: number, g: Float64Array | null, scale: number) => number
}

export const compileSketch = (sketch: Sketch): CompiledEquations => {
  const layout = layoutOf(sketch)
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
  const pointId = (id: string): SketchPoint => {
    const e = byId.get(id)
    if (e === undefined || e.kind !== "point") throw new SketchError(`'${id}' is not a point of the sketch`)
    return e
  }
  const px = (id: string): number => { pointId(id); return idx(`${id}.x`) }
  const py = (id: string): number => { pointId(id); return idx(`${id}.y`) }
  const lineEnds = (id: string): { a: string; b: string } => {
    const e = byId.get(id)
    if (e === undefined || e.kind !== "line") throw new SketchError(`'${id}' is not a line of the sketch`)
    return { a: e.p1, b: e.p2 }
  }
  /** Unknowns [ax, ay, bx, by] of a line. */
  const lineVars = (id: string): number[] => { const { a, b } = lineEnds(id); return [px(a), py(a), px(b), py(b)] }
  const round = (id: string): { center: string; radius: Radius; kind: "circle" | "arc" } => {
    const e = byId.get(id)
    if (e === undefined || (e.kind !== "circle" && e.kind !== "arc")) throw new SketchError(`'${id}' is not a circle or an arc of the sketch`)
    if (e.kind === "circle") {
      const ir = idx(`${e.id}.r`)
      return { center: e.center, kind: "circle", radius: { vars: [ir], eval: (x, v, at, g, scale) => { if (g !== null) g[at] = g[at]! + scale; return x[v[at]!]! } } }
    }
    const cx = px(e.center), cy = py(e.center), sx = px(e.start), sy = py(e.start)
    return {
      center: e.center, kind: "arc",
      radius: {
        vars: [cx, cy, sx, sy],
        eval: (x, v, at, g, scale) => {
          const dx = x[v[at + 2]!]! - x[v[at]!]!, dy = x[v[at + 3]!]! - x[v[at + 1]!]!
          const len = Math.hypot(dx, dy)
          if (g !== null) {
            const ux = len > TINY ? dx / len : 1, uy = len > TINY ? dy / len : 0
            g[at] = g[at]! - scale * ux; g[at + 1] = g[at + 1]! - scale * uy; g[at + 2] = g[at + 2]! + scale * ux; g[at + 3] = g[at + 3]! + scale * uy
          }
          return len
        }
      }
    }
  }
  const radVars = (r: Radius): number[] => [...r.vars]

  const eqs: Eq[] = []
  const ownerNames: string[] = []
  const driven: Driven[] = []
  const constraintNames: string[] = []
  const emit = (constraint: number, owner: string, vars: ReadonlyArray<number>, f: EqFn): void => {
    eqs.push({ vars: Int32Array.from(vars), f, constraint })
    ownerNames.push(owner)
  }

  for (const e of sketch.entities) {
    if (e.kind !== "arc") continue
    emit(-1, `${e.id} (arc)`, [px(e.end), py(e.end), px(e.center), py(e.center), px(e.start), py(e.start)], arcClosure)
  }

  let counter = 0
  sketch.constraints.forEach((c, ci) => {
    const name = c.id ?? `${c.type}#${counter++}`
    constraintNames.push(name)
    const add = (vars: ReadonlyArray<number>, f: EqFn): void => emit(ci, name, vars, f)
    /** A dimension: either an equation or a reference measure. */
    const dimension = (vars: ReadonlyArray<number>, make: (value: number) => EqFn, value: number, measure: EqFn): void => {
      if (c.driven === true) {
        const vv = Int32Array.from(vars)
        driven.push({ id: name, type: c.type, measure: (x) => measure(x, vv, null) })
      } else add(vars, make(value))
    }
    switch (c.type) {
      case "fixed": {
        const e = pointId(c.point)
        const ix = px(c.point), iy = py(c.point)
        const both = c.x === undefined && c.y === undefined
        if (c.x !== undefined || both) add([ix], pin(c.x ?? e.x))
        if (c.y !== undefined || both) add([iy], pin(c.y ?? e.y))
        break
      }
      case "coincident": add([px(c.a), px(c.b)], diff(0)); add([py(c.a), py(c.b)], diff(0)); break
      case "horizontal": { const l = lineVars(c.line); add([l[1]!, l[3]!], diff(0)); break }
      case "vertical": { const l = lineVars(c.line); add([l[0]!, l[2]!], diff(0)); break }
      case "horizontalPoints": add([py(c.a), py(c.b)], diff(0)); break
      case "verticalPoints": add([px(c.a), px(c.b)], diff(0)); break
      case "distance": dimension([px(c.a), py(c.a), px(c.b), py(c.b)], dist, c.value, dist(0)); break
      case "distanceX": dimension([px(c.a), px(c.b)], (d) => diff(d), c.value, diff(0)); break
      case "distanceY": dimension([py(c.a), py(c.b)], (d) => diff(d), c.value, diff(0)); break
      case "length": dimension(lineVars(c.line), dist, c.value, dist(0)); break
      case "parallel": add([...lineVars(c.a), ...lineVars(c.b)], parallel); break
      case "perpendicular": add([...lineVars(c.a), ...lineVars(c.b)], perpendicular); break
      case "equalLength": add([...lineVars(c.a), ...lineVars(c.b)], equalDist); break
      case "equalRadius": {
        const a = round(c.a), b = round(c.b)
        const na = a.radius.vars.length
        add([...radVars(a.radius), ...radVars(b.radius)], (x, v, g) => {
          if (g !== null) g.fill(0, 0, na + b.radius.vars.length)
          return a.radius.eval(x, v, 0, g, 1) - b.radius.eval(x, v, na, g, -1)
        })
        break
      }
      case "radius": case "diameter": {
        const a = round(c.circle), scale = c.type === "diameter" ? 0.5 : 1
        const vars = radVars(a.radius)
        const make = (value: number): EqFn => (x, v, g) => {
          if (g !== null) g.fill(0, 0, vars.length)
          return a.radius.eval(x, v, 0, g, 1) - value * scale
        }
        dimension(vars, make, c.value, (x, v) => a.radius.eval(x, v, 0, null, 0) / scale)
        break
      }
      case "angle": {
        const vars = [...lineVars(c.a), ...lineVars(c.b)]
        // The angle is a dimension: measured as the wrapped difference from 0, i.e. the angle itself.
        dimension(vars, angle, c.value, angle(0))
        break
      }
      case "pointOnLine": add([px(c.point), py(c.point), ...lineVars(c.line).slice(0, 4)], pointOnLine); break
      case "pointOnCircle": {
        const r = round(c.circle), n = r.radius.vars.length
        const vars = [px(c.point), py(c.point), px(r.center), py(r.center), ...radVars(r.radius)]
        add(vars, (x, v, g) => {
          const dx = x[v[0]!]! - x[v[2]!]!, dy = x[v[1]!]! - x[v[3]!]!
          const len = Math.hypot(dx, dy)
          if (g !== null) {
            const ux = len > TINY ? dx / len : 1, uy = len > TINY ? dy / len : 0
            g.fill(0, 0, 4 + n)
            g[0] = ux; g[1] = uy; g[2] = -ux; g[3] = -uy
          }
          return len - r.radius.eval(x, v, 4, g, -1)
        })
        break
      }
      case "midpoint": {
        const { a, b } = lineEnds(c.line)
        const half = (x: Float64Array, v: Int32Array, g: Float64Array | null): number => {
          if (g !== null) { g[0] = 1; g[1] = -0.5; g[2] = -0.5 }
          return x[v[0]!]! - (x[v[1]!]! + x[v[2]!]!) / 2
        }
        add([px(c.point), px(a), px(b)], half)
        add([py(c.point), py(a), py(b)], half)
        break
      }
      case "symmetric": {
        const l = lineVars(c.line)
        const vars = [px(c.a), py(c.a), px(c.b), py(c.b), ...l]
        add(vars, symmetricMidpoint)
        add(vars, symmetricPerpendicular)
        break
      }
      case "tangentLineCircle": {
        const l = lineVars(c.line), r = round(c.circle), n = r.radius.vars.length
        const vars = [px(r.center), py(r.center), l[0]!, l[1]!, l[2]!, l[3]!, ...radVars(r.radius)]
        add(vars, (x, v, g) => {
          const s = signedDistance(x[v[0]!]!, x[v[1]!]!, x[v[2]!]!, x[v[3]!]!, x[v[4]!]!, x[v[5]!]!, g === null ? null : scratch6)
          const sign = s < 0 ? -1 : 1
          if (g !== null) {
            g.fill(0, 0, 6 + n)
            for (let k = 0; k < 6; k++) g[k] = sign * scratch6[k]!
          }
          return sign * s - r.radius.eval(x, v, 6, g, -1)
        })
        break
      }
      case "tangentCircles": {
        const a = round(c.a), b = round(c.b), internal = c.internal === true
        const na = a.radius.vars.length, nb = b.radius.vars.length
        const vars = [px(a.center), py(a.center), px(b.center), py(b.center), ...radVars(a.radius), ...radVars(b.radius)]
        add(vars, (x, v, g) => {
          const dx = x[v[2]!]! - x[v[0]!]!, dy = x[v[3]!]! - x[v[1]!]!
          const d = Math.hypot(dx, dy)
          const ra = a.radius.eval(x, v, 4, null, 0), rb = b.radius.eval(x, v, 4 + na, null, 0)
          if (g !== null) {
            const ux = d > TINY ? dx / d : 1, uy = d > TINY ? dy / d : 0
            g.fill(0, 0, 4 + na + nb)
            g[0] = -ux; g[1] = -uy; g[2] = ux; g[3] = uy
            const big = ra >= rb ? 1 : -1
            a.radius.eval(x, v, 4, g, internal ? -big : -1)
            b.radius.eval(x, v, 4 + na, g, internal ? big : -1)
          }
          return d - (internal ? Math.abs(ra - rb) : ra + rb)
        })
        break
      }
      case "concentric": {
        const a = round(c.a), b = round(c.b)
        add([px(a.center), px(b.center)], diff(0))
        add([py(a.center), py(b.center)], diff(0))
        break
      }
      case "ellipseSize": {
        const e = byId.get(c.ellipse)
        if (e === undefined || e.kind !== "ellipse") throw new SketchError(`'${c.ellipse}' is not an ellipse of the sketch`)
        add([idx(`${e.id}.rx`)], pin(c.radiusX))
        add([idx(`${e.id}.ry`)], pin(c.radiusY))
        break
      }
      case "pointOnEllipse": {
        const e = byId.get(c.ellipse)
        if (e === undefined || e.kind !== "ellipse") throw new SketchError(`'${c.ellipse}' is not an ellipse of the sketch`)
        const rot = e.rotation ?? 0
        const cos = Math.cos(rot), sin = Math.sin(rot)
        // The residual is scaled by the initial smaller semi-axis (a constant) so it is a length and its gradient is exact.
        const scale = Math.max(Math.min(e.radiusX, e.radiusY), 1e-9)
        add([px(c.point), py(c.point), px(e.center), py(e.center), idx(`${e.id}.rx`), idx(`${e.id}.ry`)], (x, v, g) => {
          const dx = x[v[0]!]! - x[v[2]!]!, dy = x[v[1]!]! - x[v[3]!]!
          const rx = x[v[4]!]!, ry = x[v[5]!]!
          const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos
          const ux = lx / rx, uy = ly / ry
          if (g !== null) {
            // dQ/dlx = 2 lx / rx^2, dQ/dly = 2 ly / ry^2; d lx / d(px) = cos, d ly / d(px) = -sin, d lx / d(py) = sin, d ly / d(py) = cos
            const qlx = (2 * ux) / rx, qly = (2 * uy) / ry
            g[0] = scale * (qlx * cos - qly * sin)
            g[1] = scale * (qlx * sin + qly * cos)
            g[2] = -g[0]; g[3] = -g[1]
            g[4] = scale * (-2 * ux * ux) / rx
            g[5] = scale * (-2 * uy * uy) / ry
          }
          return (ux * ux + uy * uy - 1) * scale
        })
        break
      }
      case "collinear": {
        const a = lineVars(c.a), b = lineVars(c.b)
        add([b[0]!, b[1]!, a[0]!, a[1]!, a[2]!, a[3]!], pointOnLine)
        add([b[2]!, b[3]!, a[0]!, a[1]!, a[2]!, a[3]!], pointOnLine)
        break
      }
      default: {
        const never: never = c
        throw new SketchError(`Unknown constraint '${(never as Constraint).type}'`)
      }
    }
  })
  return { layout, eqs, constraintNames, ownerNames, driven }
}
