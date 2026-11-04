/**
 * Sketch construction tools on the entity model (spec 72 P2-10): Offset, Mirror, Pattern (linear and circular) and corner Fillet.
 * Like `sketch-edit.ts` they are pure: each returns a new `Sketch` or an error string, never edits its input, and the geometry they
 * create is made of ordinary points, so the solver and every later tool treat it like drawn geometry. Mirror also adds the
 * `symmetric` / `equalRadius` constraints that keep the copy a mirror image when the original is dimensioned later.
 */
import type { Constraint, Sketch, SketchArc, SketchCircle, SketchEntity, SketchLine, SketchPoint } from "./sketch-model.ts"
import type { Vec2 } from "./vec.ts"

const TAU = Math.PI * 2
const EPS = 1e-9

type Result = Sketch | string

const pointMap = (s: Sketch): Map<string, SketchPoint> => new Map(s.entities.filter((e): e is SketchPoint => e.kind === "point").map((p) => [p.id, p]))
const pos = (pts: Map<string, SketchPoint>, id: string): Vec2 => {
  const p = pts.get(id)
  if (p === undefined) throw new Error(`point '${id}' is not in the sketch`)
  return { x: p.x, y: p.y }
}
const freshId = (taken: Set<string>, base: string): string => {
  for (let k = 1; ; k++) if (!taken.has(`${base}${k}`)) { taken.add(`${base}${k}`); return `${base}${k}` }
}
const usedPoints = (e: SketchEntity): string[] =>
  e.kind === "line" ? [e.p1, e.p2] : e.kind === "circle" || e.kind === "ellipse" ? [e.center] : e.kind === "arc" ? [e.center, e.start, e.end] : e.kind === "spline" ? [...e.points] : []
const withoutIds = (cs: ReadonlyArray<Constraint>, removed: ReadonlySet<string>): Constraint[] =>
  cs.filter((c) => !Object.values(c).some((v) => typeof v === "string" && removed.has(v)))
const guardNominal = (s: Sketch, ids: ReadonlyArray<string>): string | undefined => {
  const hit = s.nominalCurves?.find((c) => c.replaces.some((r) => ids.includes(r)))
  return hit === undefined ? undefined : "a construction edge of a nominal curve cannot be used by this tool; select the curve's own entities"
}

// ---------------------------------------------------------------------------------------------------------------------------
// Offset
// ---------------------------------------------------------------------------------------------------------------------------

interface OffsetLine { readonly kind: "line"; readonly id: string; readonly a: Vec2; readonly b: Vec2; readonly n: Vec2 }
interface OffsetArc { readonly kind: "arc"; readonly id: string; readonly c: Vec2; readonly r: number; readonly r2: number; readonly start: string; readonly end: string; readonly centre: string }

/** Intersections of the carriers of two offset elements (line or circle), nothing for parallel / concentric ones. */
const carrierHits = (u: OffsetLine | OffsetArc, v: OffsetLine | OffsetArc): Vec2[] => {
  if (u.kind === "line" && v.kind === "line") {
    const d1 = { x: u.b.x - u.a.x, y: u.b.y - u.a.y }, d2 = { x: v.b.x - v.a.x, y: v.b.y - v.a.y }
    const den = d1.x * d2.y - d1.y * d2.x
    if (Math.abs(den) < EPS * Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y)) return []
    const w = { x: v.a.x - u.a.x, y: v.a.y - u.a.y }
    const t = (w.x * d2.y - w.y * d2.x) / den
    return [{ x: u.a.x + d1.x * t, y: u.a.y + d1.y * t }]
  }
  if (u.kind === "arc" && v.kind === "arc") {
    const d = Math.hypot(v.c.x - u.c.x, v.c.y - u.c.y)
    if (d < EPS || d > u.r2 + v.r2 + EPS || d < Math.abs(u.r2 - v.r2) - EPS) return []
    const x = (d * d + u.r2 * u.r2 - v.r2 * v.r2) / (2 * d), h = Math.sqrt(Math.max(0, u.r2 * u.r2 - x * x))
    const ux = (v.c.x - u.c.x) / d, uy = (v.c.y - u.c.y) / d
    const m = { x: u.c.x + ux * x, y: u.c.y + uy * x }
    return [{ x: m.x - uy * h, y: m.y + ux * h }, { x: m.x + uy * h, y: m.y - ux * h }]
  }
  const l = (u.kind === "line" ? u : v) as OffsetLine, r = (u.kind === "arc" ? u : v) as OffsetArc
  const d = { x: l.b.x - l.a.x, y: l.b.y - l.a.y }, f = { x: l.a.x - r.c.x, y: l.a.y - r.c.y }
  const A = d.x * d.x + d.y * d.y, B = 2 * (f.x * d.x + f.y * d.y), C = f.x * f.x + f.y * f.y - r.r2 * r.r2
  const disc = B * B - 4 * A * C
  if (disc < 0) return []
  const root = Math.sqrt(disc)
  return [(-B - root) / (2 * A), (-B + root) / (2 * A)].map((t) => ({ x: l.a.x + d.x * t, y: l.a.y + d.y * t }))
}

