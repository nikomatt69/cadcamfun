/**
 * Parametric sketch shapes: the profiles a designer reaches for first (rectangle, circle, regular polygon, ellipse, slot, any closed
 * polyline), described by their measures instead of by points and constraints. A shape expands into ordinary sketch entities and
 * constraints, so the solver, the profile extraction and every feature after the sketch see nothing new; what the shape adds is that
 * every measure is a `Dimension` (a number or an expression of the history's parameters) and the expansion is fully constrained.
 *
 *   rectangle  at (corner, or centre when `centered`), width, height
 *   circle     at (centre), diameter
 *   polygon    at (centre), sides (whole), radius (to the corners; `flats` makes it the radius to the middle of the sides), rotation
 *   ellipse    at (centre), radiusX, radiusY, drawn as `segments` straight chords
 *   slot       at (middle), length (overall), width, angle (degrees): two half-circle ends joined by two straight sides
 *   polyline   points [[x, y], ...] (at least three): any closed outline; every coordinate is a dimension
 *   curve      a spline through points, a Bezier or a NURBS (B-spline) from control points; open (a sweep path, or a profile edge
 *              closed by `chord`) or closed. The curve is sampled from the evaluated control points at every rebuild, so moving a
 *              control point by a parameter reshapes it.
 *
 * Positions are measured from the sketch origin. Every id a shape creates starts with the shape's own id and a dot, so a constraint
 * written next to the shape can name them (`slot1.c1` is the first end centre of the slot `slot1`).
 */
import type { Dimension } from "./expr.ts"
import type { DimConstraint } from "./history.ts"
import type { SketchEntity } from "./sketch.ts"
import { sampleSpline } from "./spline.ts"
import type { Vec2 } from "./vec.ts"

type Pair = readonly [Dimension, Dimension]

export type SketchShape =
  | { readonly id: string; readonly kind: "rectangle"; readonly at: Pair; readonly width: Dimension; readonly height: Dimension; readonly centered?: boolean }
  | { readonly id: string; readonly kind: "circle"; readonly at: Pair; readonly diameter: Dimension }
  | { readonly id: string; readonly kind: "polygon"; readonly at: Pair; readonly sides: number; readonly radius: Dimension; readonly flats?: boolean; readonly rotation?: Dimension }
  | { readonly id: string; readonly kind: "ellipse"; readonly at: Pair; readonly radiusX: Dimension; readonly radiusY: Dimension; readonly segments?: number }
  | { readonly id: string; readonly kind: "slot"; readonly at: Pair; readonly length: Dimension; readonly width: Dimension; readonly angle?: Dimension }
  | { readonly id: string; readonly kind: "polyline"; readonly points: ReadonlyArray<Pair> }
  | { readonly id: string; readonly kind: "curve"; readonly curve: "spline" | "bezier" | "nurbs"; readonly points: ReadonlyArray<Pair>; readonly closed?: boolean; readonly chord?: boolean; readonly degree?: number; readonly divisions?: number }

export interface ExpandedShape {
  readonly entities: ReadonlyArray<SketchEntity>
  readonly constraints: ReadonlyArray<DimConstraint>
}

/** Turns a dimension into a number (the history's parameters are known to the caller). */
export type Evaluate = (d: Dimension) => number

const text = (d: Dimension): string => `(${d})`
const allNumbers = (args: ReadonlyArray<Dimension>): args is ReadonlyArray<number> => args.every((a) => typeof a === "number")

/** A dimension computed from others: a plain number when they all are numbers, an expression otherwise. */
const derive = (args: ReadonlyArray<Dimension>, number: (n: ReadonlyArray<number>) => number, expression: (t: ReadonlyArray<string>) => string): Dimension =>
  allNumbers(args) ? number(args) : expression(args.map(text))

const GUARD = 1e-9

