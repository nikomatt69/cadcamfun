/**
 * Sketch construction tools (spec 45, spec 72 P2-10): Fillet a corner, Mirror, Pattern, Offset, and Project model edges into a sketch.
 *
 * Pure functions on the entity model, the same contract as Trim and Extend (`sketch-edit.ts`): each returns a new `Sketch`, or the
 * reason it cannot be done, and never edits the sketch it was given. Geometry is exact (fillets and offsets of arcs are true arcs,
 * offsets meet at the crossings of their carriers, projected circles are circles or ellipses), and nothing is approximated: a case
 * the entity model cannot hold exactly is refused with the reason. Each tool adds the constraints that keep its intent when the
 * sketch is solved (tangency and radius of a fillet, symmetry of a mirror, the placement of a pattern copy, parallelism of an
 * offset line, the fixed position of a projected edge).
 */
import type { Brep } from "./brep/topology.ts"
import type { Vec3 } from "./brep/math.ts"
import type { Constraint, Sketch, SketchArc, SketchEntity, SketchLine, SketchPoint } from "./sketch.ts"
import type { Vec2 } from "./vec.ts"

const TAU = Math.PI * 2
const EPS = 1e-9
const SAME = 1e-7

const pointOf = (s: Sketch, id: string): SketchPoint | undefined => s.entities.find((e): e is SketchPoint => e.kind === "point" && e.id === id)
const at = (s: Sketch, id: string): Vec2 => {
  const p = pointOf(s, id)
  if (p === undefined) throw new Error(`point '${id}' is not in the sketch`)
  return { x: p.x, y: p.y }
}
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
const len = (a: Vec2): number => Math.hypot(a.x, a.y)
const unit = (a: Vec2): Vec2 => { const l = len(a); return { x: a.x / l, y: a.y / l } }
const crossZ = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
const norm = (a: number): number => ((a % TAU) + TAU) % TAU
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a))
const angleOf = (c: Vec2, p: Vec2): number => Math.atan2(p.y - c.y, p.x - c.x)

/** Names new entities without clashing with the sketch's ids or with each other. */
const namer = (s: Sketch) => {
  const ids = new Set(s.entities.map((e) => e.id))
  return (base: string): string => {
    let id = base
    for (let k = 1; ids.has(id); k++) id = `${base}${k}`
    ids.add(id)
    return id
  }
}
const withoutIds = (cs: ReadonlyArray<Constraint>, removed: ReadonlySet<string>): Constraint[] =>
  cs.filter((c) => !Object.values(c).some((v) => typeof v === "string" && removed.has(v)))
const nominalGuard = (s: Sketch, ids: ReadonlyArray<string>): string | undefined => {
  const replaced = new Set(s.nominalCurves?.flatMap((c) => c.replaces))
  const hit = ids.find((id) => replaced.has(id))
  return hit === undefined ? undefined : `'${hit}' is a construction edge of a nominal curve; edit the curve instead`
}

/** The points an entity is made of. */
const pointsOf = (e: SketchEntity): string[] =>
  e.kind === "point" ? [e.id] : e.kind === "line" ? [e.p1, e.p2] : e.kind === "circle" || e.kind === "ellipse" ? [e.center] : e.kind === "arc" ? [e.center, e.start, e.end] : [...e.points]

// ------------------------------------------------------------------------------------------------------------------------- fillet

/** The two ends of two lines that are one corner: a shared point, a coincident pair, or two points at the same place. */
const sharedCorner = (s: Sketch, a: SketchLine, b: SketchLine): { readonly pa: string; readonly pb: string } | undefined => {
  const pairs = [a.p1, a.p2].flatMap((pa) => [b.p1, b.p2].map((pb) => ({ pa, pb })))
  return pairs.find(({ pa, pb }) => pa === pb)
    ?? pairs.find(({ pa, pb }) => s.constraints.some((c) => c.type === "coincident" && ((c.a === pa && c.b === pb) || (c.a === pb && c.b === pa))))
    ?? pairs.find(({ pa, pb }) => len(sub(at(s, pa), at(s, pb))) < SAME)
}

/**
 * Sketch fillet: rounds the corner where lines `a` and `b` meet with an arc of `radius` tangent to both (Fusion's sketch Fillet).
 * Both lines are cut back to the tangent points, the arc joins them (sharing their end points), and `tangentLineCircle` (twice)
 * and `radius` keep it a fillet when the sketch is solved. The sharp corner point goes, with the constraints that held it (as in
 * Fusion, a dimension to the virtual sharp is lost). Refused: lines that do not meet at an end, collinear lines, and a radius whose
 * tangent points fall off either line.
 */