/**
 * Offset: copies lines, arcs and circles at signed distance `distance`. Positive is to the left of the direction of travel (a line
 * p1 -> p2; arcs and circles run counter-clockwise, so a positive distance shrinks them and a negative one grows them). Entities
 * that share end points are offset as a chain: neighbours meet again at the crossing of their offset carriers, so a rectangle
 * offsets into a rectangle and a rounded slot into a slot. Refused with the reason when an entity would vanish (an arc whose radius
 * reaches zero) or reverse (a line shorter than the inset it receives), instead of returning degenerate geometry.
 */
export const offsetEntities = (sketch: Sketch, ids: ReadonlyArray<string>, distance: number): Result => {
  if (!Number.isFinite(distance) || Math.abs(distance) < EPS) return "the offset distance must be a non-zero number"
  const nominal = guardNominal(sketch, ids)
  if (nominal !== undefined) return nominal
  const pts = pointMap(sketch)
  const picked: Array<SketchLine | SketchArc | SketchCircle> = []
  for (const id of ids) {
    const e = sketch.entities.find((x) => x.id === id)
    if (e === undefined) return `'${id}' is not in the sketch`
    if (e.kind !== "line" && e.kind !== "arc" && e.kind !== "circle") return `'${id}' (${e.kind}) cannot be offset; lines, arcs and circles can`
    picked.push(e)
  }
  const taken = new Set(sketch.entities.map((e) => e.id))
  const newEntities: SketchEntity[] = []
  const addPoint = (p: Vec2): string => {
    const id = freshId(taken, "pt")
    newEntities.push({ id, kind: "point", x: p.x, y: p.y })
    return id
  }
  // Circles are independent of the chain logic.
  for (const e of picked) {
    if (e.kind !== "circle") continue
    const r = e.radius - distance
    if (r <= EPS) return `offsetting circle '${e.id}' by ${distance} leaves no circle (radius ${e.radius})`
    const centre = pos(pts, e.center)
    newEntities.push({ id: freshId(taken, `${e.id}_off`), kind: "circle", center: addPoint(centre), radius: r })
  }
  const elems = new Map<string, OffsetLine | OffsetArc>()
  for (const e of picked) {
    if (e.kind === "line") {
      const a = pos(pts, e.p1), b = pos(pts, e.p2), len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < EPS) return `line '${e.id}' has no length`
      const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
      elems.set(e.id, { kind: "line", id: e.id, a: { x: a.x + n.x * distance, y: a.y + n.y * distance }, b: { x: b.x + n.x * distance, y: b.y + n.y * distance }, n })
    } else if (e.kind === "arc") {
      const c = pos(pts, e.center), s = pos(pts, e.start)
      const r = Math.hypot(s.x - c.x, s.y - c.y), r2 = r - distance
      if (r2 <= EPS) return `offsetting arc '${e.id}' by ${distance} leaves no arc (radius ${r})`
      elems.set(e.id, { kind: "arc", id: e.id, c, r, r2, start: e.start, end: e.end, centre: e.center })
    }
  }
  // Joint point (original point id shared by two picked elements) -> new point id, found at the crossing of the offset carriers.
  const joint = new Map<string, string>()
  const endsOf = (e: SketchLine | SketchArc): [string, string] => (e.kind === "line" ? [e.p1, e.p2] : [e.start, e.end])
  const byPoint = new Map<string, Array<SketchLine | SketchArc>>()
  for (const e of picked) if (e.kind !== "circle") for (const p of endsOf(e)) byPoint.set(p, [...(byPoint.get(p) ?? []), e])
  const jointPos = new Map<string, Vec2>()
  for (const [p, es] of byPoint) {
    if (es.length !== 2) continue
    const [u, v] = [elems.get(es[0]!.id)!, elems.get(es[1]!.id)!]
    const orig = pos(pts, p)
    const hits = carrierHits(u, v)
    const moved = (el: OffsetLine | OffsetArc): Vec2 => {
      if (el.kind === "line") return { x: orig.x + el.n.x * distance, y: orig.y + el.n.y * distance }
      const d = Math.hypot(orig.x - el.c.x, orig.y - el.c.y)
      return { x: el.c.x + ((orig.x - el.c.x) / d) * el.r2, y: el.c.y + ((orig.y - el.c.y) / d) * el.r2 }
    }
    const guess = moved(u)
    const best = hits.sort((h1, h2) => Math.hypot(h1.x - guess.x, h1.y - guess.y) - Math.hypot(h2.x - guess.x, h2.y - guess.y))[0]
    jointPos.set(p, best ?? guess)
    joint.set(p, "")
  }
  const idOfEnd = (e: SketchLine | SketchArc, p: string, free: Vec2): string => {
    if (joint.has(p)) {
      let id = joint.get(p)!
      if (id === "") { id = addPoint(jointPos.get(p)!); joint.set(p, id) }
      return id
    }
    return addPoint(free)
  }
  for (const e of picked) {
    if (e.kind === "circle") continue
    const el = elems.get(e.id)!
    if (e.kind === "line") {
      const l = el as OffsetLine
      const aId = idOfEnd(e, e.p1, l.a), bId = idOfEnd(e, e.p2, l.b)
      const na = newEntities.find((x): x is SketchPoint => x.id === aId)!, nb = newEntities.find((x): x is SketchPoint => x.id === bId)!
      const old = { x: l.b.x - l.a.x, y: l.b.y - l.a.y }
      if ((nb.x - na.x) * old.x + (nb.y - na.y) * old.y <= EPS) return `offsetting line '${e.id}' by ${distance} reverses it: the offset is larger than its neighbours allow`
      newEntities.push({ id: freshId(taken, `${e.id}_off`), kind: "line", p1: aId, p2: bId })
    } else {
      const a = el as OffsetArc
      const ang = (p: Vec2) => Math.atan2(p.y - a.c.y, p.x - a.c.x)
      const sOrig = pos(pts, e.start), eOrig = pos(pts, e.end)
      const onCircle = (o: Vec2): Vec2 => ({ x: a.c.x + Math.cos(ang(o)) * a.r2, y: a.c.y + Math.sin(ang(o)) * a.r2 })
      const sId = idOfEnd(e, e.start, onCircle(sOrig)), eId = idOfEnd(e, e.end, onCircle(eOrig))
      const ns = newEntities.find((x): x is SketchPoint => x.id === sId)!, ne = newEntities.find((x): x is SketchPoint => x.id === eId)!
      // The arc must keep its angular direction and not flip to the complementary arc.
      const span = (s: Vec2, t: Vec2) => (((Math.atan2(t.y - a.c.y, t.x - a.c.x) - Math.atan2(s.y - a.c.y, s.x - a.c.x)) % TAU) + TAU) % TAU
      if (Math.abs(span(sOrig, eOrig) - span(ns, ne)) > Math.PI) return `offsetting arc '${e.id}' by ${distance} flips it: the offset is larger than its neighbours allow`
      let cId = [...newEntities].reverse().find((x): x is SketchPoint => x.kind === "point" && Math.abs(x.x - a.c.x) < EPS && Math.abs(x.y - a.c.y) < EPS)?.id
      if (cId === undefined) cId = addPoint(a.c)
      newEntities.push({ id: freshId(taken, `${e.id}_off`), kind: "arc", center: cId, start: sId, end: eId })
    }
  }
  return { ...sketch, entities: [...sketch.entities, ...newEntities] }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Copy machinery shared by mirror and pattern