/** `ellipse` and `polygon` corners are the same walk round a centre: vertex k at the angle `start + 360 k / count` on radii `rx`, `ry`. */
const roundVertices = (id: string, at: Pair, count: number, rx: Dimension, ry: Dimension, startDeg: Dimension, evaluate: Evaluate): ExpandedShape => {
  const entities: SketchEntity[] = [{ id: `${id}.o`, kind: "point", x: 0, y: 0 }, { id: `${id}.c`, kind: "point", x: evaluate(at[0]), y: evaluate(at[1]) }]
  const constraints: DimConstraint[] = [
    { type: "fixed", point: `${id}.o`, x: 0, y: 0 },
    { type: "distanceX", a: `${id}.o`, b: `${id}.c`, value: at[0] }, { type: "distanceY", a: `${id}.o`, b: `${id}.c`, value: at[1] }
  ]
  const cx = evaluate(at[0]), cy = evaluate(at[1])
  for (let k = 0; k < count; k++) {
    const step = (360 * k) / count
    const angle = derive([startDeg], ([s]) => s! + step, ([s]) => `${s} + ${step}`)
    const dx = derive([rx, angle], ([r, a]) => r! * Math.cos((a! * Math.PI) / 180), ([r, a]) => `${r} * cos(rad(${a}))`)
    const dy = derive([ry, angle], ([r, a]) => r! * Math.sin((a! * Math.PI) / 180), ([r, a]) => `${r} * sin(rad(${a}))`)
    const vertex = `${id}.v${k}`
    entities.push({ id: vertex, kind: "point", x: cx + evaluate(dx), y: cy + evaluate(dy) })
    constraints.push({ type: "distanceX", a: `${id}.c`, b: vertex, value: dx }, { type: "distanceY", a: `${id}.c`, b: vertex, value: dy })
  }
  for (let k = 0; k < count; k++) entities.push({ id: `${id}.l${k}`, kind: "line", p1: `${id}.v${k}`, p2: `${id}.v${(k + 1) % count}` })
  return { entities, constraints }
}


/** Points of the curve through (`spline`) or controlled by (`bezier`, `nurbs`) the given points, `divisions` chords in all. */
const sampleCurve = (curve: "spline" | "bezier" | "nurbs", points: ReadonlyArray<Vec2>, closed: boolean, degree: number, divisions: number): Vec2[] => {
  if (curve === "nurbs") {
    const sampled = sampleSpline(points, degree, closed, divisions)
    // The sampler repeats the first point to close a periodic curve; the sketch closes it with a line instead.
    return closed ? sampled.slice(0, -1) : [...sampled, evaluateEnd(points, degree)]
  }
  if (curve === "bezier") {
    return Array.from({ length: divisions + 1 }, (_, k) => {
      let level = [...points]
      const t = k / divisions
      while (level.length > 1) level = level.slice(1).map((q, i) => ({ x: level[i]!.x + (q.x - level[i]!.x) * t, y: level[i]!.y + (q.y - level[i]!.y) * t }))
      return level[0]!
    })
  }
  // Catmull-Rom: a smooth curve that passes through every point.
  const n = points.length
  const segments = closed ? n : n - 1
  const per = Math.max(2, Math.ceil(divisions / segments))
  const at = (i: number): Vec2 => (closed ? points[((i % n) + n) % n]! : points[Math.min(n - 1, Math.max(0, i))]!)
  const out: Vec2[] = []
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t
      const c = (a: number, b: number, d: number, e: number): number => 0.5 * (2 * b + (-a + d) * t + (2 * a - 5 * b + 4 * d - e) * t2 + (-a + 3 * b - 3 * d + e) * t3)
      out.push({ x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y) })
    }
  }
  if (!closed) out.push(points[n - 1]!)
  return out
}

/** The last point of a clamped open B-spline is its last control point. */
const evaluateEnd = (points: ReadonlyArray<Vec2>, _degree: number): Vec2 => points[points.length - 1]!