export const filletCorner = (sketch: Sketch, a: string, b: string, radius: number): Sketch | string => {
  const la = sketch.entities.find((e) => e.id === a), lb = sketch.entities.find((e) => e.id === b)
  if (la?.kind !== "line" || lb?.kind !== "line") return `a sketch fillet needs two lines ('${a}' and '${b}')`
  if (a === b) return "a sketch fillet needs two different lines"
  if (!(radius > 0) || !Number.isFinite(radius)) return `the fillet radius must be a positive number (it is ${radius})`
  const guard = nominalGuard(sketch, [a, b])
  if (guard !== undefined) return guard
  const corner = sharedCorner(sketch, la, lb)
  if (corner === undefined) return `lines '${a}' and '${b}' do not meet at an end point`
  const q = at(sketch, corner.pa)
  const farA = at(sketch, la.p1 === corner.pa ? la.p2 : la.p1), farB = at(sketch, lb.p1 === corner.pb ? lb.p2 : lb.p1)
  const lenA = len(sub(farA, q)), lenB = len(sub(farB, q))
  if (lenA < EPS || lenB < EPS) return "a line of the corner has no length"
  const ua = unit(sub(farA, q)), ub = unit(sub(farB, q))
  const theta = Math.acos(Math.max(-1, Math.min(1, dot(ua, ub))))
  if (theta < 1e-9 || Math.PI - theta < 1e-9) return `lines '${a}' and '${b}' are collinear: there is no corner to round`
  const t = radius / Math.tan(theta / 2)
  if (t > lenA - 1e-9 || t > lenB - 1e-9) return `a ${radius} mm fillet needs ${t.toFixed(4)} mm of each line, but '${a}' is ${lenA.toFixed(4)} mm and '${b}' ${lenB.toFixed(4)} mm long`
  const bis = unit({ x: ua.x + ub.x, y: ua.y + ub.y })
  const h = radius / Math.sin(theta / 2)
  const c = { x: q.x + bis.x * h, y: q.y + bis.y * h }
  const ta = { x: q.x + ua.x * t, y: q.y + ua.y * t }, tb = { x: q.x + ub.x * t, y: q.y + ub.y * t }
  const name = namer(sketch)
  const ida = name(`${a}_t`), idb = name(`${b}_t`), idc = name(`${a}_${b}_c`), arcId = name(`${a}_${b}_fillet`)
  // Counter-clockwise from start to end about the centre: the short way from one tangent point to the other.
  const ccw = crossZ(sub(ta, c), sub(tb, c)) > 0
  const arc: SketchArc = { id: arcId, kind: "arc", center: idc, start: ccw ? ida : idb, end: ccw ? idb : ida }
  const moved = sketch.entities.map((e): SketchEntity => {
    if (e.id === a && e.kind === "line") return e.p1 === corner.pa ? { ...e, p1: ida } : { ...e, p2: ida }
    if (e.id === b && e.kind === "line") return e.p1 === corner.pb ? { ...e, p1: idb } : { ...e, p2: idb }
    return e
  })
  const used = new Set(moved.filter((e) => e.kind !== "point").flatMap(pointsOf))
  const dropped = new Set([corner.pa, corner.pb].filter((p) => !used.has(p)))
  return {
    ...sketch,
    entities: [
      ...moved.filter((e) => !(e.kind === "point" && dropped.has(e.id))),
      { id: ida, kind: "point", x: ta.x, y: ta.y }, { id: idb, kind: "point", x: tb.x, y: tb.y }, { id: idc, kind: "point", x: c.x, y: c.y }, arc
    ],
    constraints: [
      ...withoutIds(sketch.constraints, dropped),
      { type: "tangentLineCircle", line: a, circle: arcId }, { type: "tangentLineCircle", line: b, circle: arcId }, { type: "radius", circle: arcId, value: radius }
    ]
  }
}

// --------------------------------------------------------------------------------------------------------------- mirror, pattern

/** The curves of a selection (points given alone count as their own curve) and every point they use, in sketch order. */
const selection = (s: Sketch, ids: ReadonlyArray<string>): { readonly curves: SketchEntity[]; readonly points: SketchPoint[] } | string => {
  if (ids.length === 0) return "nothing is selected"
  const chosen = ids.map((id) => s.entities.find((e) => e.id === id))
  const missing = ids.find((_, i) => chosen[i] === undefined)
  if (missing !== undefined) return `'${missing}' is not in the sketch`
  const guard = nominalGuard(s, ids)
  if (guard !== undefined) return guard
  const want = new Set(chosen.flatMap((e) => pointsOf(e!)))
  return { curves: chosen.filter((e) => e!.kind !== "point") as SketchEntity[], points: s.entities.filter((e): e is SketchPoint => e.kind === "point" && want.has(e.id)) }
}