// ---------------------------------------------------------------------------------------------------------------------------

interface Copy { readonly sketch: Sketch; readonly pointMap: Map<string, string>; readonly entityMap: Map<string, string> }

/**
 * Copies the entities `ids` (and the points they use) through `move`. `reverse` swaps the end points of arcs (a reflection turns a
 * counter-clockwise arc clockwise). `reuse` lets a point stay itself (mirror: a point on the axis). `rotation` maps an ellipse's
 * rotation.
 */
const copyEntities = (
  sketch: Sketch, ids: ReadonlyArray<string>, tag: string, move: (p: Vec2) => Vec2,
  opts: { reverse: boolean; reuse?: (p: Vec2) => boolean; rotation: (r: number) => number }
): Copy | string => {
  const pts = pointMap(sketch)
  const taken = new Set(sketch.entities.map((e) => e.id))
  const pointMapOut = new Map<string, string>(), entityMap = new Map<string, string>()
  const out: SketchEntity[] = []
  const map = (id: string): string => {
    const known = pointMapOut.get(id)
    if (known !== undefined) return known
    const p = pos(pts, id)
    let nid = id
    if (opts.reuse === undefined || !opts.reuse(p)) {
      const q = move(p)
      nid = freshId(taken, `${tag}_pt`)
      out.push({ id: nid, kind: "point", x: q.x, y: q.y })
    }
    pointMapOut.set(id, nid)
    return nid
  }
  for (const id of ids) {
    const e = sketch.entities.find((x) => x.id === id)
    if (e === undefined) return `'${id}' is not in the sketch`
    if (e.kind === "point") { map(e.id); continue }
    const nid = freshId(taken, `${tag}_${e.id}_`)
    entityMap.set(e.id, nid)
    if (e.kind === "line") out.push({ id: nid, kind: "line", p1: map(e.p1), p2: map(e.p2) })
    else if (e.kind === "circle") out.push({ id: nid, kind: "circle", center: map(e.center), radius: e.radius })
    else if (e.kind === "arc") out.push({ id: nid, kind: "arc", center: map(e.center), start: map(opts.reverse ? e.end : e.start), end: map(opts.reverse ? e.start : e.end) })
    else if (e.kind === "ellipse") out.push({ id: nid, kind: "ellipse", center: map(e.center), radiusX: e.radiusX, radiusY: e.radiusY, rotation: opts.rotation(e.rotation ?? 0) })
    else out.push({ id: nid, kind: "spline", points: (opts.reverse ? [...e.points].reverse() : e.points).map(map), ...(e.closed === true ? { closed: true } : {}) })
  }
  // Points are emitted before the entities that use them so a reader that resolves in order never sees a forward reference.
  const points = out.filter((e) => e.kind === "point"), rest = out.filter((e) => e.kind !== "point")
  return { sketch: { ...sketch, entities: [...sketch.entities, ...points, ...rest] }, pointMap: pointMapOut, entityMap }
}