/** Entities and constraints of one shape. Throws a `RangeError` for a measure that makes no shape (a slot shorter than it is wide). */
export const expandShape = (shape: SketchShape, evaluate: Evaluate, lenient = false): ExpandedShape => {
  const { id } = shape
  /** A measure that makes no shape: refused, unless the caller only wants the ids (before the parameters are known). */
  const refuse = (message: string): void => { if (!lenient) throw new RangeError(message) }
  const origin = (): { entities: SketchEntity[]; constraints: DimConstraint[] } => ({
    entities: [{ id: `${id}.o`, kind: "point", x: 0, y: 0 }],
    constraints: [{ type: "fixed", point: `${id}.o`, x: 0, y: 0 }]
  })
  /** A point placed by two dimensions from the origin. */
  const placed = (acc: { entities: SketchEntity[]; constraints: DimConstraint[] }, name: string, x: Dimension, y: Dimension): void => {
    acc.entities.push({ id: `${id}.${name}`, kind: "point", x: evaluate(x), y: evaluate(y) })
    acc.constraints.push({ type: "distanceX", a: `${id}.o`, b: `${id}.${name}`, value: x }, { type: "distanceY", a: `${id}.o`, b: `${id}.${name}`, value: y })
  }

  switch (shape.kind) {
    case "rectangle": {
      const w = evaluate(shape.width), h = evaluate(shape.height)
      if (!(w > GUARD && h > GUARD)) refuse(`Rectangle '${id}' needs a positive width and height (they are ${w} and ${h})`)
      const x0 = shape.centered === true ? derive([shape.at[0], shape.width], ([x, w2]) => x! - w2! / 2, ([x, w2]) => `${x} - ${w2} / 2`) : shape.at[0]
      const y0 = shape.centered === true ? derive([shape.at[1], shape.height], ([y, h2]) => y! - h2! / 2, ([y, h2]) => `${y} - ${h2} / 2`) : shape.at[1]
      const ax = evaluate(x0), ay = evaluate(y0)
      const acc = origin()
      acc.entities.push(
        { id: `${id}.p0`, kind: "point", x: ax, y: ay }, { id: `${id}.p1`, kind: "point", x: ax + w * 0.9, y: ay + 0.1 },
        { id: `${id}.p2`, kind: "point", x: ax + w * 1.1, y: ay + h * 0.9 }, { id: `${id}.p3`, kind: "point", x: ax - 0.1, y: ay + h * 1.1 },
        { id: `${id}.l0`, kind: "line", p1: `${id}.p0`, p2: `${id}.p1` }, { id: `${id}.l1`, kind: "line", p1: `${id}.p1`, p2: `${id}.p2` },
        { id: `${id}.l2`, kind: "line", p1: `${id}.p2`, p2: `${id}.p3` }, { id: `${id}.l3`, kind: "line", p1: `${id}.p3`, p2: `${id}.p0` }
      )
      acc.constraints.push(
        { type: "distanceX", a: `${id}.o`, b: `${id}.p0`, value: x0 }, { type: "distanceY", a: `${id}.o`, b: `${id}.p0`, value: y0 },
        { type: "horizontal", line: `${id}.l0` }, { type: "vertical", line: `${id}.l1` }, { type: "horizontal", line: `${id}.l2` }, { type: "vertical", line: `${id}.l3` },
        { type: "length", line: `${id}.l0`, value: shape.width }, { type: "length", line: `${id}.l1`, value: shape.height }
      )
      return acc
    }
    case "circle": {
      const d = evaluate(shape.diameter)
      if (!(d > GUARD)) refuse(`Circle '${id}' needs a positive diameter (it is ${d})`)
      const acc = origin()
      placed(acc, "c", shape.at[0], shape.at[1])
      acc.entities.push({ id: `${id}.k`, kind: "circle", center: `${id}.c`, radius: d / 2 })
      acc.constraints.push({ type: "diameter", circle: `${id}.k`, value: shape.diameter })
      return acc
    }
    case "polygon": {
      if (!Number.isInteger(shape.sides) || shape.sides < 3 || shape.sides > 64) refuse(`Polygon '${id}' needs a whole number of sides from 3 to 64 (it is ${shape.sides})`)
      const r = evaluate(shape.radius)
      if (!(r > GUARD)) refuse(`Polygon '${id}' needs a positive radius (it is ${r})`)
      // The radius to the middle of a side is r_corner * cos(pi / n): turn it into the radius to the corners.
      const corner = shape.flats === true ? derive([shape.radius], ([x]) => x! / Math.cos(Math.PI / shape.sides), ([x]) => `${x} / cos(pi / ${shape.sides})`) : shape.radius
      return roundVertices(id, shape.at, shape.sides, corner, corner, shape.rotation ?? 0, evaluate)
    }
    case "ellipse": {
      const segments = shape.segments ?? 48
      if (!Number.isInteger(segments) || segments < 8 || segments > 200) refuse(`Ellipse '${id}' needs from 8 to 200 segments (it has ${segments})`)
      if (!(evaluate(shape.radiusX) > GUARD && evaluate(shape.radiusY) > GUARD)) refuse(`Ellipse '${id}' needs positive radii`)
      return roundVertices(id, shape.at, segments, shape.radiusX, shape.radiusY, 0, evaluate)
    }
    case "slot": {
      const length = evaluate(shape.length), width = evaluate(shape.width)
      if (!(width > GUARD)) refuse(`Slot '${id}' needs a positive width (it is ${width})`)
      if (!(length > width + GUARD)) refuse(`Slot '${id}' is ${length} mm long overall and ${width} mm wide: the length has to exceed the width (it is the end-to-end length, round ends included)`)
      const angle = shape.angle ?? 0
      const cos = derive([angle], ([a]) => Math.cos((a! * Math.PI) / 180), ([a]) => `cos(rad(${a}))`)
      const sin = derive([angle], ([a]) => Math.sin((a! * Math.PI) / 180), ([a]) => `sin(rad(${a}))`)
      // Along the slot (u) and across it (n = u turned a quarter turn): the end centres are half the straight run either side of the middle.
      const run = derive([shape.length, shape.width], ([l, w]) => (l! - w!) / 2, ([l, w]) => `(${l} - ${w}) / 2`)
      const half = derive([shape.width], ([w]) => w! / 2, ([w]) => `${w} / 2`)
      const at = (along: number, across: number): readonly [Dimension, Dimension] => [
        derive([shape.at[0], run, half, cos, sin], ([x, r, h, c, s]) => x! + along * r! * c! - across * h! * s!, ([x, r, h, c, s]) => `${x} + ${along} * ${r} * ${c} - ${across} * ${h} * ${s}`),
        derive([shape.at[1], run, half, cos, sin], ([y, r, h, c, s]) => y! + along * r! * s! + across * h! * c!, ([y, r, h, c, s]) => `${y} + ${along} * ${r} * ${s} + ${across} * ${h} * ${c}`)
      ]
      const centre = (along: number): readonly [Dimension, Dimension] => at(along, 0)
      const acc = origin()
      const names: Array<readonly [string, readonly [Dimension, Dimension]]> = [
        ["c1", centre(-1)], ["c2", centre(1)],
        // Right end: from the low side round the far tip to the high side; left end: from the high side round the near tip to the low side.
        ["a2s", at(1, -1)], ["a2e", at(1, 1)], ["a1s", at(-1, 1)], ["a1e", at(-1, -1)]
      ]
      for (const [name, [x, y]] of names) placed(acc, name, x, y)
      acc.entities.push(
        { id: `${id}.r2`, kind: "arc", center: `${id}.c2`, start: `${id}.a2s`, end: `${id}.a2e` },
        { id: `${id}.r1`, kind: "arc", center: `${id}.c1`, start: `${id}.a1s`, end: `${id}.a1e` },
        { id: `${id}.top`, kind: "line", p1: `${id}.a2e`, p2: `${id}.a1s` },
        { id: `${id}.bottom`, kind: "line", p1: `${id}.a1e`, p2: `${id}.a2s` }
      )
      return acc
    }
    case "curve": {
      const minimum = shape.curve === "spline" ? 2 : shape.curve === "bezier" ? 3 : 3
      if (shape.points.length < minimum) refuse(`Curve '${id}' (${shape.curve}) needs at least ${minimum} points (it has ${shape.points.length})`)
      const closed = shape.closed === true
      if (closed && shape.curve === "bezier") refuse(`Curve '${id}': a Bezier curve cannot be closed; end it where it starts, or use a spline or a NURBS`)
      if (closed && shape.points.length < 3) refuse(`Curve '${id}' needs at least three points to close`)
      const divisions = shape.divisions ?? 48
      if (!Number.isInteger(divisions) || divisions < 4 || divisions > 400) refuse(`Curve '${id}' needs from 4 to 400 divisions (it has ${divisions})`)
      const degree = shape.degree ?? 3
      if (!Number.isInteger(degree) || degree < 1 || degree > 8) refuse(`Curve '${id}' needs a degree from 1 to 8 (it is ${degree})`)
      const sampled = sampleCurve(shape.curve, shape.points.map(([x, y]) => ({ x: evaluate(x), y: evaluate(y) })), closed, degree, divisions)
        .filter((p, k, all) => k === 0 || Math.hypot(p.x - all[k - 1]!.x, p.y - all[k - 1]!.y) > 1e-9)
      const acc = origin()
      // The samples are numbers: the curve is rebuilt from its evaluated control points each time the history replays.
      sampled.forEach((p, k) => {
        acc.entities.push({ id: `${id}.p${k}`, kind: "point", x: p.x, y: p.y })
        acc.constraints.push({ type: "fixed", point: `${id}.p${k}`, x: p.x, y: p.y })
      })
      const joins = closed || shape.chord === true ? sampled.length : sampled.length - 1
      for (let k = 0; k < joins; k++) acc.entities.push({ id: `${id}.l${k}`, kind: "line", p1: `${id}.p${k}`, p2: `${id}.p${(k + 1) % sampled.length}` })
      return acc
    }
    case "polyline": {
      if (shape.points.length < 3) refuse(`Polyline '${id}' needs at least three points (it has ${shape.points.length})`)
      const acc = origin()
      shape.points.forEach(([x, y], k) => placed(acc, `p${k}`, x, y))
      shape.points.forEach((_, k) => acc.entities.push({ id: `${id}.l${k}`, kind: "line", p1: `${id}.p${k}`, p2: `${id}.p${(k + 1) % shape.points.length}` }))
      return acc
    }
  }
}

/** The entities and constraints of a sketch with its shapes expanded in after its own. */
export const expandSketch = (
  sketch: { readonly entities: ReadonlyArray<SketchEntity>; readonly constraints: ReadonlyArray<DimConstraint>; readonly shapes?: ReadonlyArray<SketchShape> },
  evaluate: Evaluate
): ExpandedShape => {
  const entities: SketchEntity[] = [...sketch.entities]
  const constraints: DimConstraint[] = [...sketch.constraints]
  const seen = new Set(entities.map((e) => e.id))
  for (const shape of sketch.shapes ?? []) {
    const expanded = expandShape(shape, evaluate)
    for (const e of expanded.entities) {
      if (seen.has(e.id)) throw new RangeError(`Shape '${shape.id}' makes an id that is already taken: '${e.id}'`)
      seen.add(e.id)
      entities.push(e)
    }
    constraints.push(...expanded.constraints)
  }
  return { entities, constraints }
}