/** An entity under a new id with its point ids renamed. */
const renamed = (e: SketchEntity, id: string, p: (old: string) => string): SketchEntity => {
  switch (e.kind) {
    case "point": return { ...e, id }
    case "line": return { ...e, id, p1: p(e.p1), p2: p(e.p2) }
    case "circle": case "ellipse": return { ...e, id, center: p(e.center) }
    case "arc": return { ...e, id, center: p(e.center), start: p(e.start), end: p(e.end) }
    case "spline": return { ...e, id, points: e.points.map(p) }
  }
}

/**
 * Sketch mirror (Fusion's sketch Mirror): copies entities `ids` across the line `axis`. Each mirrored point is tied to its original
 * by a `symmetric` constraint about the axis, so the copy follows every later edit of the original; a point on the axis is its
 * own image and is shared (a profile mirrored about one of its edges closes). A mirrored circle gets `equalRadius` with its
 * original; a mirrored arc runs the other way round (a reflection reverses the sense). Refused: an ellipse (its fixed rotation
 * would not follow the axis) and the axis itself.
 */
export const mirrorEntities = (sketch: Sketch, ids: ReadonlyArray<string>, axis: string): Sketch | string => {
  const ax = sketch.entities.find((e) => e.id === axis)
  if (ax?.kind !== "line") return `the mirror axis '${axis}' is not a line of the sketch`
  if (ids.includes(axis)) return "the mirror axis cannot be mirrored onto itself"
  const sel = selection(sketch, ids)
  if (typeof sel === "string") return sel
  const ell = sel.curves.find((e) => e.kind === "ellipse")
  if (ell !== undefined) return `'${ell.id}' is an ellipse: its fixed rotation would not follow the mirror`
  const A = at(sketch, ax.p1), d = sub(at(sketch, ax.p2), A)
  if (len(d) < EPS) return `the mirror axis '${axis}' has no length`
  const u = unit(d)
  const reflect = (p: Vec2): Vec2 => { const w = sub(p, A), s = dot(w, u); return { x: A.x + 2 * s * u.x - w.x, y: A.y + 2 * s * u.y - w.y } }
  const name = namer(sketch)
  const image = new Map<string, string>()
  const points: SketchPoint[] = []
  const constraints: Constraint[] = [...sketch.constraints]
  for (const p of sel.points) {
    if (Math.abs(crossZ(u, sub(p, A))) < SAME) { image.set(p.id, p.id); continue }
    const r = reflect(p), id = name(`${p.id}_m`)
    image.set(p.id, id)
    points.push({ id, kind: "point", x: r.x, y: r.y })
    constraints.push({ type: "symmetric", a: p.id, b: id, line: axis })
  }
  const curves = sel.curves.map((e): SketchEntity => {
    const copy = renamed(e, name(`${e.id}_m`), (old) => image.get(old)!)
    if (copy.kind === "arc") return { ...copy, start: copy.end, end: copy.start }
    if (copy.kind === "circle") constraints.push({ type: "equalRadius", a: e.id, b: copy.id })
    return copy
  })
  return { ...sketch, entities: [...sketch.entities, ...points, ...curves], constraints }
}

/** A linear pattern (`step` from one copy to the next) or a circular one about point `center` (`angle` radians, default a full turn). */
export type SketchPatternSpec =
  | { readonly kind: "linear"; readonly count: number; readonly step: readonly [number, number] }
  | { readonly kind: "circular"; readonly count: number; readonly center: string; readonly angle?: number }

/** Constraints a rotation keeps true (no direction of the sketch axes, no fixed position). */
const ROTATION_INVARIANT: ReadonlySet<string> = new Set(["coincident", "distance", "length", "parallel", "perpendicular", "equalLength", "equalRadius", "radius", "diameter", "angle", "pointOnLine", "pointOnCircle", "midpoint", "symmetric", "tangentLineCircle", "tangentCircles", "concentric", "collinear"])

/**
 * Sketch pattern (Fusion's Rectangular / Circular Pattern, one direction): `count - 1` copies of entities `ids`.
 *
 *   linear    every copied point is tied to its original by `distanceX` / `distanceY` of k steps and every copied circle by
 *             `equalRadius`: a copy is the original moved, and it follows every later edit of the original.
 *   circular  the copy keeps the original's shape (the constraints among the selected entities that a rotation keeps true are
 *             copied with it) and is placed by its first point: `distance` from the centre and from the original point, and the
 *             `angle` of its first line to the original line. The placement values are those of the pattern when it was made:
 *             a later edit of the original's shape is followed, a change of its distance to the centre is not.
 *
 * The centre point of a circular pattern is never copied. Refused: an ellipse in a circular pattern (its rotation is fixed), a
 * count outside 2..1000, a zero step or angle.
 */