/**
 * Mirror: reflects entities across the line `axis` (a line entity of the sketch, which stays). Points that lie on the axis are shared
 * with the copy, so a half profile mirrors into a closed outline. `constrain` (default true) adds a `symmetric` constraint per
 * point pair and `equalRadius` per circle pair, so the copy stays a mirror image under later dimensions.
 */
export const mirrorEntities = (sketch: Sketch, ids: ReadonlyArray<string>, axis: string, options: { constrain?: boolean } = {}): Result => {
  const ax = sketch.entities.find((e) => e.id === axis)
  if (ax === undefined || ax.kind !== "line") return `mirror axis '${axis}' must be a line of the sketch`
  const pts = pointMap(sketch)
  const a = pos(pts, ax.p1), b = pos(pts, ax.p2), len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < EPS) return `mirror axis '${axis}' has no length`
  if (ids.includes(axis)) return "the mirror axis cannot be mirrored with itself"
  const nominal = guardNominal(sketch, ids)
  if (nominal !== undefined) return nominal
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  const axisAngle = Math.atan2(u.y, u.x)
  const reflect = (p: Vec2): Vec2 => {
    const w = { x: p.x - a.x, y: p.y - a.y }, t = w.x * u.x + w.y * u.y
    const foot = { x: a.x + u.x * t, y: a.y + u.y * t }
    return { x: 2 * foot.x - p.x, y: 2 * foot.y - p.y }
  }
  const onAxis = (p: Vec2) => Math.abs((p.x - a.x) * u.y - (p.y - a.y) * u.x) < 1e-9
  const copy = copyEntities(sketch, ids, "mir", reflect, { reverse: true, reuse: onAxis, rotation: (r) => 2 * axisAngle - r })
  if (typeof copy === "string") return copy
  const extra: Constraint[] = []
  if (options.constrain !== false) {
    for (const [from, to] of copy.pointMap) if (from !== to) extra.push({ type: "symmetric", a: from, b: to, line: axis })
    for (const [from, to] of copy.entityMap) {
      const e = sketch.entities.find((x) => x.id === from)
      if (e?.kind === "circle") extra.push({ type: "equalRadius", a: from, b: to })
    }
  }
  return { ...copy.sketch, constraints: [...sketch.constraints, ...extra] }
}