export const patternEntities = (sketch: Sketch, ids: ReadonlyArray<string>, spec: SketchPatternSpec): Sketch | string => {
  if (!Number.isInteger(spec.count) || spec.count < 2 || spec.count > 1000) return `a pattern needs a whole count from 2 to 1000 (it is ${spec.count})`
  const sel = selection(sketch, ids)
  if (typeof sel === "string") return sel
  const name = namer(sketch)
  const entities: SketchEntity[] = [...sketch.entities]
  const constraints: Constraint[] = [...sketch.constraints]
  if (spec.kind === "linear") {
    const [dx, dy] = spec.step
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < EPS) return "a linear pattern needs a step that is not zero"
    if (sel.curves.some((e) => e.kind === "ellipse")) return "an ellipse cannot be tied to its copy (its semi-axes have no equality constraint)"
    for (let k = 1; k < spec.count; k++) {
      const ren = new Map<string, string>()
      for (const p of sel.points) {
        const id = name(`${p.id}_p${k}`)
        ren.set(p.id, id)
        entities.push({ id, kind: "point", x: p.x + dx * k, y: p.y + dy * k })
        constraints.push({ type: "distanceX", a: p.id, b: id, value: dx * k }, { type: "distanceY", a: p.id, b: id, value: dy * k })
      }
      for (const e of sel.curves) {
        const copy = renamed(e, name(`${e.id}_p${k}`), (old) => ren.get(old)!)
        entities.push(copy)
        if (copy.kind === "circle") constraints.push({ type: "equalRadius", a: e.id, b: copy.id })
      }
    }
    return { ...sketch, entities, constraints }
  }
  if (pointOf(sketch, spec.center) === undefined) return `the pattern centre '${spec.center}' is not a point of the sketch`
  const ell = sel.curves.find((e) => e.kind === "ellipse")
  if (ell !== undefined) return `'${ell.id}' is an ellipse: its fixed rotation would not turn with the pattern`
  const total = spec.angle ?? TAU
  if (!Number.isFinite(total) || Math.abs(total) < 1e-9 || Math.abs(total) > TAU + 1e-9) return `a circular pattern spans more than nothing and at most a full turn (it is ${total} rad)`
  const step = Math.abs(Math.abs(total) - TAU) < 1e-9 ? total / spec.count : total / (spec.count - 1)
  const C = at(sketch, spec.center)
  const turn = (p: Vec2, a: number): Vec2 => { const w = sub(p, C); return { x: C.x + w.x * Math.cos(a) - w.y * Math.sin(a), y: C.y + w.x * Math.sin(a) + w.y * Math.cos(a) } }
  const inSet = new Set([...sel.curves.map((e) => e.id), ...sel.points.map((p) => p.id)])
  const shape = sketch.constraints.filter((c) => ROTATION_INVARIANT.has(c.type) && c.driven !== true &&
    Object.entries(c).every(([k, v]) => k === "type" || k === "id" || typeof v !== "string" || inSet.has(v)))
  const anchor = sel.points.find((p) => p.id !== spec.center)
  const firstLine = sel.curves.find((e): e is SketchLine => e.kind === "line")
  for (let k = 1; k < spec.count; k++) {
    const a = step * k
    const ren = new Map<string, string>([[spec.center, spec.center]])
    for (const p of sel.points) {
      if (p.id === spec.center) continue
      const q = turn(p, a), id = name(`${p.id}_p${k}`)
      ren.set(p.id, id)
      entities.push({ id, kind: "point", x: q.x, y: q.y })
    }
    for (const e of sel.curves) { const id = name(`${e.id}_p${k}`); ren.set(e.id, id); entities.push(renamed(e, id, (old) => ren.get(old)!)) }
    for (const c of shape) {
      constraints.push(Object.fromEntries(Object.entries(c).map(([key, v]) => [key, key === "type" || typeof v !== "string" ? v : key === "id" ? `${v}_p${k}` : ren.get(v) ?? v])) as unknown as Constraint)
    }
    if (anchor === undefined) continue
    const r = len(sub(anchor, C))
    if (r > EPS) {
      constraints.push({ type: "distance", a: spec.center, b: ren.get(anchor.id)!, value: r })
      constraints.push({ type: "distance", a: anchor.id, b: ren.get(anchor.id)!, value: 2 * r * Math.abs(Math.sin(a / 2)) })
    }
    if (firstLine !== undefined) constraints.push({ type: "angle", a: firstLine.id, b: ren.get(firstLine.id)!, value: wrap(a) })
  }
  return { ...sketch, entities, constraints }
}

// ---------------------------------------------------------------------------------------------------------------------- offset

/** One element of a chain in the direction it is walked: a line from `a` to `b`, or an arc about `c` walked counter-clockwise or not. */
type Piece =
  | { readonly kind: "line"; readonly id: string; readonly a: Vec2; readonly b: Vec2 }
  | { readonly kind: "arc"; readonly id: string; readonly c: Vec2; readonly center: string; readonly r: number; readonly a: Vec2; readonly b: Vec2; readonly ccw: boolean }

const tangentAt = (p: Piece, end: "a" | "b"): Vec2 => {
  if (p.kind === "line") return unit(sub(p.b, p.a))
  const radial = unit(sub(end === "a" ? p.a : p.b, p.c))
  return p.ccw ? { x: -radial.y, y: radial.x } : { x: radial.y, y: -radial.x }
}
/** The offset carrier of a piece: a line through a point along a direction, or a circle. `d` is to the left of the walk. */
type Carrier = { readonly kind: "line"; readonly p: Vec2; readonly t: Vec2 } | { readonly kind: "circle"; readonly c: Vec2; readonly r: number }
const carrierOf = (p: Piece, d: number): Carrier | string => {
  if (p.kind === "line") {
    const t = unit(sub(p.b, p.a)), n = { x: -t.y, y: t.x }
    return { kind: "line", p: { x: p.a.x + n.x * d, y: p.a.y + n.y * d }, t }
  }
  // Walking counter-clockwise the centre is on the left.
  const r = p.ccw ? p.r - d : p.r + d
  return r > 1e-9 ? { kind: "circle", c: p.c, r } : `the offset of arc '${p.id}' (radius ${p.r}) by ${d} mm leaves no arc`
}
/** The point of an end of a piece moved onto its offset carrier along the normal. */
const offsetEnd = (p: Piece, cr: Carrier, end: "a" | "b"): Vec2 => {
  const q = end === "a" ? p.a : p.b
  if (cr.kind === "line") { const s = dot(sub(q, cr.p), cr.t); return { x: cr.p.x + cr.t.x * s, y: cr.p.y + cr.t.y * s } }
  const u = unit(sub(q, cr.c))
  return { x: cr.c.x + u.x * cr.r, y: cr.c.y + u.y * cr.r }
}
const meet = (a: Carrier, b: Carrier): Vec2[] => {
  if (a.kind === "line" && b.kind === "line") {
    const den = crossZ(a.t, b.t)
    if (Math.abs(den) < EPS) return []
    const s = crossZ(sub(b.p, a.p), b.t) / den
    return [{ x: a.p.x + a.t.x * s, y: a.p.y + a.t.y * s }]
  }
  if (a.kind === "circle" && b.kind === "line") return meet(b, a)
  if (a.kind === "line" && b.kind === "circle") {
    const w = sub(a.p, b.c), B = dot(w, a.t), C = dot(w, w) - b.r * b.r, disc = B * B - C
    if (disc < -1e-12) return []
    const root = Math.sqrt(Math.max(0, disc))
    return [-B - root, -B + root].map((s) => ({ x: a.p.x + a.t.x * s, y: a.p.y + a.t.y * s }))
  }
  if (a.kind === "circle" && b.kind === "circle") {
    const dv = sub(b.c, a.c), dd = len(dv)
    if (dd < EPS || dd > a.r + b.r + 1e-12 || dd < Math.abs(a.r - b.r) - 1e-12) return []
    const x = (dd * dd + a.r * a.r - b.r * b.r) / (2 * dd), h = Math.sqrt(Math.max(0, a.r * a.r - x * x))
    const u = { x: dv.x / dd, y: dv.y / dd }, m = { x: a.c.x + u.x * x, y: a.c.y + u.y * x }
    return [{ x: m.x - u.y * h, y: m.y + u.x * h }, { x: m.x + u.y * h, y: m.y - u.x * h }]
  }
  return []
}

/**
 * Sketch offset (Fusion's sketch Offset): a copy of a connected chain of lines and arcs, or of circles, at `distance`.
 *
 *   closed chain   positive grows the loop (outward), negative shrinks it
 *   open chain     positive is to the left walking the chain from the first selected entity's free end
 *   circle         positive grows the radius
 *
 * Offset arcs and circles keep the original centre point (so they stay concentric through any edit); offset lines are
 * `parallel` to their originals. Where two pieces met at a corner the offsets are joined at the crossing of their carriers
 * (a sharp corner, extended or trimmed); where they met tangentially they still meet. Refused: a selection that is not one chain
 * (a branch or a gap), an arc whose radius would vanish, a piece the offset turns inside out, a corner whose carriers do not cross.
 */