export type SketchPattern =
  | { readonly kind: "linear"; readonly dx: number; readonly dy: number; readonly count: number }
  | { readonly kind: "circular"; readonly center: Vec2; readonly angle: number; readonly count: number }

/**
 * Pattern: `count` instances in all (the original plus count - 1 copies). Linear steps by (dx, dy) per instance. Circular turns by
 * `angle` radians about `center`; a full turn (2 pi) spaces the instances evenly round the circle, a part turn puts the last
 * instance exactly `angle` from the first. Instances are plain geometry; the originals keep their constraints.
 */
export const patternEntities = (sketch: Sketch, ids: ReadonlyArray<string>, pattern: SketchPattern): Result => {
  if (!Number.isInteger(pattern.count) || pattern.count < 2 || pattern.count > 500) return "a pattern needs an integer count from 2 to 500"
  if (pattern.kind === "linear" && Math.hypot(pattern.dx, pattern.dy) < EPS) return "a linear pattern needs a non-zero step"
  if (pattern.kind === "circular" && (!Number.isFinite(pattern.angle) || Math.abs(pattern.angle) < EPS)) return "a circular pattern needs a non-zero angle"
  const nominal = guardNominal(sketch, ids)
  if (nominal !== undefined) return nominal
  let current = sketch
  const full = pattern.kind === "circular" && Math.abs(Math.abs(pattern.angle) - TAU) < 1e-9
  const step = pattern.kind === "circular" ? pattern.angle / (full ? pattern.count : pattern.count - 1) : 0
  for (let k = 1; k < pattern.count; k++) {
    const move = pattern.kind === "linear"
      ? (p: Vec2): Vec2 => ({ x: p.x + pattern.dx * k, y: p.y + pattern.dy * k })
      : (p: Vec2): Vec2 => {
        const t = step * k, c = Math.cos(t), s = Math.sin(t), w = { x: p.x - pattern.center.x, y: p.y - pattern.center.y }
        return { x: pattern.center.x + w.x * c - w.y * s, y: pattern.center.y + w.x * s + w.y * c }
      }
    const rotation = pattern.kind === "circular" ? (r: number) => r + step * k : (r: number) => r
    // Each instance is made from the original ids, so ids stay unique (`pat<k>_...`) and the copy never feeds on a copy.
    const copy = copyEntities({ ...sketch, entities: current.entities }, ids, `pat${k}`, move, { reverse: false, rotation })
    if (typeof copy === "string") return copy
    current = { ...current, entities: copy.sketch.entities }
  }
  return current
}

// ---------------------------------------------------------------------------------------------------------------------------
// Corner fillet
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Fillet: rounds the corner where lines `a` and `b` meet (they must share an end point) with a tangent arc of `radius`. Both lines
 * are shortened to the tangent points; the corner point is removed when nothing else uses it. Refused when the lines are parallel
 * or either is too short to hold the tangent point.
 */