export const offsetEntities = (sketch: Sketch, ids: ReadonlyArray<string>, distance: number): Sketch | string => {
  if (!Number.isFinite(distance) || Math.abs(distance) < EPS) return `the offset distance must be a number other than zero (it is ${distance})`
  const sel = selection(sketch, ids)
  if (typeof sel === "string") return sel
  const name = namer(sketch)
  if (sel.curves.length > 0 && sel.curves.every((e) => e.kind === "circle")) {
    const circles = sel.curves.flatMap((e) => (e.kind === "circle" ? [e] : []))
    const small = circles.find((e) => e.radius + distance <= 1e-9)
    if (small !== undefined) return `the offset of circle '${small.id}' (radius ${small.radius}) by ${distance} mm leaves no circle`
    return { ...sketch, entities: [...sketch.entities, ...circles.map((e): SketchEntity => ({ ...e, id: name(`${e.id}_o`), radius: e.radius + distance }))] }
  }
  const bad = sel.curves.find((e) => e.kind !== "line" && e.kind !== "arc")
  if (bad !== undefined || sel.curves.length === 0) return bad === undefined ? "an offset needs lines, arcs or circles" : `'${bad.id}' is a ${bad.kind}: an offset chain is made of lines and arcs`
  // Ends that are one point: the same id, a coincident pair, or the same place.
  const canon = new Map<string, string>()
  const ends = sel.curves.flatMap((e) => (e.kind === "line" ? [e.p1, e.p2] : e.kind === "arc" ? [e.start, e.end] : []))
  for (const p of ends) {
    if (canon.has(p)) continue
    const P = at(sketch, p)
    const twin = [...canon.keys()].find((q) => len(sub(at(sketch, q), P)) < SAME || sketch.constraints.some((c) => c.type === "coincident" && ((c.a === p && c.b === q) || (c.a === q && c.b === p))))
    canon.set(p, twin === undefined ? p : canon.get(twin)!)
  }
  const endsOf = (e: SketchEntity): readonly [string, string] => (e.kind === "line" ? [canon.get(e.p1)!, canon.get(e.p2)!] : e.kind === "arc" ? [canon.get(e.start)!, canon.get(e.end)!] : ["", ""])
  const degree = new Map<string, number>()
  for (const e of sel.curves) for (const p of endsOf(e)) degree.set(p, (degree.get(p) ?? 0) + 1)
  const branch = [...degree].find(([, n]) => n > 2)
  if (branch !== undefined) return `the selection branches at point '${branch[0]}': an offset needs one chain`
  const free = [...degree].filter(([, n]) => n === 1).map(([p]) => p)
  const closed = free.length === 0
  if (!closed && free.length !== 2) return "the selection is not one connected chain"
  // Walk the chain.
  const first = sel.curves[0]!
  let cursor = closed ? endsOf(first)[0] : (endsOf(first).find((p) => free.includes(p)) ?? free[0]!)
  const left = new Set(sel.curves.map((e) => e.id))
  const pieces: Piece[] = []
  while (left.size > 0) {
    const next = sel.curves.find((e) => left.has(e.id) && endsOf(e).includes(cursor) && (pieces.length > 0 || !closed || e.id === first.id))
    if (next === undefined) return "the selection is not one connected chain"
    left.delete(next.id)
    const [s, t] = endsOf(next)
    const forward = s === cursor
    const A = at(sketch, forward ? s : t), B = at(sketch, forward ? t : s)
    if (next.kind === "line") pieces.push({ kind: "line", id: next.id, a: A, b: B })
    else if (next.kind === "arc") {
      const c = at(sketch, next.center)
      pieces.push({ kind: "arc", id: next.id, c, center: next.center, r: len(sub(at(sketch, next.start), c)), a: A, b: B, ccw: forward })
    }
    cursor = forward ? t : s
  }
  // A closed loop: positive is outward, i.e. to the right of a counter-clockwise walk.
  let d = distance
  if (closed) {
    let area = 0
    for (const p of pieces) {
      area += crossZ(p.a, p.b)
      if (p.kind === "arc") {
        const span = p.ccw ? norm(angleOf(p.c, p.b) - angleOf(p.c, p.a)) || TAU : -(norm(angleOf(p.c, p.a) - angleOf(p.c, p.b)) || TAU)
        // Twice the area of the circular segment between the chord and the arc, signed with the sense of the walk.
        area += p.r * p.r * (span - Math.sin(span))
      }
    }
    if (area > 0) d = -distance
  }
  const carriers: Carrier[] = []
  for (const p of pieces) { const cr = carrierOf(p, d); if (typeof cr === "string") return cr; carriers.push(cr) }
  // The joints: the start of piece i is joint i, its end joint i + 1 (closed: joint n is joint 0).
  const n = pieces.length
  const joints: Vec2[] = []
  for (let i = 0; i <= n; i++) {
    if (!closed && i === 0) { joints.push(offsetEnd(pieces[0]!, carriers[0]!, "a")); continue }
    if (!closed && i === n) { joints.push(offsetEnd(pieces[n - 1]!, carriers[n - 1]!, "b")); continue }
    if (closed && i === n) { joints.push(joints[0]!); continue }
    const prev = pieces[(i - 1 + n) % n]!, nextP = pieces[i % n]!
    const tIn = tangentAt(prev, "b"), tOut = tangentAt(nextP, "a")
    if (Math.abs(crossZ(tIn, tOut)) < 1e-9 && dot(tIn, tOut) > 0) { joints.push(offsetEnd(prev, carriers[(i - 1 + n) % n]!, "b")); continue }
    if (Math.abs(crossZ(tIn, tOut)) < 1e-9) return `the chain turns back on itself at the end of '${prev.id}'`
    const guess = offsetEnd(prev, carriers[(i - 1 + n) % n]!, "b")
    const hits = meet(carriers[(i - 1 + n) % n]!, carriers[i % n]!)
    if (hits.length === 0) return `the offsets of '${prev.id}' and '${nextP.id}' do not meet`
    joints.push(hits.reduce((best, h) => (len(sub(h, guess)) < len(sub(best, guess)) ? h : best)))
  }
  // A piece the offset turned inside out is refused, not drawn backwards.
  for (let i = 0; i < n; i++) {
    const p = pieces[i]!, a = joints[i]!, b = joints[i + 1]!
    if (p.kind === "line" && dot(sub(b, a), sub(p.b, p.a)) <= EPS) return `the offset by ${distance} mm consumes line '${p.id}'`
    if (p.kind === "arc") {
      const sweep = (x: Vec2, y: Vec2) => (p.ccw ? norm(angleOf(p.c, y) - angleOf(p.c, x)) : norm(angleOf(p.c, x) - angleOf(p.c, y)))
      const was = sweep(p.a, p.b) || TAU, now = sweep(a, b)
      if (now < 1e-9 || now - was > Math.PI) return `the offset by ${distance} mm consumes arc '${p.id}'`
    }
  }
  const jointIds = joints.slice(0, closed ? n : n + 1).map((_, i) => name(`${pieces[Math.min(i, n - 1)]!.id}_o${i === n ? "e" : "s"}`))
  const idAt = (i: number): string => jointIds[closed ? i % n : i]!
  const points: SketchEntity[] = jointIds.map((id, i) => ({ id, kind: "point", x: joints[i]!.x, y: joints[i]!.y }))
  const curves: SketchEntity[] = []
  const constraints: Constraint[] = [...sketch.constraints]
  pieces.forEach((p, i) => {
    const id = name(`${p.id}_o`)
    if (p.kind === "line") { curves.push({ id, kind: "line", p1: idAt(i), p2: idAt(i + 1) }); constraints.push({ type: "parallel", a: p.id, b: id }) }
    else curves.push({ id, kind: "arc", center: p.center, start: p.ccw ? idAt(i) : idAt(i + 1), end: p.ccw ? idAt(i + 1) : idAt(i) })
  })
  return { ...sketch, entities: [...sketch.entities, ...points, ...curves], constraints }
}

// --------------------------------------------------------------------------------------------------------------------- project

/** A sketch plane in the world: origin and the right-handed axes u, v, n (a `RebuildResult.sketches[id].frame`). */
export interface SketchPlaneFrame { readonly origin: Vec3; readonly u: Vec3; readonly v: Vec3; readonly n: Vec3 }

export interface ProjectedEdges {
  readonly sketch: Sketch
  /** The new entity per projected edge, by edge index. */
  readonly projected: ReadonlyArray<{ readonly edge: number; readonly entity: string }>
  /** Edges that a sketch cannot hold exactly, with the reason (never approximated). */
  readonly refused: ReadonlyArray<{ readonly edge: number; readonly reason: string }>
}

/**
 * Project model edges into a sketch (Fusion's Project): edges `edges` of `brep` seen along the plane's normal. A line edge becomes
 * a line (or a point when it is seen end-on); a circle edge in a plane parallel to the sketch becomes a circle or an arc; a full
 * circle tilted to it becomes an ellipse. Projected geometry is reference geometry: every new point is `fixed` where the edge
 * put it (and a circle's radius, an ellipse's semi-axes are dimensioned), so solving never moves it; ends that land on the same
 * place share one point, so projected loops close into profiles. It is not associative: a model edit does not move it (project
 * again). Refused per edge, with the reason: an arc of a tilted circle (part of an ellipse), a circle seen edge-on, an ellipse or
 * a NURBS edge. Returns a string when no edge could be projected.
 */