export const filletCorner = (sketch: Sketch, a: string, b: string, radius: number): Result => {
  if (!(radius > EPS) || !Number.isFinite(radius)) return "the fillet radius must be positive"
  const la = sketch.entities.find((e): e is SketchLine => e.id === a && e.kind === "line")
  const lb = sketch.entities.find((e): e is SketchLine => e.id === b && e.kind === "line")
  if (la === undefined || lb === undefined) return "a fillet needs two lines of the sketch"
  if (a === b) return "a fillet needs two different lines"
  const shared = [la.p1, la.p2].filter((p) => p === lb.p1 || p === lb.p2)
  if (shared.length !== 1) return shared.length === 2 ? "the two lines are the same segment" : "the lines must share an end point (a corner); extend or trim them to meet first"
  const corner = shared[0]!
  const pts = pointMap(sketch)
  const c = pos(pts, corner)
  const farA = pos(pts, la.p1 === corner ? la.p2 : la.p1), farB = pos(pts, lb.p1 === corner ? lb.p2 : lb.p1)
  const ua = { x: farA.x - c.x, y: farA.y - c.y }, ub = { x: farB.x - c.x, y: farB.y - c.y }
  const lenA = Math.hypot(ua.x, ua.y), lenB = Math.hypot(ub.x, ub.y)
  if (lenA < EPS || lenB < EPS) return "a line has no length"
  ua.x /= lenA; ua.y /= lenA; ub.x /= lenB; ub.y /= lenB
  const cosT = ua.x * ub.x + ua.y * ub.y
  const theta = Math.acos(Math.max(-1, Math.min(1, cosT)))
  if (theta < 1e-6 || Math.PI - theta < 1e-6) return "the lines are parallel; there is no corner to fillet"
  const t = radius / Math.tan(theta / 2)
  if (t >= lenA - EPS || t >= lenB - EPS) return `radius ${radius} needs ${t.toFixed(4)} of tangent length; the lines are ${lenA.toFixed(4)} and ${lenB.toFixed(4)} long`
  const ta = { x: c.x + ua.x * t, y: c.y + ua.y * t }, tb = { x: c.x + ub.x * t, y: c.y + ub.y * t }
  const bis = { x: ua.x + ub.x, y: ua.y + ub.y }, bl = Math.hypot(bis.x, bis.y)
  const dist = radius / Math.sin(theta / 2)
  const centre = { x: c.x + (bis.x / bl) * dist, y: c.y + (bis.y / bl) * dist }
  const taken = new Set(sketch.entities.map((e) => e.id))
  const idA = freshId(taken, "pt"), idB = freshId(taken, "pt"), idC = freshId(taken, "pt")
  // The arc runs counter-clockwise: from the tangent point that is clockwise-first about the centre.
  const cross = (ta.x - centre.x) * (tb.y - centre.y) - (ta.y - centre.y) * (tb.x - centre.x)
  const [start, end] = cross > 0 ? [idA, idB] : [idB, idA]
  const arcId = freshId(taken, "fillet")
  const arc: SketchArc = { id: arcId, kind: "arc", center: idC, start, end }
  const swap = (l: SketchLine, to: string): SketchLine => (l.p1 === corner ? { ...l, p1: to } : { ...l, p2: to })
  const newPoints: SketchPoint[] = [{ id: idA, kind: "point", x: ta.x, y: ta.y }, { id: idB, kind: "point", x: tb.x, y: tb.y }, { id: idC, kind: "point", x: centre.x, y: centre.y }]
  let entities: SketchEntity[] = sketch.entities.map((e) => (e.id === a ? swap(la, idA) : e.id === b ? swap(lb, idB) : e))
  const stillUsed = entities.some((e) => usedPoints(e).includes(corner))
  const removed = new Set<string>()
  if (!stillUsed) { removed.add(corner); entities = entities.filter((e) => e.id !== corner) }
  // A constraint that glued the two lines at the corner (or fixed it) can no longer hold; drop those that name a removed point.
  const constraints = withoutIds(sketch.constraints, removed)
  return { ...sketch, entities: [...entities, ...newPoints, arc], constraints }
}