export const projectEdges = (sketch: Sketch, brep: Brep, edges: ReadonlyArray<number>, frame: SketchPlaneFrame): ProjectedEdges | string => {
  if (edges.length === 0) return "no edge is selected"
  const d3 = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
  const to2 = (p: Vec3): Vec2 => { const w = { x: p.x - frame.origin.x, y: p.y - frame.origin.y, z: p.z - frame.origin.z }; return { x: d3(w, frame.u), y: d3(w, frame.v) } }
  const name = namer(sketch)
  const points: SketchPoint[] = []
  const curves: SketchEntity[] = []
  const constraints: Constraint[] = [...sketch.constraints]
  const projected: Array<{ edge: number; entity: string }> = []
  const refused: Array<{ edge: number; reason: string }> = []
  const point = (p: Vec2, base: string): string => {
    const same = points.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < SAME)
    if (same !== undefined) return same.id
    const id = name(base)
    points.push({ id, kind: "point", x: p.x, y: p.y })
    constraints.push({ type: "fixed", point: id, x: p.x, y: p.y })
    return id
  }
  for (const index of edges) {
    const edge = brep.edges[index]
    if (edge === undefined) { refused.push({ edge: index, reason: `edge ${index} is not in the body` }); continue }
    const P0 = to2(brep.vertices[edge.v0]!.point), P1 = to2(brep.vertices[edge.v1]!.point)
    const c = edge.curve
    const base = `proj${index}`
    if (c.kind === "line") {
      if (len(sub(P1, P0)) < SAME) { projected.push({ edge: index, entity: point(P0, `${base}_p`) }); continue }
      const id = name(base)
      curves.push({ id, kind: "line", p1: point(P0, `${base}_a`), p2: point(P1, `${base}_b`) })
      projected.push({ edge: index, entity: id })
      continue
    }
    if (c.kind !== "circle") { refused.push({ edge: index, reason: `edge ${index} is ${c.kind === "ellipse" ? "an ellipse" : "a NURBS curve"}: its projection is not a sketch entity` }); continue }
    const z = c.frame.z, dz = d3(z, frame.n)
    const full = Math.abs(edge.t1 - edge.t0 - TAU) < 1e-9
    const centre = to2(c.frame.origin)
    if (Math.abs(Math.abs(dz) - 1) < 1e-9) {
      const id = name(base)
      if (full) {
        curves.push({ id, kind: "circle", center: point(centre, `${base}_c`), radius: c.radius })
        constraints.push({ type: "radius", circle: id, value: c.radius })
      } else {
        // The parameter runs counter-clockwise about the circle's own normal: the same sense in the sketch when the normals agree.
        const s = point(dz > 0 ? P0 : P1, `${base}_a`), e = point(dz > 0 ? P1 : P0, `${base}_b`)
        curves.push({ id, kind: "arc", center: point(centre, `${base}_c`), start: s, end: e })
      }
      projected.push({ edge: index, entity: id })
      continue
    }
    if (Math.abs(dz) < 1e-9) { refused.push({ edge: index, reason: `edge ${index} is a circle seen edge-on: it projects to a segment traced twice, which is not one sketch entity` }); continue }
    if (!full) { refused.push({ edge: index, reason: `edge ${index} is an arc of a circle tilted to the sketch plane: it projects to part of an ellipse, which a sketch cannot hold` }); continue }
    // A full circle tilted by acos|dz|: an ellipse whose major axis (the radius) lies along the line where the two planes meet.
    const w = { x: z.y * frame.n.z - z.z * frame.n.y, y: z.z * frame.n.x - z.x * frame.n.z, z: z.x * frame.n.y - z.y * frame.n.x }
    const id = name(base)
    curves.push({ id, kind: "ellipse", center: point(centre, `${base}_c`), radiusX: c.radius, radiusY: c.radius * Math.abs(dz), rotation: Math.atan2(d3(w, frame.v), d3(w, frame.u)) })
    constraints.push({ type: "ellipseSize", ellipse: id, radiusX: c.radius, radiusY: c.radius * Math.abs(dz) })
    projected.push({ edge: index, entity: id })
  }
  if (projected.length === 0) return refused.map((r) => r.reason).join("; ")
  return { sketch: { ...sketch, entities: [...sketch.entities, ...points, ...curves], constraints }, projected, refused }
}
